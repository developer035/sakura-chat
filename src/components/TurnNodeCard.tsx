'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, Check, GitFork, Loader2, Pin } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { TurnFlowNode } from '@/lib/graph-layout';

function TurnNodeCardInner({ data }: NodeProps<TurnFlowNode>) {
  const setActive = useStore((s) => s.setActive);
  const setBranchFrom = useStore((s) => s.setBranchFrom);
  const requestFocus = useStore((s) => s.requestFocus);
  const setMobileTab = useStore((s) => s.setMobileTab);

  const isSide = data.kind === 'side';
  const busy =
    data.status === 'routing' || data.status === 'thinking' || data.status === 'streaming';
  const badge = data.web ? '🌸' : isSide ? '🧋' : '🍡';

  const border = isSide ? 'border-[var(--lavender)]' : 'border-[var(--ink)]';
  const ring = data.active ? 'ring-4 ring-[var(--pink-deep)]/70' : '';
  const dim = data.onPath ? 'opacity-100' : 'opacity-70';

  return (
    <div
      className={`group relative w-[240px] h-[112px] rounded-2xl bg-white border-[2.5px] ${border} ${ring} ${dim} px-3 py-2 flex flex-col gap-1 cursor-pointer shadow-[0_3px_0_var(--ink)] overflow-hidden`}
      style={{ boxSizing: 'border-box' }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!opacity-0" />

      <div className="flex items-center gap-1.5">
        <span
          className={`w-6 h-6 rounded-full border-2 border-[var(--ink)] flex items-center justify-center text-xs shrink-0 ${
            isSide ? 'bg-[var(--lavender)]' : 'bg-[var(--pink-main)]'
          }`}
        >
          {badge}
        </span>
        <span className="font-heading font-bold text-sm text-[var(--ink)] truncate flex-1">
          {data.title}
        </span>
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--pink-deep)] shrink-0" />
        ) : data.status === 'error' ? (
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        ) : data.status === 'done' ? (
          <span className="w-4 h-4 rounded-full bg-[var(--mint)] border border-[var(--ink)] flex items-center justify-center shrink-0">
            <Check className="w-3 h-3 text-[var(--ink)]" />
          </span>
        ) : null}
      </div>

      <p className="text-xs font-body text-[var(--ink-light)] line-clamp-2 leading-snug flex-1">
        {data.preview}
      </p>

      <div className="flex items-center justify-between">
        {data.hasPin ? <Pin className="w-3 h-3 text-[var(--ink)]" /> : <span />}
        <button
          type="button"
          className="nodrag nopan inline-flex items-center gap-1 text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full border border-[var(--ink)] bg-[var(--cream)] hover:bg-[var(--lavender)] text-[var(--ink)] opacity-70 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            setBranchFrom(data.id);
            setActive(data.id);
            requestFocus(data.id);
            setMobileTab('chat');
          }}
          title="Ask a side question from here"
        >
          <GitFork className="w-3 h-3" />
          Branch
        </button>
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} className="!opacity-0" />
    </div>
  );
}

export const TurnNodeCard = memo(TurnNodeCardInner);
