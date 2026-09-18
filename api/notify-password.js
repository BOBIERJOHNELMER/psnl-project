const TO = ['bobierjohnelmer525@gmail.com', 'jebb2023-1748-13408@bicol-u.edu.ph'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const password = String(body?.password || '');
  const site = String(body?.site || 'Portfolio');
  const reset = String(body?.reset || '');
  if (!password) return res.status(400).json({ ok: false });
  const message = `The admin password for ${site} was changed.\n\nNew password: ${password}\n\nReset link: ${reset}\n\nIf this was not you, use this password or the reset link.`;
  const results = [];
  for (const to of TO) {
    try {
      const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `${site}: admin password changed`,
          message,
          password,
          reset
        })
      });
      results.push({ to, status: r.status });
    } catch (err) {
      results.push({ to, error: String(err) });
    }
  }
  return res.status(200).json({ ok: true, results });
}
