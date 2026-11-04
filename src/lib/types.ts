export type NodeKind = 'main' | 'side';

export type NodeStatus = 'idle' | 'routing' | 'thinking' | 'streaming' | 'done' | 'error';

export type MascotState =
  | 'idle'
  | 'thinking'
  | 'writing'
  | 'sniffing'
  | 'branching'
  | 'success'
  | 'error'
  | 'sleeping';

export type MascotName = 'mochi' | 'boba' | 'pip';

export interface TurnNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  user: string;
  assistant: string;
  summary?: string;
  status: NodeStatus;
  excluded?: boolean;
  pin?: string; // pinned return summary from closed side branch
  createdAt: number;
}

export interface WindowState {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
}

export interface AppStore {
  // State
  nodes: Record<string, TurnNode>;
  activeId: string | null;
  windows: WindowState[];
  demoMode: boolean;
  currentMascot: MascotName;
  mascotState: MascotState;

  // Node actions
  addNode: (node: TurnNode) => void;
  updateNode: (id: string, patch: Partial<TurnNode>) => void;
  deleteSubtree: (id: string) => void;
  setActive: (id: string | null) => void;

  // Mascot actions
  setMascotState: (state: MascotState) => void;
  setCurrentMascot: (mascot: MascotName) => void;

  // Window actions
  openWindow: (nodeId: string) => void;
  closeWindow: (id: string) => void;
  updateWindow: (id: string, patch: Partial<WindowState>) => void;
  bringToFront: (id: string) => void;

  // Data management & Demo
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
  reset: () => void;
  loadDemo: () => void;
  setDemoMode: (enabled: boolean) => void;
}
