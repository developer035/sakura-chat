'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { nanoid } from 'nanoid';
import { useStore } from '@/lib/store';
import type { TurnNode } from '@/lib/types';
import { buildContext } from '@/lib/context';
import { streamChat } from '@/lib/stream';
import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts';
import { MASCOTS } from '@/lib/constants';
import { getBranchPath, findBranchLeaf } from '@/lib/tree-utils';
import { MascotWidget } from './MascotWidget';
import { Breadcrumbs } from './Breadcrumbs';
import { ChatInput } from './ChatInput';
import { ArrowDown, GitFork, Pin, RotateCcw, Sparkles, X } from 'lucide-react';

export function ChatPanel() {
  const nodes = useStore((s) => s.nodes);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const currentMascot = useStore((s) => s.currentMascot);
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const setMascotState = useStore((s) => s.setMascotState);

  const [activeStreamCancel, setActiveStreamCancel] = useState<(() => void) | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [branchingParent, setBranchingParent] = useState<TurnNode | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Compute leaf of the current active branch so all descendant turns remain visible
  const leafId = activeId ? findBranchLeaf(nodes, activeId) || activeId : null;
  const thread = leafId ? getBranchPath(nodes, leafId) : [];

  // Keep activeId pointing to current leaf if it was pointing to an ancestor
  useEffect(() => {
    if (leafId && leafId !== activeId && nodes[leafId]) {
      setActive(leafId);
    }
  }, [leafId, activeId, nodes, setActive]);

  const activeNode = leafId ? nodes[leafId] : null;
  const isStreaming = activeNode?.status === 'streaming' || activeNode?.status === 'thinking';

  // Scroll to a specific message turn without removing any messages below it
  const handleScrollToNode = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    const el = document.getElementById(`turn-${nodeId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Remove highlight pulse after 2.5s
    setTimeout(() => {
      setFocusedNodeId((curr) => (curr === nodeId ? null : curr));
    }, 2500);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  }, []);

  // Detect scroll position to show "scroll to bottom" button
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isUp = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isUp);
  };

  // Auto-scroll when streaming tokens arrive
  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeNode?.assistant, isStreaming]);

  // Handle sending a new message
  const handleSendMessage = async (text: string) => {
    // If branching from an earlier node, parent is that node; otherwise parent is current branch leaf
    const isBranching = !!branchingParent;
    const parentId = isBranching ? branchingParent.id : leafId;
    const nodeId = nanoid();

    // Context from ancestors
    const historyMessages = buildContext(nodes, parentId);
    const messages = [...historyMessages, { role: 'user' as const, content: text }];

    const newNode: TurnNode = {
      id: nodeId,
      parentId,
      kind: isBranching ? 'side' : 'main',
      title: text.length > 28 ? `${text.slice(0, 28)}...` : text,
      user: text,
      assistant: '',
      status: 'thinking',
      createdAt: Date.now(),
    };

    // Clear branching parent banner
    setBranchingParent(null);
    addNode(newNode);
    setMascotState('thinking');
    scrollToBottom();

    try {
      const cancelFn = await streamChat(
        {
          messages,
          system: CHAT_SYSTEM_PROMPT,
        },
        (accumulated) => {
          updateNode(nodeId, {
            assistant: accumulated,
            status: 'streaming',
          });
          setMascotState('writing');
        },
        () => {
          updateNode(nodeId, { status: 'done' });
          setMascotState('idle');
          setActiveStreamCancel(null);
        },
        (error) => {
          console.error('Chat stream error:', error);
          updateNode(nodeId, {
            status: 'error',
            assistant:
              (nodes[nodeId]?.assistant || '') +
              `\n\n*(Error: ${error.message || 'Stream interrupted'}. Please retry.)*`,
          });
          setMascotState('error');
          setActiveStreamCancel(null);
        }
      );

      setActiveStreamCancel(() => cancelFn);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateNode(nodeId, {
        status: 'error',
        assistant: `*(Failed to initiate stream: ${msg})*`,
      });
      setMascotState('error');
    }
  };

  const handleRetry = (node: TurnNode) => {
    if (isStreaming) return;
    updateNode(node.id, { assistant: '', status: 'thinking' });
    setMascotState('thinking');

    const historyMessages = buildContext(nodes, node.parentId);
    const messages = [...historyMessages, { role: 'user' as const, content: node.user }];

    streamChat(
      { messages, system: CHAT_SYSTEM_PROMPT },
      (accumulated) => {
        updateNode(node.id, { assistant: accumulated, status: 'streaming' });
        setMascotState('writing');
      },
      () => {
        updateNode(node.id, { status: 'done' });
        setMascotState('idle');
      },
      () => {
        updateNode(node.id, { status: 'error' });
        setMascotState('error');
      }
    );
  };

  const handleCancelStream = () => {
    if (activeStreamCancel) {
      activeStreamCancel();
      setActiveStreamCancel(null);
    }
    if (activeNode && (activeNode.status === 'streaming' || activeNode.status === 'thinking')) {
      updateNode(activeNode.id, { status: 'done' });
      setMascotState('idle');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-cream)] relative">
      {/* Thread Navigation & Breadcrumbs Header */}
      <div className="border-b-2 border-[var(--ink)]/15 bg-white/95 backdrop-blur px-4 py-2 shrink-0 z-10 shadow-sm">
        <Breadcrumbs
          thread={thread}
          focusedNodeId={focusedNodeId}
          onScrollToNode={handleScrollToNode}
        />
      </div>

      {/* Main Messages Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 relative"
      >
        {thread.length === 0 ? (
          <EmptyChatState onSelectPrompt={handleSendMessage} />
        ) : (
          thread.map((node) => (
            <MessageTurn
              key={node.id}
              node={node}
              isFocused={focusedNodeId === node.id}
              onRetry={() => handleRetry(node)}
              onBranch={() => {
                setBranchingParent(node);
                const el = document.getElementById(`turn-${node.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          ))
        )}

        {/* Mascot Thinking Indicator */}
        {activeNode?.status === 'thinking' && !activeNode.assistant && (
          <div className="flex items-center gap-3 p-3 bg-white/80 rounded-2xl border-2 border-[var(--ink)]/20 w-fit animate-pulse shadow-sm">
            <MascotWidget size="sm" state="thinking" />
            <div className="text-xs font-heading font-semibold text-[var(--ink)]">
              {MASCOTS[currentMascot]?.name || 'Mochi'} is pondering with Meta Muse Spark... 🌸
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating "Scroll to Bottom" Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 sticker-button bg-white hover:bg-[var(--butter)] text-[var(--ink)] px-3.5 py-2 text-xs border-2 border-[var(--ink)] z-20 flex items-center gap-1.5 shadow-[0_3px_0_var(--ink)] active:translate-y-0.5"
          title="Scroll to latest message"
        >
          <span>Jump to latest</span>
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Chat Input Container */}
      <div className="p-4 md:px-6 md:pb-6 bg-white/70 border-t border-[var(--ink)]/10 shrink-0">
        {/* Branching from notice */}
        {branchingParent && (
          <div className="mb-2.5 px-3 py-1.5 bg-[var(--lavender)]/50 border-2 border-[var(--ink)] rounded-xl flex items-center justify-between text-xs font-heading font-semibold text-[var(--ink)] shadow-[0_2px_0_var(--ink)]">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-white rounded-full border border-[var(--ink)]">
                <GitFork className="w-3.5 h-3.5 text-[var(--ink)]" />
              </span>
              <span>
                Branching side topic from: <strong>"{branchingParent.title}"</strong>
              </span>
            </div>
            <button
              onClick={() => setBranchingParent(null)}
              className="p-1 hover:bg-white/80 rounded-full text-[var(--ink)] transition-colors"
              title="Cancel branching and continue main thread"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <ChatInput
          onSend={handleSendMessage}
          onCancel={handleCancelStream}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Empty Conversation State
// -------------------------------------------------------------
function EmptyChatState({ onSelectPrompt }: { onSelectPrompt: (p: string) => void }) {
  const currentMascot = useStore((s) => s.currentMascot);
  const mascotInfo = MASCOTS[currentMascot] || MASCOTS.mochi;

  const starterPrompts = [
    '🌸 Plan a cozy Japanese kissaten & cat sanctuary in Kyoto',
    '🍵 What are the secrets to brewing ceremonial Uji matcha?',
    '🎮 Brainstorm a kawaii pixel-art roguelike RPG game loop',
    '💡 Write a clean Next.js 16 Edge API route for SSE streaming',
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 px-4 space-y-6">
      <MascotWidget size="xl" state="idle" showSpeechBubble speechText="Hello! I'm ready to chat! ✨" />

      <div>
        <h2 className="text-2xl md:text-3xl font-heading font-bold text-[var(--ink)]">
          Welcome to Sakura Chat! 🌸
        </h2>
        <p className="text-sm md:text-base text-[var(--ink-light)] mt-2">
          Chat naturally with {mascotInfo.name}. Ask questions, explore tangents, and branch ideas
          without losing context.
        </p>
      </div>

      <div className="w-full space-y-2 pt-2">
        <div className="text-xs font-heading font-semibold text-[var(--ink-light)] uppercase tracking-wider">
          Try a prompt starter
        </div>
        <div className="flex flex-col gap-2">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSelectPrompt(prompt)}
              className="sticker bg-white hover:bg-[var(--cream)] text-left px-4 py-2.5 text-xs md:text-sm font-body font-semibold text-[var(--ink)] border-2 border-[var(--ink)] flex items-center justify-between group transition-all"
            >
              <span>{prompt}</span>
              <Sparkles className="w-4 h-4 text-[var(--pink-deep)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Message Turn: Shows User Bubble + Assistant Bubble
// -------------------------------------------------------------
function MessageTurn({
  node,
  isFocused,
  onRetry,
  onBranch,
}: {
  node: TurnNode;
  isFocused: boolean;
  onRetry: () => void;
  onBranch: () => void;
}) {
  const isSide = node.kind === 'side';

  return (
    <div
      id={`turn-${node.id}`}
      className={`space-y-4 p-2 rounded-2xl transition-all duration-300 ${
        isFocused
          ? 'ring-4 ring-[var(--pink-deep)]/70 bg-[var(--pink-main)]/15 shadow-md scale-[1.01]'
          : ''
      }`}
    >
      {/* User Bubble */}
      <div className="flex justify-end items-start gap-2.5">
        <div className="max-w-[85%] md:max-w-[75%] sticker bg-[var(--butter)] text-[var(--ink)] px-4 py-3 border-[var(--border-w)] border-[var(--ink)] font-body text-sm md:text-base shadow-[0_3px_0_var(--ink)]">
          <p className="whitespace-pre-wrap">{node.user}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-[var(--ink)] text-white flex items-center justify-center font-heading text-xs font-bold shrink-0 border border-[var(--ink)] shadow-[0_2px_0_var(--ink)]">
          👤
        </div>
      </div>

      {/* Assistant Bubble */}
      <div className="flex justify-start items-start gap-2.5">
        <div className="shrink-0 mt-0.5">
          <MascotWidget size="sm" state={node.status === 'streaming' ? 'writing' : 'idle'} />
        </div>

        <div
          className={`max-w-[90%] md:max-w-[80%] sticker bg-white text-[var(--ink)] p-4 md:p-5 border-[var(--border-w)] relative group ${
            isSide
              ? 'border-[var(--lavender)] shadow-[0_3px_0_var(--lavender)]'
              : 'border-[var(--ink)] shadow-[0_3px_0_var(--ink)]'
          }`}
        >
          {/* Header row in bubble with side tag and branch button */}
          <div className="flex items-center justify-between mb-2">
            <div>
              {isSide && (
                <span className="inline-flex items-center gap-1 bg-[var(--lavender)] px-2.5 py-0.5 rounded-full text-xs font-heading font-bold text-[var(--ink)] border border-[var(--ink)]">
                  <span>🧋 Side Tangent</span>
                </span>
              )}
            </div>

            {/* Branch from here button */}
            <button
              onClick={onBranch}
              className="sticker-button text-[11px] px-2 py-0.5 bg-[var(--cream)] hover:bg-[var(--lavender)] text-[var(--ink)] border border-[var(--ink)] opacity-70 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-none hover:shadow-[0_1.5px_0_var(--ink)]"
              title="Start a side branch from this turn"
            >
              <GitFork className="w-3 h-3" />
              <span>Branch</span>
            </button>
          </div>

          {/* Markdown Assistant Content */}
          <div className="prose prose-sm md:prose-base max-w-none text-[var(--ink)] leading-relaxed space-y-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {node.assistant || (node.status === 'thinking' ? '*Thinking...*' : '')}
            </ReactMarkdown>
          </div>

          {/* Side note pin if present */}
          {node.pin && (
            <div className="mt-3 p-2.5 bg-[var(--lavender)]/30 border border-[var(--lavender)] rounded-xl flex items-center gap-2 text-xs font-heading font-medium text-[var(--ink)]">
              <Pin className="w-3.5 h-3.5 text-[var(--ink)] shrink-0" />
              <span>
                <strong>Pinned Tangent Summary:</strong> {node.pin}
              </span>
            </div>
          )}

          {/* Error retry option */}
          {node.status === 'error' && (
            <div className="mt-3 pt-3 border-t border-red-200 flex items-center justify-between">
              <span className="text-xs text-red-600 font-medium">Generation interrupted</span>
              <button
                onClick={onRetry}
                className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] text-[var(--ink)] px-3 py-1 text-xs"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
