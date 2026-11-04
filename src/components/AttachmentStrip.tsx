'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X } from 'lucide-react';
import { getBlob } from '@/lib/file-store';
import type { Attachment } from '@/lib/types';
import { useBlobUrl } from './useBlobUrl';

/** Full-size image viewer (portal, above floating windows). */
export function ImageLightbox({ att, onClose }: { att: Attachment; onClose: () => void }) {
  const url = useBlobUrl(att.blobKey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1250] flex items-center justify-center bg-[var(--ink)]/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 sticker-button bg-white p-2 text-[var(--ink)]"
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={att.name}
          className="max-w-full max-h-full rounded-2xl border-[3px] border-[var(--ink)] bg-white object-contain"
        />
      ) : (
        <div className="text-white font-heading">Loading…</div>
      )}
    </div>,
    document.body
  );
}

/** Thumbnails / file chips for the files attached to a turn. */
export function AttachmentStrip({ items, onOpen }: { items: Attachment[]; onOpen?: (a: Attachment) => void }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        {items.map((a) =>
          a.kind === 'image' ? (
            <button
              key={a.id}
              type="button"
              onClick={() => (onOpen ? onOpen(a) : setOpen(a))}
              className="rounded-xl border-2 border-[var(--ink)] overflow-hidden bg-white shadow-[0_2px_0_var(--ink)] hover:-translate-y-0.5 transition-transform"
              title={`${a.name} (click to enlarge)`}
            >
              {a.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumb} alt={a.name} className="w-20 h-20 object-cover" />
              ) : (
                <span className="w-20 h-20 flex items-center justify-center text-2xl">🖼️</span>
              )}
            </button>
          ) : (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--ink)] bg-white px-2.5 py-1.5 text-xs font-heading font-semibold text-[var(--ink)] shadow-[0_2px_0_var(--ink)] max-w-[220px]"
              title={a.name}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate">{a.name}</span>
              {a.pages ? <span className="opacity-60 shrink-0">{a.pages}p</span> : null}
              {a.truncated ? <span className="shrink-0 text-[10px] bg-[var(--butter)] rounded-full px-1.5">cut</span> : null}
            </span>
          )
        )}
      </div>
      {open && <ImageLightbox att={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Saves a stored image as a PNG (generated images are WebP, which many tools can't open). */
async function downloadAsPng(att: Attachment) {
  const blob = await getBlob(att.blobKey);
  if (!blob) return;
  let out = blob;
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    bmp.close();
    out = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b ?? blob), 'image/png'));
  }
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sakura-image-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function GeneratedImage({ att, onOpen }: { att: Attachment; onOpen: () => void }) {
  const url = useBlobUrl(att.blobKey);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="block rounded-2xl border-2 border-[var(--ink)] overflow-hidden bg-[var(--cream)] shadow-[0_3px_0_var(--ink)]"
        style={{ aspectRatio: att.width && att.height ? `${att.width} / ${att.height}` : undefined, maxWidth: 'min(100%, 420px)' }}
        title="Click to enlarge"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Generated" className="w-full h-full object-cover" />
        ) : att.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={att.thumb} alt="Generated (loading)" className="w-full h-full object-cover blur-sm" />
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => void downloadAsPng(att)}
        className="sticker-button bg-white hover:bg-[var(--cream)] px-2.5 py-1 text-xs text-[var(--ink)]"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download PNG</span>
      </button>
    </div>
  );
}

/** Images produced by the image tool, shown inside the assistant bubble. */
export function GeneratedImages({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  return (
    <div className="mb-3 space-y-3">
      {items.map((a) => (
        <GeneratedImage key={a.id} att={a} onOpen={() => setOpen(a)} />
      ))}
      {open && <ImageLightbox att={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
