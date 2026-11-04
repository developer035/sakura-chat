'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Download, FileText, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { TurnNode } from '@/lib/types';
import { docTitle, exportDocument, type DocFormat } from '@/lib/export-doc';

const FORMATS: Array<{ format: DocFormat; label: string; hint: string }> = [
  { format: 'pdf', label: 'PDF', hint: 'Ready to share or print' },
  { format: 'docx', label: 'Word (.docx)', hint: 'Editable in Word / Docs' },
  { format: 'md', label: 'Markdown', hint: 'Plain text with formatting' },
];

function useExport(markdown: string) {
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState<DocFormat | null>(null);
  const run = async (format: DocFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      await exportDocument(markdown, format);
    } catch (err) {
      console.error('Export failed:', err);
      pushToast({ message: `🍵 Could not create the ${format.toUpperCase()} file. Please try again.` });
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/** Compact ⬇ dropdown: download any assistant reply as PDF, DOCX or Markdown. */
export function DownloadMenu({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { busy, run } = useExport(markdown);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1 rounded-full text-[var(--ink-light)] hover:text-[var(--ink)] hover:bg-[var(--cream)] opacity-70 hover:opacity-100 transition-all"
        title="Download this reply"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-52 sticker-static bg-white p-1.5 space-y-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void run(f.format);
              }}
              className="w-full text-left rounded-xl px-3 py-1.5 text-sm font-heading font-semibold text-[var(--ink)] hover:bg-[var(--cream)]"
            >
              {f.label}
              <span className="block text-[11px] font-normal text-[var(--ink-light)]">{f.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Replaces the plain bubble body for document-tool turns: title, preview, download buttons. */
export function DocumentCard({ node }: { node: TurnNode }) {
  const [expanded, setExpanded] = useState(false);
  const markdown = node.assistant;
  const done = node.status === 'done' || node.status === 'error';
  const writing = !done;
  const { busy, run } = useExport(markdown);
  const title = markdown.trim() ? docTitle(markdown) : 'Your document';
  const canDownload = done && markdown.trim().length > 0;

  return (
    <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--cream)]/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--lavender)]/60 border-b-2 border-[var(--ink)]">
        <FileText className="w-4 h-4 shrink-0 text-[var(--ink)]" />
        <div className="flex-1 min-w-0">
          <div className="font-heading font-bold text-sm text-[var(--ink)] truncate">{title}</div>
          <div className="text-[10px] font-heading text-[var(--ink)]/70">
            {writing ? 'Writing…' : 'Document ready'}
          </div>
        </div>
        {writing && <Loader2 className="w-4 h-4 animate-spin text-[var(--ink)]" />}
      </div>

      <div
        className={`px-3 py-2 prose prose-sm max-w-none text-[var(--ink)] leading-relaxed overflow-y-auto ${
          expanded || writing ? 'max-h-[70vh]' : 'max-h-56'
        }`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || '*Drafting…*'}</ReactMarkdown>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t-2 border-[var(--ink)]/15 bg-white/70">
        {FORMATS.map((f) => (
          <button
            key={f.format}
            type="button"
            disabled={!canDownload || !!busy}
            onClick={() => void run(f.format)}
            className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] hover:text-white px-2.5 py-1 text-xs text-[var(--ink)] disabled:opacity-40"
            title={f.hint}
          >
            {busy === f.format ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{f.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-heading font-semibold text-[var(--ink-light)] hover:text-[var(--ink)]"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
    </div>
  );
}
