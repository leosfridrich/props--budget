module.exports.config = { api: { bodyParser: { sizeLimit: '20mb' } } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-beta');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('POST only');

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ error: { message: 'Missing API key' } });

  try {
    // Race: celá operace (fetch + čtení těla) musí skončit do 52s
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
        setTimeout(() => reject(new Error('TIMEOUT')), 52000)
      )
    ]);

    return res.status(result.status).json(result.data);

  } catch (err) {
    const isTimeout = err.message === 'TIMEOUT';
    return res.status(504).json({
      error: { message: isTimeout ? 'Timeout 52s — zkus znovu.' : err.message }
    });
  }
};
