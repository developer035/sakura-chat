'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import type { TurnNode } from '@/lib/types';
import { getBranchPath } from '@/lib/tree-utils';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbsProps {
  thread?: TurnNode[];
  focusedNodeId?: string | null;
  onScrollToNode?: (nodeId: string) => void;
}

export function Breadcrumbs({ thread: propThread, focusedNodeId, onScrollToNode }: BreadcrumbsProps) {
  const nodes = useStore((s) => s.nodes);
  const activeId = useStore((s) => s.activeId);

  // Use provided thread or compute full branch path
  const thread = propThread ?? (activeId ? getBranchPath(nodes, activeId) : []);

  if (thread.length === 0) {
    return null;
  }

  const latestNode = thread[thread.length - 1];

  const handleClick = (nodeId: string) => {
    if (onScrollToNode) {
      onScrollToNode(nodeId);
    } else {
      const el = document.getElementById(`turn-${nodeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto py-1 px-3 text-xs font-heading font-semibold scrollbar-none">
      <span className="text-[var(--ink-light)] shrink-0 flex items-center gap-1">
        <span>🌸 Tree Path:</span>
      </span>

      {thread.map((node, index) => {
        const isFocused = focusedNodeId === node.id;
        const isLatest = node.id === latestNode.id;
        const isSide = node.kind === 'side';

        return (
          <React.Fragment key={node.id}>
            {index > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-light)] shrink-0 opacity-60" />
            )}
            <button
              type="button"
              onClick={() => handleClick(node.id)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                isFocused
                  ? 'bg-[var(--pink-deep)] text-white border-[var(--ink)] shadow-[0_2px_0_var(--ink)] font-bold scale-105 ring-2 ring-[var(--pink-deep)]/40'
                  : isLatest
                  ? isSide
                    ? 'bg-[var(--lavender)] text-[var(--ink)] border-[var(--ink)] shadow-[0_1.5px_0_var(--ink)] font-bold'
                    : 'bg-[var(--pink-main)] text-[var(--ink)] border-[var(--ink)] shadow-[0_1.5px_0_var(--ink)] font-bold'
                  : 'bg-white/80 text-[var(--ink-light)] hover:text-[var(--ink)] hover:bg-white border-[var(--ink)]/20 hover:border-[var(--ink)] shadow-sm'
              }`}
              title={`Scroll up to "${node.title}"`}
            >
              <span>{isSide ? '🧋' : '🌸'}</span>
              <span className="max-w-[140px] truncate">{node.title}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
