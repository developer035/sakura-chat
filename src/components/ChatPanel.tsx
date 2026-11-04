'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { MASCOTS } from '@/lib/constants';
import { getMainThread, getVersions, sideRootsOf } from '@/lib/tree-utils';
import {
  cancelTurn,
  editTurn,
  isBusy,
  requestDeleteTurn,
  retryTurn,
  sendMainTurn,
} from '@/lib/chat-actions';
import { scrollBehavior } from '@/lib/motion';
import { MascotWidget } from './MascotWidget';
import { Breadcrumbs } from './Breadcrumbs';
import { ChatInput } from './ChatInput';
import type { Attachment, ImageSize, ToolMode } from '@/lib/types';
import { EmptyChatState, MessageTurn } from './MessageTurn';
import { ArrowDown, Globe, ScanSearch } from 'lucide-react';

/** Main conversation panel: shows the main thread only. Side branches live in floating windows. */
export function ChatPanel() {
  const nodes = useStore((s) => s.nodes);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const currentMascot = useStore((s) => s.currentMascot);
  const focusRequest = useStore((s) => s.focusRequest);
  const requestFocus = useStore((s) => s.requestFocus);
  const openWindow = useStore((s) => s.openWindow);
  const openInspector = useStore((s) => s.openInspector);

  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const thread = getMainThread(nodes, activeId);
  const leafId = thread.length ? thread[thread.length - 1].id : null;

  // Keep activeId pointing at the main leaf.
  useEffect(() => {
    if (leafId && leafId !== activeId) setActive(leafId);
  }, [leafId, activeId, setActive]);

  const activeNode = leafId ? nodes[leafId] : null;
  const isStreaming = isBusy(activeNode);

  const handleScrollToNode = useCallback((nodeId: string) => {
    const el = document.getElementById(`turn-${nodeId}`);
    if (!el) return;
    setFocusedNodeId(nodeId);
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    setTimeout(() => {
      setFocusedNodeId((curr) => (curr === nodeId ? null : curr));
    }, 2500);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    setShowScrollBottom(false);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 180);
  };

  // Respond to focus requests from the graph / breadcrumbs.
  useEffect(() => {
    if (!focusRequest) return;
    const r = requestAnimationFrame(() => handleScrollToNode(focusRequest.id));
    return () => cancelAnimationFrame(r);
  }, [focusRequest, handleScrollToNode]);

  // Auto-scroll while streaming.
  useEffect(() => {
    if (isStreaming) messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, [activeNode?.assistant, isStreaming]);

  const handleSendMessage = (
    text: string,
    attachments?: Attachment[],
    tool?: ToolMode,
    imageSize?: ImageSize
  ) => {
    sendMainTurn(text, attachments, tool, imageSize);
    requestAnimationFrame(scrollToBottom);
  };

  const versionsFor = (id: string) => {
    const list = getVersions(nodes, id);
    if (list.length < 2) return undefined;
    const index = list.findIndex((v) => v.id === id);
    const go = (target: number) => {
      const v = list[target];
      if (!v) return;
      setActive(v.id);
      requestFocus(v.id);
    };
    return { index, total: list.length, onPrev: () => go(index - 1), onNext: () => go(index + 1) };
  };

  const openSide = (rootId: string) => {
    const root = nodes[rootId];
    if (root?.parentId) openWindow({ rootId, anchorId: root.parentId });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-cream)] relative">
      <div className="border-b-2 border-[var(--ink)]/15 bg-white/95 backdrop-blur px-4 py-2 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Breadcrumbs thread={thread} focusedNodeId={focusedNodeId} onScrollToNode={requestFocus} />
          </div>
          <button
            type="button"
            disabled={!leafId}
            onClick={() => leafId && openInspector(leafId)}
            className="sticker-button shrink-0 bg-[var(--mint)] px-2.5 py-1 text-xs text-[var(--ink)] disabled:opacity-40"
            title="Inspect the context sent with your next message"
          >
            <ScanSearch className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Context</span>
          </button>
        </div>
      </div>

      <div onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 relative">
        {thread.length === 0 ? (
          <EmptyChatState onSelectPrompt={handleSendMessage} />
        ) : (
          thread.map((node) => (
            <MessageTurn
              key={node.id}
              node={node}
              isFocused={focusedNodeId === node.id}
              onRetry={() => retryTurn(node.id)}
              onBranch={() => openWindow({ anchorId: node.id })}
              onEdit={(text) => editTurn(node.id, text)}
              canEdit={!isStreaming}
              onDelete={() => requestDeleteTurn(node.id)}
              versions={versionsFor(node.id)}
              sideBranches={sideRootsOf(nodes, node.id).map((r) => ({ id: r.id, title: r.title }))}
              onOpenSide={openSide}
            />
          ))
        )}

        {activeNode?.status === 'thinking' && !activeNode.assistant && (
          <div
            className={`flex items-center gap-3 p-3 rounded-2xl border-2 border-[var(--ink)]/25 w-fit animate-pulse shadow-sm ${
              activeNode.webSearchEnabled ? 'bg-[var(--sky)]/35' : 'bg-white/80'
            } text-[var(--ink)]`}
          >
            <MascotWidget
              size="sm"
              mascot={activeNode.webSearchEnabled ? 'pip' : currentMascot}
              state={activeNode.webSearchEnabled ? 'sniffing' : 'thinking'}
            />
            <div className="text-xs font-heading font-semibold">
              {activeNode.webSearchEnabled ? (
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />
                  <span>Pip is querying the live web with Meta Muse Spark... 🌐🔍</span>
                </span>
              ) : (
                <span>
                  {MASCOTS[currentMascot]?.name || 'Mochi'} is pondering with Meta Muse Spark... 🌸
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 sticker-button bg-white hover:bg-[var(--butter)] text-[var(--ink)] px-3.5 py-2 text-xs border-2 border-[var(--ink)] z-20 flex items-center gap-1.5 shadow-[0_3px_0_var(--ink)]"
          title="Scroll to latest message"
        >
          <span>Jump to latest</span>
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="p-4 md:px-6 md:pb-6 bg-white/70 border-t border-[var(--ink)]/10 shrink-0">
        <ChatInput
          onSend={handleSendMessage}
          suggestedRef={thread.length ? (thread[thread.length - 1].outputs?.[0] ?? null) : null}
          onCancel={() => leafId && cancelTurn(leafId)}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
