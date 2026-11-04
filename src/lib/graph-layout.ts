import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import type { NodeKind, NodeStatus, TurnNode } from './types';
import { getBranchPath } from './tree-utils';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 112;

/** Minimal, token-free projection of a TurnNode used by the graph. */
export interface GraphItem extends Record<string, unknown> {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  preview: string;
  status: NodeStatus;
  hasPin: boolean;
  files: number; // uploaded attachments
  images: number; // generated images
  doc: boolean; // document-tool turn
  excluded: boolean;
  web: boolean;
  onPath: boolean;
  active: boolean;
}

export type TurnFlowNode = Node<GraphItem, 'turnNode'>;

/**
 * Serialises only the fields the graph cares about. Streaming tokens change
 * `assistant` but not this string, so the graph does not re-layout per token.
 */
export function graphSignature(
  nodes: Record<string, TurnNode>,
  activeId: string | null
): string {
  const onPath = new Set(getBranchPath(nodes, activeId).map((n) => n.id));
  const items: GraphItem[] = Object.values(nodes)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((n) => ({
      id: n.id,
      parentId: n.parentId,
      kind: n.kind,
      title: n.title,
      preview: n.user.slice(0, 70),
      status: n.status,
      hasPin: !!n.pin,
      files: n.attachments?.length ?? 0,
      images: n.outputs?.length ?? 0,
      doc: n.tool === 'document',
      excluded: !!n.excluded,
      web: !!n.webSearchEnabled,
      onPath: onPath.has(n.id),
      active: n.id === activeId,
    }));
  return JSON.stringify(items);
}

export function computeLayout(items: GraphItem[]): {
  nodes: TurnFlowNode[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 30 });

  const ids = new Set(items.map((i) => i.id));
  for (const it of items) {
    g.setNode(it.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const it of items) {
    if (it.parentId && ids.has(it.parentId)) g.setEdge(it.parentId, it.id);
  }

  dagre.layout(g);

  const nodes: TurnFlowNode[] = items.map((it) => {
    const pos = g.node(it.id);
    return {
      id: it.id,
      type: 'turnNode',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      data: it,
    };
  });

  const edges: Edge[] = items
    .filter((it) => it.parentId && ids.has(it.parentId))
    .map((it) => {
      const busy = it.status === 'thinking' || it.status === 'streaming';
      const side = it.kind === 'side';
      return {
        id: `${it.parentId}-${it.id}`,
        source: it.parentId as string,
        target: it.id,
        type: 'smoothstep',
        animated: busy,
        style: {
          stroke: side ? '#B9A3E8' : '#FF7EB6',
          strokeWidth: 2.5,
          strokeDasharray: side ? '6 4' : undefined,
        },
      };
    });

  return { nodes, edges };
}
