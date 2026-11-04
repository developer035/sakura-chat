'use client';

import React, { useEffect, useState } from 'react';
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { requestDeleteConversation } from '@/lib/chat-actions';
import { sortedConversations } from '@/lib/conversations';
import type { Conversation } from '@/lib/types';

function stamp(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface ChatSidebarProps {
  variant: 'desktop' | 'overlay';
  /** Called after picking / creating a chat (closes the mobile overlay). */
  onNavigate?: () => void;
}

export function ChatSidebar({ variant, onNavigate }: ChatSidebarProps) {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeConversationId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const createConversation = useStore((s) => s.createConversation);
  const switchConversation = useStore((s) => s.switchConversation);
  const renameConversation = useStore((s) => s.renameConversation);
  const setMobileTab = useStore((s) => s.setMobileTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const overlay = variant === 'overlay';
  const collapsed = !overlay && !sidebarOpen;
  const list = sortedConversations(conversations);

  // Esc closes the mobile overlay (the confirm dialog handles its own Esc first).
  useEffect(() => {
    if (!overlay || !onNavigate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingId) onNavigate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, onNavigate, editingId]);

  const open = (id: string) => {
    switchConversation(id);
    setMobileTab('chat');
    onNavigate?.();
  };

  const startNew = () => {
    createConversation();
    setMobileTab('chat');
    onNavigate?.();
  };

  const startRename = (c: Conversation) => {
    setEditingId(c.id);
    setDraft(c.title);
  };

  const commitRename = () => {
    if (editingId) renameConversation(editingId, draft);
    setEditingId(null);
  };

  if (collapsed) {
    return (
      <aside className="hidden md:flex w-12 shrink-0 flex-col items-center gap-2 sticker-static bg-white py-2 overflow-y-auto">
        <button
          type="button"
          onClick={toggleSidebar}
          className="p-1.5 rounded-xl hover:bg-[var(--cream)] text-[var(--ink)]"
          title="Show chats"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={startNew}
          className="p-1.5 rounded-xl bg-[var(--pink-main)] border-2 border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--pink-deep)] hover:text-white"
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </button>
        {list.slice(0, 14).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => open(c.id)}
            title={c.title}
            className={`p-1.5 rounded-xl border-2 ${
              c.id === activeId
                ? 'bg-[var(--pink-main)] border-[var(--ink)]'
                : 'border-transparent hover:bg-[var(--cream)]'
            } text-[var(--ink)]`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside
      className={
        overlay
          ? 'fixed inset-y-0 left-0 z-[1050] w-72 max-w-[85vw] flex flex-col bg-white border-r-2 border-[var(--ink)] shadow-[4px_0_0_var(--ink)]'
          : 'hidden md:flex w-60 shrink-0 flex-col sticker-static bg-white min-h-0'
      }
    >
      <div className="flex items-center gap-2 p-2.5 border-b-2 border-[var(--ink)]/15 shrink-0">
        <button
          type="button"
          onClick={startNew}
          className="sticker-button flex-1 bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] hover:text-white text-[var(--ink)] px-3 py-1.5 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New chat</span>
        </button>
        {overlay ? (
          <button
            type="button"
            onClick={onNavigate}
            className="p-1.5 rounded-xl hover:bg-[var(--cream)] text-[var(--ink)]"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 rounded-xl hover:bg-[var(--cream)] text-[var(--ink)]"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      <ol className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {list.length === 0 && (
          <li className="px-2 py-6 text-center text-xs font-heading text-[var(--ink-light)]">
            No chats yet. Say hi and your first chat appears here 🌸
          </li>
        )}
        {list.map((c) => {
          const active = c.id === activeId;
          const editing = editingId === c.id;
          return (
            <li key={c.id}>
              <div
                className={`group flex items-center gap-1.5 rounded-2xl border-2 px-2.5 py-2 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[var(--pink-main)] border-[var(--ink)] shadow-[0_2px_0_var(--ink)]'
                    : 'bg-white border-[var(--ink)]/20 hover:border-[var(--ink)] hover:bg-[var(--cream)]'
                }`}
                onClick={() => !editing && open(c.id)}
              >
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <input
                      autoFocus
                      value={draft}
                      maxLength={80}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingId(null);
                        }
                      }}
                      className="w-full rounded-lg border-2 border-[var(--ink)] bg-white px-1.5 py-0.5 text-sm font-heading font-semibold text-[var(--ink)] focus:outline-none"
                    />
                  ) : (
                    <div
                      className="truncate text-sm font-heading font-bold text-[var(--ink)]"
                      title={c.title}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(c);
                      }}
                    >
                      {c.title}
                    </div>
                  )}
                  <div className="text-[10px] font-heading text-[var(--ink)]/60">{stamp(c.updatedAt)}</div>
                </div>
                {!editing && (
                  <div className="flex items-center opacity-70 group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(c);
                      }}
                      className="p-1 rounded-full hover:bg-white/80 text-[var(--ink)]"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteConversation(c.id);
                      }}
                      className="p-1 rounded-full hover:bg-red-50 text-[var(--ink)] hover:text-red-600"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
