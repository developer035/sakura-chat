import { nanoid } from 'nanoid';
import { useStore } from './store';
import { buildContext } from './context';
import { streamChat } from './stream';
import { CHAT_SYSTEM_PROMPT } from './prompts';
import { branchSummary, routeMessage, summarize } from './api';
import { getMainThread } from './tree-utils';
import type { NodeKind, SearchCitation, TurnNode } from './types';

/** Abort controllers for in-flight streams, keyed by node id. */
const inflight = new Map<string, AbortController>();

const get = () => useStore.getState();

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

  const history = buildContext(get().nodes, node.parentId);
  const messages = [...history, { role: 'user' as const, content: node.user }];
  const controller = new AbortController();
  inflight.get(nodeId)?.abort();
  inflight.set(nodeId, controller);

  get().setMascotState(node.webSearchEnabled ? 'sniffing' : 'thinking');

  // Only the newest stream for a node may write to it (a restart supersedes older ones).
  const isCurrent = () => inflight.get(nodeId) === controller;
  const finish = () => {
    if (isCurrent()) inflight.delete(nodeId);
  };

  void streamChat(
    { messages, system: CHAT_SYSTEM_PROMPT, webSearch: node.webSearchEnabled },
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
        get().setMascotState('idle');
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
}

/** Creates a new turn under parentId and starts streaming the reply. Returns the new node id. */
export function sendTurn(opts: {
  parentId: string | null;
  text: string;
  kind: NodeKind;
  branchRoot?: boolean;
}): string {
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
    webSearchEnabled: get().webSearchEnabled,
    searchQueries: [],
    citations: [],
    ...(opts.branchRoot ? { branchRoot: true } : {}),
  };
  // Side turns must not move the main panel.
  get().addNode(node, opts.kind === 'main');
  runStream(id);
  return id;
}

/**
 * Sends a message in the main thread. The reply starts streaming immediately;
 * in parallel the router decides whether the message is a tangent (moves to a
 * side window) or an unrelated topic (starts a new tree). Both are undoable.
 */
export function sendMainTurn(text: string): string {
  const thread = getMainThread(get().nodes, get().activeId);
  const parentId = thread.length ? thread[thread.length - 1].id : null;
  const id = sendTurn({ parentId, text, kind: 'main' });

  // Never route the first two messages of a tree.
  if (!get().autoRoute || !parentId || thread.length < 2) return id;

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
      st.updateNode(id, { parentId: null });
      retryTurn(id);
      st.setMascotState('branching');
      st.pushToast({
        message: '🌱 Fresh topic, so I started a new tree',
        actionLabel: 'Keep in thread',
        onAction: () => {
          const s = get();
          if (!s.nodes[id]) return;
          s.updateNode(id, { parentId });
          retryTurn(id);
          s.setActive(id);
        },
      });
    }
  })();

  return id;
}

export function retryTurn(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;
  get().updateNode(nodeId, {
    assistant: '',
    summary: undefined,
    status: 'thinking',
    searchQueries: [],
    citations: [],
  });
  runStream(nodeId);
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

export function isBusy(node: TurnNode | null | undefined): boolean {
  return !!node && (node.status === 'thinking' || node.status === 'streaming' || node.status === 'routing');
}
