'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import { useStore } from '@/lib/store';

/**
 * Kawaii confirmation popup for destructive actions. Driven by the store
 * (`askConfirm`), so any component can request one without prop drilling.
 */
export function ConfirmDialog() {
  const dialog = useStore((s) => s.confirmDialog);
  const closeConfirm = useStore((s) => s.closeConfirm);

  // Esc cancels. Capture phase + stopImmediatePropagation so no window/inspector
  // handler underneath also reacts to the same keypress.
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, closeConfirm]);

  if (!dialog) return null;

  const confirm = () => {
    const run = dialog.onConfirm;
    closeConfirm();
    run();
  };

  // Keep Tab focus inside the dialog (two buttons): wrap around at the ends.
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-[var(--ink)]/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeConfirm();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onKeyDown={trapTab}
        className="sticker-static bg-white w-[92vw] max-w-sm p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-full bg-[var(--butter)] border-2 border-[var(--ink)] flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-[var(--ink)]" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-heading font-bold text-lg text-[var(--ink)] leading-tight">
              {dialog.title}
            </h2>
            <p id="confirm-message" className="mt-1 text-sm font-body text-[var(--ink-light)] leading-snug">
              {dialog.message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {/* Cancel is focused first so a stray Enter never destroys anything. */}
          <button
            type="button"
            autoFocus
            onClick={closeConfirm}
            className="sticker-button bg-white hover:bg-[var(--cream)] px-4 py-1.5 text-sm text-[var(--ink)]"
          >
            {dialog.cancelLabel ?? 'Keep it'}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="sticker-button bg-red-400 hover:bg-red-500 px-4 py-1.5 text-sm text-white"
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
