'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Pin, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { IMAGE_TOKENS, planContext, type ContextMode } from '@/lib/context';

const MODE_LABEL: Record<ContextMode, string> = {
  full: 'Full',
  summary: 'Summarized',
  excluded: 'Excluded',
};

const MODE_STYLE: Record<ContextMode, string> = {
  full: 'bg-[var(--mint)]',
  summary: 'bg-[var(--butter)]',
  excluded: 'bg-gray-200 text-gray-500',
};

/** Right-hand drawer showing exactly what will be sent with the next message. */
export function ContextInspector() {
  const target = useStore((s) => s.inspectorTarget);
  const nodes = useStore((s) => s.nodes);
  const closeInspector = useStore((s) => s.closeInspector);
  const updateNode = useStore((s) => s.updateNode);

  if (!target || !nodes[target]) return null;

  const plan = planContext(nodes, target);
  const pct = Math.min(100, Math.round((plan.total / plan.budget) * 100));

  return createPortal(
    <aside className="fixed top-0 right-0 bottom-0 z-[1100] w-full sm:w-[380px] bg-[var(--bg-cream)] border-l-[3px] border-[var(--ink)] shadow-[-4px_0_0_var(--ink)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 bg-[var(--mint)] border-b-2 border-[var(--ink)] shrink-0">
        <span className="text-xl">🌸</span>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-bold text-[var(--ink)] leading-tight">
            Pip&apos;s Context Sniffer
          </div>
          <div className="text-[11px] font-heading text-[var(--ink)]/70">
            What the next message will carry
          </div>
        </div>
        <button
          type="button"
          onClick={closeInspector}
          className="p-1.5 rounded-full hover:bg-white/70 text-[var(--ink)]"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-[var(--ink)]/15 shrink-0">
        <div className="flex justify-between text-xs font-heading font-semibold text-[var(--ink)] mb-1">
          <span>~{plan.total.toLocaleString()} tokens</span>
          <span>budget {plan.budget.toLocaleString()}</span>
        </div>
        <div className="h-3 rounded-full border-2 border-[var(--ink)] bg-white overflow-hidden">
          <div
            className={`h-full ${pct > 85 ? 'bg-[var(--pink-deep)]' : 'bg-[var(--mint)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-[var(--ink-light)] mt-1.5">
          Older turns collapse to summaries when over budget. Switch a turn off to leave it out.
        </p>
      </div>

      <ol className="flex-1 overflow-y-auto p-3 space-y-2">
        {plan.entries.map(({ node, mode, tokens }) => {
          const off = mode === 'excluded';
          return (
            <li
              key={node.id}
              className={`rounded-2xl border-2 bg-white p-2.5 ${
                node.kind === 'side' ? 'border-[var(--lavender)]' : 'border-[var(--ink)]'
              } ${off ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span>{node.kind === 'side' ? '🧋' : '🍡'}</span>
                <span
                  className={`flex-1 min-w-0 truncate text-sm font-heading font-bold text-[var(--ink)] ${
                    off ? 'line-through' : ''
                  }`}
                >
                  {node.title}
                </span>
                <span className="text-[11px] font-heading text-[var(--ink-light)] shrink-0">
                  {tokens} tok
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!off}
                  onClick={() => updateNode(node.id, { excluded: !node.excluded })}
                  className={`relative w-9 h-5 rounded-full border-2 border-[var(--ink)] shrink-0 transition-colors ${
                    off ? 'bg-gray-200' : 'bg-[var(--pink-main)]'
                  }`}
                  title={off ? 'Include in context' : 'Exclude from context'}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-[var(--ink)] transition-all ${
                      off ? 'left-0.5' : 'left-[18px]'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-[var(--ink)] text-[var(--ink)] ${MODE_STYLE[mode]}`}
                >
                  {MODE_LABEL[mode]}
                </span>
                {mode === 'full' &&
                  (node.attachments ?? []).map((a) => (
                    <span
                      key={a.id}
                      className="text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full border border-[var(--ink)]/40 bg-white text-[var(--ink)] max-w-[180px] truncate"
                      title={a.name}
                    >
                      {a.kind === 'image' ? '🖼️' : '📄'} {a.name} ·{' '}
                      {a.kind === 'image' ? IMAGE_TOKENS : (a.textTokens ?? 0)} tok
                    </span>
                  ))}
              </div>

              <p className="mt-1.5 text-xs text-[var(--ink-light)] leading-snug line-clamp-3">
                {node.summary ?? (node.status === 'done' ? 'summary pending…' : node.user)}
              </p>

              {node.pin && (
                <div className="mt-1.5 flex items-start gap-1 text-[11px] text-[var(--ink)]">
                  <Pin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{node.pin}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>,
    document.body
  );
}
