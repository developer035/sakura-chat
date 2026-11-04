'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Toast as ToastData } from '@/lib/types';

const TOAST_MS = 7000;

function ToastCard({ toast }: { toast: ToastData }) {
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, dismissToast]);

  return (
    <div
      role="status"
      className="pointer-events-auto sticker-static bg-white flex items-center gap-3 px-4 py-2.5 max-w-[92vw]"
    >
      <span className="text-sm font-heading font-semibold text-[var(--ink)]">{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] px-3 py-1 text-xs text-[var(--ink)] shrink-0"
          onClick={() => {
            toast.onAction?.();
            dismissToast(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="p-1 rounded-full hover:bg-[var(--cream)] text-[var(--ink-light)] shrink-0"
        onClick={() => dismissToast(toast.id)}
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1200] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>,
    document.body
  );
}
