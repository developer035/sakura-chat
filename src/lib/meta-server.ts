import { META_API_URL, META_MODEL_CHAT } from './constants';

export interface MetaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Non-streaming chat completion against the Meta Model API. Throws on any failure.
 *
 * Muse Spark is a reasoning model: hidden reasoning tokens count against
 * max_tokens, so with the default effort a small cap yields `content: null`.
 * These helper calls (router, summarizer) are simple, so reasoning is set to
 * "minimal" (~1.5s instead of ~7s) and the cap leaves headroom.
 */
export async function callMeta(
  messages: MetaMessage[],
  opts: { temperature?: number; max_tokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new Error('META_API_KEY is not configured');

  const res = await fetch(META_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: META_MODEL_CHAT,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.max_tokens ?? 800,
      reasoning_effort: 'minimal',
      messages,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
  });
  if (!res.ok) throw new Error(`Meta API ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Meta API returned no content');
  return content;
}
