import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { STREAM_TIMEOUT_MS } from './constants';
import type { ChatMessage } from './context';

export interface StreamChatPayload {
  messages: ChatMessage[];
  system?: string;
}

export async function streamChat(
  body: StreamChatPayload,
  onToken: (accumulated: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<() => void> {
  let buffer = '';
  let rafId: number | null = null;

  const flush = () => {
    onToken(buffer);
    rafId = null;
  };

  const scheduleFlush = () => {
    if (typeof window !== 'undefined' && rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Streaming response timed out after 30 seconds.'));
  }, STREAM_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason));
  }

  // Cancel function returned to caller
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
    onToken(buffer);
    onDone();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (buffer) {
      onToken(buffer);
    }
    const finalError = err instanceof Error ? err : new Error(String(err));
    onError(finalError);
  }

  return cancel;
}
