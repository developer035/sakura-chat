'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { Sparkles, Trash2 } from 'lucide-react';

export function DemoModeBanner() {
  const demoMode = useStore((s) => s.demoMode);
  const hasDemoChat = useStore((s) => !!s.conversations['demo-conv']);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const setDemoMode = useStore((s) => s.setDemoMode);
  const askConfirm = useStore((s) => s.askConfirm);

  if (!demoMode || !hasDemoChat) return null;

  return (
    <div className="bg-gradient-to-r from-[var(--butter)] via-[var(--pink-main)] to-[var(--lavender)] border-b-2 border-[var(--ink)] px-4 py-2 flex items-center justify-between text-xs font-heading font-semibold text-[var(--ink)] shadow-[0_2px_0_var(--ink)]">
      <div className="flex items-center gap-2">
        <span className="p-1 bg-white/80 rounded-full border border-[var(--ink)] flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-[var(--pink-deep)]" />
        </span>
        <span>
          <strong>Demo Mode Active:</strong> Exploring the pre-seeded Kyoto Cat Sanctuary chat. Your other chats are untouched.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setDemoMode(false);
          }}
          className="px-2.5 py-1 bg-white rounded-full border border-[var(--ink)] hover:bg-[var(--cream)] active:translate-y-0.5 transition-all text-[var(--ink)]"
        >
          Dismiss Banner
        </button>
        <button
          onClick={() => {
            askConfirm({
              title: 'Remove the demo chat?',
              message: 'Only the demo chat is removed. Your other chats stay.',
              confirmLabel: 'Remove demo',
              onConfirm: () => {
                deleteConversation('demo-conv');
                setDemoMode(false);
              },
            });
          }}
          className="px-2.5 py-1 bg-[var(--pink-deep)] text-white rounded-full border border-[var(--ink)] hover:bg-[var(--pink-main)] hover:text-[var(--ink)] active:translate-y-0.5 transition-all flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          <span>Remove demo chat</span>
        </button>
      </div>
    </div>
  );
}
