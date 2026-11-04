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

export interface SearchCitation {
  url: string;
  title?: string;
}

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
  searchQueries?: string[];
  citations?: SearchCitation[];
  webSearchEnabled?: boolean;
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
  webSearchEnabled: boolean;
  branchFromId: string | null;
  focusRequest: { id: string; nonce: number } | null;
  mobileTab: 'graph' | 'chat';

  // UI actions
  setBranchFrom: (id: string | null) => void;
  requestFocus: (id: string) => void;
  setMobileTab: (tab: 'graph' | 'chat') => void;

  // Node actions
  addNode: (node: TurnNode) => void;
  updateNode: (id: string, patch: Partial<TurnNode>) => void;
  deleteSubtree: (id: string) => void;
  setActive: (id: string | null) => void;

  // Mascot actions
  setMascotState: (state: MascotState) => void;
  setCurrentMascot: (mascot: MascotName) => void;
  setWebSearchEnabled: (enabled: boolean) => void;

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
