import type { ToolMode } from './types';

/** `/image a cat cafe` or `/doc launch checklist`: returns the tool and the prompt text. */
export function parseSlash(input: string): { tool: ToolMode; text: string } | null {
  const m = input.trim().match(/^\/(image|img|doc|document)\s+([\s\S]+)$/i);
  if (!m) return null;
  const text = m[2].trim();
  if (!text) return null;
  return { tool: /^doc/i.test(m[1]) ? 'document' : 'image', text };
}

/** True while the user is still typing the command word itself (`/`, `/im`, `/doc`). */
export function isSlashPrefix(input: string): boolean {
  return /^\/[a-z]{0,8}$/i.test(input);
}

const IMAGE_RE =
  /\b(draw|generate|create|make|paint|design|illustrate|render|sketch)\b[^.?!\n]{0,40}\b(image|picture|photo|illustration|logo|poster|icon|wallpaper|sticker|artwork|drawing|portrait)\b/i;

const DOC_RE =
  /\b(write|make|create|draft|generate|prepare|produce)\b[^.?!\n]{0,40}\b(pdf|docx|word document|document|report|resume|cv|cover letter|letter|essay|proposal|memo|checklist|handout|one-pager|brief)\b/i;

/**
 * Cheap client-side hint (no API call): suggests a tool but never switches to it by itself.
 * Requires a minimum length so half-typed words do not flicker the chip.
 */
export function suggestTool(input: string): ToolMode | null {
  const text = input.trim();
  if (text.length < 8 || text.startsWith('/')) return null;
  if (IMAGE_RE.test(text)) return 'image';
  if (DOC_RE.test(text)) return 'document';
  return null;
}
