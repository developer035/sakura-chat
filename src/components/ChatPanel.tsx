'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { nanoid } from 'nanoid';
import { useStore } from '@/lib/store';
import type { TurnNode, SearchCitation } from '@/lib/types';
import { buildContext } from '@/lib/context';
import { streamChat } from '@/lib/stream';
import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts';
import { MASCOTS } from '@/lib/constants';
import { getBranchPath, findBranchLeaf } from '@/lib/tree-utils';
import { MascotWidget } from './MascotWidget';
import { Breadcrumbs } from './Breadcrumbs';
import { ChatInput } from './ChatInput';
import {
  ArrowDown,
  ExternalLink,
  GitFork,
  Globe,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

export function ChatPanel() {
  const nodes = useStore((s) => s.nodes);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const currentMascot = useStore((s) => s.currentMascot);
  const webSearchEnabled = useStore((s) => s.webSearchEnabled);
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
      webSearchEnabled,
      searchQueries: [],
      citations: [],
    };

    setBranchingParent(null);
    addNode(newNode);
    setMascotState(webSearchEnabled ? 'sniffing' : 'thinking');
    scrollToBottom();

    try {
      const cancelFn = await streamChat(
        {
          messages,
          system: CHAT_SYSTEM_PROMPT,
          webSearch: webSearchEnabled,
        },
        {
          onToken: (accumulated) => {
            updateNode(nodeId, {
              assistant: accumulated,
              status: 'streaming',
            });
            setMascotState('writing');
          },
          onSearchQuery: (query) => {
            const currentList = useStore.getState().nodes[nodeId]?.searchQueries || [];
            if (!currentList.includes(query)) {
              updateNode(nodeId, {
                searchQueries: [...currentList, query],
              });
            }
          },
          onCitations: (citations: SearchCitation[]) => {
            updateNode(nodeId, { citations });
          },
          onDone: () => {
            updateNode(nodeId, { status: 'done' });
            setMascotState('idle');
            setActiveStreamCancel(null);
          },
          onError: (error) => {
            console.error('Chat stream error:', error);
            updateNode(nodeId, {
              status: 'error',
              assistant:
                (nodes[nodeId]?.assistant || '') +
                `\n\n*(Error: ${error.message || 'Stream interrupted'}. Please retry.)*`,
            });
            setMascotState('error');
            setActiveStreamCancel(null);
          },
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
    updateNode(node.id, { assistant: '', status: 'thinking', searchQueries: [], citations: [] });
    setMascotState(node.webSearchEnabled ? 'sniffing' : 'thinking');

    const historyMessages = buildContext(nodes, node.parentId);
    const messages = [...historyMessages, { role: 'user' as const, content: node.user }];

    streamChat(
      {
        messages,
        system: CHAT_SYSTEM_PROMPT,
        webSearch: node.webSearchEnabled,
      },
      {
        onToken: (accumulated) => {
          updateNode(node.id, { assistant: accumulated, status: 'streaming' });
          setMascotState('writing');
        },
        onSearchQuery: (query) => {
          const currentList = useStore.getState().nodes[node.id]?.searchQueries || [];
          if (!currentList.includes(query)) {
            updateNode(node.id, { searchQueries: [...currentList, query] });
          }
        },
        onCitations: (citations) => {
          updateNode(node.id, { citations });
        },
        onDone: () => {
          updateNode(node.id, { status: 'done' });
          setMascotState('idle');
        },
        onError: () => {
          updateNode(node.id, { status: 'error' });
          setMascotState('error');
        },
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

        {/* Mascot Thinking / Sniffing Indicator */}
        {activeNode?.status === 'thinking' && !activeNode.assistant && (
          <div
            className={`flex items-center gap-3 p-3 rounded-2xl border-2 border-[var(--ink)]/25 w-fit animate-pulse shadow-sm ${
              activeNode.webSearchEnabled
                ? 'bg-[var(--sky)]/35 text-[var(--ink)]'
                : 'bg-white/80 text-[var(--ink)]'
            }`}
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
    '🌐 What are the latest AI hackathons and news today in 2026?',
    '🍵 What are the secrets to brewing ceremonial Uji matcha?',
    '🎮 Brainstorm a kawaii pixel-art roguelike RPG game loop',
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 px-4 space-y-6">
      <MascotWidget size="xl" state="idle" showSpeechBubble speechText="Hello! I'm ready to chat! ✨" />

      <div>
        <h2 className="text-2xl md:text-3xl font-heading font-bold text-[var(--ink)]">
          Welcome to Sakura Chat! 🌸
        </h2>
        <p className="text-sm md:text-base text-[var(--ink-light)] mt-2">
          Chat naturally with {mascotInfo.name}. Ask questions, explore tangents, branch ideas, and
          ground facts with live web search!
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
// Message Turn: Shows User Bubble + Assistant Bubble with Citations
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
  const hasCitations = node.citations && node.citations.length > 0;
  const hasSearchQueries = node.searchQueries && node.searchQueries.length > 0;

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
          <MascotWidget
            size="sm"
            mascot={node.webSearchEnabled ? 'pip' : undefined}
            state={node.status === 'streaming' ? 'writing' : 'idle'}
          />
        </div>

        <div
          className={`max-w-[90%] md:max-w-[80%] sticker bg-white text-[var(--ink)] p-4 md:p-5 border-[var(--border-w)] relative group ${
            isSide
              ? 'border-[var(--lavender)] shadow-[0_3px_0_var(--lavender)]'
              : node.webSearchEnabled
              ? 'border-[var(--sky)] shadow-[0_3px_0_var(--sky)]'
              : 'border-[var(--ink)] shadow-[0_3px_0_var(--ink)]'
          }`}
        >
          {/* Header row in bubble with tags and branch button */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isSide && (
                <span className="inline-flex items-center gap-1 bg-[var(--lavender)] px-2.5 py-0.5 rounded-full text-xs font-heading font-bold text-[var(--ink)] border border-[var(--ink)]">
                  <span>🧋 Side Tangent</span>
                </span>
              )}
              {node.webSearchEnabled && (
                <span className="inline-flex items-center gap-1 bg-[var(--sky)] px-2.5 py-0.5 rounded-full text-xs font-heading font-bold text-blue-900 border border-[var(--ink)] shadow-xs">
                  <Globe className="w-3 h-3 text-blue-700" />
                  <span>Web Grounded</span>
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

          {/* Search Queries announcement if search was performed */}
          {hasSearchQueries && (
            <div className="mb-3 p-2 bg-[var(--sky)]/25 border border-[var(--sky)] rounded-xl text-xs font-heading text-[var(--ink)] flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-[11px] text-blue-800 flex items-center gap-1">
                <Search className="w-3 h-3" /> Searched:
              </span>
              {node.searchQueries!.map((q, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-white/95 rounded-md border border-[var(--ink)]/20 text-[11px] font-mono text-[var(--ink)]"
                >
                  "{q}"
                </span>
              ))}
            </div>
          )}

          {/* Markdown Assistant Content */}
          <div className="prose prose-sm md:prose-base max-w-none text-[var(--ink)] leading-relaxed space-y-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {node.assistant || (node.status === 'thinking' ? '*Searching and thinking...*' : '')}
            </ReactMarkdown>
          </div>

          {/* Citations & Source Links */}
          {hasCitations && (
            <div className="mt-4 pt-3 border-t-2 border-[var(--ink)]/10 space-y-2">
              <div className="text-xs font-heading font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Sources & Citations ({node.citations!.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {node.citations!.map((c, i) => {
                  let domain = c.url;
                  try {
                    domain = new URL(c.url).hostname.replace(/^www\./, '');
                  } catch {
                    // ignore
                  }
                  return (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--sky)]/30 hover:bg-[var(--sky)] text-[var(--ink)] border border-[var(--ink)]/35 hover:border-[var(--ink)] rounded-full text-xs font-body font-semibold transition-all hover:scale-102 shadow-xs"
                      title={c.title || c.url}
                    >
                      <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                      <span className="max-w-[200px] truncate">{c.title || domain}</span>
                      <span className="text-[10px] text-[var(--ink-light)] opacity-70">
                        ({domain})
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

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
