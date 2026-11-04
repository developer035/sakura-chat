import { IMAGE_TOKENS, planContext } from './context';
import { blobToDataUrl, getBlob, getText } from './file-store';
import type { Attachment, TurnNode } from './types';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface RequestMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

/** Only the newest images are sent as pixels; older ones become a text placeholder. */
export const MAX_IMAGES_SENT = 4;

export { IMAGE_TOKENS };

/** Images a turn contributes to a request: uploads, plus scanned-PDF page renders. */
export function imageRefs(n: TurnNode): Array<{ key: string; name: string }> {
  const out: Array<{ key: string; name: string }> = [];
  for (const a of n.attachments ?? []) {
    if (a.kind === 'image') out.push({ key: a.blobKey, name: a.name });
    else (a.pageImageKeys ?? []).forEach((key, i) => out.push({ key, name: `${a.name} p.${i + 1}` }));
  }
  return out;
}

function docLabel(a: Attachment): string {
  const pages = a.pages ? ` (${a.pages} page${a.pages === 1 ? '' : 's'})` : '';
  return `[Attached file: ${a.name}${pages}]`;
}

async function renderUser(n: TurnNode, allowed: Set<string>): Promise<string | ContentPart[]> {
  const atts = n.attachments ?? [];
  if (!atts.length) return n.user;

  let text = n.user;
  const images: ContentPart[] = [];

  for (const a of atts) {
    if (a.kind === 'image') continue;
    const body = a.textKey ? await getText(a.textKey) : null;
    if (body) text += `\n\n${docLabel(a)}${a.truncated ? ' (truncated)' : ''}\n${body}`;
    else if (!a.pageImageKeys?.length) text += `\n\n${docLabel(a)} (content unavailable)`;
  }

  for (const ref of imageRefs(n)) {
    if (!allowed.has(ref.key)) {
      text += `\n[image: ${ref.name}]`;
      continue;
    }
    const blob = await getBlob(ref.key);
    if (!blob) {
      text += `\n[image: ${ref.name} (unavailable)]`;
      continue;
    }
    images.push({ type: 'image_url', image_url: { url: await blobToDataUrl(blob) } });
  }

  return images.length ? [{ type: 'text', text }, ...images] : text;
}

/**
 * Async counterpart of buildContext: same plan (budget, summaries, exclusions, pins),
 * but user turns carry their attachments. Plain-text conversations come out as plain strings.
 */
export async function buildRequestMessages(
  nodes: Record<string, TurnNode>,
  current: TurnNode
): Promise<RequestMessage[]> {
  const { entries } = planContext(nodes, current.parentId);

  // Pick the newest MAX_IMAGES_SENT image keys across full-mode turns + the current one.
  const ordered: string[] = [];
  for (const { node, mode } of entries) if (mode === 'full') ordered.push(...imageRefs(node).map((r) => r.key));
  ordered.push(...imageRefs(current).map((r) => r.key));
  const allowed = new Set(ordered.slice(-MAX_IMAGES_SENT));

  const messages: RequestMessage[] = [];
  for (const { node: n, mode } of entries) {
    if (mode === 'excluded') continue;
    if (mode === 'summary') {
      messages.push({ role: 'user', content: `(earlier topic: ${n.title})` });
      messages.push({ role: 'assistant', content: n.summary as string });
    } else {
      messages.push({ role: 'user', content: await renderUser(n, allowed) });
      if (n.assistant) messages.push({ role: 'assistant', content: n.assistant });
    }
    if (n.pin) messages.push({ role: 'assistant', content: `[Side note pinned from tangent: ${n.pin}]` });
  }
  messages.push({ role: 'user', content: await renderUser(current, allowed) });
  return messages;
}
