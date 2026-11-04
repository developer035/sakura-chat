import type { TurnNode } from './types';

export type RouteDecision = 'continue' | 'tangent' | 'new_topic';

export interface RouteResult {
  decision: RouteDecision;
  title: string;
  reason: string;
}

const CONTINUE: RouteResult = { decision: 'continue', title: '', reason: '' };

/** Asks the router how a new message relates to the current thread. Never throws. */
export async function routeMessage(branchSummary: string, message: string): Promise<RouteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('/api/route-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchSummary, message }),
      signal: controller.signal,
    });
    if (!res.ok) return CONTINUE;
    const data = await res.json();
    if (data?.decision === 'tangent' || data?.decision === 'new_topic') {
      return { decision: data.decision, title: String(data.title ?? ''), reason: String(data.reason ?? '') };
    }
    return { ...CONTINUE, title: String(data?.title ?? '') };
  } catch {
    return CONTINUE;
  } finally {
    clearTimeout(timer);
  }
}

/** Generates a 1-2 sentence summary of an exchange. Returns null on any failure. */
export async function summarize(user: string, assistant: string): Promise<string | null> {
  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, assistant }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.summary === 'string' && data.summary ? data.summary : null;
  } catch {
    return null;
  }
}

/**
 * The recent main thread as the router sees it: the last 3 turns with the user's message AND
 * the assistant's actual reply (follow-ups usually refer to something in the reply).
 */
export function routerContext(thread: TurnNode[]): string {
  const recent = thread.slice(-3);
  return recent
    .map((n, i) => {
      const isLast = i === recent.length - 1;
      const reply = (n.assistant || n.summary || '').replace(/\s+/g, ' ').trim();
      return `User: ${n.user.slice(0, 200)}\nAssistant: ${reply.slice(0, isLast ? 800 : 500)}`;
    })
    .join('\n\n');
}
