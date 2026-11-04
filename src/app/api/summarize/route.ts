import { callMeta } from '@/lib/meta-server';
import { SUMMARIZER_SYSTEM_PROMPT } from '@/lib/prompts';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  if (!rateLimit(req, 'summarize', 40, 60_000).ok) return Response.json({ summary: null });
  try {
    const body = await req.json();
    const user = String(body?.user ?? '').slice(0, 2000);
    const assistant = String(body?.assistant ?? '').slice(0, 6000);
    if (!assistant.trim()) return Response.json({ summary: null });

    const content = await callMeta(
      [
        { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: `User asked:\n${user}\n\nAssistant replied:\n${assistant}` },
      ],
      { temperature: 0.2, max_tokens: 800, timeoutMs: 15000 }
    );
    const summary = content.trim().slice(0, 400);
    return Response.json({ summary: summary || null });
  } catch {
    return Response.json({ summary: null });
  }
}
