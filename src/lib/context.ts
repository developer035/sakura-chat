import { DEFAULT_CONTEXT_BUDGET, SYSTEM_PROMPT_RESERVE } from './constants';
import type { TurnNode } from './types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function estimateTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/**
 * Builds the chronological message array starting from root up to parentId,
 * taking into account token budgeting, summary compaction for older nodes,
 * and user exclusions.
 */
export function buildContext(
  nodes: Record<string, TurnNode>,
  parentId: string | null,
  budget = DEFAULT_CONTEXT_BUDGET
): ChatMessage[] {
  if (!parentId || !nodes[parentId]) {
    return [];
  }

  // Walk from parentId up to root
  const path: TurnNode[] = [];
  let curr: TurnNode | undefined = nodes[parentId];

  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }

  const usable = path.filter((n) => !n.excluded);
  const effectiveBudget = Math.max(1000, budget - SYSTEM_PROMPT_RESERVE);

  let total = usable.reduce(
    (s, n) => s + estimateTokens(n.user) + estimateTokens(n.assistant),
    0
  );

  const messages: ChatMessage[] = [];

  for (const n of usable) {
    const isDirectParent = n.id === parentId;

    // Compact older nodes if over budget and summary is available
    if (total > effectiveBudget && n.summary && !isDirectParent) {
      const savedTokens =
        estimateTokens(n.user) +
        estimateTokens(n.assistant) -
        estimateTokens(n.summary);
      total -= savedTokens;

      messages.push({
        role: 'user',
        content: `(earlier topic: ${n.title})`,
      });
      messages.push({
        role: 'assistant',
        content: n.summary,
      });
    } else {
      messages.push({
        role: 'user',
        content: n.user,
      });
      if (n.assistant) {
        messages.push({
          role: 'assistant',
          content: n.assistant,
        });
      }
    }

    // Include pinned return summaries from side branches if present
    if (n.pin) {
      messages.push({
        role: 'assistant',
        content: `[Side note pinned from tangent: ${n.pin}]`,
      });
    }
  }

  return messages;
}
