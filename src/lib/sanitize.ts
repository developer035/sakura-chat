import type { NodeStatus, SearchCitation, TurnNode, WindowState } from './types';

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

  const summary = str(v.summary);
  if (summary) node.summary = summary;
  const pin = str(v.pin);
  if (pin) node.pin = pin;
  if (typeof v.excluded === 'boolean') node.excluded = v.excluded;
  if (typeof v.webSearchEnabled === 'boolean') node.webSearchEnabled = v.webSearchEnabled;
  if (typeof v.branchRoot === 'boolean') node.branchRoot = v.branchRoot;
  const versionOf = str(v.versionOf);
  if (versionOf) node.versionOf = versionOf;
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
