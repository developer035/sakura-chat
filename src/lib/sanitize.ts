import type { Attachment, Conversation, NodeStatus, SearchCitation, TurnNode, WindowState } from './types';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Statuses that imply a live stream cannot survive a reload/import, so they become
 * `error` (which shows the Retry button) instead of spinning forever.
 */
export function sanitizeStatus(status: unknown): NodeStatus {
  switch (status) {
    case 'thinking':
    case 'streaming':
    case 'routing':
      return 'error';
    case 'idle':
    case 'done':
    case 'error':
      return status;
    default:
      return 'done';
  }
}

const KINDS = ['image', 'pdf', 'docx', 'text'];

function sanitizeAttachments(raw: unknown): Attachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Attachment[] = [];
  for (const a of raw.slice(0, 12)) {
    if (!isObj(a)) continue;
    const id = str(a.id);
    const name = str(a.name);
    const blobKey = str(a.blobKey);
    const kind = str(a.kind);
    if (!id || !name || !blobKey || !kind || !KINDS.includes(kind)) continue;
    const att: Attachment = {
      id,
      name: name.slice(0, 200),
      mime: str(a.mime) ?? 'application/octet-stream',
      size: num(a.size) ?? 0,
      kind: kind as Attachment['kind'],
      blobKey,
    };
    const textKey = str(a.textKey);
    if (textKey) att.textKey = textKey;
    const [tt, pages, width, height] = [num(a.textTokens), num(a.pages), num(a.width), num(a.height)];
    if (tt !== undefined) att.textTokens = tt;
    if (pages !== undefined) att.pages = pages;
    if (width !== undefined) att.width = width;
    if (height !== undefined) att.height = height;
    if (a.truncated === true) att.truncated = true;
    if (Array.isArray(a.pageImageKeys)) {
      att.pageImageKeys = a.pageImageKeys.filter((k): k is string => typeof k === 'string').slice(0, 8);
    }
    const thumb = str(a.thumb);
    if (thumb && thumb.startsWith('data:image/') && thumb.length < 40_000) att.thumb = thumb;
    out.push(att);
  }
  return out;
}

function sanitizeNode(key: string, v: unknown): TurnNode | null {
  if (!isObj(v)) return null;
  const user = str(v.user);
  if (user === undefined) return null;

  const id = str(v.id) ?? key;
  const node: TurnNode = {
    id,
    parentId: str(v.parentId) ?? null,
    kind: v.kind === 'side' ? 'side' : 'main',
    title: str(v.title) || (user.length > 28 ? `${user.slice(0, 28)}...` : user),
    user,
    assistant: str(v.assistant) ?? '',
    status: sanitizeStatus(v.status),
    createdAt: num(v.createdAt) ?? Date.now(),
  };

  const conversationId = str(v.conversationId);
  if (conversationId) node.conversationId = conversationId;
  const summary = str(v.summary);
  if (summary) node.summary = summary;
  const pin = str(v.pin);
  if (pin) node.pin = pin;
  if (typeof v.excluded === 'boolean') node.excluded = v.excluded;
  if (typeof v.webSearchEnabled === 'boolean') node.webSearchEnabled = v.webSearchEnabled;
  if (typeof v.branchRoot === 'boolean') node.branchRoot = v.branchRoot;
  const versionOf = str(v.versionOf);
  if (versionOf) node.versionOf = versionOf;
  const attachments = sanitizeAttachments(v.attachments);
  if (attachments?.length) node.attachments = attachments;
  const outputs = sanitizeAttachments(v.outputs);
  if (outputs?.length) node.outputs = outputs;
  if (v.tool === 'image' || v.tool === 'document') node.tool = v.tool;
  if (v.imageSize === '1024x1024' || v.imageSize === '1536x1024' || v.imageSize === '1024x1536') {
    node.imageSize = v.imageSize;
  }
  if (Array.isArray(v.searchQueries)) {
    node.searchQueries = v.searchQueries.filter((q): q is string => typeof q === 'string');
  }
  if (Array.isArray(v.citations)) {
    node.citations = v.citations.flatMap((c): SearchCitation[] => {
      if (!isObj(c) || typeof c.url !== 'string') return [];
      return [{ url: c.url, title: str(c.title) }];
    });
  }
  return node;
}

/**
 * Validates an untrusted `nodes` map (localStorage or an imported file).
 * Drops malformed entries, repairs dangling parents and breaks parent cycles so
 * that every tree walk in the app is guaranteed to terminate.
 */
export function sanitizeNodes(raw: unknown): Record<string, TurnNode> {
  if (!isObj(raw)) return {};

  const nodes: Record<string, TurnNode> = {};
  for (const [key, value] of Object.entries(raw)) {
    const node = sanitizeNode(key, value);
    if (node) nodes[node.id] = node;
  }

  // Dangling parents become roots.
  for (const n of Object.values(nodes)) {
    if (n.parentId && !nodes[n.parentId]) n.parentId = null;
    if (n.parentId === n.id) n.parentId = null;
  }

  // Break cycles: walking up from any node must reach a root.
  for (const n of Object.values(nodes)) {
    const seen = new Set<string>([n.id]);
    let cur: TurnNode | undefined = n.parentId ? nodes[n.parentId] : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        n.parentId = null;
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? nodes[cur.parentId] : undefined;
    }
  }

  return nodes;
}

/** Keeps only windows with sane geometry whose nodes still exist. */
export function sanitizeWindows(raw: unknown, nodes: Record<string, TurnNode>): WindowState[] {
  if (!Array.isArray(raw)) return [];
  const out: WindowState[] = [];
  for (const w of raw) {
    if (!isObj(w)) continue;
    const id = str(w.id);
    const anchorId = str(w.anchorId);
    const rootId = w.rootId === null || w.rootId === undefined ? null : str(w.rootId);
    const [x, y, wd, h, z] = [num(w.x), num(w.y), num(w.w), num(w.h), num(w.z)];
    if (!id || !anchorId || !nodes[anchorId]) continue;
    if (rootId === undefined || (rootId !== null && !nodes[rootId])) continue;
    if (x === undefined || y === undefined || wd === undefined || h === undefined || z === undefined) {
      continue;
    }
    out.push({ id, anchorId, rootId, x, y, w: wd, h, z, minimized: w.minimized === true });
  }
  return out.slice(0, 3);
}

/** Validates an untrusted `conversations` map (localStorage or an imported file). */
export function sanitizeConversations(raw: unknown): Record<string, Conversation> {
  const out: Record<string, Conversation> = {};
  if (!isObj(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    const id = str(v.id) ?? key;
    const title = (str(v.title) ?? '').trim().slice(0, 80);
    const createdAt = num(v.createdAt) ?? Date.now();
    out[id] = { id, title: title || 'New chat', createdAt, updatedAt: num(v.updatedAt) ?? createdAt };
  }
  return out;
}
