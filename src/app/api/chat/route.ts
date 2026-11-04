import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts';
import { META_API_URL, META_MODEL_CHAT, MAX_MESSAGE_TOKENS } from '@/lib/constants';

export const runtime = 'edge';

export async function POST(req: Request) {
  const apiKey = process.env.META_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: 'META_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: {
    messages?: Array<{ role: string; content: string }>;
    system?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { messages = [], system = CHAT_SYSTEM_PROMPT } = body;

  try {
    const upstream = await fetch(META_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: META_MODEL_CHAT,
        stream: true,
        max_tokens: MAX_MESSAGE_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => 'Upstream call failed');
      return new Response(errText, {
        status: upstream.status || 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return Response.json({ error: message }, { status: 500 });
  }
}
