export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  const src = String(req.query?.src || '');
  const name = String(req.query?.name || 'file.pdf').replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/psnl\/file\/[^?\s]+$/i.test(src)) {
    return res.status(400).json({ ok: false });
  }
  const r = await fetch(src, { cache: 'no-store' });
  if (!r.ok) return res.status(r.status).end();
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get('content-type') || 'application/pdf';
  res.setHeader('Content-Type', type.includes('pdf') ? 'application/pdf' : type);
  res.setHeader('Content-Disposition', `inline; filename="${name || 'file.pdf'}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).send(buf);
}
