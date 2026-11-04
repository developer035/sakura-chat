import { callMeta } from '@/lib/meta-server';
import { ROUTER_SYSTEM_PROMPT } from '@/lib/prompts';

const DECISIONS = ['continue', 'tangent', 'new_topic'] as const;
type Decision = (typeof DECISIONS)[number];

const FALLBACK = { decision: 'continue' as Decision, title: '', reason: '' };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const branchSummary = String(body?.branchSummary ?? '').slice(0, 4000);
    const message = String(body?.message ?? '').slice(0, 4000);
    if (!message) return Response.json(FALLBACK);

    const content = await callMeta(
      [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current thread summary:\n${branchSummary || '(none)'}\n\nNew message:\n${message}`,
        },
      ],
      { temperature: 0, max_tokens: 800, timeoutMs: 8000 }
    );

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return Response.json(FALLBACK);
    const parsed = JSON.parse(match[0]);
    const decision: Decision = DECISIONS.includes(parsed.decision) ? parsed.decision : 'continue';
    return Response.json({
      decision,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 40) : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    });
  } catch {
    // The router is best-effort: never block or break the chat.
    return Response.json(FALLBACK);
  }
}
