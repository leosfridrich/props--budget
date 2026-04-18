const { put, list } = require('@vercel/blob');

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-password');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const expectedPw = process.env.APP_PASSWORD;
  const gotPw = req.headers['x-app-password'];
  if (!expectedPw || gotPw !== expectedPw) {
    return res.status(401).json({ error: 'Unauthorized — nesprávné přístupové heslo' });
  }

  const rawCode = (req.method === 'GET' ? req.query.workspace : req.body?.workspace) || '';
  const code = rawCode.toLowerCase().replace(/[^a-z0-9_-]/g, '').substring(0, 32);
  if (code.length < 2) return res.status(400).json({ error: 'Workspace kód musí mít alespoň 2 znaky' });

  const blobPath = `ws-${code}.json`;

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: blobPath });
      if (!blobs.length) {
        return res.status(200).json({ exists: false, scriptMemory: [], instructions: '', learned: [], projects: [], lastSync: null });
      }
      const r = await fetch(blobs[0].url + '?t=' + Date.now());
      const data = await r.json();
      return res.status(200).json({ exists: true, ...data });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { data } = req.body || {};
      if (!data) return res.status(400).json({ error: 'Chybí data' });
      const payload = { ...data, lastSync: new Date().toISOString() };
      await put(blobPath, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true, lastSync: payload.lastSync });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
