import { getStatements, lrsConfigured, REFERRER_EXT } from '../lib/xapi.js';

// Daily digest → ntfy push. Triggered by Vercel Cron (see vercel.json), or
// hit manually to test. Reads the last 24h of this app's statements from the
// LRS, summarizes them, and pushes one notification to your ntfy topic.
//
// Env vars: NTFY_TOPIC (your ntfy topic), CRON_SECRET (optional — if set,
// Vercel Cron sends it as a Bearer token and manual hits must match).
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }
  if (!lrsConfigured) return res.status(200).json({ ok: false, reason: 'lrs-not-configured' });

  const topic = process.env.NTFY_TOPIC;
  if (!topic) return res.status(200).json({ ok: false, reason: 'ntfy-not-configured' });

  try {
    const all = await getStatements({ limit: 500 });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = all.filter((s) => {
      const t = Date.parse(s.timestamp || s.stored || '');
      return Number.isFinite(t) && t >= cutoff;
    });

    const sessions = new Set();
    let projectsExplored = 0;
    let conversations = 0;
    const topics = {};
    const referrers = {};
    const unanswered = [];

    for (const s of recent) {
      const sid = s.actor?.account?.name;
      if (sid) sessions.add(sid);
      const oid = s.object?.id || '';
      const name = s.object?.definition?.name?.['en-US'] || '';
      if (oid.includes('/x/project/')) projectsExplored++;
      else if (oid.includes('/x/ai-experiment/')) conversations++;
      else if (oid.includes('/x/ai-topic/') && name) topics[name] = (topics[name] || 0) + 1;
      else if (oid.includes('/x/ai-unanswered/')) {
        const question = s.object?.definition?.description?.['en-US'];
        if (question) unanswered.push(question);
      }
      const ref = s.context?.extensions?.[REFERRER_EXT];
      if (ref) referrers[ref] = (referrers[ref] || 0) + 1;
    }

    // Skip the push entirely on a quiet day — no "0 visitors" spam.
    if (sessions.size === 0) {
      return res.status(200).json({ ok: true, sent: false, reason: 'no-activity' });
    }

    const top = (o) => {
      const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : null;
    };
    const lines = [
      `${sessions.size} visitor${sessions.size === 1 ? '' : 's'}`,
      `${projectsExplored} project view${projectsExplored === 1 ? '' : 's'}`,
      `${conversations} AI conversation${conversations === 1 ? '' : 's'}`,
    ];
    const topTopic = top(topics);
    if (topTopic) lines.push(`Top topic: ${topTopic}`);
    const topRef = top(referrers);
    if (topRef) lines.push(`Top referrer: ${topRef}`);
    if (unanswered.length) {
      lines.push('');
      lines.push(`${unanswered.length} question${unanswered.length === 1 ? '' : 's'} the AI couldn't answer:`);
      for (const q of unanswered.slice(0, 10)) lines.push(`• ${q}`);
    }

    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        // HTTP header values must be Latin-1/ByteString — an em dash here throws
        // ("Cannot convert argument to a ByteString") and silently kills the whole push.
        Title: unanswered.length ? 'learnmatthew.com - last 24h (add to content.md)' : 'learnmatthew.com - last 24h',
        Tags: unanswered.length ? 'bar_chart,warning' : 'bar_chart',
        Priority: unanswered.length ? 'high' : 'default',
      },
      body: lines.join('\n'),
    });

    return res.status(200).json({ ok: true, sent: r.ok, summary: lines });
  } catch (e) {
    console.error('digest failed:', e);
    return res.status(200).json({ ok: false, reason: 'error' });
  }
}
