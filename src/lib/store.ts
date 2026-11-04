import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { AppStore, MascotName, MascotState, TurnNode, WindowState } from './types';
import { DEMO_NODES } from './demo-data';
import { sanitizeNodes, sanitizeStatus, sanitizeWindows } from './sanitize';

let storageWarned = false;

/** localStorage that never throws (private mode, quota exceeded) and warns once. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      if (!storageWarned) {
        storageWarned = true;
        queueMicrotask(() =>
          useStore.getState().pushToast({
            message: '💾 Storage is full, so Export your tree to keep it safe',
          })
        );
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      nodes: {},
      activeId: null,
      windows: [],
      demoMode: false,
      currentMascot: 'mochi',
      mascotState: 'idle',
      webSearchEnabled: false,
      focusRequest: null,
      mobileTab: 'chat',
      autoRoute: true,
      toasts: [],
      inspectorTarget: null,
      confirmDialog: null,

      setAutoRoute: (autoRoute: boolean) => set({ autoRoute }),
      pushToast: (toast) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-3) }));
        return id;
      },
      dismissToast: (id: string) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      openInspector: (inspectorTarget: string) => set({ inspectorTarget }),
      closeInspector: () => set({ inspectorTarget: null }),
      askConfirm: (confirmDialog) => set({ confirmDialog }),
      closeConfirm: () => set({ confirmDialog: null }),

      requestFocus: (id: string) => set({ focusRequest: { id, nonce: Date.now() } }),
      setMobileTab: (mobileTab: 'graph' | 'chat') => set({ mobileTab }),

      addNode: (node: TurnNode, activate = true) => {
        set((state) => ({
          nodes: { ...state.nodes, [node.id]: node },
          activeId: activate ? node.id : state.activeId,
        }));
      },

      updateNode: (id: string, patch: Partial<TurnNode>) => {
        set((state) => {
          const existing = state.nodes[id];
          if (!existing) return state;
          return {
            nodes: {
              ...state.nodes,
              [id]: { ...existing, ...patch },
            },
          };
        });
      },

      deleteSubtree: (id: string) => {
        set((state) => {
          const allNodes = { ...state.nodes };
          const target = allNodes[id];
          if (!target) return state;

          // Find all descendant IDs
          const toDelete = new Set<string>([id]);
          let foundMore = true;

          while (foundMore) {
            foundMore = false;
            for (const [nodeId, node] of Object.entries(allNodes)) {
              if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(nodeId)) {
                toDelete.add(nodeId);
                foundMore = true;
              }
            }
          }

          toDelete.forEach((nodeId) => {
            delete allNodes[nodeId];
          });

          // Determine new activeId if current active was in deleted subtree
          let newActiveId = state.activeId;
          if (state.activeId && toDelete.has(state.activeId)) {
            newActiveId = target.parentId && allNodes[target.parentId] ? target.parentId : null;
            if (!newActiveId) {
              const remainingIds = Object.keys(allNodes);
              newActiveId = remainingIds.length > 0 ? remainingIds[remainingIds.length - 1] : null;
            }
          }

          // Filter out closed windows
          const newWindows = state.windows.filter(
            (w) => !toDelete.has(w.anchorId) && !(w.rootId && toDelete.has(w.rootId))
          );

          return {
            nodes: allNodes,
            activeId: newActiveId,
            windows: newWindows,
          };
        });
      },

      restoreSnapshot: (snapshot) => {
        set((state) => {
          const restored: Record<string, TurnNode> = {};
          for (const [id, n] of Object.entries(snapshot.nodes)) {
            // A reply that was mid-stream when deleted cannot resume: offer Retry instead.
            if (n) restored[id] = { ...n, status: sanitizeStatus(n.status) };
          }
          const nodes = { ...state.nodes, ...restored };
          const known = new Set(state.windows.map((w) => w.id));
          const windows = [
            ...state.windows,
            ...snapshot.windows.filter(
              (w) => !known.has(w.id) && nodes[w.anchorId] && (!w.rootId || nodes[w.rootId])
            ),
          ]
            .sort((a, b) => a.z - b.z)
            .slice(-3);
          return {
            nodes,
            windows,
            activeId:
              snapshot.activeId && nodes[snapshot.activeId] ? snapshot.activeId : state.activeId,
          };
        });
      },

      setActive: (id: string | null) => {
        set({ activeId: id });
      },

      setMascotState: (mascotState: MascotState) => {
        set({ mascotState });
      },

      setCurrentMascot: (currentMascot: MascotName) => {
        set({ currentMascot });
      },

      setWebSearchEnabled: (webSearchEnabled: boolean) => {
        set({ webSearchEnabled });
      },

      openWindow: ({ rootId = null, anchorId }) => {
        set((state) => {
          // If a window for this branch already exists, bring it to front
          const existing = rootId ? state.windows.find((w) => w.rootId === rootId) : undefined;
          if (existing) {
            const maxZ = Math.max(10, ...state.windows.map((w) => w.z));
            return {
              windows: state.windows.map((w) =>
                w.id === existing.id ? { ...w, z: maxZ + 1, minimized: false } : w
              ),
            };
          }

          // Enforce max 3 open floating windows by removing the lowest z-index window
          const currentList = [...state.windows];
          if (currentList.length >= 3) {
            currentList.sort((a, b) => a.z - b.z);
            currentList.shift();
          }

          const maxZ = currentList.length > 0 ? Math.max(...currentList.map((w) => w.z)) : 10;
          const offset = (currentList.length * 30) % 150;

          const newWindow: WindowState = {
            id: `win-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            rootId,
            anchorId,
            x: 80 + offset,
            y: 80 + offset,
            w: 420,
            h: 480,
            z: maxZ + 1,
            minimized: false,
          };

          return {
            windows: [...currentList, newWindow],
          };
        });
      },

      setWindowRoot: (id: string, rootId: string) => {
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, rootId } : w)),
        }));
      },

      minimizeWindow: (id: string, minimized: boolean) => {
        set((state) => {
          const maxZ = Math.max(10, ...state.windows.map((w) => w.z));
          return {
            windows: state.windows.map((w) =>
              w.id === id ? { ...w, minimized, z: minimized ? w.z : maxZ + 1 } : w
            ),
          };
        });
      },

      closeWindow: (id: string) => {
        set((state) => ({
          windows: state.windows.filter((w) => w.id !== id),
        }));
      },

      updateWindow: (id: string, patch: Partial<WindowState>) => {
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }));
      },

      bringToFront: (id: string) => {
        set((state) => {
          const maxZ = Math.max(10, ...state.windows.map((w) => w.z));
          return {
            windows: state.windows.map((w) => (w.id === id ? { ...w, z: maxZ + 1 } : w)),
          };
        });
      },

      exportJSON: () => {
        const state = get();
        const exportData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          nodes: state.nodes,
          activeId: state.activeId,
          currentMascot: state.currentMascot,
        };
        return JSON.stringify(exportData, null, 2);
      },

      importJSON: (json: string) => {
        try {
          const parsed = JSON.parse(json);
          const nodes = sanitizeNodes(parsed?.nodes);
          const count = Object.keys(nodes).length;
          if (count === 0) return { ok: false, count: 0 };
          const activeId =
            typeof parsed.activeId === 'string' && nodes[parsed.activeId]
              ? parsed.activeId
              : Object.keys(nodes)[0];
          const mascot = parsed.currentMascot;
          set({
            nodes,
            activeId,
            currentMascot: mascot === 'boba' || mascot === 'pip' ? mascot : 'mochi',
            windows: [],
            demoMode: false,
            focusRequest: null,
            inspectorTarget: null,
          });
          return { ok: true, count };
        } catch {
          return { ok: false, count: 0 };
        }
      },

      reset: () => {
        set({
          nodes: {},
          activeId: null,
          windows: [],
          demoMode: false,
          mascotState: 'idle',
          focusRequest: null,
          inspectorTarget: null,
        });
      },

      loadDemo: () => {
        set({
          nodes: { ...DEMO_NODES },
          activeId: 'demo-8',
          windows: [],
          demoMode: true,
          mascotState: 'success',
          focusRequest: null,
          inspectorTarget: null,
        });
      },

      setDemoMode: (enabled: boolean) => {
        set({ demoMode: enabled });
      },
    }),
    {
      name: 'sakura-chat-storage',
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppStore>;
        const nodes = sanitizeNodes(p.nodes);
        const activeId = p.activeId && nodes[p.activeId] ? p.activeId : null;
        return {
          ...current,
          ...p,
          nodes,
          activeId,
          windows: sanitizeWindows(p.windows, nodes),
        };
      },
      partialize: (state) => ({
        nodes: state.nodes,
        activeId: state.activeId,
        currentMascot: state.currentMascot,
        demoMode: state.demoMode,
        windows: state.windows,
        autoRoute: state.autoRoute,
      }),
    }
  )
);
