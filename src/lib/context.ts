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

export type ContextMode = 'full' | 'summary' | 'excluded';

export interface ContextEntry {
  node: TurnNode;
  mode: ContextMode;
  /** Tokens this node contributes to the next request (0 when excluded). */
  tokens: number;
}

export interface ContextPlan {
  entries: ContextEntry[];
  total: number;
  /** Budget available for conversation (after reserving the system prompt). */
  budget: number;
}

/**
 * Decides, for every ancestor of parentId (root first), whether it is sent in
 * full, as a summary, or not at all. buildContext() renders this plan and the
 * Context Inspector displays it, so what you see is what is sent.
 */
export function planContext(
  nodes: Record<string, TurnNode>,
  parentId: string | null,
  budget = DEFAULT_CONTEXT_BUDGET
): ContextPlan {
  const effectiveBudget = Math.max(1000, budget - SYSTEM_PROMPT_RESERVE);
  if (!parentId || !nodes[parentId]) {
    return { entries: [], total: 0, budget: effectiveBudget };
  }

  // Walk from parentId up to root
  const path: TurnNode[] = [];
  let curr: TurnNode | undefined = nodes[parentId];
  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? nodes[curr.parentId] : undefined;
  }

  const fullCost = (n: TurnNode) => estimateTokens(n.user) + estimateTokens(n.assistant);
  const usable = path.filter((n) => !n.excluded);
  let total = usable.reduce((s, n) => s + fullCost(n), 0);

  const entries: ContextEntry[] = path.map((node) => {
    if (node.excluded) return { node, mode: 'excluded' as const, tokens: 0 };

    const isDirectParent = node.id === parentId;
    // Compact older nodes if over budget and a summary is available
    if (total > effectiveBudget && node.summary && !isDirectParent) {
      total -= fullCost(node) - estimateTokens(node.summary);
      return { node, mode: 'summary' as const, tokens: estimateTokens(node.summary) };
    }
    return { node, mode: 'full' as const, tokens: fullCost(node) };
  });

  return { entries, total, budget: effectiveBudget };
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
  const { entries } = planContext(nodes, parentId, budget);
  const messages: ChatMessage[] = [];

  for (const { node: n, mode } of entries) {
    if (mode === 'excluded') continue;

    if (mode === 'summary') {
      messages.push({ role: 'user', content: `(earlier topic: ${n.title})` });
      messages.push({ role: 'assistant', content: n.summary as string });
    } else {
      messages.push({ role: 'user', content: n.user });
      if (n.assistant) {
        messages.push({ role: 'assistant', content: n.assistant });
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
