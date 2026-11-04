import { nanoid } from 'nanoid';
import { useStore } from './store';
import { buildContext } from './context';
import { streamChat } from './stream';
import { CHAT_SYSTEM_PROMPT } from './prompts';
import type { NodeKind, SearchCitation, TurnNode } from './types';

/** Abort controllers for in-flight streams, keyed by node id. */
const inflight = new Map<string, AbortController>();

const get = () => useStore.getState();

function makeTitle(text: string): string {
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

function runStream(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;

  const history = buildContext(get().nodes, node.parentId);
  const messages = [...history, { role: 'user' as const, content: node.user }];
  const controller = new AbortController();
  inflight.get(nodeId)?.abort();
  inflight.set(nodeId, controller);

  get().setMascotState(node.webSearchEnabled ? 'sniffing' : 'thinking');

  const finish = () => {
    if (inflight.get(nodeId) === controller) inflight.delete(nodeId);
  };

  void streamChat(
    { messages, system: CHAT_SYSTEM_PROMPT, webSearch: node.webSearchEnabled },
    {
      signal: controller.signal,
      onToken: (accumulated) => {
        if (controller.signal.aborted && !accumulated) return;
        get().updateNode(nodeId, { assistant: accumulated, status: 'streaming' });
        get().setMascotState('writing');
      },
      onSearchQuery: (query) => {
        const list = get().nodes[nodeId]?.searchQueries || [];
        if (!list.includes(query)) get().updateNode(nodeId, { searchQueries: [...list, query] });
      },
      onCitations: (citations: SearchCitation[]) => {
        get().updateNode(nodeId, { citations });
      },
      onDone: () => {
        finish();
        get().updateNode(nodeId, { status: 'done' });
        get().setMascotState('idle');
      },
      onError: (error) => {
        finish();
        // A user-initiated cancel is not an error: keep what we have.
        if (controller.signal.aborted && controller.signal.reason === 'user-cancel') {
          get().updateNode(nodeId, { status: 'done' });
          get().setMascotState('idle');
          return;
        }
        console.error('Chat stream error:', error);
        const partial = get().nodes[nodeId]?.assistant || '';
        get().updateNode(nodeId, {
          status: 'error',
          assistant:
            partial + `\n\n*(Error: ${error.message || 'Stream interrupted'}. Please retry.)*`,
        });
        get().setMascotState('error');
      },
    }
  );
}

/** Creates a new turn under parentId and starts streaming the reply. Returns the new node id. */
export function sendTurn(opts: {
  parentId: string | null;
  text: string;
  kind: NodeKind;
  branchRoot?: boolean;
}): string {
  const id = nanoid();
  const node: TurnNode = {
    id,
    parentId: opts.parentId,
    kind: opts.kind,
    title: makeTitle(opts.text),
    user: opts.text,
    assistant: '',
    status: 'thinking',
    createdAt: Date.now(),
    webSearchEnabled: get().webSearchEnabled,
    searchQueries: [],
    citations: [],
    ...(opts.branchRoot ? { branchRoot: true } : {}),
  };
  // Side turns must not move the main panel.
  get().addNode(node, opts.kind === 'main');
  runStream(id);
  return id;
}

export function retryTurn(nodeId: string) {
  const node = get().nodes[nodeId];
  if (!node) return;
  get().updateNode(nodeId, { assistant: '', status: 'thinking', searchQueries: [], citations: [] });
  runStream(nodeId);
}

export function cancelTurn(nodeId: string) {
  const c = inflight.get(nodeId);
  if (c) {
    c.abort('user-cancel');
  } else {
    const n = get().nodes[nodeId];
    if (n && (n.status === 'thinking' || n.status === 'streaming')) {
      get().updateNode(nodeId, { status: 'done' });
      get().setMascotState('idle');
    }
  }
}

export function isBusy(node: TurnNode | null | undefined): boolean {
  return !!node && (node.status === 'thinking' || node.status === 'streaming' || node.status === 'routing');
}
