import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts';
import {
  META_API_URL,
  META_RESPONSES_URL,
  META_MODEL_CHAT,
  MAX_MESSAGE_TOKENS,
} from '@/lib/constants';
import { createParser, type EventSourceMessage } from 'eventsource-parser';

export const runtime = 'edge';

export async function POST(req: Request) {
  const apiKey = process.env.META_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: 'META_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: {
    messages?: Array<{ role: string; content: string }>;
    system?: string;
    webSearch?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { messages = [], system = CHAT_SYSTEM_PROMPT, webSearch = false } = body;

  try {
    // Mode 1: Search Grounding via Meta Responses API
    if (webSearch) {
      let inputText = '';
      if (system) {
        inputText += `[Instructions: ${system}]\n\n`;
      }
      for (const m of messages) {
        inputText += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}\n\n`;
      }
      inputText = inputText.trim();

      const upstream = await fetch(META_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: META_MODEL_CHAT,
          input: inputText,
          tools: [{ type: 'web_search' }],
          stream: true,
        }),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => 'Responses API call failed');
        return new Response(errText, {
          status: upstream.status || 502,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = upstream.body.getReader();

      const transformStream = new ReadableStream({
        async start(controller) {
          const citations: Array<{ url: string; title: string }> = [];
          const searchQueries: string[] = [];

          const parser = createParser({
            onEvent: (event: EventSourceMessage) => {
              if (!event.data) return;
              try {
                const parsed = JSON.parse(event.data);

                // Handle web search calls in real time
                if (
                  event.event === 'response.output_item.added' ||
                  parsed.type === 'response.output_item.added'
                ) {
                  const item = parsed.item;
                  if (item?.type === 'web_search_call' && item.action?.query) {
                    const q = String(item.action.query);
                    if (!searchQueries.includes(q)) {
                      searchQueries.push(q);
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: 'search_query', query: q })}\n\n`
                        )
                      );
                    }
                  }
                }

                // Handle text streaming deltas
                if (
                  event.event === 'response.output_text.delta' ||
                  parsed.type === 'response.output_text.delta'
                ) {
                  if (parsed.delta) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          choices: [{ delta: { content: parsed.delta } }],
                        })}\n\n`
                      )
                    );
                  }
                }

                // Handle final completed response with citations
                if (
                  event.event === 'response.completed' ||
                  parsed.type === 'response.completed'
                ) {
                  const outputs = parsed.response?.output || [];
                  for (const item of outputs) {
                    if (item.type === 'web_search_call' && item.action?.query) {
                      const q = String(item.action.query);
                      if (!searchQueries.includes(q)) {
                        searchQueries.push(q);
                      }
                    }
                    if (item.type === 'message' && item.content) {
                      for (const c of item.content) {
                        if (c.annotations) {
                          for (const ann of c.annotations) {
                            if (ann.type === 'url_citation' && ann.url) {
                              if (!citations.some((x) => x.url === ann.url)) {
                                let fallbackTitle = ann.url;
                                try {
                                  fallbackTitle = new URL(ann.url).hostname.replace(/^www\./, '');
                                } catch {
                                  // ignore invalid url
                                }
                                citations.push({
                                  url: ann.url,
                                  title: ann.title || fallbackTitle,
                                });
                              }
                            }
                          }
                        }
                      }
                    }
                  }

                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'grounding_metadata',
                        citations,
                        searchQueries,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Non-JSON SSE ping, ignore
              }
            },
          });

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              parser.feed(decoder.decode(value, { stream: true }));
            }
          } catch (readErr) {
            console.error('Error reading upstream Responses stream:', readErr);
          } finally {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        },
      });

      return new Response(transformStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Mode 2: Standard Fast Chat Completions
    const upstream = await fetch(META_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: META_MODEL_CHAT,
        stream: true,
        max_tokens: MAX_MESSAGE_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => 'Upstream call failed');
      return new Response(errText, {
        status: upstream.status || 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return Response.json({ error: message }, { status: 500 });
  }
}
