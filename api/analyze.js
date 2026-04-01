module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('POST only');

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ error: { message: 'Missing API key' } });

  try {
    // Buffer entire body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Parse multipart manually
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return res.status(400).json({ error: { message: 'Missing multipart boundary' } });
    const boundary = boundaryMatch[1];

    const parts = parseMultipart(buffer, boundary);
    const contentParts = [];

    for (const part of parts) {
      if (part.name === 'prompt') {
        contentParts.push({ type: 'text', text: part.data.toString('utf8') });
      } else if (part.name === 'file') {
        const b64 = part.data.toString('base64');
        const mime = part.mime || 'application/octet-stream';
        const isPdf = mime === 'application/pdf';
        contentParts.push({
          type: isPdf ? 'document' : 'image',
          source: { type: 'base64', media_type: mime, data: b64 }
        });
      }
    }

    if (contentParts.length === 0) {
      return res.status(400).json({ error: { message: 'Žádný obsah — přidej soubor nebo popis projektu' } });
    }

    // Text must be last for Anthropic
    const textParts = contentParts.filter(p => p.type === 'text');
    const fileParts = contentParts.filter(p => p.type !== 'text');
    const ordered = [...fileParts, ...textParts];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: ordered }]
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(504).json({
      error: { message: isTimeout ? 'Timeout 55s — zkus znovu.' : err.message }
    });
  }
};

module.exports.config = { api: { bodyParser: false } };

function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);

  let pos = 0;
  while (pos < buffer.length) {
    const sepIdx = indexOf(buffer, sep, pos);
    if (sepIdx === -1) break;
    pos = sepIdx + sep.length;

    if (buffer.slice(pos, pos + 2).toString() === '--') break;
    if (buffer[pos] === 13 && buffer[pos + 1] === 10) pos += 2;

    const headerEnd = indexOf(buffer, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headerStr = buffer.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4;

    const nextSep = indexOf(buffer, sep, pos);
    if (nextSep === -1) break;

    const data = buffer.slice(pos, nextSep - 2);
    pos = nextSep;

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        mime: mimeMatch ? mimeMatch[1].trim() : null,
        data
      });
    }
  }
  return parts;
}

function indexOf(buf, search, start = 0) {
  for (let i = start; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
