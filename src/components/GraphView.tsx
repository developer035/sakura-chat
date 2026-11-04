'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  computeLayout,
  graphSignature,
  type GraphItem,
} from '@/lib/graph-layout';
import { TurnNodeCard } from './TurnNodeCard';
import { findSideRoot } from '@/lib/tree-utils';

// Stable reference (module scope) so React Flow doesn't re-register node types.
const nodeTypes = { turnNode: TurnNodeCard };

function GraphInner() {
  const sig = useStore((s) => graphSignature(s.nodes, s.activeId));
  const focusRequest = useStore((s) => s.focusRequest);
  const mobileTab = useStore((s) => s.mobileTab);
  const setActive = useStore((s) => s.setActive);
  const requestFocus = useStore((s) => s.requestFocus);
  const setMobileTab = useStore((s) => s.setMobileTab);
  const openWindow = useStore((s) => s.openWindow);
  const { fitView, setCenter, getZoom, setViewport } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Animated viewport moves compute log(w1/w0) in d3, which is NaN when the pane has
  // zero size (it is display:none while the Chat tab is active on mobile). Only animate
  // when the pane is actually visible, and recover if the zoom ever goes non-finite.
  const paneVisible = () => {
    const el = wrapRef.current;
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  };

  const { nodes, edges } = useMemo(() => computeLayout(JSON.parse(sig) as GraphItem[]), [sig]);

  // Refit when the number of nodes changes or the graph tab becomes visible.
  useEffect(() => {
    const r = requestAnimationFrame(() => {
      if (!paneVisible()) return;
      if (!Number.isFinite(getZoom())) setViewport({ x: 0, y: 0, zoom: 1 });
      fitView({ padding: 0.2, duration: 400 });
    });
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, mobileTab, fitView]);

  // Center on the requested node.
  useEffect(() => {
    if (!focusRequest) return;
    const target = nodes.find((n) => n.id === focusRequest.id);
    if (!target) return;
    const r = requestAnimationFrame(() => {
      if (!paneVisible()) return;
      const zoom = getZoom();
      setCenter(target.position.x + NODE_WIDTH / 2, target.position.y + NODE_HEIGHT / 2, {
        zoom: Number.isFinite(zoom) ? Math.max(zoom, 0.8) : 1,
        duration: 400,
      });
    });
    return () => cancelAnimationFrame(r);
    // Only react to new focus requests, not layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => {
          if ((n.data as GraphItem).kind === 'side') {
            const all = useStore.getState().nodes;
            const rootId = findSideRoot(all, n.id);
            const anchorId = rootId ? all[rootId]?.parentId : null;
            if (rootId && anchorId) openWindow({ rootId, anchorId });
            return;
          }
          setActive(n.id);
          requestFocus(n.id);
          setMobileTab('chat');
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} color="#D4C1F5" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => ((n.data as GraphItem).kind === 'side' ? '#D4C1F5' : '#FFB7D5')}
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="font-heading font-semibold text-[var(--ink-light)] text-center px-6">
            Your conversation tree will bloom here 🌱
          </p>
        </div>
      )}
    </div>
  );
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
