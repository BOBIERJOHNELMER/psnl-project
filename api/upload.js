import { issueSignedToken, presignUrl, get, list } from '@vercel/blob';

const LIVE = 'psnl/live.json';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readLive() {
  try {
    const blob = await get(LIVE, { useCache: false });
    if (blob?.stream) {
      const text = await new Response(blob.stream).text();
      if (text) return JSON.parse(text);
    }
  } catch {}
  try {
    const { blobs } = await list({ prefix: LIVE, limit: 5 });
    const url = blobs[0]?.url;
    if (!url) return null;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function publicBlobUrl(pathname) {
  const id = String(process.env.BLOB_STORE_ID || '').replace(/^store_/, '').toLowerCase();
  return id ? `https://${id}.public.blob.vercel-storage.com/${pathname}` : '';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const password = String(body?.password || '');
  const pathname = String(body?.pathname || '');
  const contentType = String(body?.contentType || 'application/octet-stream');
  if (!pathname.startsWith('psnl/hero/') && !pathname.startsWith('psnl/file/')) {
    return res.status(400).json({ ok: false, error: 'Invalid upload path' });
  }
  const existing = await readLive();
  const needed = existing?.password || password;
  if (!password || password !== needed) return res.status(401).json({ ok: false, error: 'Wrong password' });
  const types = [contentType, 'application/octet-stream', 'application/pdf', 'video/*', 'image/*', 'audio/*'];
  try {
    const signed = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: types,
      maximumSizeInBytes: 150 * 1024 * 1024,
      validUntil: Date.now() + 60 * 60 * 1000
    });
    const { presignedUrl } = await presignUrl(signed, {
      access: 'public',
      operation: 'put',
      pathname,
      allowOverwrite: true,
      addRandomSuffix: false,
      allowedContentTypes: types,
      contentType,
      contentDisposition: 'inline',
      maximumSizeInBytes: 150 * 1024 * 1024
    });
    return res.status(200).json({
      ok: true,
      uploadUrl: presignedUrl,
      pathname,
      publicUrl: publicBlobUrl(pathname)
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
