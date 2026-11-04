'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/lib/store';
import type { TurnNode } from '@/lib/types';
import { MASCOTS } from '@/lib/constants';
import { MascotWidget } from './MascotWidget';
import { AttachmentStrip, GeneratedImages } from './AttachmentStrip';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitFork,
  Globe,
  Pencil,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';

// -------------------------------------------------------------
// Empty Conversation State
// -------------------------------------------------------------
export function EmptyChatState({ onSelectPrompt }: { onSelectPrompt: (p: string) => void }) {
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
      <MascotWidget size="xl" state="sleeping" showSpeechBubble speechText="Psst… wake me with a question! 💤" />

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
export function MessageTurn({
  node,
  isFocused = false,
  onRetry,
  onBranch,
  compact = false,
  sideBranches,
  onOpenSide,
  onEdit,
  canEdit = true,
  onDelete,
  versions,
}: {
  node: TurnNode;
  isFocused?: boolean;
  onRetry: () => void;
  onBranch: () => void;
  compact?: boolean;
  sideBranches?: { id: string; title: string }[];
  onOpenSide?: (rootId: string) => void;
  /** Saves an edit as a new sibling version. */
  onEdit?: (text: string) => void;
  canEdit?: boolean;
  onDelete?: () => void;
  /** Present when this turn has edited sibling versions. */
  versions?: { index: number; total: number; onPrev: () => void; onNext: () => void };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const canSave = canEdit && draft.trim().length > 0 && draft.trim() !== node.user.trim();
  const save = () => {
    if (!canSave) return;
    onEdit?.(draft);
    setEditing(false);
  };
  const bubbleMascotState =
    node.status === 'error'
      ? 'error'
      : node.status === 'streaming'
      ? 'writing'
      : node.status === 'thinking' || node.status === 'routing'
      ? 'thinking'
      : 'idle';
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
        <div
          className={`flex flex-col items-end gap-1.5 ${
            compact ? 'max-w-[90%]' : 'max-w-[85%] md:max-w-[75%]'
          } ${editing ? 'w-full' : ''}`}
        >
          {editing ? (
            <div className="w-full sticker-static bg-[var(--butter)] p-2.5 space-y-2">
              <textarea
                autoFocus
                value={draft}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(false);
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    save();
                  }
                }}
                className="w-full rounded-xl border-2 border-[var(--ink)] bg-white p-2 text-sm font-body text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-deep)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="sticker-button bg-white px-3 py-1 text-xs text-[var(--ink)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!canSave}
                  className="sticker-button bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] px-3 py-1 text-xs text-[var(--ink)] disabled:opacity-50"
                >
                  Save as new version
                </button>
              </div>
            </div>
          ) : (
            <>
              {node.attachments && node.attachments.length > 0 && (
                <AttachmentStrip items={node.attachments} />
              )}
            <div className="sticker-static bg-[var(--butter)] text-[var(--ink)] px-4 py-3 border-[var(--border-w)] border-[var(--ink)] font-body text-sm md:text-base shadow-[0_3px_0_var(--ink)]">
              <p className="whitespace-pre-wrap">{node.user}</p>
            </div>
            </>
          )}

          {!editing && (versions || onEdit) && (
            <div className="flex items-center gap-2 text-[11px] font-heading font-semibold text-[var(--ink-light)]">
              {versions && versions.total > 1 && (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--ink)]/30 bg-white/80 px-1">
                  <button
                    type="button"
                    onClick={versions.onPrev}
                    disabled={versions.index <= 0}
                    className="p-0.5 disabled:opacity-30 hover:text-[var(--ink)]"
                    title="Previous version"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-0.5 tabular-nums text-[var(--ink)]">
                    {versions.index + 1}/{versions.total}
                  </span>
                  <button
                    type="button"
                    onClick={versions.onNext}
                    disabled={versions.index >= versions.total - 1}
                    className="p-0.5 disabled:opacity-30 hover:text-[var(--ink)]"
                    title="Next version"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              {onEdit && (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setDraft(node.user);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 hover:text-[var(--ink)] disabled:opacity-40"
                  title={canEdit ? 'Edit as a new version' : 'Wait for the reply to finish'}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          )}
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
            state={bubbleMascotState}
          />
        </div>

        <div
          className={`${compact ? 'max-w-[95%] p-3' : 'max-w-[90%] md:max-w-[80%] p-4 md:p-5'} sticker-static bg-white text-[var(--ink)] border-[var(--border-w)] relative group ${
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

            <div className="flex items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="p-1 rounded-full text-[var(--ink-light)] hover:text-red-600 hover:bg-red-50 opacity-70 hover:opacity-100 transition-all"
                title="Delete this turn and everything below it"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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
                  &ldquo;{q}&rdquo;
                </span>
              ))}
            </div>
          )}

          {node.tool === 'image' && node.status === 'thinking' && (
            <div className="mb-2 text-sm font-heading font-semibold text-[var(--ink)] animate-pulse">
              🎨 Painting your image… this takes a few seconds
            </div>
          )}
          {node.outputs && node.outputs.length > 0 && <GeneratedImages items={node.outputs} />}

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

          {/* Side branches hanging off this turn */}
          {sideBranches && sideBranches.length > 0 && (
            <div className="mt-3 pt-2 border-t border-[var(--ink)]/10 flex flex-wrap gap-1.5">
              {sideBranches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpenSide?.(b.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-heading font-bold bg-[var(--lavender)]/60 hover:bg-[var(--lavender)] border border-[var(--ink)] text-[var(--ink)]"
                  title="Open this side branch in a floating window"
                >
                  <span>🧋</span>
                  <span className="max-w-[160px] truncate">{b.title}</span>
                </button>
              ))}
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
