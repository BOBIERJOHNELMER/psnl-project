import { put, get, list } from '@vercel/blob';

const PATH = 'psnl/live.json';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

async function readLive() {
  try {
    const blob = await get(PATH, { useCache: false });
    if (blob?.stream) {
      const text = await new Response(blob.stream).text();
      if (text) return JSON.parse(text);
    }
  } catch {}
  try {
    const { blobs } = await list({ prefix: PATH, limit: 5 });
    const url = blobs[0]?.url;
    if (!url) return null;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const live = await readLive();
    if (!live?.pages) return res.status(404).json({ ok: false });
    return res.status(200).json(live);
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const incoming = body?.data;
  const password = String(body?.password || incoming?.password || '');
  if (!incoming?.pages) return res.status(400).json({ ok: false, error: 'Missing site data' });
  const existing = await readLive();
  const needed = existing?.password || incoming.password;
  if (!password || password !== needed) return res.status(401).json({ ok: false, error: 'Wrong password' });
  incoming.publishedAt = Date.now();
  const json = JSON.stringify(incoming);
  if (json.length > 4500000) return res.status(413).json({ ok: false, error: 'Site is too large to publish. Use a smaller photo or video.' });
  try {
    await put(PATH, json, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 0
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
  return res.status(200).json({ ok: true, publishedAt: incoming.publishedAt });
}
