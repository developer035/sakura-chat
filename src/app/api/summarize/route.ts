import { callMeta } from '@/lib/meta-server';
import { SUMMARIZER_SYSTEM_PROMPT } from '@/lib/prompts';

export async function POST(req: Request) {
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
