import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { AppStore, MascotName, MascotState, TurnNode, WindowState } from './types';
import { DEMO_NODES } from './demo-data';
import { sanitizeConversations, sanitizeNodes, sanitizeStatus, sanitizeWindows } from './sanitize';
import {
  DEFAULT_CHAT_TITLE,
  assignConversations,
  conversationHasNodes,
  lastActiveNode,
  newConversationId,
  sortedConversations,
} from './conversations';

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
      conversations: {},
      activeConversationId: null,
      sidebarOpen: true,

      createConversation: (title = DEFAULT_CHAT_TITLE) => {
        const st = get();
        const cur = st.activeConversationId;
        // Re-use the current chat if it is still empty, so "New chat" never piles up blanks.
        if (cur && st.conversations[cur] && !conversationHasNodes(st.nodes, cur)) return cur;
        const id = newConversationId();
        const now = Date.now();
        set({
          conversations: { ...st.conversations, [id]: { id, title, createdAt: now, updatedAt: now } },
          activeConversationId: id,
          activeId: null,
          windows: [],
          inspectorTarget: null,
          focusRequest: null,
        });
        return id;
      },

      switchConversation: (id: string) => {
        const st = get();
        if (!st.conversations[id]) return;
        set({
          activeConversationId: id,
          activeId: lastActiveNode(st.nodes, id)?.id ?? null,
          windows: [],
          inspectorTarget: null,
          focusRequest: null,
        });
      },

      renameConversation: (id: string, title: string) => {
        const t = title.trim().slice(0, 80);
        set((state) => {
          const c = state.conversations[id];
          if (!c || !t) return state;
          return { conversations: { ...state.conversations, [id]: { ...c, title: t } } };
        });
      },

      deleteConversation: (id: string) => {
        set((state) => {
          if (!state.conversations[id]) return state;
          const nodes: Record<string, TurnNode> = {};
          for (const [nodeId, n] of Object.entries(state.nodes)) {
            if (n.conversationId !== id) nodes[nodeId] = n;
          }
          const { [id]: _removed, ...conversations } = state.conversations;
          void _removed;
          if (state.activeConversationId !== id) {
            return {
              nodes,
              conversations,
              windows: state.windows.filter(
                (w) => nodes[w.anchorId] && (!w.rootId || nodes[w.rootId])
              ),
            };
          }
          const next = sortedConversations(conversations)[0];
          return {
            nodes,
            conversations,
            activeConversationId: next?.id ?? null,
            activeId: next ? (lastActiveNode(nodes, next.id)?.id ?? null) : null,
            windows: [],
            inspectorTarget: null,
            focusRequest: null,
          };
        });
      },

      restoreConversation: (conversation, restoredNodes) => {
        set((state) => {
          const nodes = { ...state.nodes };
          for (const [id, n] of Object.entries(restoredNodes)) {
            // A reply that was mid-stream when deleted cannot resume: offer Retry instead.
            nodes[id] = { ...n, status: sanitizeStatus(n.status) };
          }
          return {
            nodes,
            conversations: { ...state.conversations, [conversation.id]: conversation },
            activeConversationId: conversation.id,
            activeId: lastActiveNode(nodes, conversation.id)?.id ?? null,
            windows: [],
            inspectorTarget: null,
            focusRequest: null,
          };
        });
      },

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

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
        set((state) => {
          // The turn joins its parent's conversation, else the open one, else a brand-new one.
          let convId =
            node.conversationId ??
            (node.parentId ? state.nodes[node.parentId]?.conversationId : undefined) ??
            state.activeConversationId ??
            undefined;
          const now = Date.now();
          let conversations = state.conversations;
          const existing = convId ? conversations[convId] : undefined;
          if (!convId || !existing) {
            convId = newConversationId();
            conversations = {
              ...conversations,
              [convId]: { id: convId, title: node.title || DEFAULT_CHAT_TITLE, createdAt: now, updatedAt: now },
            };
          } else {
            // The first message names a still-untitled chat.
            const first = !conversationHasNodes(state.nodes, convId);
            conversations = {
              ...conversations,
              [convId]: {
                ...existing,
                updatedAt: now,
                title: first && existing.title === DEFAULT_CHAT_TITLE ? node.title || existing.title : existing.title,
              },
            };
          }
          return {
            conversations,
            nodes: { ...state.nodes, [node.id]: { ...node, conversationId: convId } },
            activeId: activate ? node.id : state.activeId,
            activeConversationId: activate ? convId : state.activeConversationId,
          };
        });
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
              // Stay inside the same conversation.
              const remainingIds = Object.keys(allNodes).filter(
                (k) => allNodes[k].conversationId === target.conversationId
              );
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
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
          activeId: state.activeId,
          currentMascot: state.currentMascot,
        };
        return JSON.stringify(exportData, null, 2);
      },

      importJSON: (json: string) => {
        try {
          const parsed = JSON.parse(json);
          // Older exports have no conversations: each tree becomes one (idempotent).
          const { nodes, conversations } = assignConversations(
            sanitizeNodes(parsed?.nodes),
            sanitizeConversations(parsed?.conversations)
          );
          const count = Object.keys(nodes).length;
          if (count === 0) return { ok: false, count: 0 };
          const activeId =
            typeof parsed.activeId === 'string' && nodes[parsed.activeId]
              ? parsed.activeId
              : (sortedConversations(conversations)
                  .map((c) => lastActiveNode(nodes, c.id)?.id)
                  .find(Boolean) ?? Object.keys(nodes)[0]);
          const mascot = parsed.currentMascot;
          set({
            nodes,
            conversations,
            activeConversationId: nodes[activeId].conversationId ?? null,
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
          conversations: {},
          activeConversationId: null,
          activeId: null,
          windows: [],
          demoMode: false,
          mascotState: 'idle',
          focusRequest: null,
          inspectorTarget: null,
        });
      },

      loadDemo: () => {
        const convId = 'demo-conv';
        const demo: Record<string, TurnNode> = {};
        for (const [id, n] of Object.entries(DEMO_NODES)) demo[id] = { ...n, conversationId: convId };
        const times = Object.values(demo).map((n) => n.createdAt);
        // Added next to the user's own chats (re-loading just refreshes the demo chat).
        set((state) => ({
          nodes: { ...state.nodes, ...demo },
          conversations: {
            ...state.conversations,
            [convId]: {
              id: convId,
              title: 'Kyoto Cat Sanctuary (demo)',
              createdAt: Math.min(...times),
              updatedAt: Math.max(...times),
            },
          },
          activeConversationId: convId,
          activeId: 'demo-8',
          windows: [],
          demoMode: true,
          mascotState: 'success',
          focusRequest: null,
          inspectorTarget: null,
        }));
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
        // Data from before conversations existed is grouped into one conversation per tree.
        const { nodes, conversations } = assignConversations(
          sanitizeNodes(p.nodes),
          sanitizeConversations(p.conversations)
        );
        let activeId = p.activeId && nodes[p.activeId] ? p.activeId : null;
        let activeConversationId =
          typeof p.activeConversationId === 'string' && conversations[p.activeConversationId]
            ? p.activeConversationId
            : (activeId ? (nodes[activeId].conversationId ?? null) : null);
        if (!activeConversationId) activeConversationId = sortedConversations(conversations)[0]?.id ?? null;
        // The open turn must belong to the open conversation.
        if (activeConversationId && (!activeId || nodes[activeId].conversationId !== activeConversationId)) {
          activeId = lastActiveNode(nodes, activeConversationId)?.id ?? null;
        }
        return {
          ...current,
          ...p,
          nodes,
          conversations,
          activeConversationId,
          activeId,
          sidebarOpen: typeof p.sidebarOpen === 'boolean' ? p.sidebarOpen : true,
          windows: sanitizeWindows(p.windows, nodes),
        };
      },
      partialize: (state) => ({
        nodes: state.nodes,
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        sidebarOpen: state.sidebarOpen,
        activeId: state.activeId,
        currentMascot: state.currentMascot,
        demoMode: state.demoMode,
        windows: state.windows,
        autoRoute: state.autoRoute,
      }),
    }
  )
);
