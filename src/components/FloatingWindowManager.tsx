'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import type { TurnNode, WindowState } from '@/lib/types';
import { FloatingWindow, needsPinPrompt } from './FloatingWindow';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

/** Windows whose nodes still exist, in z order. */
function liveWindows(windows: WindowState[], nodes: Record<string, TurnNode>): WindowState[] {
  return windows
    .filter((w) => nodes[w.anchorId] && (!w.rootId || nodes[w.rootId]))
    .sort((a, b) => a.z - b.z);
}

/**
 * Portal layer for side-branch windows. Lives outside the React Flow tree so
 * windows never get trapped under the graph's own stacking context.
 */
export function FloatingWindowManager() {
  const windows = useStore((s) => s.windows);
  const nodes = useStore((s) => s.nodes);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );

  const live = liveWindows(windows, nodes);
  const visible = live.filter((w) => !w.minimized);
  const minimized = live.filter((w) => w.minimized);
  const shown = isMobile ? visible.slice(-1) : visible;

  const requestClose = (win: WindowState) => {
    const st = useStore.getState();
    if (needsPinPrompt(win, st.nodes)) {
      st.bringToFront(win.id);
      setConfirmingId(win.id);
    } else {
      st.closeWindow(win.id);
    }
  };

  // Keyboard shortcuts: Esc closes the top window, B branches from the active node.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === 'Escape') {
        const top = liveWindows(st.windows, st.nodes).filter((w) => !w.minimized).pop();
        if (!top) return;
        e.preventDefault();
        if (confirmingId === top.id) {
          setConfirmingId(null);
        } else {
          requestClose(top);
        }
        return;
      }
      if (
        (e.key === 'b' || e.key === 'B') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e.target) &&
        st.activeId &&
        st.nodes[st.activeId]
      ) {
        e.preventDefault();
        st.openWindow({ anchorId: st.activeId });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (live.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      {shown.map((w) => (
        <FloatingWindow
          key={w.id}
          win={w}
          isMobile={isMobile}
          confirming={confirmingId === w.id}
          onRequestClose={() => requestClose(w)}
          onCancelConfirm={() => setConfirmingId(null)}
        />
      ))}

      {minimized.length > 0 && (
        <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-2 pointer-events-auto">
          {minimized.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => minimizeWindow(w.id, false)}
              className="sticker-button bg-[var(--lavender)] px-3 py-1 text-xs text-[var(--ink)] max-w-[200px]"
              title="Restore side branch"
            >
              <span>🧋</span>
              <span className="truncate">
                {w.rootId && nodes[w.rootId] ? nodes[w.rootId].title : 'New side question'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
