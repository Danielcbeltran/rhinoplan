export default async function handler(req, res) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY;

  const endpoint = req.query.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + endpoint, {
      method: req.method,
      headers: {
        apikey: SUPA_KEY,
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
