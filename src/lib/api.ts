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

/** Compact description of the recent main thread, for the router. */
export function branchSummary(thread: TurnNode[]): string {
  return thread
    .slice(-4)
    .map((n) => n.summary ?? `${n.title}: ${n.user.slice(0, 150)}`)
    .join('\n');
}
