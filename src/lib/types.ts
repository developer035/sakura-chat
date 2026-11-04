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
  branchRoot?: boolean; // first node of a branch created via "Branch"
  versionOf?: string; // id of the first version, when this turn is an edited sibling
}

export interface WindowState {
  id: string;
  rootId: string | null; // side-branch root; null = draft (nothing sent yet)
  anchorId: string; // node this branch hangs off
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
}

export interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
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
  focusRequest: { id: string; nonce: number } | null;
  mobileTab: 'graph' | 'chat';
  autoRoute: boolean;
  toasts: Toast[];
  inspectorTarget: string | null;

  // UI actions
  setAutoRoute: (enabled: boolean) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;
  requestFocus: (id: string) => void;
  setMobileTab: (tab: 'graph' | 'chat') => void;

  // Node actions
  addNode: (node: TurnNode, activate?: boolean) => void;
  updateNode: (id: string, patch: Partial<TurnNode>) => void;
  deleteSubtree: (id: string) => void;
  restoreSnapshot: (snapshot: {
    nodes: Record<string, TurnNode>;
    activeId: string | null;
    windows: WindowState[];
  }) => void;
  setActive: (id: string | null) => void;

  // Mascot actions
  setMascotState: (state: MascotState) => void;
  setCurrentMascot: (mascot: MascotName) => void;
  setWebSearchEnabled: (enabled: boolean) => void;

  // Window actions
  openWindow: (opts: { rootId?: string | null; anchorId: string }) => void;
  setWindowRoot: (id: string, rootId: string) => void;
  minimizeWindow: (id: string, minimized: boolean) => void;
  closeWindow: (id: string) => void;
  updateWindow: (id: string, patch: Partial<WindowState>) => void;
  bringToFront: (id: string) => void;

  // Data management & Demo
  exportJSON: () => string;
  importJSON: (json: string) => { ok: boolean; count: number };
  reset: () => void;
  loadDemo: () => void;
  setDemoMode: (enabled: boolean) => void;
}
