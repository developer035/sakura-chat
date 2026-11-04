'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
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
    // Auto-grow height
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="w-full relative">
      <div className="sticker bg-white p-2.5 flex items-end gap-2 border-[var(--border-w)] border-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--pink-deep)]/50 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
          placeholder={`Ask ${mascotInfo.name} anything... 🌸 (Enter to send, Shift+Enter for new line)`}
          className="flex-1 max-h-40 resize-none bg-transparent py-1.5 px-3 font-body text-sm md:text-base text-[var(--ink)] placeholder-[var(--ink-light)] focus:outline-none scrollbar-none leading-relaxed"
        />

        <div className="shrink-0 flex items-center gap-1.5 pb-0.5">
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
