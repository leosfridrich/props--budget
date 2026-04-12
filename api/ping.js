module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const hasKey = !!(req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY);
  return res.status(200).json({ ok: hasKey });
};
