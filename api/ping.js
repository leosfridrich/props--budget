module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-app-password');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const expectedPw = process.env.APP_PASSWORD;
  const gotPw = req.headers['x-app-password'];
  const authenticated = !!expectedPw && gotPw === expectedPw;
  if (!authenticated) {
    return res.status(401).json({ ok: false, authenticated: false });
  }

  const hasKey = !!(req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY);
  return res.status(200).json({ ok: hasKey, authenticated: true });
};
