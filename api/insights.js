import { getStatements, lrsConfigured } from '../lib/xapi.js';

// Short-lived in-memory cache (per warm function instance) to avoid hammering
// the LRS on every page load.
let cache = { at: 0, data: null };
const TTL_MS = 60 * 1000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!lrsConfigured) return res.status(200).json({ ok: false, reason: 'lrs-not-configured' });

  if (cache.data && Date.now() - cache.at < TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(cache.data);
  }

  try {
    const statements = await getStatements({ limit: 500 });

    const sessions = new Set();
    let projectsExplored = 0;
    let conversations = 0;
    let outbound = 0;
    const topics = {};
    const projects = {};

    for (const s of statements) {
      const sid = s.actor?.account?.name;
      if (sid) sessions.add(sid);
      const oid = s.object?.id || '';
      const name = s.object?.definition?.name?.['en-US'] || '';
      if (oid.includes('/x/project/')) {
        projectsExplored++;
        if (name) projects[name] = (projects[name] || 0) + 1;
      } else if (oid.includes('/x/ai-experiment/') || oid.includes('/x/ai-topic/')) {
        if (oid.includes('/x/ai-experiment/')) conversations++;
        if (oid.includes('/x/ai-topic/') && name) topics[name] = (topics[name] || 0) + 1;
      } else if (oid.includes('/x/outbound/')) {
        outbound++;
      }
    }

    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const topTopics = sortDesc(topics).slice(0, 5).map(([label, count]) => ({ label, count }));
    const topProjectEntry = sortDesc(projects)[0];

    const data = {
      ok: true,
      updated: new Date().toISOString(),
      counters: {
        sessions: sessions.size,
        projectsExplored,
        conversations,
        outbound,
      },
      topProject: topProjectEntry ? { label: topProjectEntry[0], count: topProjectEntry[1] } : null,
      topTopics,
    };

    cache = { at: Date.now(), data };
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);
  } catch {
    return res.status(200).json({ ok: false, reason: 'error' });
  }
}
