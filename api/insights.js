import { getStatements, lrsConfigured } from '../lib/xapi.js';

// Short-lived in-memory cache (per warm function instance) to avoid hammering
// the LRS on every page load.
let cache = { at: 0, data: null };
const TTL_MS = 10 * 1000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!lrsConfigured) return res.status(200).json({ ok: false, reason: 'lrs-not-configured' });

  if (cache.data && Date.now() - cache.at < TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=10');
    return res.status(200).json(cache.data);
  }

  try {
    const statements = await getStatements({ limit: 500 });

    const sessions = new Set();
    let projectsExplored = 0;
    let conversations = 0;
    let outbound = 0;
    let deepDives = 0;
    let totalVisits = 0;
    let returnVisits = 0;
    const topics = {};
    const projects = {};
    const deepDiveProjects = {};
    const timeOnPageSecs = [];
    const scrollMaxBySession = {};

    // Find the most recent reset marker first — the unanswered counter below
    // only counts questions logged after it (see resolve-unanswered.js).
    let resetAt = 0;
    for (const s of statements) {
      if ((s.object?.id || '').includes('/x/ai-unanswered-reset/')) {
        const t = Date.parse(s.timestamp || s.stored || '');
        if (Number.isFinite(t) && t > resetAt) resetAt = t;
      }
    }

    let unanswered = 0;
    for (const s of statements) {
      const sid = s.actor?.account?.name;
      if (sid) sessions.add(sid);
      const oid = s.object?.id || '';
      const name = s.object?.definition?.name?.['en-US'] || '';
      if (oid.includes('/x/project-detail/')) {
        deepDives++;
        if (name) deepDiveProjects[name] = (deepDiveProjects[name] || 0) + 1;
      } else if (oid.includes('/x/project/')) {
        projectsExplored++;
        if (name) projects[name] = (projects[name] || 0) + 1;
      } else if (oid.includes('/x/ai-topic/')) {
        // Each ai-topic statement is a real message sent to the AI guide —
        // a truer "conversation" signal than a launch click.
        conversations++;
        if (name) topics[name] = (topics[name] || 0) + 1;
      } else if (oid.includes('/x/outbound/')) {
        outbound++;
      } else if (oid.includes('/x/ai-unanswered/')) {
        const t = Date.parse(s.timestamp || s.stored || '');
        if (Number.isFinite(t) && t > resetAt) unanswered++;
      } else if (oid.includes('/x/session/')) {
        totalVisits++;
      } else if (oid.includes('/x/return-visit/')) {
        returnVisits++;
      } else if (oid.includes('/x/time-on-page/')) {
        const m = /^PT(\d+)S$/.exec(s.result?.duration || '');
        if (m) timeOnPageSecs.push(parseInt(m[1], 10));
      } else if (oid.includes('/x/scroll-depth/')) {
        const pct = parseInt(name, 10);
        if (Number.isFinite(pct) && sid) {
          scrollMaxBySession[sid] = Math.max(scrollMaxBySession[sid] || 0, pct);
        }
      }
    }

    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const topTopics = sortDesc(topics).slice(0, 5).map(([label, count]) => ({ label, count }));
    const topDeepDives = sortDesc(deepDiveProjects).slice(0, 5).map(([label, count]) => ({ label, count }));
    const topProjectEntry = sortDesc(projects)[0];

    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const avgTimeOnPageSeconds = avg(timeOnPageSecs);
    const avgScrollDepth = avg(Object.values(scrollMaxBySession));
    const returnVisitPct = totalVisits ? Math.round((returnVisits / totalVisits) * 100) : null;

    const data = {
      ok: true,
      updated: new Date().toISOString(),
      counters: {
        sessions: sessions.size,
        projectsExplored,
        conversations,
        outbound,
        deepDives,
        unanswered,
        avgTimeOnPageSeconds,
        avgScrollDepth,
        returnVisitPct,
      },
      topProject: topProjectEntry ? { label: topProjectEntry[0], count: topProjectEntry[1] } : null,
      topTopics,
      topDeepDives,
    };

    cache = { at: Date.now(), data };
    res.setHeader('Cache-Control', 's-maxage=10');
    return res.status(200).json(data);
  } catch {
    return res.status(200).json({ ok: false, reason: 'error' });
  }
}
