import type { Conversation, TurnNode } from './types';

export const DEFAULT_CHAT_TITLE = 'New chat';

export const newConversationId = () =>
  `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function rootOf(nodes: Record<string, TurnNode>, id: string): string {
  let cur = nodes[id];
  const seen = new Set<string>();
  while (cur && cur.parentId && nodes[cur.parentId] && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = nodes[cur.parentId];
  }
  return cur?.id ?? id;
}

/**
 * Makes every node belong to a known conversation. Nodes without one (data saved before
 * conversations existed, old exports) are grouped by their root: each tree becomes its own
 * conversation. Idempotent: ids are derived from the root id, so repeating it changes nothing.
 */
export function assignConversations(
  nodes: Record<string, TurnNode>,
  conversations: Record<string, Conversation>
): { nodes: Record<string, TurnNode>; conversations: Record<string, Conversation> } {
  const outNodes: Record<string, TurnNode> = { ...nodes };
  const outConvs: Record<string, Conversation> = { ...conversations };

  const groups = new Map<string, TurnNode[]>();
  for (const n of Object.values(nodes)) {
    if (n.conversationId && outConvs[n.conversationId]) continue;
    const root = rootOf(nodes, n.id);
    const list = groups.get(root) ?? [];
    list.push(n);
    groups.set(root, list);
  }

  for (const [rootId, members] of groups) {
    const convId = `conv-${rootId}`;
    const root = nodes[rootId] ?? members[0];
    const times = members.map((m) => m.createdAt);
    const existing = outConvs[convId];
    outConvs[convId] = existing ?? {
      id: convId,
      title: root.title || DEFAULT_CHAT_TITLE,
      createdAt: Math.min(...times),
      updatedAt: Math.max(...times),
    };
    for (const m of members) outNodes[m.id] = { ...m, conversationId: convId };
  }

  return { nodes: outNodes, conversations: outConvs };
}

/** The node to show when opening a conversation: its newest main-thread turn. */
export function lastActiveNode(nodes: Record<string, TurnNode>, convId: string): TurnNode | null {
  let best: TurnNode | null = null;
  let bestMain: TurnNode | null = null;
  for (const n of Object.values(nodes)) {
    if (n.conversationId !== convId) continue;
    if (!best || n.createdAt > best.createdAt) best = n;
    if (n.kind === 'main' && (!bestMain || n.createdAt > bestMain.createdAt)) bestMain = n;
  }
  return bestMain ?? best;
}

export function conversationHasNodes(nodes: Record<string, TurnNode>, convId: string): boolean {
  return Object.values(nodes).some((n) => n.conversationId === convId);
}

/** Most recently updated first. */
export function sortedConversations(conversations: Record<string, Conversation>): Conversation[] {
  return Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt);
}
