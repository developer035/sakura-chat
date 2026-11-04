/**
 * Best-effort per-IP sliding-window rate limiter.
 *
 * State lives in module memory, so it is per server instance / edge isolate.
 * That is not airtight (a determined attacker can spread across instances) but it
 * stops naive scripted abuse of a public demo URL.
 */
const hitsByKey = new Map<string, number[]>();
const STALE_AFTER_MS = 10 * 60 * 1000;

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'local';
}

export function rateLimit(
  req: Request,
  bucket: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= max) {
    hitsByKey.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }

  hits.push(now);
  hitsByKey.set(key, hits);

  // Keep memory bounded: occasionally drop keys that have gone quiet.
  if (hitsByKey.size > 2000) {
    for (const [k, v] of hitsByKey) {
      if (now - v[v.length - 1] > STALE_AFTER_MS) hitsByKey.delete(k);
    }
  }

  return { ok: true, retryAfter: 0 };
}
