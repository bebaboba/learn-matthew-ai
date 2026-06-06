// Shared xAPI helpers for the Learn Matthew analytics loop.
// LRS credentials live only in Vercel env vars — never in client code.
//
// Required env vars (set in Vercel): LRS_ENDPOINT, LRS_KEY, LRS_SECRET
// LRS_ENDPOINT is the xAPI endpoint, e.g. https://lrs.io/xapi/<your-store>/

const ENDPOINT = (process.env.LRS_ENDPOINT || '').replace(/\/$/, '');
const KEY = process.env.LRS_KEY || '';
const SECRET = process.env.LRS_SECRET || '';
const HOMEPAGE = 'https://learnmatthew.com';

export const lrsConfigured = Boolean(ENDPOINT && KEY && SECRET);

function authHeader() {
  return 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');
}

const xapiHeaders = (extra = {}) => ({
  'X-Experience-API-Version': '1.0.3',
  Authorization: authHeader(),
  ...extra,
});

// Anonymous actor — a random session id only, no PII.
function actor(sessionId) {
  return {
    objectType: 'Agent',
    account: { homePage: HOMEPAGE, name: String(sessionId || 'anonymous').slice(0, 64) },
  };
}

const VERBS = {
  experienced: { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { 'en-US': 'experienced' } },
  launched: { id: 'http://adlnet.gov/expapi/verbs/launched', display: { 'en-US': 'launched' } },
  asked: { id: 'http://adlnet.gov/expapi/verbs/asked', display: { 'en-US': 'asked' } },
  clicked: { id: 'https://w3id.org/xapi/dod-isd/verbs/clicked', display: { 'en-US': 'clicked' } },
};

// Whitelisted events → statement shape. Anything not listed is rejected, so the
// public /api/track endpoint can't inject arbitrary data into the LRS.
const EVENTS = {
  session_start: { verb: 'launched', kind: 'session', fallback: 'Portfolio session' },
  project_view: { verb: 'experienced', kind: 'project', fallback: 'Project' },
  section_view: { verb: 'experienced', kind: 'section', fallback: 'Section' },
  ai_launch: { verb: 'launched', kind: 'ai-experiment', fallback: 'Learn Matthew AI experiment' },
  ai_topic: { verb: 'asked', kind: 'ai-topic', fallback: 'General' },
  outbound_click: { verb: 'clicked', kind: 'outbound', fallback: 'Outbound link' },
};

export function buildStatement(eventType, label, sessionId) {
  const def = EVENTS[eventType];
  if (!def) return null;
  const safeLabel =
    (String(label || '').replace(/[^\w \-&·.]/g, '').slice(0, 60).trim()) || def.fallback;
  const slug = safeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || def.kind;
  return {
    actor: actor(sessionId),
    verb: VERBS[def.verb],
    object: {
      objectType: 'Activity',
      id: `${HOMEPAGE}/x/${def.kind}/${slug}`,
      definition: {
        name: { 'en-US': safeLabel },
        type: 'http://adlnet.gov/expapi/activities/interaction',
      },
    },
    timestamp: new Date().toISOString(),
  };
}

export async function sendStatement(statement) {
  if (!lrsConfigured || !statement) return false;
  const res = await fetch(`${ENDPOINT}/statements`, {
    method: 'POST',
    headers: xapiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(statement),
  });
  return res.ok;
}

export async function getStatements({ limit = 500 } = {}) {
  if (!lrsConfigured) return [];
  const res = await fetch(`${ENDPOINT}/statements?limit=${encodeURIComponent(limit)}`, {
    headers: xapiHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.statements) ? data.statements : [];
}

// Map a free-text question to a coarse topic bucket. Only the bucket label is
// ever stored — the raw question text never leaves the request.
const TOPIC_RULES = [
  ['Platform scaling', /(scal|platform|adopt|grow|infrastructure|0-to-1|zero to)/i],
  ['Career arc & background', /(career|art|curat|gallery|starbuck|journey|background|story|path|why)/i],
  ['Product & PM craft', /(product|roadmap|\bpm\b|manage|stakeholder|ship|feature|prioriti)/i],
  ['Learning & enablement', /(learning|l&d|enable|train|onboard|curriculum|instructional|teach)/i],
  ['Data & analytics', /(data|analytic|tableau|sql|dashboard|metric|snowflake|xapi)/i],
  ['AI & tooling', /(\bai\b|llm|claude|tooling|automat|model)/i],
  ['Fit, role & logistics', /(hire|fit|role|salary|comp|available|relocat|remote|contact|reach)/i],
];

export function topicFor(text) {
  const t = String(text || '');
  for (const [label, re] of TOPIC_RULES) if (re.test(t)) return label;
  return 'General';
}
