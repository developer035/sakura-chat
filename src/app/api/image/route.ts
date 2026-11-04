import { rateLimit } from '@/lib/rate-limit';

const META_MODEL_IMAGE = 'muse-image-1.0';
const META_IMAGES_URL = 'https://api.meta.ai/v1/images/generations';
const META_IMAGE_EDITS_URL = 'https://api.meta.ai/v1/images/edits';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
const MAX_REFS = 4;
const MAX_REF_CHARS = 1_500_000;
const MAX_BODY_BYTES = 4_000_000; // stays under Vercel's 4.5MB request limit

/** The edits endpoint checks the declared MIME against the real bytes, so sniff it. */
function sniff(bytes: Buffer): { mime: string; ext: string } {
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length > 3 && bytes.subarray(0, 3).toString('latin1') === 'GIF') return { mime: 'image/gif', ext: 'gif' };
  return { mime: 'image/png', ext: 'png' };
}

function friendlyError(status: number, raw: string): string {
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    message = parsed?.error?.message ?? parsed?.error ?? raw;
  } catch {
    /* keep raw */
  }
  message = String(message).slice(0, 300);
  if (status === 429) return 'The image painter is busy right now. Try again in a minute 🍵';
  if (/safety|policy|moderation|blocked/i.test(message)) {
    return `The image request was declined by Meta's safety filter. Try rephrasing. (${message})`;
  }
  return message || 'Image generation failed.';
}

export async function POST(req: Request) {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'META_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const limited = rateLimit(req, 'image', 6, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many image requests. Have a sip of tea 🍵 and try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    );
  }

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  }

  let body: { prompt?: unknown; size?: unknown; refs?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return Response.json({ error: 'Prompt is required.' }, { status: 400 });
  if (prompt.length > 4000) return Response.json({ error: 'Prompt is too long.' }, { status: 413 });

  const size = typeof body.size === 'string' && SIZES.has(body.size) ? body.size : '1024x1024';

  const refsRaw = body.refs ?? [];
  if (!Array.isArray(refsRaw) || refsRaw.some((r) => typeof r !== 'string')) {
    return Response.json({ error: 'Invalid reference images.' }, { status: 400 });
  }
  const refs = refsRaw as string[];
  if (refs.length > MAX_REFS || refs.some((r) => r.length > MAX_REF_CHARS)) {
    return Response.json({ error: 'Too many or too large reference images.' }, { status: 413 });
  }
  if (refs.some((r) => !/^data:image\/[a-z+.-]+;base64,/i.test(r))) {
    return Response.json({ error: 'Invalid reference images.' }, { status: 400 });
  }

  try {
    let upstream: Response;
    if (refs.length === 0) {
      upstream = await fetch(META_IMAGES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: META_MODEL_IMAGE, prompt, n: 1, size }),
        signal: AbortSignal.timeout(55_000),
      });
    } else {
      const form = new FormData();
      form.append('model', META_MODEL_IMAGE);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('size', size);
      refs.forEach((url, i) => {
        const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
        const { mime, ext } = sniff(bytes);
        // One reference uses the plain field; several use indexed fields image[0], image[1], ...
        form.append(refs.length === 1 ? 'image' : `image[${i}]`, new Blob([new Uint8Array(bytes)], { type: mime }), `ref${i}.${ext}`);
      });
      upstream = await fetch(META_IMAGE_EDITS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(55_000),
      });
    }

    if (!upstream.ok || !upstream.body) {
      const raw = await upstream.text().catch(() => '');
      return Response.json(
        { error: friendlyError(upstream.status, raw) },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    // Stream the (large, base64) upstream body straight through without buffering it.
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[api/image] failed:', err);
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const detail =
      process.env.NODE_ENV !== 'production' && err instanceof Error ? ` (${err.message})` : '';
    return Response.json(
      { error: (timedOut ? 'Image generation timed out. Please try again.' : 'Image generation failed.') + detail },
      { status: timedOut ? 504 : 500 }
    );
  }
}
