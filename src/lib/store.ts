import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppStore, MascotName, MascotState, TurnNode, WindowState } from './types';
import { DEMO_NODES } from './demo-data';

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

      addNode: (node: TurnNode) => {
        set((state) => ({
          nodes: { ...state.nodes, [node.id]: node },
          activeId: node.id,
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
          const newWindows = state.windows.filter((w) => !toDelete.has(w.nodeId));

          return {
            nodes: allNodes,
            activeId: newActiveId,
            windows: newWindows,
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

      openWindow: (nodeId: string) => {
        set((state) => {
          // If window for this node already exists, bring it to front
          const existing = state.windows.find((w) => w.nodeId === nodeId);
          if (existing) {
            const maxZ = Math.max(10, ...state.windows.map((w) => w.z));
            return {
              windows: state.windows.map((w) =>
                w.id === existing.id ? { ...w, z: maxZ + 1, minimized: false } : w
              ),
            };
          }

          // Enforce max 3 open floating windows by removing the lowest z-index window
          let currentList = [...state.windows];
          if (currentList.length >= 3) {
            currentList.sort((a, b) => a.z - b.z);
            currentList.shift();
          }

          const maxZ = currentList.length > 0 ? Math.max(...currentList.map((w) => w.z)) : 10;
          const offset = (currentList.length * 30) % 150;

          const newWindow: WindowState = {
            id: `win-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            nodeId,
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

      importJSON: (json: string): boolean => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object' || !parsed.nodes) {
            return false;
          }
          set({
            nodes: parsed.nodes,
            activeId: parsed.activeId || Object.keys(parsed.nodes)[0] || null,
            currentMascot: parsed.currentMascot || 'mochi',
            windows: [],
            demoMode: false,
          });
          return true;
        } catch {
          return false;
        }
      },

      reset: () => {
        set({
          nodes: {},
          activeId: null,
          windows: [],
          demoMode: false,
          mascotState: 'idle',
        });
      },

      loadDemo: () => {
        set({
          nodes: { ...DEMO_NODES },
          activeId: 'demo-8',
          windows: [],
          demoMode: true,
          mascotState: 'success',
        });
      },

      setDemoMode: (enabled: boolean) => {
        set({ demoMode: enabled });
      },
    }),
    {
      name: 'sakura-chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nodes: state.nodes,
        activeId: state.activeId,
        currentMascot: state.currentMascot,
        demoMode: state.demoMode,
      }),
    }
  )
);
