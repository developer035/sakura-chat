import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { STREAM_TIMEOUT_MS } from './constants';
import type { ChatMessage } from './context';
import type { SearchCitation } from './types';

export interface StreamChatPayload {
  messages: ChatMessage[];
  system?: string;
  webSearch?: boolean;
}

export interface StreamChatCallbacks {
  onToken: (accumulated: string) => void;
  onSearchQuery?: (query: string) => void;
  onCitations?: (citations: SearchCitation[]) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  body: StreamChatPayload,
  onTokenOrCallbacks: ((accumulated: string) => void) | StreamChatCallbacks,
  onDoneArg?: () => void,
  onErrorArg?: (error: Error) => void,
  signalArg?: AbortSignal
): Promise<() => void> {
  const callbacks: StreamChatCallbacks =
    typeof onTokenOrCallbacks === 'function'
      ? {
          onToken: onTokenOrCallbacks,
          onDone: onDoneArg || (() => {}),
          onError: onErrorArg || (() => {}),
        }
      : onTokenOrCallbacks;

  const signal = typeof onTokenOrCallbacks === 'function' ? signalArg : onTokenOrCallbacks.signal;

  let buffer = '';
  let rafId: number | null = null;

  const flush = () => {
    callbacks.onToken(buffer);
    rafId = null;
  };

  const scheduleFlush = () => {
    if (typeof window !== 'undefined' && rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  };

  const controller = new AbortController();
  // Allow up to 45s for deep web search grounding queries
  const timeoutMs = body.webSearch ? 45000 : STREAM_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Streaming response timed out.'));
  }, timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason));
  }

  const cancel = () => {
    controller.abort();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown upstream error');
      throw new Error(`Chat API error (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('Streaming response body is missing.');
    }

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(event.data);

          // Handle live search query announcement
          if (parsed.type === 'search_query' && typeof parsed.query === 'string') {
            callbacks.onSearchQuery?.(parsed.query);
            return;
          }

          // Handle grounding metadata (citations & all search queries)
          if (parsed.type === 'grounding_metadata') {
            if (Array.isArray(parsed.citations)) {
              callbacks.onCitations?.(parsed.citations);
            }
            if (Array.isArray(parsed.searchQueries)) {
              for (const q of parsed.searchQueries) {
                callbacks.onSearchQuery?.(q);
              }
            }
            return;
          }

          // Handle standard token delta
          const token = parsed.choices?.[0]?.delta?.content;
          if (typeof token === 'string' && token.length > 0) {
            buffer += token;
            scheduleFlush();
          }
        } catch {
          // Non-JSON or keep-alive message, ignore
        }
      },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    callbacks.onToken(buffer);
    callbacks.onDone();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (buffer) {
      callbacks.onToken(buffer);
    }
    const finalError = err instanceof Error ? err : new Error(String(err));
    callbacks.onError(finalError);
  }

  return cancel;
}
