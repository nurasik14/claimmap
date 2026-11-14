// DEV ONLY. Loaded only when the page URL has ?mock=1 (see main.js). Serves fixture-shaped data for the
// CONTRACT-v2 routes that are not live yet, by wrapping window.fetch (real routes are used when they work),
// and fakes the live WebSocket for mock sessions (ids starting with "mock-") or when ?mockws=1.
import { useMock } from './api.js';
import { libraryItemFromAnalysis } from './graphcore.js';

const realFetch = window.fetch.bind(window);
const RealWS = window.WebSocket;
const sessions = new Map(); // mock id -> DeckAnalysis
const deleted = new Set();
const enriched = new Map(); // real id -> extra fields (status overrides, brief)
const W = 1600;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const missing = (r) => r.status === 405 || r.status === 404;

function lineLayout(text) {
  const lines = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.map((t, i) => ({ t, y: i === 0 ? 130 : 230 + (i - 1) * 80, size: i === 0 ? 60 : 38 }));
}

function boxesFor(a) {
  for (const c of a.claims || []) {
    if (c.source === 'spoken' || !c.slide || (c.boxes && c.boxes.length)) continue;
    const lines = lineLayout(a.slides?.[c.slide - 1]);
    const needle = String(c.quote || c.text).toLowerCase().slice(0, 18);
    const hit = lines.find((l) => l.t.toLowerCase().includes(needle));
    if (!hit) continue;
    const width = Math.min(W - 160, hit.t.length * hit.size * 0.52);
    c.boxes = [{ slide: c.slide, x: 80 / W, y: (hit.y - hit.size) / H, w: width / W, h: (hit.size * 1.3) / H }];
  }
}

function enrich(a) {
  a = { ...a, ...(enriched.get(a.deck_id) || {}) };
  a.mode = a.mode || 'deck';
  a.title = a.title || a.company || '';
  a.__realSlides = !!a.slide_count;
  if (!a.slide_count && a.mode !== 'live') a.slide_count = (a.slides || []).length;
  a.claims = (a.claims || []).map((c) => ({ source: 'deck', boxes: [], ...c }));
  boxesFor(a);
  a.transcript = a.transcript || [];
  return a;
}

function slideSvg(a, n) {
  const esc = (s) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const lines = lineLayout(a.slides?.[n - 1]);
  const body = lines.map((l, i) => `<text x="80" y="${l.y}" font-size="${l.size}" font-family="Helvetica, Arial, sans-serif" font-weight="${i ? 400 : 700}" fill="#111">${esc(l.t)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${body}<text x="${W - 80}" y="${H - 50}" font-size="28" text-anchor="end" fill="#999" font-family="Arial">${n}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const cache = new Map(); // id -> last analysis (for slide svgs)

function mockBrief(a) {
  const red = (a.claims || []).filter((c) => c.check?.verdict === 'contradicted');
  const top = [...(a.claims || [])].sort((x, y) => (y.load || 0) - (x.load || 0));
  return {
    recommendation: red.length ? 'dig_deeper' : 'take_meeting',
    headline: `${a.title || a.company || 'This company'}: ${red.length ? 'the story holds only if the contradicted claims are explained' : 'nothing contradicted so far'} (MOCK brief).`,
    summary: `MOCK. The deck makes ${(a.claims || []).length} claims; the deal rests on ${top.slice(0, 2).map((c) => c.text).join(' and ')}. ${red.length} claim(s) are contradicted by public evidence.`,
    strengths: top.filter((c) => c.check?.verdict === 'supported').slice(0, 3).map((c) => c.text).concat(['Clear ask and use of funds']),
    red_flags: red.map((c) => ({ text: `${c.text}: ${c.check.reason || 'contradicted'}`, claim_ids: [c.id] })),
    questions: (a.questions || []).slice(0, 4).map((q) => q.text),
    evidence_requests: (a.questions || []).map((q) => q.evidence_to_request).filter(Boolean).slice(0, 4),
    live_notes: (a.claims || []).filter((c) => c.source === 'spoken').map((c) => `Said live: ${c.text}`),
    generated_at: new Date().toISOString(),
  };
}
function briefMd(b) {
  return [`# ${b.headline}`, '', `**Recommendation:** ${b.recommendation}`, '', b.summary, '', '## Red flags', ...b.red_flags.map((f) => `- ${f.text}`), '', '## Questions', ...b.questions.map((q) => `- ${q}`), ''].join('\n');
}

async function getAnalysis(id) {
  if (sessions.has(id)) return sessions.get(id);
  const r = await realFetch(`/api/deck/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const a = enrich(await r.json());
  cache.set(id, a);
  return a;
}

async function mockFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const method = (init.method || 'GET').toUpperCase();
  const p = url.pathname;
  let m;

  if (p === '/api/decks' && method === 'GET') {
    const r = await realFetch(input, init);
    const list = r.ok ? await r.json() : [];
    const full = await Promise.all(list.filter((x) => !deleted.has(x.deck_id)).map(async (x) => {
      if (x.counts) return x;
      const a = await getAnalysis(x.deck_id);
      return a ? libraryItemFromAnalysis(a) : x;
    }));
    return json([...[...sessions.values()].map(libraryItemFromAnalysis), ...full]);
  }
  if (p === '/api/session' && method === 'POST') {
    const r = await realFetch(input, init);
    if (!missing(r)) return r;
    const { title } = JSON.parse(init.body || '{}');
    const id = `mock-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(id, { deck_id: id, status: 'done', progress: '', company: '', slides: [], claims: [], questions: [], created_at: new Date().toISOString(), mode: 'live', title: title || 'Live session', slide_count: 0, transcript: [], brief: null });
    return json({ deck_id: id });
  }
  if ((m = p.match(/^\/api\/deck\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'DELETE') {
      const r = sessions.has(id) ? null : await realFetch(input, init);
      if (r && !missing(r)) return r;
      sessions.delete(id);
      deleted.add(id);
      return json({ ok: true });
    }
    const a = await getAnalysis(id);
    return a ? json(a) : json({ detail: 'Unknown deck' }, 404);
  }
  if ((m = p.match(/^\/api\/deck\/([^/]+)\/finalize$/))) {
    const id = decodeURIComponent(m[1]);
    if (!sessions.has(id)) { const r = await realFetch(input, init); if (!missing(r)) return r; }
    const set = (st) => { if (sessions.has(id)) sessions.get(id).status = st; else enriched.set(id, { ...(enriched.get(id) || {}), status: st, brief: null }); };
    set('checking');
    setTimeout(() => set('done'), 2500);
    return json({ status: 'checking' });
  }
  if ((m = p.match(/^\/api\/deck\/([^/]+)\/brief(\.md)?$/))) {
    const id = decodeURIComponent(m[1]);
    if (!sessions.has(id)) { const r = await realFetch(input, init); if (!missing(r)) return r; }
    const a = await getAnalysis(id);
    if (!a) return json({ detail: 'Unknown deck' }, 404);
    await sleep(m[2] ? 100 : 1500);
    const b = mockBrief(a);
    return m[2] ? new Response(briefMd(b), { headers: { 'Content-Type': 'text/markdown' } }) : json(b);
  }
  return realFetch(input, init);
}

// ---- fake live socket (scripted LabLoop-like pitch) ----
class FakeWS extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.id = decodeURIComponent(url.split('/ws/live/')[1] || '');
    this.n = 0;
    this.timers = [];
    setTimeout(() => { this.readyState = 1; this.onopen?.({}); this.emit({ type: 'status', state: 'idle' }); }, 150);
  }
  emit(ev) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(ev) }); }
  later(ms, ev) { this.timers.push(setTimeout(() => this.emit(ev), ms)); }
  claim(text, value, t, extra = {}) {
    this.n += 1;
    const c = { id: `s${this.n}`, text, quote: text, slide: null, category: extra.category || 'other', value, unit: null, depends_on: extra.depends_on || [], load: extra.load ?? 0.5, check: { verdict: 'unverified', reason: '', sources: [], method: 'none' }, source: 'spoken', t, boxes: [] };
    const a = sessions.get(this.id);
    if (a) a.claims.push(c);
    return c;
  }
  send(data) {
    if (typeof data !== 'string') return;
    const cmd = JSON.parse(data);
    if (cmd.type === 'stop') { this.timers.forEach(clearTimeout); this.emit({ type: 'status', state: 'stopped' }); return; }
    if (cmd.type === 'text') {
      const t = this.n * 5;
      this.emit({ type: 'transcript', text: cmd.text, t0: t, t1: t + 3 });
      const c = this.claim(cmd.text, null, t);
      this.later(400, { type: 'claim_added', claim: c });
      this.later(500, { type: 'spoken_claim', id: c.id, quote: cmd.text, relation: 'new', t });
      return;
    }
    if (cmd.type === 'replay') {
      const sp = 1000 / (cmd.speed || 1);
      const c1 = this.claim('40 paying customers', 40, 3, { category: 'customers', load: 0.9 });
      const c2 = this.claim('Revenue grows 40% every month', 0.4, 7, { category: 'growth', depends_on: [c1.id], load: 0.7 });
      const c3 = this.claim('Market over $10 billion', 1e10, 11, { category: 'market', load: 0.6 });
      const c4 = this.claim('55 paying customers', 55, 18, { category: 'customers', load: 0.9 });
      const c5 = this.claim('$5M revenue by year three', 5e6, 21, { category: 'financials', depends_on: [c2.id, c3.id, c4.id], load: 0.8 });
      this.later(0, { type: 'status', state: 'listening' });
      const steps = [
        [1, { type: 'transcript', text: 'We now have 40 paying customers.', t0: 1, t1: 4 }],
        [3, { type: 'claim_added', claim: c1 }],
        [3.2, { type: 'spoken_claim', id: c1.id, quote: 'We now have 40 paying customers.', category: 'customers', deck_claim_id: 'c3', relation: 'drift', note: 'Deck says 26 customers; founder said 40', t: 3 }],
        [5, { type: 'transcript', text: 'Revenue is growing 40% every month.', t0: 5, t1: 8 }],
        [7, { type: 'claim_added', claim: c2 }],
        [9, { type: 'transcript', text: 'The market is over $10 billion.', t0: 9, t1: 12 }],
        [11, { type: 'claim_added', claim: c3 }],
        [12, { type: 'question', question: { id: 'lq1', text: 'Which of the 40 customers pay today, and can we see the invoices?', claim_ids: [c1.id], why: 'Customer count drifted from the deck.', evidence_to_request: 'Stripe export', priority: 1 } }],
        [16, { type: 'transcript', text: 'Honestly we are at 55 paying customers now.', t0: 16, t1: 19 }],
        [18, { type: 'claim_added', claim: c4 }],
        [18.3, { type: 'spoken_claim', id: c4.id, quote: 'Honestly we are at 55 paying customers now.', category: 'customers', deck_claim_id: c1.id, relation: 'drift', note: 'Said 40 customers at 0:03, now 55', t: 18 }],
        [20, { type: 'transcript', text: 'We will hit $5M revenue by year three.', t0: 20, t1: 23 }],
        [21, { type: 'claim_added', claim: c5 }],
        [24, { type: 'status', state: 'stopped' }],
      ];
      for (const [s, ev] of steps) this.later(s * sp, ev);
    }
  }
  close() { this.timers.forEach(clearTimeout); this.readyState = 3; }
}
FakeWS.OPEN = 1;
FakeWS.CLOSED = 3;
FakeWS.CONNECTING = 0;

export async function install() {
  window.fetch = mockFetch;
  const allFake = new URLSearchParams(location.search).get('mockws') === '1';
  window.WebSocket = function (url, ...rest) {
    return allFake || /\/ws\/live\/mock-/.test(url) ? new FakeWS(url) : new RealWS(url, ...rest);
  };
  Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 });
  useMock({
    slideUrl(id, n) {
      const a = cache.get(id);
      return a && !a.__realSlides ? slideSvg(a, n) : null;
    },
  });
  document.documentElement.dataset.mock = '1';
  console.info('[claimmap] MOCK mode: fetch + live socket are partly simulated (static/js/mock.js).');
}
