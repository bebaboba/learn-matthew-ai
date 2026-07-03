import { buildStatement, sendStatement, lrsConfigured } from '../lib/xapi.js';

// Marks all unanswered questions logged so far as addressed, by writing a
// reset marker to the LRS. The public "unanswered questions" counter (see
// insights.js) only counts ai_unanswered statements after the latest reset —
// so hitting this after you've updated content.md brings the tile back to 0.
//
// Auth: reuses CRON_SECRET (same trust boundary as the digest endpoint — both
// are admin-only actions triggered by Matthew, not visitors).
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method-not-allowed' });
  }
  if (!lrsConfigured) return res.status(200).json({ ok: false, reason: 'lrs-not-configured' });

  const result = await sendStatement(buildStatement('ai_unanswered_reset', null, 'matthew-admin'));
  return res.status(200).json({ ok: result.ok });
}
