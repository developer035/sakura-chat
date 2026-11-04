import { nanoid } from 'nanoid';
import { estimateTokens } from './context';
import { putBlob, putText } from './file-store';
import type { Attachment } from './types';

export const MAX_DOC_BYTES = 25 * 1024 * 1024;
export const MAX_DOC_CHARS = 60_000; // per file
export const MAX_PDF_PAGES = 100;
/** Total document text allowed in one message (stays under the server's 250k char cap). */
export const MAX_MESSAGE_DOC_CHARS = 160_000;
const SCANNED_PAGES_TO_RENDER = 4;

export class DocError extends Error {}

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'log', 'yaml', 'yml', 'ini', 'toml',
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'css', 'scss',
]);

const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

export function docKindOf(file: Pick<File, 'name' | 'type'>): 'pdf' | 'docx' | 'text' | null {
  const ext = extOf(file.name);
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (TEXT_EXTS.has(ext) || file.type.startsWith('text/')) return 'text';
  return null;
}

function clip(text: string): { text: string; truncated: boolean } {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (cleaned.length <= MAX_DOC_CHARS) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, MAX_DOC_CHARS), truncated: true };
}

async function finish(
  file: File,
  kind: 'pdf' | 'docx' | 'text',
  text: string,
  truncated: boolean,
  extra: Partial<Attachment> = {}
): Promise<Attachment> {
  const blobKey = `doc-${nanoid()}`;
  await putBlob(blobKey, file);
  const att: Attachment = {
    id: nanoid(),
    name: file.name.slice(0, 200),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    kind,
    blobKey,
    ...extra,
  };
  if (text) {
    const textKey = `txt-${nanoid()}`;
    await putText(textKey, text);
    att.textKey = textKey;
    att.textTokens = estimateTokens(text);
  }
  if (truncated) att.truncated = true;
  return att;
}

async function ingestPdf(file: File): Promise<Attachment> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new DocError(`${file.name} is password-protected`);
    }
    throw new DocError(`${file.name} could not be read as a PDF`);
  }

  try {
    const pageCount = doc.numPages;
    const limit = Math.min(pageCount, MAX_PDF_PAGES);
    let text = '';
    let truncated = pageCount > MAX_PDF_PAGES;

    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if ('str' in item) {
          line += item.str;
          line += item.hasEOL ? '\n' : '';
        }
      }
      text += `${i > 1 ? '\n\n' : ''}[Page ${i}]\n${line.trim()}`;
      page.cleanup();
      if (text.length > MAX_DOC_CHARS) {
        truncated = true;
        break;
      }
    }

    const clipped = clip(text);
    const realChars = clipped.text.replace(/\[Page \d+\]/g, '').replace(/\s+/g, '').length;
    // A true scan has (almost) no text layer; even a short memo clears ~10 chars per page.
    const scanned = realChars < 10 * Math.min(limit, 3);

    if (scanned) {
      // No text layer: render the first pages as images so the vision model can read them.
      const keys: string[] = [];
      for (let i = 1; i <= Math.min(pageCount, SCANNED_PAGES_TO_RENDER); i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1400 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new DocError('Canvas not available');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.8)
        );
        const key = `pg-${nanoid()}`;
        await putBlob(key, blob);
        keys.push(key);
        page.cleanup();
      }
      return finish(file, 'pdf', '', pageCount > keys.length, { pages: pageCount, pageImageKeys: keys });
    }

    return finish(file, 'pdf', clipped.text, truncated || clipped.truncated, { pages: pageCount });
  } finally {
    void task.destroy();
  }
}

async function ingestDocx(file: File): Promise<Attachment> {
  const mammoth = await import('mammoth');
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }));
  } catch {
    throw new DocError(`${file.name} could not be read as a Word document`);
  }
  const clipped = clip(value);
  if (!clipped.text) throw new DocError(`${file.name} has no readable text`);
  return finish(file, 'docx', clipped.text, clipped.truncated);
}

async function ingestPlainText(file: File): Promise<Attachment> {
  const clipped = clip(await file.text());
  if (!clipped.text) throw new DocError(`${file.name} is empty`);
  return finish(file, 'text', clipped.text, clipped.truncated);
}

/** Reads a PDF / DOCX / text-like file in the browser and stores its text in IndexedDB. */
export async function ingestDocument(file: File): Promise<Attachment> {
  if (file.size > MAX_DOC_BYTES) throw new DocError(`${file.name} is larger than 25MB`);
  const kind = docKindOf(file);
  if (kind === 'pdf') return ingestPdf(file);
  if (kind === 'docx') return ingestDocx(file);
  if (kind === 'text') return ingestPlainText(file);
  throw new DocError(`${file.name || 'That file'} is not a supported file type`);
}
