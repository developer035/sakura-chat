import { nanoid } from 'nanoid';
import { blobToDataUrl, del, getBlob, putBlob } from './file-store';
import { makeThumb } from './attachments';
import { MAX_IMAGES_PER_SESSION } from './constants';
import { useStore } from './store';
import { buildRequestMessages } from './request';
import { streamChat } from './stream';
import { CHAT_SYSTEM_PROMPT, DOCUMENT_SYSTEM_PROMPT } from './prompts';
import { branchSummary, routeMessage, summarize } from './api';
import { collectSubtree, getMainThread, versionOrigin } from './tree-utils';
import type { Attachment, ImageSize, NodeKind, SearchCitation, ToolMode, TurnNode } from './types';

/** Abort controllers for in-flight streams, keyed by node id. */
const inflight = new Map<string, AbortController>();

const get = () => useStore.getState();

// ---------------------------------------------------------------------------
// Per-session message cap (friendly client-side guard; the server rate-limits too)
// ---------------------------------------------------------------------------
const MAX_MESSAGES_PER_SESSION = 150;
const COUNT_KEY = 'sakura-msg-count';
let memoryCount = 0;

/** Reserves one message slot. Returns false (and tells the user) when the cap is reached. */
function takeMessageSlot(): boolean {
  let count = memoryCount;
  try {
    count = Math.max(count, Number(sessionStorage.getItem(COUNT_KEY) ?? '0') || 0);
  } catch {
    /* sessionStorage unavailable: fall back to the in-memory counter */
  }
  if (count >= MAX_MESSAGES_PER_SESSION) {
    get().pushToast({
      message: `🍵 Session limit reached (${MAX_MESSAGES_PER_SESSION} messages). Open a new tab to keep chatting!`,
    });
    return false;
  }
  count += 1;
  memoryCount = count;
  try {
    sessionStorage.setItem(COUNT_KEY, String(count));
  } catch {
    /* ignore */
  }
  return true;
}

function makeTitle(text: string): string {
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

/** Generates a summary in the background and stores it if the reply is unchanged. */
async function summarizeInBackground(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node || node.summary || !node.assistant.trim()) return;
  const { user, assistant } = node;

  const summary = await summarize(user, assistant);
  const now = get().nodes[nodeId];
  if (summary && now && now.assistant === assistant) {
    get().updateNode(nodeId, { summary });
  }
}

function runStream(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;

  const controller = new AbortController();
  inflight.get(nodeId)?.abort();
  inflight.set(nodeId, controller);

  get().setMascotState(node.webSearchEnabled ? 'sniffing' : 'thinking');

  // Only the newest stream for a node may write to it (a restart supersedes older ones).
  const isCurrent = () => inflight.get(nodeId) === controller;
  const finish = () => {
    if (isCurrent()) inflight.delete(nodeId);
  };

  void (async () => {
    let messages;
    try {
      messages = await buildRequestMessages(get().nodes, node);
    } catch (err) {
      if (!isCurrent()) return;
      finish();
      get().updateNode(nodeId, {
        status: 'error',
        assistant: `*(Could not prepare your attachments: ${err instanceof Error ? err.message : 'unknown error'}. Please retry.)*`,
      });
      get().setMascotState('error');
      return;
    }
    if (!isCurrent()) return;
    // Attachments force a plain (non-search) request: the web-search path is text only.
    const hasFiles = !!node.attachments?.length;
    void streamChat(
    {
      messages,
      system: node.tool === 'document' ? DOCUMENT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT,
      webSearch: node.webSearchEnabled && !hasFiles && !node.tool,
    },
    {
      signal: controller.signal,
      onToken: (accumulated) => {
        if (!isCurrent()) return;
        get().updateNode(nodeId, { assistant: accumulated, status: 'streaming' });
        get().setMascotState('writing');
      },
      onSearchQuery: (query) => {
        if (!isCurrent()) return;
        const list = get().nodes[nodeId]?.searchQueries || [];
        if (!list.includes(query)) get().updateNode(nodeId, { searchQueries: [...list, query] });
      },
      onCitations: (citations: SearchCitation[]) => {
        if (!isCurrent()) return;
        get().updateNode(nodeId, { citations });
      },
      onDone: () => {
        if (!isCurrent()) return;
        finish();
        get().updateNode(nodeId, { status: 'done' });
        get().setMascotState('success');
        // Settle back to idle, unless something else has taken over the mascot meanwhile.
        setTimeout(() => {
          if (get().mascotState === 'success') get().setMascotState('idle');
        }, 1500);
        void summarizeInBackground(nodeId);
      },
      onError: (error) => {
        if (!isCurrent()) return;
        finish();
        // A user-initiated cancel is not an error: keep what we have.
        if (controller.signal.aborted && controller.signal.reason === 'user-cancel') {
          get().updateNode(nodeId, { status: 'done' });
          get().setMascotState('idle');
          void summarizeInBackground(nodeId);
          return;
        }
        console.error('Chat stream error:', error);
        const partial = get().nodes[nodeId]?.assistant || '';
        get().updateNode(nodeId, {
          status: 'error',
          assistant:
            partial + `\n\n*(Error: ${error.message || 'Stream interrupted'}. Please retry.)*`,
        });
        get().setMascotState('error');
      },
    }
    );
  })();
}


// ---------------------------------------------------------------------------
// Image generation / editing (Muse Image 1.0 via /api/image)
// ---------------------------------------------------------------------------
const IMAGE_COUNT_KEY = 'sakura-img-count';
let memoryImageCount = 0;

function takeImageSlot(): boolean {
  let count = memoryImageCount;
  try {
    count = Math.max(count, Number(sessionStorage.getItem(IMAGE_COUNT_KEY) ?? '0') || 0);
  } catch {
    /* in-memory fallback */
  }
  if (count >= MAX_IMAGES_PER_SESSION) return false;
  count += 1;
  memoryImageCount = count;
  try {
    sessionStorage.setItem(IMAGE_COUNT_KEY, String(count));
  } catch {
    /* ignore */
  }
  return true;
}

const IMAGE_TIMEOUT_MS = 90_000;

function runImage(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;

  const controller = new AbortController();
  inflight.get(nodeId)?.abort();
  inflight.set(nodeId, controller);
  const isCurrent = () => inflight.get(nodeId) === controller;
  const finish = () => {
    if (isCurrent()) inflight.delete(nodeId);
  };
  const timer = setTimeout(() => controller.abort(new Error('Image generation timed out.')), IMAGE_TIMEOUT_MS);

  get().setMascotState('thinking');

  const fail = (message: string) => {
    if (!isCurrent()) return;
    finish();
    get().updateNode(nodeId, { status: 'error', assistant: `*(${message})*` });
    get().setMascotState('error');
  };

  void (async () => {
    try {
      if (!takeImageSlot()) {
        throw new Error(`Image limit reached for this session (${MAX_IMAGES_PER_SESSION}). Open a new tab to keep creating!`);
      }

      // Reference images: this turn's attached images (an auto-attached previous result counts).
      const refs: string[] = [];
      for (const a of (node.attachments ?? []).filter((x) => x.kind === 'image').slice(0, 4)) {
        const blob = await getBlob(a.blobKey);
        if (blob) refs.push(await blobToDataUrl(blob));
      }
      if (!isCurrent()) return;

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: node.user, size: node.imageSize ?? '1024x1024', refs }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let message = raw;
        try {
          message = JSON.parse(raw).error ?? raw;
        } catch {
          /* keep raw */
        }
        throw new Error(String(message).slice(0, 300) || `Image request failed (${res.status})`);
      }
      const json = await res.json();
      const b64: unknown = json?.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) throw new Error('The image painter returned nothing. Please retry.');
      const format = json?.output_format === 'png' ? 'png' : json?.output_format === 'jpeg' ? 'jpeg' : 'webp';
      const mime = `image/${format}`;
      const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
      if (!isCurrent()) return;

      const blobKey = `gen-${nanoid()}`;
      await putBlob(blobKey, blob);
      const { thumb, width, height } = await makeThumb(blob);
      if (!isCurrent()) {
        void del(blobKey);
        return;
      }
      clearTimeout(timer);
      finish();
      const edited = refs.length > 0;
      get().updateNode(nodeId, {
        outputs: [
          { id: nanoid(), name: 'sakura-image', mime, size: blob.size, kind: 'image', blobKey, thumb, width, height },
        ],
        assistant: edited ? 'Here is your edited image! 🎨' : 'Here is your image! 🎨',
        summary: `${edited ? 'Edited' : 'Generated'} image: ${node.user.slice(0, 120)}`,
        status: 'done',
      });
      get().setMascotState('success');
      setTimeout(() => {
        if (get().mascotState === 'success') get().setMascotState('idle');
      }, 1500);
    } catch (err) {
      clearTimeout(timer);
      if (!isCurrent()) return;
      if (controller.signal.aborted && controller.signal.reason === 'user-cancel') {
        finish();
        get().updateNode(nodeId, { status: 'done', assistant: '*(Image cancelled)*' });
        get().setMascotState('idle');
        return;
      }
      fail(err instanceof Error ? err.message : 'Image generation failed.');
    }
  })();
}

/** Starts the right kind of run for a node (chat stream or image generation). */
function run(nodeId: string) {
  if (get().nodes[nodeId]?.tool === 'image') runImage(nodeId);
  else runStream(nodeId);
}

/**
 * Creates a new turn under parentId and starts streaming the reply.
 * Returns the new node id, or null when the per-session message cap is reached.
 */
export function sendTurn(opts: {
  parentId: string | null;
  text: string;
  kind: NodeKind;
  branchRoot?: boolean;
  versionOf?: string;
  attachments?: Attachment[];
  tool?: ToolMode;
  imageSize?: ImageSize;
}): string | null {
  if (!takeMessageSlot()) return null;

  const id = nanoid();
  const node: TurnNode = {
    id,
    parentId: opts.parentId,
    kind: opts.kind,
    title: makeTitle(opts.text),
    user: opts.text,
    assistant: '',
    status: 'thinking',
    createdAt: Date.now(),
    webSearchEnabled: get().webSearchEnabled && !opts.tool,
    searchQueries: [],
    citations: [],
    ...(opts.branchRoot ? { branchRoot: true } : {}),
    ...(opts.versionOf ? { versionOf: opts.versionOf } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    ...(opts.tool ? { tool: opts.tool } : {}),
    ...(opts.tool === 'image' ? { imageSize: opts.imageSize ?? '1024x1024' } : {}),
  };
  // Side turns must not move the main panel.
  get().addNode(node, opts.kind === 'main');
  run(id);
  return id;
}

/**
 * Sends a message in the main thread. The reply starts streaming immediately;
 * in parallel the router decides whether the message is a tangent (moves to a
 * side window) or an unrelated topic (starts a new tree). Both are undoable.
 */
export function sendMainTurn(
  text: string,
  attachments?: Attachment[],
  tool?: ToolMode,
  imageSize?: ImageSize
): string | null {
  const thread = getMainThread(get().nodes, get().activeId);
  const parentId = thread.length ? thread[thread.length - 1].id : null;
  const id = sendTurn({ parentId, text, kind: 'main', attachments, tool, imageSize });
  if (!id) return null;

  // Never route the first two messages of a tree.
  // Turns with files or a tool never auto-route (they need to stay where the user put them).
  if (!get().autoRoute || !parentId || thread.length < 2 || attachments?.length || tool) return id;

  void (async () => {
    const result = await routeMessage(branchSummary(thread), text);

    // Ignore stale results: node gone, already moved, or the user has moved on.
    const st = get();
    const node = st.nodes[id];
    if (!node || node.kind !== 'main' || node.parentId !== parentId) return;
    if (Object.values(st.nodes).some((n) => n.parentId === id)) return;

    if (result.title) st.updateNode(id, { title: result.title });

    if (result.decision === 'tangent') {
      st.updateNode(id, { kind: 'side', branchRoot: true });
      st.setActive(parentId);
      st.openWindow({ rootId: id, anchorId: parentId });
      st.setMascotState('branching');
      st.pushToast({
        message: '🧋 Boba spotted a tangent, so it moved to a side window',
        actionLabel: 'Keep in main',
        onAction: () => {
          const s = get();
          const n = s.nodes[id];
          if (!n) return;
          s.updateNode(id, { kind: 'main', branchRoot: undefined });
          s.windows.filter((w) => w.rootId === id).forEach((w) => s.closeWindow(w.id));
          s.setActive(id);
        },
      });
    } else if (result.decision === 'new_topic') {
      // An unrelated topic gets its own chat (and its own graph) in the sidebar.
      const oldConv = node.conversationId;
      const newConv = st.createConversation(result.title || node.title);
      st.updateNode(id, { parentId: null, conversationId: newConv });
      st.setActive(id);
      restartTurn(id);
      st.setMascotState('branching');
      st.pushToast({
        message: '🌱 Fresh topic, so I started a new chat',
        actionLabel: 'Keep in thread',
        onAction: () => {
          const s = get();
          if (!s.nodes[id]) return;
          // The new chat already carries on without this turn? Then leave it as it is.
          if (Object.values(s.nodes).some((n) => n.conversationId === newConv && n.id !== id)) {
            s.pushToast({ message: '🍵 That chat has already continued, so it stays separate' });
            return;
          }
          s.updateNode(id, { parentId, conversationId: oldConv });
          s.deleteConversation(newConv);
          if (oldConv) get().switchConversation(oldConv);
          get().setActive(id);
          restartTurn(id);
        },
      });
    }
  })();

  return id;
}

/**
 * Edits a turn by creating a sibling version (the original and its replies are kept).
 * Returns the new node id, or null if nothing changed / the cap was reached.
 */
export function editTurn(nodeId: string, text: string): string | null {
  const n = get().nodes[nodeId];
  const trimmed = text.trim();
  if (!n || !trimmed || trimmed === n.user.trim()) return null;
  return sendTurn({
    parentId: n.parentId,
    text: trimmed,
    kind: n.kind,
    branchRoot: n.branchRoot,
    versionOf: versionOrigin(n),
    attachments: n.attachments,
    tool: n.tool,
    imageSize: n.imageSize,
  });
}

/** Restarts a reply without counting against the message cap (internal re-runs). */
function restartTurn(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;
  get().updateNode(nodeId, {
    assistant: '',
    summary: undefined,
    status: 'thinking',
    searchQueries: [],
    citations: [],
    outputs: undefined,
  });
  run(nodeId);
}

/** User-initiated retry: counts as a message. */
export function retryTurn(nodeId: string) {
  if (!get().nodes[nodeId] || !takeMessageSlot()) return;
  restartTurn(nodeId);
}

export function cancelTurn(nodeId: string) {
  const c = inflight.get(nodeId);
  if (c) {
    c.abort('user-cancel');
  } else {
    const n = get().nodes[nodeId];
    if (n && (n.status === 'thinking' || n.status === 'streaming')) {
      get().updateNode(nodeId, { status: 'done' });
      get().setMascotState('idle');
    }
  }
}

/** Asks for confirmation (showing exactly what will go), then runs deleteTurn. */
export function requestDeleteTurn(id: string) {
  const st = get();
  const node = st.nodes[id];
  if (!node) return;

  const doomed = collectSubtree(st.nodes, id);
  const total = doomed.size;
  const below = total - 1;
  const streaming = [...doomed].some((nodeId) => isBusy(st.nodes[nodeId]));

  let message =
    below === 0
      ? 'Its reply goes with it.'
      : `This also deletes the ${below} turn${below === 1 ? '' : 's'} that came after it, side branches included.`;
  if (streaming) message += ' A reply is still being written; it will be stopped.';
  message += ' You can undo right after.';

  const title = node.title.length > 40 ? `${node.title.slice(0, 40)}...` : node.title;
  st.askConfirm({
    title: `Delete \u201c${title}\u201d?`,
    message,
    confirmLabel: total === 1 ? 'Delete turn' : `Delete ${total} turns`,
    onConfirm: () => deleteTurn(id),
  });
}

/** Asks for confirmation, then deletes a whole chat (all of its turns) with an Undo toast. */
export function requestDeleteConversation(id: string) {
  const st = get();
  const conv = st.conversations[id];
  if (!conv) return;
  const count = Object.values(st.nodes).filter((n) => n.conversationId === id).length;
  const title = conv.title.length > 40 ? `${conv.title.slice(0, 40)}...` : conv.title;
  st.askConfirm({
    title: `Delete \u201c${title}\u201d?`,
    message:
      count === 0
        ? 'This empty chat will be removed.'
        : `This deletes all ${count} turn${count === 1 ? '' : 's'} in this chat, side branches included. You can undo right after.`,
    confirmLabel: 'Delete chat',
    onConfirm: () => {
      const s = get();
      const doomed = Object.fromEntries(
        Object.entries(s.nodes).filter(([, n]) => n.conversationId === id)
      );
      Object.keys(doomed).forEach((nodeId) => {
        if (inflight.has(nodeId)) cancelTurn(nodeId);
      });
      s.deleteConversation(id);
      get().pushToast({
        message: `\uD83D\uDDD1\uFE0F Deleted \u201c${title}\u201d`,
        actionLabel: 'Undo',
        onAction: () => get().restoreConversation(conv, doomed),
      });
    },
  });
}

/** Deletes a turn and everything below it, with an Undo toast that restores it exactly. */
export function deleteTurn(id: string) {
  const st = get();
  if (!st.nodes[id]) return;

  const doomed = collectSubtree(st.nodes, id);

  doomed.forEach((nodeId) => {
    if (inflight.has(nodeId)) cancelTurn(nodeId);
  });

  const snapshot = {
    nodes: Object.fromEntries([...doomed].map((nodeId) => [nodeId, get().nodes[nodeId]])),
    activeId: st.activeId,
    windows: st.windows,
  };

  get().deleteSubtree(id);

  const count = doomed.size;
  get().pushToast({
    message: `🗑️ Deleted ${count} turn${count === 1 ? '' : 's'}`,
    actionLabel: 'Undo',
    onAction: () => get().restoreSnapshot(snapshot),
  });
}

export function isBusy(node: TurnNode | null | undefined): boolean {
  return !!node && (node.status === 'thinking' || node.status === 'streaming' || node.status === 'routing');
}
