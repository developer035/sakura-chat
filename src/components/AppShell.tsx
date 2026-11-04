'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '@/lib/store';
import { MASCOTS } from '@/lib/constants';
import type { MascotName } from '@/lib/types';
import { DemoModeBanner } from './DemoModeBanner';
import { ChatPanel } from './ChatPanel';
import { GraphView } from './GraphView';
import { FloatingWindowManager } from './FloatingWindowManager';
import { ToastHost } from './Toast';
import { ContextInspector } from './ContextInspector';
import { ConfirmDialog } from './ConfirmDialog';
import { MascotWidget } from './MascotWidget';
import { setFileStoreFallbackHandler } from '@/lib/file-store';
import { cleanupFiles, embedFiles, restoreFiles } from '@/lib/bundle';
import { ChatSidebar } from './ChatSidebar';
import { ResizableDivider } from './ResizableDivider';
import { Download, Ellipsis, Menu, Upload, RotateCcw, Sparkles } from 'lucide-react';

const PANEL_KEY = 'sakura-panel-width';
const DEFAULT_CHAT_WIDTH = 480;
const MIN_CHAT = 280;
const MIN_GRAPH = 250;

function readSavedWidth(): number {
  try {
    const n = Number(localStorage.getItem(PANEL_KEY));
    return Number.isFinite(n) && n >= MIN_CHAT ? n : DEFAULT_CHAT_WIDTH;
  } catch {
    return DEFAULT_CHAT_WIDTH;
  }
}

export function AppShell() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [chatWidth, setChatWidth] = useState(readSavedWidth);
  const [mainWidth, setMainWidth] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const widthRef = useRef(chatWidth);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  const demoMode = useStore((s) => s.demoMode);
  const currentMascot = useStore((s) => s.currentMascot);
  const setCurrentMascot = useStore((s) => s.setCurrentMascot);
  const mobileTab = useStore((s) => s.mobileTab);
  const autoRoute = useStore((s) => s.autoRoute);
  const setAutoRoute = useStore((s) => s.setAutoRoute);
  const setMobileTab = useStore((s) => s.setMobileTab);
  const loadDemo = useStore((s) => s.loadDemo);
  const reset = useStore((s) => s.reset);
  const exportJSON = useStore((s) => s.exportJSON);
  const importJSON = useStore((s) => s.importJSON);
  const pushToast = useStore((s) => s.pushToast);
  const askConfirm = useStore((s) => s.askConfirm);
  const hasNodes = useStore((s) => Object.keys(s.nodes).length > 0);

  // Track the available width so the chat panel can be clamped as the window changes.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMainWidth(el.clientWidth));
    ro.observe(el);
    setMainWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [hydrated]);

  // One-time heads-up if the browser blocks IndexedDB (files then live in memory only).
  useEffect(() => {
    setFileStoreFallbackHandler(() =>
      useStore.getState().pushToast({
        message: '🍵 This browser blocks file storage, so attachments will be lost on refresh.',
      })
    );
  }, []);

  // Drop stored files that no turn refers to any more (older than 10 minutes only).
  useEffect(() => {
    void cleanupFiles(useStore.getState().nodes).catch(() => {});
  }, []);

  // Check URL params for ?demo=1 and hydrate store
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || params.get('demo') === 'true') {
        loadDemo();
      }
    }
  }, [loadDemo]);

  // Close the mobile overflow menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Chat width limits: graph keeps >= 250px, chat >= 280px and at most 75% of the space.
  const sidebarW = sidebarOpen ? 240 : 48;
  const available = Math.max(0, mainWidth - 32 - sidebarW - 6 - 24);
  const maxChat = Math.max(MIN_CHAT, Math.min(available * 0.75, available - MIN_GRAPH));
  const effectiveChat = mainWidth > 0 ? Math.round(Math.min(Math.max(chatWidth, MIN_CHAT), maxChat)) : chatWidth;

  const resizeBy = (delta: number) => {
    // Dragging the divider right makes the chat narrower.
    const next = Math.min(Math.max(effectiveChat - delta, MIN_CHAT), maxChat);
    widthRef.current = next;
    setChatWidth(next);
  };
  const saveWidth = () => {
    try {
      localStorage.setItem(PANEL_KEY, String(Math.round(widthRef.current)));
    } catch {
      /* ignore */
    }
  };
  const resetWidth = () => {
    widthRef.current = DEFAULT_CHAT_WIDTH;
    setChatWidth(DEFAULT_CHAT_WIDTH);
    saveWidth();
  };

  const handleReset = () => {
    const count = Object.keys(useStore.getState().nodes).length;
    if (count === 0) {
      reset();
      return;
    }
    askConfirm({
      title: 'Start fresh?',
      message: `This clears all ${count} turn${count === 1 ? '' : 's'} and your windows. Export first if you want a backup.`,
      confirmLabel: 'Clear everything',
      onConfirm: reset,
    });
  };

  const handleLoadDemo = () => {
    if (hasNodes && !demoMode) {
      askConfirm({
        title: 'Replace your tree with the demo?',
        message: 'Your current conversation will be replaced. Export it first if you want to keep it.',
        confirmLabel: 'Load demo',
        onConfirm: loadDemo,
      });
      return;
    }
    loadDemo();
  };

  // Export JSON file download
  const handleExport = async () => {
    let jsonStr = exportJSON();
    try {
      // v2 bundle: embed uploaded and generated files so the backup is complete.
      const { json, missing } = await embedFiles(jsonStr, useStore.getState().nodes);
      jsonStr = json;
      if (missing > 0) {
        pushToast({ message: `🍵 ${missing} file${missing === 1 ? ' was' : 's were'} no longer stored and could not be included` });
      }
    } catch (err) {
      console.error('Export bundle failed:', err);
    }
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sakura-chat-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import JSON file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        // v2 exports carry their files: put them back in IndexedDB before the turns appear.
        try {
          await restoreFiles(JSON.parse(content));
        } catch {
          /* not JSON: importJSON reports it */
        }
        const { ok, count } = importJSON(content);
        pushToast({
          message: ok
            ? `🌸 Imported ${count} turn${count === 1 ? '' : 's'}`
            : "😿 That file doesn't look like a Sakura Chat export",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-sakura-dots flex flex-col items-center justify-center">
        <MascotWidget size="lg" state="thinking" />
        <p className="font-heading font-semibold text-[var(--ink)] mt-4 animate-pulse">
          Awakening Sakura Chat... 🌸
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-sakura-dots">
      {/* Top Application Navigation Bar */}
      <header className="border-b-2 border-[var(--ink)] bg-white/95 backdrop-blur px-4 py-2.5 flex items-center justify-between shrink-0 z-30">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileSidebar(true)}
            className="md:hidden p-1.5 sticker-button bg-white text-[var(--ink)]"
            title="Chats"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-[var(--pink-main)] border-2 border-[var(--ink)] items-center justify-center shadow-[0_2px_0_var(--ink)] shrink-0">
            <span className="text-xl">🌸</span>
          </div>
          {/* Live mascot: follows the global mascot state (thinking, writing, success...) */}
          <MascotWidget size="sm" />
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg md:text-xl font-heading font-bold text-[var(--ink)] tracking-tight leading-none">
                Sakura Chat
              </h1>
              <span className="text-[10px] font-heading font-extrabold px-1.5 py-0.5 rounded-full bg-[var(--mint)] border border-[var(--ink)] text-[var(--ink)]">
                Multi-chat
              </span>
            </div>
            <p className="text-[11px] font-body text-[var(--ink-light)] font-semibold hidden sm:block">
              Branching AI Conversations with Meta Muse Spark
            </p>
          </div>
        </div>

        {/* Center / Mascot Switcher */}
        <div className="flex items-center gap-1 bg-[var(--bg-cream)] p-1 rounded-full border-2 border-[var(--ink)] shadow-[0_2px_0_var(--ink)]">
          {(['mochi', 'boba', 'pip'] as MascotName[]).map((mKey) => {
            const m = MASCOTS[mKey];
            const isSelected = currentMascot === mKey;
            return (
              <button
                key={mKey}
                onClick={() => setCurrentMascot(mKey)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-heading font-bold transition-all ${
                  isSelected
                    ? 'bg-white text-[var(--ink)] border border-[var(--ink)] shadow-[0_1.5px_0_var(--ink)]'
                    : 'text-[var(--ink-light)] hover:text-[var(--ink)]'
                }`}
                title={m.title}
              >
                <span>{m.avatar}</span>
                <span className="hidden md:inline">{m.name}</span>
              </button>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Auto-branch toggle */}
          <button
            onClick={() => setAutoRoute(!autoRoute)}
            role="switch"
            aria-checked={autoRoute}
            className={`sticker-button text-xs px-3 py-1.5 text-[var(--ink)] ${
              autoRoute ? 'bg-[var(--lavender)]' : 'bg-white opacity-70'
            }`}
            title="Let Muse Spark move tangents into side windows automatically"
          >
            <span>✨</span>
            <span className="hidden sm:inline">Auto-branch {autoRoute ? 'on' : 'off'}</span>
          </button>

          {/* Demo Button */}
          <button
            onClick={handleLoadDemo}
            className={`sticker-button text-xs px-3 py-1.5 transition-all ${
              demoMode
                ? 'bg-[var(--butter)] text-[var(--ink)]'
                : 'bg-[var(--pink-main)] hover:bg-[var(--pink-deep)] hover:text-white text-[var(--ink)]'
            }`}
            title="Load realistic Kyoto Cat Sanctuary demo tree"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Demo Mode</span>
          </button>

          {/* Data actions: inline on desktop */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={handleExport}
              className="md:px-2.5 md:py-1.5 sticker-button bg-white hover:bg-[var(--cream)] text-[var(--ink)] text-xs"
              title="Export conversation tree as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="md:px-2.5 md:py-1.5 sticker-button bg-white hover:bg-[var(--cream)] text-[var(--ink)] text-xs"
              title="Import conversation tree from JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 sticker-button bg-white hover:bg-red-50 text-[var(--ink)] hover:text-red-600 text-xs"
              title="Reset to blank canvas"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Data actions: overflow menu on mobile */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-1.5 sticker-button bg-white text-[var(--ink)]"
              title="More actions"
            >
              <Ellipsis className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 z-40 w-44 sticker-static bg-white p-1.5 space-y-1"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    handleExport();
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-heading font-semibold text-[var(--ink)] hover:bg-[var(--cream)]"
                >
                  <Download className="w-4 h-4" />
                  Export JSON
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-heading font-semibold text-[var(--ink)] hover:bg-[var(--cream)]"
                >
                  <Upload className="w-4 h-4" />
                  Import JSON
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    handleReset();
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-heading font-semibold text-[var(--ink)] hover:bg-[var(--cream)]"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </header>

      {/* Demo Mode Notice Banner */}
      <DemoModeBanner />

      {/* Mobile tab switcher */}
      <div className="md:hidden flex gap-2 px-2 pt-2 shrink-0">
        {(['graph', 'chat'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`sticker-button flex-1 text-sm py-1.5 text-[var(--ink)] ${
              mobileTab === tab ? 'bg-[var(--pink-main)]' : 'bg-white'
            }`}
          >
            {tab === 'graph' ? '🌳 Graph' : '💬 Chat'}
          </button>
        ))}
      </div>

      {/* Main Content Area: both panes stay mounted so streams survive tab switches */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 flex gap-1.5 md:gap-2 p-2 md:p-4"
        style={{ '--chat-w': `${effectiveChat}px` } as React.CSSProperties}
      >
        <ChatSidebar variant="desktop" />
        <section
          className={`sticker-static bg-white overflow-hidden relative min-h-0 md:flex-1 md:min-w-[250px] w-full md:w-auto ${
            mobileTab === 'graph' ? 'block' : 'hidden md:block'
          }`}
        >
          <GraphView />
        </section>
        <ResizableDivider onResize={resizeBy} onResizeEnd={saveWidth} onReset={resetWidth} />
        <section
          className={`sticker-static bg-white overflow-hidden min-h-0 flex-col w-full md:w-[var(--chat-w)] md:min-w-[280px] md:shrink-0 ${
            mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <ChatPanel />
        </section>
      </main>

      {/* Mobile: chat list slides in from the left */}
      {mobileSidebar && (
        <>
          <div
            className="md:hidden fixed inset-0 z-[1040] bg-[var(--ink)]/40"
            onClick={() => setMobileSidebar(false)}
          />
          <div className="md:hidden">
            <ChatSidebar variant="overlay" onNavigate={() => setMobileSidebar(false)} />
          </div>
        </>
      )}

      {/* Side-branch windows (portal, outside the graph) */}
      <FloatingWindowManager />
      <ContextInspector />
      <ToastHost />
      <ConfirmDialog />
    </div>
  );
}
