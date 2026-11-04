'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { MASCOTS } from '@/lib/constants';
import type { MascotName } from '@/lib/types';
import { DemoModeBanner } from './DemoModeBanner';
import { ChatPanel } from './ChatPanel';
import { MascotWidget } from './MascotWidget';
import { Download, Upload, RotateCcw, Sparkles } from 'lucide-react';

export function AppShell() {
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const demoMode = useStore((s) => s.demoMode);
  const currentMascot = useStore((s) => s.currentMascot);
  const setCurrentMascot = useStore((s) => s.setCurrentMascot);
  const loadDemo = useStore((s) => s.loadDemo);
  const reset = useStore((s) => s.reset);
  const exportJSON = useStore((s) => s.exportJSON);
  const importJSON = useStore((s) => s.importJSON);

  // Check URL params for ?demo=1 and hydrate store
  useEffect(() => {
    setHydrated(true);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || params.get('demo') === 'true') {
        loadDemo();
      }
    }
  }, [loadDemo]);

  // Export JSON file download
  const handleExport = () => {
    const jsonStr = exportJSON();
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
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importJSON(content);
        if (success) {
          alert('Tree imported successfully! 🌸');
        } else {
          alert('Failed to parse JSON backup file.');
        }
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
          <div className="w-10 h-10 rounded-2xl bg-[var(--pink-main)] border-2 border-[var(--ink)] flex items-center justify-center shadow-[0_2px_0_var(--ink)] shrink-0">
            <span className="text-xl">🌸</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg md:text-xl font-heading font-bold text-[var(--ink)] tracking-tight leading-none">
                Sakura Chat
              </h1>
              <span className="text-[10px] font-heading font-extrabold px-1.5 py-0.5 rounded-full bg-[var(--mint)] border border-[var(--ink)] text-[var(--ink)]">
                M1 Core
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
          {/* Demo Button */}
          <button
            onClick={loadDemo}
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

          {/* Export JSON */}
          <button
            onClick={handleExport}
            className="p-1.5 md:px-2.5 md:py-1.5 sticker-button bg-white hover:bg-[var(--cream)] text-[var(--ink)] text-xs"
            title="Export conversation tree as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Export</span>
          </button>

          {/* Import JSON */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 md:px-2.5 md:py-1.5 sticker-button bg-white hover:bg-[var(--cream)] text-[var(--ink)] text-xs"
            title="Import conversation tree from JSON"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Reset */}
          <button
            onClick={() => {
              if (window.confirm('Clear all conversation turns and start fresh?')) {
                reset();
              }
            }}
            className="p-1.5 sticker-button bg-white hover:bg-red-50 text-[var(--ink)] hover:text-red-600 text-xs"
            title="Reset to blank canvas"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Demo Mode Notice Banner */}
      <DemoModeBanner />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden max-w-5xl w-full mx-auto my-2 md:my-4 md:px-4">
        <div className="w-full h-full sticker bg-white overflow-hidden flex flex-col border-[var(--border-w)] border-[var(--ink)] shadow-[0_6px_0_var(--ink)]">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
