import type { TurnNode } from './types';

/**
 * Local sanity checks that run before the AI router. A message that obviously builds on the
 * recent thread (or on what the assistant just said) is a continuation: no API call is made
 * and it can never be moved to a side window.
 */

const STOP = new Set(
  (
    'about above after again also always another because been before being between both cant could does doing done dont each ' +
    'even every find from give going good great have having here into just keep know like look made make many might more most much ' +
    'must need never only other over really right same should show some still such sure take tell than that their them then there ' +
    'these they thing things think this those through very want well were what when where which while will with without would your ' +
    'yours mine best able also quick question random please thanks thank okay help helps using used uses come comes said says ' +
    'something anything everything someone anyone because since until upon whose whom whats hows whys ' +
    'the and for are but not you all any can had her was one our out has him how its who did get may new now old see two way use say she too put let why yes nor yet via per'
  ).split(' ')
);

const tokens = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w));

/** Words that point back at the conversation ("why that one?", "make the second point shorter"). */
const REFERENCE_RE =
  /\b(it|its|that|this|those|these|they|them|above|earlier|previous|before|why|elaborate|explain|expand|shorter|longer|simpler|again|more)\b|\bthe (first|second|third|fourth|last|other|previous|same)\b|\bhow come\b/i;

/** The user is leaving the thread on purpose: let the router decide, never auto-continue. */
const ABANDON_RE =
  /\b(forget (that|it|the|about)|never ?mind|new topic|switch (to|topics)|let'?s (switch|move on|talk about something)|different (question|topic|subject)|change of subject|instead,? (help|let)|moving on)\b/i;

/** The user flags a side question themselves. */
const ASIDE_RE =
  /\b(btw|by the way|side note|on a side note|unrelated|off[- ]topic|random question|totally different|completely different|quick (side )?question|unrelated question|tangent)\b/i;

export const hasAsideMarker = (text: string) => ASIDE_RE.test(text);
export const hasAbandonMarker = (text: string) => ABANDON_RE.test(text);

function overlapCount(message: string[], hay: string[]): number {
  const set = new Set(hay);
  const prefixes = new Set(hay.filter((w) => w.length >= 5).map((w) => w.slice(0, 5)));
  let n = 0;
  for (const m of new Set(message)) {
    if (set.has(m) || (m.length >= 5 && prefixes.has(m.slice(0, 5)))) n += 1;
  }
  return n;
}

/**
 * True when the message clearly builds on the last two turns (their questions AND the
 * assistant's replies). Explicit "I'm leaving this topic" phrasing is never treated as related.
 * A signal word like "btw" raises the bar to two shared words, so a genuinely unrelated aside
 * is not rescued by one coincidental word.
 */
export function isRelatedToThread(thread: TurnNode[], text: string): boolean {
  const recent = thread.slice(-2);
  if (recent.length === 0) return false;
  if (hasAbandonMarker(text)) return false;

  const hay = tokens(recent.map((n) => `${n.title} ${n.user} ${n.assistant}`).join(' '));
  const need = hasAsideMarker(text) ? 2 : 1;
  if (overlapCount(tokens(text), hay) >= need) return true;

  const words = text.trim().split(/\s+/).length;
  return words <= 12 && !hasAsideMarker(text) && REFERENCE_RE.test(text);
}
