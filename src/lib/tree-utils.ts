import type { TurnNode } from './types';

/**
 * Finds the leaf node of a branch given any start node ID.
 * Follows children down along the main path (or newest child) until a leaf is reached.
 */
export function findBranchLeaf(
  nodes: Record<string, TurnNode>,
  startId: string | null
): string | null {
  if (!startId || !nodes[startId]) {
    return null;
  }

  let currId = startId;
  const visited = new Set<string>([currId]);

  while (true) {
    const currNode = nodes[currId];
    if (!currNode) break;

    // Find direct children
    const children = Object.values(nodes).filter(
      (n) => n.parentId === currId && !visited.has(n.id)
    );

    if (children.length === 0) {
      break;
    }

    // If current is main branch, look for a main child first
    const mainChild = children.find((c) => c.kind === 'main');
    if (currNode.kind === 'main') {
      if (mainChild) {
        currId = mainChild.id;
        visited.add(currId);
        continue;
      }
      // If no main child exists, the main branch stops here
      break;
    }

    // For side branches, follow newest child
    const nextChild = children[children.length - 1];
    currId = nextChild.id;
    visited.add(currId);
  }

  return currId;
}

/**
 * Computes the full path from root down to the leaf of the active branch.
 */
export function getBranchPath(
  nodes: Record<string, TurnNode>,
  targetId: string | null
): TurnNode[] {
  if (!targetId || !nodes[targetId]) {
    return [];
  }

  const leafId = findBranchLeaf(nodes, targetId) || targetId;
  const path: TurnNode[] = [];
  let curr: TurnNode | undefined = nodes[leafId];

  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }

  return path;
}
