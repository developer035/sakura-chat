'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Loader2, Paperclip, Send, Square, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { MASCOTS } from '@/lib/constants';
import { ACCEPT_ATTR, IngestError, MAX_FILES_PER_MESSAGE, ingestFile } from '@/lib/attachments';
import { del } from '@/lib/file-store';
import type { Attachment, ToolMode } from '@/lib/types';

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[], tool?: ToolMode) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

interface Pending {
  id: string;
  name: string;
  att?: Attachment;
  failed?: boolean;
}

let pendingSeq = 0;

export function ChatInput({ onSend, onCancel, disabled = false, isStreaming = false }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const currentMascot = useStore((s) => s.currentMascot);
  const webSearchEnabled = useStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useStore((s) => s.setWebSearchEnabled);
  const pushToast = useStore((s) => s.pushToast);
  const mascotInfo = MASCOTS[currentMascot] || MASCOTS.mochi;

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const reading = pending.some((p) => !p.att && !p.failed);
  const ready = pending.filter((p) => p.att).map((p) => p.att as Attachment);
  const canSend = !disabled && !reading && (input.trim().length > 0 || ready.length > 0);

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    const room = MAX_FILES_PER_MESSAGE - pending.length;
    if (room <= 0) {
      pushToast({ message: `🌸 Up to ${MAX_FILES_PER_MESSAGE} files per message` });
      return;
    }
    if (files.length > room) {
      pushToast({ message: `🌸 Only ${MAX_FILES_PER_MESSAGE} files per message, so I took the first ${room}` });
    }
    for (const file of files.slice(0, room)) {
      const id = `p${++pendingSeq}`;
      const name = file.name || 'pasted-image.png';
      setPending((list) => [...list, { id, name }]);
      ingestFile(file)
        .then((att) => setPending((list) => list.map((p) => (p.id === id ? { ...p, att } : p))))
        .catch((err) => {
          setPending((list) => list.filter((p) => p.id !== id));
          pushToast({
            message: `🍵 ${err instanceof IngestError ? err.message : `Could not read ${name}`}`,
          });
        });
    }
  };

  const removePending = (p: Pending) => {
    setPending((list) => list.filter((x) => x.id !== p.id));
    if (p.att) {
      void del(p.att.blobKey);
      if (p.att.textKey) void del(p.att.textKey);
      p.att.pageImageKeys?.forEach((k) => void del(k));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!canSend || isStreaming) return;
    const text =
      input.trim() ||
      (ready.some((a) => a.kind !== 'image') ? 'Summarize this document.' : 'Describe this image.');
    onSend(text, ready.length ? ready : undefined);
    setInput('');
    setPending([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className="w-full relative space-y-1.5"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-10 rounded-2xl border-[3px] border-dashed border-[var(--pink-deep)] bg-[var(--pink-main)]/70 flex items-center justify-center text-sm font-heading font-bold text-[var(--ink)] pointer-events-none">
          Drop files to attach 🌸
        </div>
      )}

      {/* Search Grounding Banner */}
      {webSearchEnabled && (
        <div className="px-3 py-1 bg-[var(--sky)]/50 border border-[var(--ink)]/30 rounded-xl flex items-center justify-between text-xs font-heading font-semibold text-[var(--ink)] shadow-xs animate-slide-up">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>Web Search Grounding ON — Querying live web with Meta Muse Spark</span>
          </div>
          <span className="text-[10px] font-bold text-blue-700 bg-white/70 px-2 py-0.5 rounded-full border border-blue-300">
            Live Citations
          </span>
        </div>
      )}

      {/* Pending attachment chips */}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pending.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--ink)] bg-white pl-1 pr-1.5 py-1 text-xs font-heading font-semibold text-[var(--ink)] max-w-[200px]"
            >
              {p.att?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.att.thumb} alt="" className="w-7 h-7 rounded-md object-cover" />
              ) : p.att ? (
                <span className="w-7 h-7 flex items-center justify-center">📄</span>
              ) : (
                <Loader2 className="w-4 h-4 mx-1.5 animate-spin" />
              )}
              <span className="truncate">{p.att ? p.name : `Reading ${p.name}…`}</span>
              <button
                type="button"
                onClick={() => removePending(p)}
                className="p-0.5 rounded-full hover:bg-[var(--cream)]"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Main Input Box */}
      <div className="sticker bg-white p-2.5 flex items-end gap-2 border-[var(--border-w)] border-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--pink-deep)]/50 transition-all">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || isStreaming}
          className="shrink-0 mb-0.5 p-2 rounded-xl hover:bg-[var(--cream)] text-[var(--ink-light)] hover:text-[var(--ink)] disabled:opacity-40"
          title="Attach images or files (or paste / drag & drop)"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          rows={1}
          placeholder={
            webSearchEnabled
              ? `Ask ${mascotInfo.name} with live web search... 🌐 (Enter to send)`
              : `Ask ${mascotInfo.name} anything... 🌸 (Enter to send, Shift+Enter for new line)`
          }
          className="flex-1 max-h-40 resize-none bg-transparent py-1.5 px-1 font-body text-sm md:text-base text-[var(--ink)] placeholder-[var(--ink-light)] focus:outline-none scrollbar-none leading-relaxed"
        />

        <div className="shrink-0 flex items-center gap-1.5 pb-0.5">
          {/* Web Search Toggle Button */}
          <button
            type="button"
            onClick={() => setWebSearchEnabled(!webSearchEnabled)}
            className={`sticker-button text-xs px-2.5 py-2 transition-all flex items-center gap-1.5 ${
              webSearchEnabled
                ? 'bg-[var(--sky)] text-[var(--ink)] border-2 border-[var(--ink)] shadow-[0_2px_0_var(--ink)] font-bold'
                : 'bg-white hover:bg-[var(--cream)] text-[var(--ink-light)] hover:text-[var(--ink)] border border-[var(--ink)]/30'
            }`}
            title="Toggle live web search grounding (Meta Muse Spark Responses API)"
          >
            <Globe className={`w-3.5 h-3.5 ${webSearchEnabled ? 'text-blue-700' : 'opacity-70'}`} />
            <span className="hidden sm:inline">Web</span>
            {webSearchEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>

          {/* Send / Stop Buttons */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="sticker-button bg-[var(--pink-deep)] text-white px-3 py-2 text-xs hover:bg-[var(--pink-main)] hover:text-[var(--ink)]"
              title="Stop generating"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] hover:text-white text-[var(--ink)] px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title={reading ? 'Waiting for files to finish reading' : 'Send message'}
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
