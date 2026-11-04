import { blobToDataUrl, del, entries, getBlob, getText, putBlob, putText } from './file-store';
import type { Attachment, TurnNode } from './types';

/** Every IndexedDB key a node refers to. */
export function keysOf(node: TurnNode): string[] {
  const keys: string[] = [];
  for (const a of [...(node.attachments ?? []), ...(node.outputs ?? [])] as Attachment[]) {
    keys.push(a.blobKey);
    if (a.textKey) keys.push(a.textKey);
    if (a.pageImageKeys) keys.push(...a.pageImageKeys);
  }
  return keys;
}

type FileEntry = { kind: 'blob'; data: string } | { kind: 'text'; data: string };

/**
 * Export v2: the v1 JSON plus `files`, so a backup includes uploaded and generated files.
 * v1 files (no `files`) still import.
 */
export async function embedFiles(
  baseJson: string,
  nodes: Record<string, TurnNode>
): Promise<{ json: string; missing: number }> {
  const parsed = JSON.parse(baseJson);
  const keys = new Set<string>();
  Object.values(nodes).forEach((n) => keysOf(n).forEach((k) => keys.add(k)));

  const files: Record<string, FileEntry> = {};
  let missing = 0;
  for (const key of keys) {
    const blob = await getBlob(key);
    if (blob) {
      files[key] = { kind: 'blob', data: await blobToDataUrl(blob) };
      continue;
    }
    const text = await getText(key);
    if (text !== null) files[key] = { kind: 'text', data: text };
    else missing += 1;
  }
  parsed.version = '2.0';
  parsed.files = files;
  return { json: JSON.stringify(parsed), missing };
}

/** Writes an imported bundle's files into IndexedDB (call before importJSON). */
export async function restoreFiles(parsed: unknown): Promise<number> {
  const files = (parsed as { files?: Record<string, FileEntry> } | null)?.files;
  if (!files || typeof files !== 'object') return 0;
  let n = 0;
  for (const [key, entry] of Object.entries(files)) {
    if (!entry || typeof entry.data !== 'string' || key.length > 100) continue;
    try {
      if (entry.kind === 'blob' && entry.data.startsWith('data:')) {
        await putBlob(key, await (await fetch(entry.data)).blob());
        n += 1;
      } else if (entry.kind === 'text') {
        await putText(key, entry.data);
        n += 1;
      }
    } catch {
      /* skip unreadable entries */
    }
  }
  return n;
}

const CLEANUP_MIN_AGE_MS = 10 * 60 * 1000;

/**
 * Removes stored files that no turn refers to (deleted turns, resets, abandoned uploads).
 * Young entries are kept so an Undo or an in-flight upload is never broken.
 */
export async function cleanupFiles(nodes: Record<string, TurnNode>): Promise<number> {
  const referenced = new Set<string>();
  Object.values(nodes).forEach((n) => keysOf(n).forEach((k) => referenced.add(k)));
  const now = Date.now();
  let removed = 0;
  for (const { key, createdAt } of await entries()) {
    if (referenced.has(key) || now - createdAt < CLEANUP_MIN_AGE_MS) continue;
    await del(key);
    removed += 1;
  }
  return removed;
}
