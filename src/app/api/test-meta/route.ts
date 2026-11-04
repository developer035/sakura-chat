export const runtime = 'edge';

export async function GET() {
  const apiKey = process.env.META_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        success: false,
        error: 'META_API_KEY is not defined in environment variables (.env.local)',
      },
      { status: 400 }
    );
  }

  const results: Record<string, unknown> = {
    apiKeyConfigured: true,
    keyPrefix: apiKey.slice(0, 8) + '...',
  };

  const startTime = Date.now();

  // Test 1: Fetch models list
  try {
    const modelsRes = await fetch('https://api.meta.ai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    results.modelsEndpointStatus = modelsRes.status;
    if (modelsRes.ok) {
      const data = await modelsRes.json();
      results.availableModels = data;
    } else {
      results.modelsEndpointError = await modelsRes.text();
    }
  } catch (err: unknown) {
    results.modelsFetchException = err instanceof Error ? err.message : String(err);
  }

  // Test 2: Test simple chat completion call
  try {
    const chatStart = Date.now();
    const chatRes = await fetch('https://api.meta.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'muse-spark-1.3',
        messages: [
          { role: 'system', content: 'You are Mochi the mascot. Respond in one cute sentence.' },
          { role: 'user', content: 'Say hello to Sakura Chat!' },
        ],
        max_tokens: 60,
      }),
    });

    results.chatLatencyMs = Date.now() - chatStart;
    results.chatStatus = chatRes.status;

    if (chatRes.ok) {
      const chatData = await chatRes.json();
      results.chatResponse = chatData;
      results.success = true;
    } else {
      results.chatError = await chatRes.text();
      results.success = false;
    }
  } catch (err: unknown) {
    results.chatException = err instanceof Error ? err.message : String(err);
    results.success = false;
  }

  results.totalLatencyMs = Date.now() - startTime;

  // Test 3: Test Responses API with web_search tool
  try {
    const respRes = await fetch('https://api.meta.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'muse-spark-1.3',
        input: 'What is the current year and latest news?',
        tools: [{ type: 'web_search' }],
      }),
    });
    results.responsesEndpointStatus = respRes.status;
    if (respRes.ok) {
      results.responsesData = await respRes.json();
    } else {
      results.responsesError = await respRes.text();
    }
  } catch (err: unknown) {
    results.responsesException = err instanceof Error ? err.message : String(err);
  }

  return Response.json(results, {
    status: results.success ? 200 : 502,
  });
}
