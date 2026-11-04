import type { TurnNode } from './types';

type Nodes = Record<string, TurnNode>;

function childrenOf(nodes: Nodes, id: string): TurnNode[] {
  return Object.values(nodes)
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** A side root is the first node of a side branch. */
export function isSideRoot(nodes: Nodes, n: TurnNode): boolean {
  if (n.kind !== 'side') return false;
  if (n.branchRoot) return true;
  const parent = n.parentId ? nodes[n.parentId] : undefined;
  return !parent || parent.kind !== 'side';
}

/** Walks up from a side node to the root of its side branch. */
export function findSideRoot(nodes: Nodes, id: string): string | null {
  let curr: TurnNode | undefined = nodes[id];
  if (!curr || curr.kind !== 'side') return null;
  while (curr && !isSideRoot(nodes, curr)) {
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }
  return curr ? curr.id : null;
}

/**
 * Finds the leaf of the branch containing startId.
 * Main nodes follow their main child; side nodes follow their newest
 * continuation (side child that is not the root of another branch).
 */
export function findBranchLeaf(nodes: Nodes, startId: string | null): string | null {
  if (!startId || !nodes[startId]) return null;

  let currId = startId;
  const visited = new Set<string>([currId]);

  while (true) {
    const curr = nodes[currId];
    const kids = childrenOf(nodes, currId).filter((c) => !visited.has(c.id));
    const next =
      curr.kind === 'main'
        ? [...kids].reverse().find((c) => c.kind === 'main')
        : [...kids].reverse().find((c) => c.kind === 'side' && !c.branchRoot);
    if (!next) break;
    currId = next.id;
    visited.add(currId);
  }

  return currId;
}

/** Full path from the tree root down to the leaf of the branch containing targetId. */
export function getBranchPath(nodes: Nodes, targetId: string | null): TurnNode[] {
  if (!targetId || !nodes[targetId]) return [];

  const leafId = findBranchLeaf(nodes, targetId) || targetId;
  const path: TurnNode[] = [];
  let curr: TurnNode | undefined = nodes[leafId];
  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }
  return path;
}

/** Nearest main ancestor (or self) of a node. */
export function nearestMainId(nodes: Nodes, id: string | null): string | null {
  let curr: TurnNode | undefined = id ? nodes[id] : undefined;
  while (curr && curr.kind !== 'main') {
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }
  return curr ? curr.id : null;
}

/** Main-thread path (root to main leaf) for whatever node is active. */
export function getMainThread(nodes: Nodes, activeId: string | null): TurnNode[] {
  return getBranchPath(nodes, nearestMainId(nodes, activeId));
}

/** Nodes of one side branch only: from its root down to its leaf. */
export function getSideThread(nodes: Nodes, rootId: string | null): TurnNode[] {
  if (!rootId || !nodes[rootId]) return [];
  const leafId = findBranchLeaf(nodes, rootId) || rootId;
  const out: TurnNode[] = [];
  let curr: TurnNode | undefined = nodes[leafId];
  while (curr) {
    out.unshift(curr);
    if (curr.id === rootId) break;
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }
  return out;
}

/** A turn plus everything below it (replies, side branches, later turns). */
export function collectSubtree(nodes: Nodes, id: string): Set<string> {
  const out = new Set<string>();
  if (!nodes[id]) return out;
  out.add(id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of Object.values(nodes)) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Id of the first version of a turn (edited siblings point back at it). */
export function versionOrigin(n: TurnNode): string {
  return n.versionOf ?? n.id;
}

/** All versions of a turn (the turn plus its edited siblings), oldest first. */
export function getVersions(nodes: Nodes, id: string): TurnNode[] {
  const n = nodes[id];
  if (!n) return [];
  const origin = versionOrigin(n);
  return Object.values(nodes)
    .filter((x) => x.parentId === n.parentId && versionOrigin(x) === origin)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Side-branch roots hanging directly off a node (newest version of each). */
export function sideRootsOf(nodes: Nodes, parentId: string): TurnNode[] {
  const newestByOrigin = new Map<string, TurnNode>();
  for (const c of childrenOf(nodes, parentId)) {
    if (isSideRoot(nodes, c)) newestByOrigin.set(versionOrigin(c), c); // sorted oldest-first
  }
  return [...newestByOrigin.values()].sort((a, b) => a.createdAt - b.createdAt);
}
