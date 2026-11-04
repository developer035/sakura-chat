import { nanoid } from 'nanoid';
import { putBlob } from './file-store';
import { DocError, docKindOf, ingestDocument } from './documents';
import type { Attachment } from './types';

export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_LONG_SIDE = 1568;
const THUMB_SIDE = 96;

/** `accept` attribute for the file picker. */
export const ACCEPT_ATTR =
  'image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.txt,.md,.csv,.json,.xml,.html,.log,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.sql,.css';

export class IngestError extends Error {}

export const isImageFile = (f: Blob) => /^image\/(png|jpe?g|webp|gif)$/i.test(f.type);

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, q)
  );
}

function drawScaled(bmp: ImageBitmap, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new IngestError('Canvas not available');
  ctx.fillStyle = '#fff'; // flatten transparency onto white (JPEG has no alpha)
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return { canvas, w, h };
}

/** Downscales (long side <= 1568, JPEG 0.85 on white), stores in IndexedDB, makes a thumbnail. */
export async function ingestImageBlob(file: Blob, name: string): Promise<Attachment> {
  if (file.size > MAX_RAW_IMAGE_BYTES) throw new IngestError(`${name} is larger than 20MB`);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new IngestError(`${name} could not be read as an image`);
  }
  try {
    const main = drawScaled(bmp, MAX_LONG_SIDE);
    const blob = await canvasToBlob(main.canvas, 'image/jpeg', 0.85);
    const thumb = drawScaled(bmp, THUMB_SIDE).canvas.toDataURL('image/jpeg', 0.6);
    const blobKey = `img-${nanoid()}`;
    await putBlob(blobKey, blob);
    return {
      id: nanoid(),
      name: name.slice(0, 200),
      mime: 'image/jpeg',
      size: blob.size,
      kind: 'image',
      blobKey,
      width: main.w,
      height: main.h,
      thumb,
    };
  } finally {
    bmp.close();
  }
}

/** Ingests any supported file (image or document). Throws IngestError with a friendly message. */
export async function ingestFile(file: File): Promise<Attachment> {
  if (isImageFile(file)) return ingestImageBlob(file, file.name || 'pasted-image.png');
  if (docKindOf(file)) {
    try {
      return await ingestDocument(file);
    } catch (err) {
      if (err instanceof DocError) throw new IngestError(err.message);
      throw new IngestError(`${file.name} could not be read`);
    }
  }
  throw new IngestError(`${file.name || 'That file'} is not a supported file type`);
}

/** Small thumbnail data URL from any image blob (used for generated images). */
export async function makeThumb(blob: Blob): Promise<{ thumb: string; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const { canvas } = drawScaled(bmp, THUMB_SIDE);
    return { thumb: canvas.toDataURL('image/jpeg', 0.6), width: bmp.width, height: bmp.height };
  } finally {
    bmp.close();
  }
}
