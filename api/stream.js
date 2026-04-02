// Edge Runtime — nativní streaming, žádný buffering
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'Missing API key' } }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  body.stream = true;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (upstream.status !== 200) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Přímý pipe ReadableStream — Edge Runtime to streamuje bez buffering
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
