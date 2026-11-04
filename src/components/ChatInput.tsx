'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Send, Square } from 'lucide-react';
import { useStore } from '@/lib/store';
import { MASCOTS } from '@/lib/constants';

interface ChatInputProps {
  onSend: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, onCancel, disabled = false, isStreaming = false }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentMascot = useStore((s) => s.currentMascot);
  const webSearchEnabled = useStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useStore((s) => s.setWebSearchEnabled);
  const mascotInfo = MASCOTS[currentMascot] || MASCOTS.mochi;

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setInput('');
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

  return (
    <div className="w-full relative space-y-1.5">
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

      {/* Main Input Box */}
      <div className="sticker bg-white p-2.5 flex items-end gap-2 border-[var(--border-w)] border-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--pink-deep)]/50 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
          placeholder={
            webSearchEnabled
              ? `Ask ${mascotInfo.name} with live web search... 🌐 (Enter to send)`
              : `Ask ${mascotInfo.name} anything... 🌸 (Enter to send, Shift+Enter for new line)`
          }
          className="flex-1 max-h-40 resize-none bg-transparent py-1.5 px-3 font-body text-sm md:text-base text-[var(--ink)] placeholder-[var(--ink-light)] focus:outline-none scrollbar-none leading-relaxed"
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
              disabled={disabled || !input.trim()}
              className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] hover:text-white text-[var(--ink)] px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Send message"
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
