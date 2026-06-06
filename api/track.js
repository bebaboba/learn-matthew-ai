import { buildStatement, sendStatement, lrsConfigured } from '../lib/xapi.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Receives a lightweight anonymous event from the site and records it to the
// LRS as an xAPI statement. Fail-safe: never returns an error that could break
// the page, and silently no-ops until the LRS env vars are configured.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  if (!lrsConfigured) return res.status(202).json({ ok: false, reason: 'lrs-not-configured' });

  try {
    const { event, label, sessionId } = req.body || {};
    const statement = buildStatement(event, label, sessionId);
    if (!statement) return res.status(400).json({ ok: false, reason: 'unknown-event' });
    const result = await sendStatement(statement);
    return res.status(202).json({
      ok: true,
      stored: result.ok,
      lrsStatus: result.status,
      ...(result.ok ? {} : { lrsBody: result.body }),
    });
  } catch {
    return res.status(200).json({ ok: false });
  }
}
