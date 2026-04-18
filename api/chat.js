module.exports.config = { api: { bodyParser: { sizeLimit: '20mb' } } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-beta');

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-app-password, anthropic-version, anthropic-beta');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('POST only');

  const expectedPw = process.env.APP_PASSWORD;
  const gotPw = req.headers['x-app-password'];
  if (!expectedPw || gotPw !== expectedPw) {
    return res.status(401).json({ error: { message: 'Unauthorized — nesprávné přístupové heslo' } });
  }

  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: { message: 'Missing API key' } });

  try {
    // Race: celá operace musí skončit do 110s (Vercel maxDuration 120s)
    const result = await Promise.race([
      (async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
            ...(req.headers['anthropic-beta'] ? { 'anthropic-beta': req.headers['anthropic-beta'] } : {}),
          },
          body: JSON.stringify(req.body),
        });
        const data = await response.json();
        return { status: response.status, data };
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 110000)
      )
    ]);

    return res.status(result.status).json(result.data);

  } catch (err) {
    const isTimeout = err.message === 'TIMEOUT';
    return res.status(504).json({
      error: { message: isTimeout ? 'Timeout — zkus znovu.' : err.message }
    });
  }
};
