'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { Minus, Pin, ScanSearch, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { TurnNode, WindowState } from '@/lib/types';
import { getSideThread, sideRootsOf } from '@/lib/tree-utils';
import { cancelTurn, isBusy, retryTurn, sendTurn } from '@/lib/chat-actions';
import { ChatInput } from './ChatInput';
import { MessageTurn } from './MessageTurn';

/** First sentence of the branch's last finished reply, stripped of markdown, max 140 chars. */
export function defaultPinText(thread: TurnNode[]): string {
  const last = [...thread].reverse().find((n) => n.status === 'done' && n.assistant.trim());
  if (!last) return '';
  if (last.summary) {
    return last.summary.length > 140 ? `${last.summary.slice(0, 137)}...` : last.summary;
  }
  const plain = last.assistant
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const first = plain.split(/(?<=[.!?])\s/)[0] || plain;
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

/** True when closing should offer to pin a return summary. */
export function needsPinPrompt(win: WindowState, nodes: Record<string, TurnNode>): boolean {
  if (!win.rootId) return false;
  return getSideThread(nodes, win.rootId).some((n) => n.status === 'done' && n.assistant.trim());
}

interface FloatingWindowProps {
  win: WindowState;
  isMobile: boolean;
  confirming: boolean;
  onRequestClose: () => void;
  onCancelConfirm: () => void;
}

export function FloatingWindow({
  win,
  isMobile,
  confirming,
  onRequestClose,
  onCancelConfirm,
}: FloatingWindowProps) {
  const updateWindow = useStore((s) => s.updateWindow);
  const bringToFront = useStore((s) => s.bringToFront);

  // Keep restored windows on screen (viewport may have shrunk since they were saved).
  const x = Math.max(0, Math.min(win.x, window.innerWidth - 120));
  const y = Math.max(0, Math.min(win.y, window.innerHeight - 60));

  const body = (
    <WindowContent
      win={win}
      draggable={!isMobile}
      confirming={confirming}
      onRequestClose={onRequestClose}
      onCancelConfirm={onCancelConfirm}
    />
  );

  if (isMobile) {
    return (
      <div className="pointer-events-auto fixed inset-0 bg-white flex flex-col" style={{ zIndex: win.z }}>
        {body}
      </div>
    );
  }

  return (
    <Rnd
      className="pointer-events-auto"
      style={{ zIndex: win.z }}
      position={{ x, y }}
      size={{ width: win.w, height: win.h }}
      bounds="parent"
      minWidth={320}
      minHeight={300}
      dragHandleClassName="fw-handle"
      cancel=".fw-nodrag"
      onMouseDown={() => bringToFront(win.id)}
      onDragStop={(_, d) => updateWindow(win.id, { x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, pos) =>
        updateWindow(win.id, { w: ref.offsetWidth, h: ref.offsetHeight, x: pos.x, y: pos.y })
      }
    >
      <div className="sticker-static bg-white h-full w-full flex flex-col overflow-hidden">{body}</div>
    </Rnd>
  );
}

function WindowContent({
  win,
  draggable,
  confirming,
  onRequestClose,
  onCancelConfirm,
}: {
  win: WindowState;
  draggable: boolean;
  confirming: boolean;
  onRequestClose: () => void;
  onCancelConfirm: () => void;
}) {
  const nodes = useStore((s) => s.nodes);
  const openWindow = useStore((s) => s.openWindow);
  const setWindowRoot = useStore((s) => s.setWindowRoot);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const closeWindow = useStore((s) => s.closeWindow);
  const openInspector = useStore((s) => s.openInspector);
  const updateNode = useStore((s) => s.updateNode);

  const endRef = useRef<HTMLDivElement>(null);
  const thread = getSideThread(nodes, win.rootId);
  const leaf = thread.length ? thread[thread.length - 1] : null;
  const anchor = nodes[win.anchorId];
  const busy = isBusy(leaf);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [leaf?.id, leaf?.assistant]);

  const handleSend = (text: string) => {
    if (!win.rootId) {
      const id = sendTurn({ parentId: win.anchorId, text, kind: 'side', branchRoot: true });
      setWindowRoot(win.id, id);
    } else if (leaf) {
      sendTurn({ parentId: leaf.id, text, kind: 'side' });
    }
  };

  const title = win.rootId && nodes[win.rootId] ? nodes[win.rootId].title : 'New side question';

  return (
    <>
      {/* Title bar (drag handle) */}
      <div
        className={`fw-handle flex items-center gap-2 px-3 py-2 bg-[var(--lavender)] border-b-2 border-[var(--ink)] shrink-0 ${
          draggable ? 'cursor-move' : ''
        } select-none`}
      >
        <span className="text-lg">🧋</span>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-bold text-sm text-[var(--ink)] truncate">{title}</div>
          {anchor && (
            <div className="text-[10px] font-heading text-[var(--ink)]/70 truncate">
              from: {anchor.title}
            </div>
          )}
        </div>
        <button
          type="button"
          className="fw-nodrag p-1 rounded-full hover:bg-white/70 text-[var(--ink)]"
          onClick={() => openInspector(leaf ? leaf.id : win.anchorId)}
          title="Inspect context"
        >
          <ScanSearch className="w-4 h-4" />
        </button>
        {draggable && (
          <button
            type="button"
            className="fw-nodrag p-1 rounded-full hover:bg-white/70 text-[var(--ink)]"
            onClick={() => minimizeWindow(win.id, true)}
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className="fw-nodrag p-1 rounded-full hover:bg-white/70 text-[var(--ink)]"
          onClick={onRequestClose}
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="fw-nodrag flex-1 overflow-y-auto p-3 space-y-4 bg-[var(--bg-cream)] relative">
        {thread.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <p className="text-sm font-heading font-semibold text-[var(--ink-light)]">
              Ask a side question about &ldquo;{anchor?.title ?? 'this turn'}&rdquo; 🧋
              <br />
              <span className="text-xs font-normal">The main thread stays untouched.</span>
            </p>
          </div>
        ) : (
          thread.map((n) => (
            <MessageTurn
              key={n.id}
              node={n}
              compact
              onRetry={() => retryTurn(n.id)}
              onBranch={() => openWindow({ anchorId: n.id })}
              sideBranches={sideRootsOf(nodes, n.id).map((r) => ({ id: r.id, title: r.title }))}
              onOpenSide={(rootId) => openWindow({ rootId, anchorId: n.id })}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="fw-nodrag p-2.5 bg-white/80 border-t border-[var(--ink)]/10 shrink-0">
        <ChatInput
          onSend={handleSend}
          onCancel={() => leaf && cancelTurn(leaf.id)}
          isStreaming={busy}
        />
      </div>

      {confirming && (
        <PinOverlay
          initial={defaultPinText(thread)}
          anchorTitle={anchor?.title ?? 'parent'}
          onPin={(text) => {
            const t = text.trim();
            if (t && anchor) {
              updateNode(anchor.id, { pin: anchor.pin ? `${anchor.pin}\n${t}` : t });
            }
            closeWindow(win.id);
          }}
          onClose={() => closeWindow(win.id)}
          onCancel={onCancelConfirm}
        />
      )}
    </>
  );
}

function PinOverlay({
  initial,
  anchorTitle,
  onPin,
  onClose,
  onCancel,
}: {
  initial: string;
  anchorTitle: string;
  onPin: (text: string) => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);

  return (
    <div className="fw-nodrag absolute inset-0 bg-[var(--ink)]/30 flex items-center justify-center p-4 z-10">
      <div className="sticker-static bg-white w-full max-w-sm p-4 space-y-3">
        <div className="font-heading font-bold text-[var(--ink)] flex items-center gap-1.5">
          <Pin className="w-4 h-4" /> Pin a return summary?
        </div>
        <p className="text-xs text-[var(--ink-light)]">
          It gets attached to &ldquo;{anchorTitle}&rdquo; and sent as context in the main thread.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-xl border-2 border-[var(--ink)] p-2 text-sm font-body text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-deep)]"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="sticker-button bg-white px-3 py-1 text-xs text-[var(--ink)]">
            Cancel
          </button>
          <button type="button" onClick={onClose} className="sticker-button bg-white px-3 py-1 text-xs text-[var(--ink)]">
            Close
          </button>
          <button
            type="button"
            onClick={() => onPin(text)}
            disabled={!text.trim()}
            className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] px-3 py-1 text-xs text-[var(--ink)] disabled:opacity-50"
          >
            📌 Pin &amp; close
          </button>
        </div>
      </div>
    </div>
  );
}
