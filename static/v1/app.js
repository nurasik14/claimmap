// ClaimMap single-page app: start screen, progress, deck view (graph, pull, questions), live panel.
import { h, VERDICTS, verdictOf, trunc, catLabel, safeUrl, toast } from './util.js';
import * as api from './api.js';
import { createGraph } from './graph.js';
import { createLive } from './live.js';

const $ = (id) => document.getElementById(id);
const STAGES = ['queued', 'parsing', 'extracting', 'checking', 'done'];

const state = {
  deck: null,
  claimById: new Map(),
  liveQs: [],
  statements: new Map(), // claim id -> spoken_claim events about it
  activeQ: null,
  tab: 'ask',
  driftCount: 0,
  token: 0,
  timer: null,
  hover: null,
};

// ---------- views ----------
function showView(name) {
  for (const v of ['start', 'progress', 'deck']) $('view-' + v).hidden = v !== name;
  $('btn-new').hidden = name === 'start';
  if (name === 'start') { $('deck-title').hidden = true; }
}

function gotoStart() {
  if (location.hash) history.pushState(null, '', location.pathname);
  route();
}

// ---------- start screen ----------
function setStartMsg(text, kind = 'info') {
  const el = $('start-msg');
  el.hidden = !text;
  el.className = `notice ${kind === 'error' ? 'error' : ''}`;
  el.textContent = text || '';
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStartMsg('That is not a PDF. Please choose the pitch deck as a PDF file.', 'error');
    return;
  }
  setStartMsg(`Uploading ${file.name}…`);
  try {
    const { deck_id } = await api.uploadDeck(file);
    setStartMsg('');
    location.hash = deck_id;
  } catch (e) {
    setStartMsg(`Upload failed: ${e.message}`, 'error');
  }
}

function initStart() {
  const dz = $('dropzone');
  const input = $('file-input');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { handleFile(input.files[0]); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); });
  dz.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));
  // dropping a file elsewhere on the page must not navigate away from the app
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

async function loadDeckList() {
  const ul = $('deck-list');
  ul.replaceChildren(h('li', { class: 'muted', text: 'Loading…' }));
  try {
    const decks = await api.listDecks();
    decks.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    ul.replaceChildren();
    if (!decks.length) { ul.append(h('li', { class: 'muted', text: 'No decks yet. Upload one above.' })); return; }
    for (const d of decks.slice(0, 12)) {
      ul.append(h('li', {}, h('button', { class: 'deck-row', onclick: () => { location.hash = d.deck_id; } },
        h('span', { class: 'dr-name', text: d.company || `Deck ${d.deck_id}` }),
        h('span', { class: `dr-status st-${d.status}`, text: d.status }),
        h('span', { class: 'dr-date muted', text: String(d.created_at || '').replace('T', ' ').slice(0, 16) }))));
    }
  } catch (e) {
    ul.replaceChildren(h('li', { class: 'muted', text: `Could not load decks: ${e.message}` }));
  }
}

// ---------- routing + progress ----------
function route() {
  clearTimeout(state.timer);
  const token = ++state.token;
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  live.disconnect();
  if (!id) {
    state.deck = null;
    showView('start');
    loadDeckList();
    return;
  }
  openDeck(id, token);
}

async function openDeck(id, token) {
  showView('progress');
  $('deck-title').hidden = true;
  renderProgress({ status: 'queued', progress: 'Loading deck…' });
  let fails = 0;
  const tick = async () => {
    if (token !== state.token) return;
    let deck;
    try {
      deck = await api.getDeck(id);
      fails = 0;
    } catch (e) {
      if (token !== state.token) return;
      if (e.status === 404) {
        history.replaceState(null, '', location.pathname);
        showView('start');
        loadDeckList();
        setStartMsg(`Deck “${trunc(id, 30)}” was not found. Upload it again or pick another one.`, 'error');
        return;
      }
      fails++;
      renderProgress({ status: 'queued', progress: `Connection problem (${trunc(e.message, 60)}), retrying…` });
      state.timer = setTimeout(tick, 1000);
      return;
    }
    if (token !== state.token) return;
    if (deck.status === 'done') { showDeck(deck); return; }
    renderProgress(deck);
    if (deck.status !== 'error') state.timer = setTimeout(tick, 1000);
  };
  tick();
}

function renderProgress(deck) {
  const failed = deck.status === 'error';
  const idx = Math.max(0, STAGES.indexOf(deck.status));
  $('prog-title').textContent = failed ? 'Analysis failed' : 'Analysing deck…';
  $('stages').replaceChildren(...STAGES.map((s, i) =>
    h('li', { class: failed && i === idx ? 'bad' : i < idx ? 'done' : i === idx ? 'active' : '' }, h('span', { class: 'dot' }), s)));
  $('prog-bar').hidden = failed;
  $('prog-text').textContent = deck.progress || '';
  const err = $('prog-error');
  err.hidden = !failed;
  err.textContent = failed ? (deck.error || 'Something went wrong while analysing this deck.') : '';
  $('prog-back').hidden = !failed;
}

// ---------- deck view ----------
const graph = createGraph($('cy'), {
  onSelect: (id) => { renderDetail(id); $('btn-pull').disabled = !id; },
  onHover: (id) => { state.hover = id; renderDetail(id || graph.selected); },
  onPull: renderPull,
});

const live = createLive({
  root: $('pane-live'),
  getClaim: (id) => state.claimById.get(id),
  onSpoken: onSpokenClaim,
  onQuestion: onLiveQuestion,
  onFocusClaim: (id) => graph.select(id),
});

function showDeck(deck) {
  state.deck = deck;
  state.claimById = new Map();
  for (const c of deck.claims || []) if (!state.claimById.has(c.id)) state.claimById.set(c.id, c);
  state.liveQs = [];
  state.statements = new Map();
  state.activeQ = null;
  state.driftCount = 0;
  showView('deck');
  const title = $('deck-title');
  title.textContent = deck.company || `Deck ${deck.deck_id}`;
  title.hidden = false;

  renderSummary(deck);
  renderQuestions();
  renderPull(null);
  setTab('ask');
  live.setDeck(deck.deck_id);

  const empty = $('graph-empty');
  let drawn = false;
  let msg = 'No claims were extracted from this deck. Try a text-based PDF (not scanned images).';
  try {
    drawn = graph.build(deck.claims);
  } catch (e) {
    msg = `The graph could not be drawn: ${e.message}`;
  }
  empty.hidden = drawn;
  empty.textContent = drawn ? '' : msg;
  $('btn-pull').disabled = true;
  $('btn-reset').disabled = !drawn;
  renderDetail(null);
  requestAnimationFrame(() => graph.fit());
}

function renderSummary(deck) {
  const claims = deck.claims || [];
  $('sum-company').textContent = deck.company || `Deck ${deck.deck_id}`;
  $('sum-meta').textContent = `${claims.length} claim${claims.length === 1 ? '' : 's'}${deck.website ? ` · ${deck.website}` : ''}`;
  const counts = Object.fromEntries(Object.keys(VERDICTS).map((k) => [k, 0]));
  for (const c of claims) counts[verdictOf(c).key]++;
  $('sum-counts').replaceChildren(...Object.values(VERDICTS).map((v) =>
    h('div', { class: `count v-${v.key}` }, h('span', { class: 'n', text: String(counts[v.key]) }), h('span', { class: 'l', text: v.label }))));
  const top = [...claims].sort((a, b) => (b.load || 0) - (a.load || 0)).slice(0, 3);
  $('sum-top').replaceChildren(...(top.length ? top.map((c) =>
    h('li', {}, h('button', { class: `top-chip v-${verdictOf(c).key}`, title: c.text, onclick: () => graph.select(c.id) },
      h('span', { class: 'pct', text: `${Math.round((c.load || 0) * 100)}%` }), h('span', { class: 'tx', text: c.text }))))
    : [h('li', { class: 'muted', text: '—' })]));
}

function chip(id) {
  const c = state.claimById.get(id);
  return h('button', { class: `chip v-${verdictOf(c).key}`, title: c.text, onclick: () => graph.select(id) }, trunc(c.text, 38));
}

function renderDetail(id) {
  const box = $('detail');
  box.replaceChildren();
  const c = id && state.claimById.get(id);
  if (!c) {
    const n = state.deck?.claims?.length || 0;
    box.append(h('p', { class: 'placeholder muted', text: n
      ? 'Click or hover a claim to see the evidence. Select one and press P to pull it: what falls if it is false?'
      : 'Nothing to inspect yet.' }));
    return;
  }
  const v = verdictOf(c);
  const load = Math.min(1, Math.max(0, Number(c.load) || 0));
  const deps = [...new Set(c.depends_on || [])].filter((d) => d !== c.id && state.claimById.has(d));
  const rev = (state.deck.claims || []).filter((o) => o.id !== c.id && (o.depends_on || []).includes(c.id)).map((o) => o.id);
  const holds = graph.cascade([c.id]).size - 1;
  const srcs = c.check?.sources || [];
  const said = state.statements.get(c.id) || [];

  const left = [
    h('div', { class: 'd-head' },
      h('span', { class: `badge v-${v.key}`, text: `${v.glyph} ${v.label}` }),
      h('span', { class: 'tag', text: catLabel(c.category) }),
      c.slide != null ? h('span', { class: 'muted', text: `Slide ${c.slide}` }) : null,
      h('span', { class: 'load', title: 'How much of the deal rests on this claim' },
        `Load ${Math.round(load * 100)}%`, h('i', {}, h('b', { style: `width:${Math.round(load * 100)}%` })))),
    h('h3', { class: 'd-text', text: c.text }),
    c.quote ? h('blockquote', { text: `“${c.quote}”` }) : null,
    deps.length ? h('div', { class: 'rel' }, h('span', { class: 'rel-l', text: 'Rests on' }), deps.map(chip)) : null,
    rev.length ? h('div', { class: 'rel' }, h('span', { class: 'rel-l', text: 'Holds up' }), rev.map(chip)) : null,
    holds > 0 ? h('div', { class: 'muted', text: `If this is false, ${holds} other claim${holds === 1 ? '' : 's'} fall with it.` }) : null,
  ];
  const right = [
    c.check?.reason ? h('p', { class: 'd-reason', text: c.check.reason }) : null,
    srcs.length ? h('ul', { class: 'sources' }, srcs.map((s) => {
      const url = safeUrl(s.url);
      return h('li', {},
        h('div', { class: 'src-top' },
          h('span', { class: 'src-kind', text: s.kind }),
          s.title ? h('strong', { text: s.title }) : null,
          s.date ? h('span', { class: 'muted', text: s.date }) : null,
          url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: trunc(url.replace(/^https?:\/\//, ''), 48) })
            : s.url ? h('span', { class: 'muted', text: trunc(s.url, 48) }) : null),
        s.quote ? h('q', { class: 'src-quote', text: s.quote }) : null);
    })) : null,
    said.length ? h('div', { class: 'said' }, h('div', { class: 'rel-l', text: 'Said live' }),
      said.map((e) => h('div', { class: `said-line ${e.relation}`, text: `${e.relation === 'drift' ? '⚠ ' : ''}“${trunc(e.quote, 120)}”` }))) : null,
  ];
  // Node.append(null) prints the text "null": only ever append real nodes (h() skips null children).
  box.append(h('div', { class: 'd-col' }, left), h('div', { class: 'd-col' }, right));
}

// ---------- pull (Jenga) ----------
function renderPull(s) {
  const el = $('pull-banner');
  el.replaceChildren();
  el.classList.toggle('active', !!s && s.pulled.length > 0);
  if (!s || !s.pulled.length) {
    el.append(h('span', { class: 'pb-idle muted', text: 'Jenga: click a claim (or use ←/→), then Pull (P) to see what falls if it is false.' }));
    return;
  }
  const q = (id) => `“${trunc(state.claimById.get(id)?.text, 40)}”`;
  const shown = s.pulled.length > 2 ? `${s.pulled.slice(0, 2).map(q).join(', ')} +${s.pulled.length - 2} more` : s.pulled.map(q).join(', ');
  const asks = (state.deck?.claims || []).filter((c) => c.category === 'ask');
  const fallenSet = new Set(s.fallen);
  const pulledSet = new Set(s.pulled);
  const askFallen = asks.find((c) => fallenSet.has(c.id));
  const others = s.fallen.length - s.pulled.length;
  let sentence;
  if (askFallen && pulledSet.has(askFallen.id)) {
    sentence = `You pulled the ask itself (${q(askFallen.id)})${others > 0 ? `; ${others} other claim${others === 1 ? '' : 's'} fall with it.` : ': nothing else rests on it.'}`;
  } else if (askFallen) {
    sentence = `Pulling ${shown} brings down the ask (${q(askFallen.id)}).`;
  } else if (asks.length) {
    sentence = `Pulling ${shown}: the ask survives.`;
  } else {
    sentence = `Pulling ${shown}.`;
  }
  el.append(
    h('span', { class: 'pb-big', text: `${s.fallen.length} of ${s.total} fall` }),
    h('span', { class: 'pb-text', text: sentence }));
}

function doPull() {
  if (!graph.selected) { toast('Select a claim first, then pull it.', 'info', 3500); return; }
  graph.pullSelected();
}

// ---------- questions ----------
function renderQuestions() {
  const ol = $('q-list');
  ol.replaceChildren();
  const items = [
    ...(state.deck?.questions || []).map((q, i) => ({ q, live: false, i })),
    ...state.liveQs.map((q, i) => ({ q, live: true, i: 1000 + i })),
  ].sort((a, b) => ((a.q.priority ?? 9) - (b.q.priority ?? 9)) || (a.i - b.i));
  if (!items.length) {
    ol.append(h('li', { class: 'muted placeholder', text: state.deck?.claims?.length
      ? 'No questions were generated for this deck.' : 'No questions: no claims were extracted.' }));
    return;
  }
  items.forEach(({ q, live: isLive }, n) => {
    const key = `${isLive ? 'L' : 'D'}:${q.id}`;
    const ids = (q.claim_ids || []).filter((id) => state.claimById.has(id));
    ol.append(h('li', {}, h('button', {
      class: `q-card${state.activeQ === key ? ' active' : ''}${isLive ? ' live' : ''}`,
      'aria-pressed': state.activeQ === key ? 'true' : 'false',
      onclick: () => toggleQuestion(key, ids),
    },
    h('span', { class: 'q-rank', text: String(n + 1) }),
    h('span', { class: 'q-body' },
      h('span', { class: 'q-text' }, isLive ? h('span', { class: 'live-badge', text: 'LIVE' }) : null, q.text),
      q.why ? h('span', { class: 'q-why' }, h('b', { text: 'Why: ' }), q.why) : null,
      q.evidence_to_request ? h('span', { class: 'q-ev' }, h('b', { text: 'Ask for: ' }), q.evidence_to_request) : null,
      ids.length ? h('span', { class: 'q-claims muted', text: `Tests ${ids.length} claim${ids.length === 1 ? '' : 's'} → highlighted in graph` }) : null))));
  });
}

function toggleQuestion(key, ids) {
  state.activeQ = state.activeQ === key ? null : key;
  graph.highlight(state.activeQ ? ids : []);
  if (state.activeQ && ids.length) graph.select(ids[0]);
  renderQuestions();
}

function onLiveQuestion(q) {
  const i = state.liveQs.findIndex((x) => x.id === q.id);
  if (i >= 0) state.liveQs[i] = q; else state.liveQs.push(q);
  renderQuestions();
  if (state.tab !== 'ask') bumpBadge();
}

// ---------- live hooks + tabs ----------
function onSpokenClaim(ev, deckClaim) {
  if (deckClaim) {
    if (!state.statements.has(deckClaim.id)) state.statements.set(deckClaim.id, []);
    state.statements.get(deckClaim.id).push(ev);
    if (ev.relation === 'drift') graph.markDrift(deckClaim.id);
    if (graph.selected === deckClaim.id || state.hover === deckClaim.id) renderDetail(deckClaim.id);
  }
}

function bumpBadge() {
  state.driftCount++;
  const b = $('live-badge');
  b.textContent = String(state.driftCount);
  b.hidden = false;
}

function setTab(tab) {
  state.tab = tab;
  for (const t of ['ask', 'live']) {
    const on = t === tab;
    $('tab-' + t).classList.toggle('active', on);
    $('tab-' + t).setAttribute('aria-selected', on ? 'true' : 'false');
    $('pane-' + t).hidden = !on;
  }
  if (tab === 'live') {
    state.driftCount = 0;
    $('live-badge').hidden = true;
    live.activate();
    $('text-input').focus({ preventScroll: true });
  }
}

// ---------- wiring ----------
function inField(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target) || $('view-deck').hidden) return;
  switch (e.key) {
    case 'p': case 'P': e.preventDefault(); doPull(); break;
    case 'r': case 'R': e.preventDefault(); graph.reset(); break;
    case 'ArrowRight': case 'ArrowDown': e.preventDefault(); graph.step(1); break;
    case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); graph.step(-1); break;
    case 'g': case 'G': e.preventDefault(); setTab(state.tab === 'live' ? 'ask' : 'live'); break;
    case 'Escape': graph.select(null); graph.highlight([]); state.activeQ = null; renderQuestions(); break;
    default: break;
  }
});

$('btn-pull').addEventListener('click', doPull);
$('btn-reset').addEventListener('click', () => graph.reset());
$('tab-ask').addEventListener('click', () => setTab('ask'));
$('tab-live').addEventListener('click', () => setTab('live'));
$('btn-new').addEventListener('click', gotoStart);
$('prog-back').addEventListener('click', gotoStart);
document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); gotoStart(); });
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => live.disconnect());

let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$('view-deck').hidden) graph.fit(); }, 120);
}).observe($('cy'));

initStart();
route();
