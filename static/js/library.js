// Library (#/): v4 hero (upload / live), stat cards, filterable grid of deck cards drawn as paper sheets.
import { h, icon, btn, dots, CAPTURE_LABEL, MODE_LABEL, fmtDate, toast, modal, empty, scoreDial, safeUrl, busy } from './util.js';
import { listDecks, uploadDeck, getDeck, createSession, slideUrl } from './api.js';
import { libraryCardModel, libraryItemFromAnalysis, sortItems } from './graphcore.js';
import { moreButton, closeMenu } from './share.js';

const SORT_KEY = 'claimmap.sort';
const MODES = [['all', 'All'], ['deck', MODE_LABEL.deck], ['live', MODE_LABEL.live], ['deck+live', MODE_LABEL['deck+live']]];

export function renderLibrary(root) {
  let items = [];
  let query = '';
  let realOnly = false;
  let modeFilter = 'all';
  let sortBy = 'newest';
  try { if (localStorage.getItem(SORT_KEY) === 'score') sortBy = 'score'; } catch { /* ignore */ }
  let alive = true;
  let loaded = false;
  const pollers = new Map();

  const grid = h('div', { class: 'lib-grid', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search decks', 'aria-label': 'Search decks by title' });
  const searchWrap = h('label', { class: 'search-wrap' }, icon('search', 16), search);

  // ---- hero ----
  const uploadBtn = h('button', { class: 'btn primary pill big hero-cta', type: 'button', title: 'Upload a PDF pitch deck' },
    h('span', { class: 'cta-ico' }, icon('upload', 18)), h('span', { class: 'cta-label', text: 'Upload a deck' }));
  const liveBtn = h('button', { class: 'btn pill big hero-live', type: 'button', title: 'Listen to a pitch without a deck' },
    icon('mic', 18), h('span', { text: 'Start live pitch' }));
  uploadBtn.addEventListener('click', () => fileInput.click());
  liveBtn.addEventListener('click', startLive);
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) upload(fileInput.files[0]); fileInput.value = ''; });

  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-h' },
    h('div', { class: 'hero-copy' },
      h('p', { class: 'eyebrow hero-eyebrow', text: 'Claim intelligence for investors' }),
      h('h1', { class: 'hero-title', id: 'hero-h' }, 'Know what the deal ', h('em', { text: 'rests on.' })),
      h('p', { class: 'hero-lede', text: 'Upload a pitch deck or record a live pitch. ClaimMap pulls out every claim, checks it against public evidence, and maps which ones the whole story depends on.' }),
      h('div', { class: 'hero-actions' }, uploadBtn, liveBtn, fileInput),
      h('p', { class: 'hero-hint', text: 'or drop a PDF anywhere on this page' })),
    heroArt());

  // ---- stats ----
  const statEls = {};
  const stat = (key, label, iconName, cap, tone) => {
    const num = h('span', { class: 'stat-num', text: '–' });
    const capEl = h('span', { class: 'stat-cap', text: cap });
    statEls[key] = { num, capEl };
    return h('div', { class: `stat tone-${tone}` },
      h('div', { class: 'stat-head' }, h('span', { class: 'stat-ico' }, icon(iconName, 16)), h('span', { class: 'stat-label', text: label })),
      num, capEl);
  };
  const stats = h('section', { class: 'stats', 'aria-label': 'Library at a glance' },
    stat('decks', 'Decks analysed', 'layers', 'decks and recorded pitches', 'sea'),
    stat('claims', 'Claims checked', 'check', 'across every analysis', 'green'),
    stat('contra', 'Contradicted', 'alert', 'claims the evidence disputes', 'red'),
    stat('live', 'Live pitches', 'mic', 'heard live or recorded', 'sea'));

  // ---- section head + filters ----
  const chipEls = {};
  const chips = h('div', { class: 'mode-chips', role: 'group', 'aria-label': 'Filter by type' }, MODES.map(([k, label]) => {
    const n = h('span', { class: 'mchip-n', text: '0' });
    const b = h('button', { class: `mchip${k === modeFilter ? ' on' : ''}`, type: 'button', 'aria-pressed': String(k === modeFilter),
      onclick: () => { modeFilter = k; for (const [kk, el] of Object.entries(chipEls)) { el.classList.toggle('on', kk === k); el.setAttribute('aria-pressed', String(kk === k)); } draw(); } },
    h('span', { class: 'mchip-l', text: label }), n);
    chipEls[k] = b;
    b._n = n;
    return b;
  }));

  const sortSel = h('select', { class: 'input sort', 'aria-label': 'Sort decks' },
    h('option', { value: 'newest', text: 'Newest' }), h('option', { value: 'score', text: 'Score: high to low' }));
  sortSel.value = sortBy;
  sortSel.addEventListener('change', () => {
    sortBy = sortSel.value;
    try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* ignore */ }
    draw();
  });
  const realChip = h('button', { class: 'fchip', type: 'button', 'aria-pressed': 'false', title: 'Only real pitches (decks and recorded pitches with a public source)',
    onclick: () => { realOnly = !realOnly; realChip.classList.toggle('on', realOnly); realChip.setAttribute('aria-pressed', String(realOnly)); draw(); } },
  'Real pitches');
  const tools = h('div', { class: 'lib-tools', hidden: true }, h('span', { class: 'muted small', text: 'Sort' }), sortSel, realChip);

  const sectionHead = h('div', { class: 'sec-head' },
    h('div', { class: 'sec-head-copy' },
      h('p', { class: 'eyebrow sec-eyebrow' }, h('span', { class: 'eb-dot' }), 'Your library'),
      h('h2', { class: 'sec-title' }, 'Every claim, ', h('em', { text: 'checked.' })),
      h('p', { class: 'muted sec-sub', text: 'Open a deck to read it slide by slide, see the claim map, or write the investment brief.' })),
    searchWrap);

  const lib = h('div', { class: 'library v4' }, hero, stats, sectionHead,
    h('div', { class: 'filter-row' }, chips, tools), grid,
    h('div', { class: 'drop-veil', 'aria-hidden': 'true' }, h('div', { class: 'drop-card' }, icon('upload', 28), h('span', { text: 'Drop the PDF to analyse it' }))));
  root.replaceChildren(lib);

  // drop a PDF anywhere on the library page
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  lib.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; lib.classList.add('dropping'); });
  lib.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  lib.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) lib.classList.remove('dropping'); });
  lib.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    lib.classList.remove('dropping');
    const f = [...(e.dataTransfer?.files || [])].find((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
    if (f) upload(f); else toast('Please drop a PDF file.');
  });

  async function upload(file) {
    if (uploadBtn.disabled) return;
    uploadBtn.disabled = true;
    uploadBtn.querySelector('.cta-label').textContent = 'Uploading…';
    uploadBtn.querySelector('.cta-ico').replaceChildren(h('span', { class: 'spinner' }));
    try {
      const { deck_id: id } = await uploadDeck(file);
      // open the review straight away; the workspace shows progress and fills in as the analysis lands
      toast('Uploaded. Analysing the deck…', 'info', 2500);
      location.hash = `#/d/${encodeURIComponent(id)}/read`;
    } catch (e) {
      toast(`Upload failed: ${e.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.querySelector('.cta-label').textContent = 'Upload a deck';
      uploadBtn.querySelector('.cta-ico').replaceChildren(icon('upload', 18));
    }
  }

  function poll(id) {
    if (pollers.has(id)) return;
    const tick = async () => {
      if (!alive) return;
      try {
        const a = await getDeck(id);
        const it = libraryItemFromAnalysis(a);
        const i = items.findIndex((x) => x.deck_id === id);
        if (i >= 0) items[i] = { ...items[i], ...it, title: it.title || items[i].title };
        draw({ stagger: false });
        if (a.status === 'done' || a.status === 'error') { pollers.delete(id); return; }
      } catch { /* transient */ }
      pollers.set(id, setTimeout(tick, 1000));
    };
    pollers.set(id, setTimeout(tick, 300));
  }

  function startLive() {
    const input = h('input', { class: 'input', type: 'text', placeholder: 'e.g. LabLoop seed pitch', 'aria-label': 'Session title', maxlength: 120 });
    let startBtn = null;
    const close = modal({
      title: 'Start a live session',
      body: h('div', null, h('p', { class: 'muted', text: 'Give it a name. You can add the deck later.' }), input),
      actions: (close) => [
        btn('Cancel', { onclick: close }),
        startBtn = btn('Start listening', { kind: 'primary', iconName: 'mic', onclick: go }),
      ],
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 0);
    async function go() {
      if (startBtn?.classList.contains('busy')) return;
      const title = input.value.trim() || 'Live session';
      await busy(startBtn, async () => {
        try {
          const { deck_id: id } = await createSession(title);
          close();
          location.hash = `#/d/${encodeURIComponent(id)}/live`;
        } catch (e) {
          toast(e.notAvailable ? 'Live-only sessions are not available on the server yet.' : `Could not start: ${e.message}`);
        }
      });
    }
  }

  const removed = (id) => { items = items.filter((x) => x.deck_id !== id); draw({ stagger: false }); };

  function card(item, anim = true) {
    const m = libraryCardModel(item);
    const tab = m.slideCount ? 'read' : m.mode === 'live' ? 'live' : 'map';
    const open = () => { location.hash = `#/d/${encodeURIComponent(m.id)}/${tab}`; };
    const more = moreButton({ id: m.id, title: m.title }, { cls: 'card-more', onDeleted: () => removed(m.id) });
    const paper = m.thumb
      ? h('img', { class: 'thumb', src: m.thumb.startsWith('/api/') ? slideUrl(m.id, 1) : m.thumb, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(transcriptPaper(m)) })
      : transcriptPaper(m);
    const src = safeUrl(m.sourceUrl);
    const badge = m.slideCount ? `${m.slideCount} slide${m.slideCount === 1 ? '' : 's'}` : (m.mode === 'live' ? 'Transcript' : 'Deck');
    const cap = m.capture && CAPTURE_LABEL[m.capture] && m.mode !== 'deck' ? CAPTURE_LABEL[m.capture] : null;
    const chipsRow = h('div', { class: 'dcard-chips' },
      h('span', { class: `schip mode-${m.mode.replace('+', '-')}` }, h('i'), m.modeLabel),
      cap ? h('span', { class: `schip cap cap-${m.capture}` }, h('i'), cap) : null,
      m.outcome ? h('span', { class: `schip outcome${m.outcomeWon ? ' won' : ''}`, title: m.outcome },
        m.outcomeWon ? icon('trophy', 13) : h('i'), m.outcomeWon === true ? 'Won' : m.outcomeWon === false ? 'Finalist' : 'Outcome') : null,
      src ? h('a', { class: 'src-ico', href: src, target: '_blank', rel: 'noopener noreferrer', title: `Source: ${new URL(src).hostname}`,
        'aria-label': 'Open the original source', onclick: (e) => e.stopPropagation() }, icon(m.sourceKind === 'video' ? 'video' : 'pdf', 16)) : null);
    const openBtn = h('button', { class: 'btn pill dcard-open', type: 'button', tabindex: -1, 'aria-hidden': 'true',
      onclick: (e) => { e.stopPropagation(); open(); } },
    h('span', { text: tab === 'read' ? 'Open deck' : tab === 'live' ? 'Open pitch' : 'Open map' }), icon('back', 16));
    return h('div', { class: `dcard${m.busy ? ' busy' : ''}${m.thumb ? '' : ' no-thumb'}`, role: 'link', tabindex: 0, 'aria-label': `Open ${m.title}`,
      onclick: open, onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); } },
    h('div', { class: 'dcard-stage' },
      h('div', { class: 'sheet sheet-back', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet sheet-front' }, paper),
      more,
      h('span', { class: 'stage-badge', text: badge }),
      m.score != null && !m.busy ? h('span', { class: 'card-score', title: `ClaimMap score ${Math.round(m.score)}/100: how well the claims hold up` }, scoreDial(m.score, { size: 46, stroke: 4, animate: anim })) : null),
    h('div', { class: 'dcard-body' },
      h('p', { class: 'eyebrow dcard-eyebrow', text: m.mode === 'live' ? 'Pitch' : m.mode === 'deck+live' ? 'Deck + pitch' : 'Pitch deck' }),
      h('h3', { class: 'dcard-title', text: m.title, title: m.title }),
      h('div', { class: 'dcard-meta muted' },
        h('span', { class: 'mono', text: fmtDate(m.date) }),
        m.claimCount ? h('span', { class: 'mono', text: `${m.claimCount} claims` }) : null),
      chipsRow,
      m.busy || m.error
        ? h('div', { class: `status-line${m.error ? ' err' : ''}` }, m.busy ? h('span', { class: 'spinner' }) : null, h('span', { text: m.statusLine }))
        : dots(m.counts, { animate: anim }),
      m.flag ? h('p', { class: 'flag v-contradicted', title: m.flag }, h('span', { class: 'dot' }), h('span', { class: 'flag-text', text: m.flag })) : null,
      openBtn));
  }

  const seen = new Set();
  function drawStats() {
    const sum = (f) => items.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const nLive = items.filter((x) => x.mode === 'live' || x.mode === 'deck+live').length;
    const vals = {
      decks: items.length,
      claims: sum((x) => x.claim_count),
      contra: sum((x) => x.counts?.contradicted),
      live: nLive,
    };
    for (const [k, v] of Object.entries(vals)) statEls[k].num.textContent = loaded ? String(v) : '–';
    const decksOnly = items.filter((x) => x.mode !== 'live').length;
    if (loaded) statEls.decks.capEl.textContent = `${decksOnly} deck${decksOnly === 1 ? '' : 's'}, ${items.length - decksOnly} pitch-only`;
    const counts = { all: items.length };
    for (const x of items) counts[x.mode || 'deck'] = (counts[x.mode || 'deck'] || 0) + 1;
    for (const [k] of MODES) chipEls[k]._n.textContent = String(counts[k] || 0);
  }

  function draw({ stagger = true } = {}) {
    drawStats();
    tools.hidden = !items.some((x) => x.source_url || x.score != null);
    const shown = sortItems(items, sortBy).filter((x) => (!query || `${x.title || ''} ${x.company || ''}`.toLowerCase().includes(query))
      && (!realOnly || x.source_url) && (modeFilter === 'all' || (x.mode || 'deck') === modeFilter));
    if (!items.length) {
      grid.replaceChildren(h('div', { class: 'lib-empty' },
        h('h3', { text: 'Three ways to use ClaimMap' }),
        h('ul', null,
          h('li', { text: 'Deck: upload a pitch deck and see which claims hold up and which the deal rests on.' }),
          h('li', { text: 'Live: start a session and listen to a pitch; every claim becomes a node as it is said.' }),
          h('li', { text: 'Deck + Live: open an analysed deck, go Live, and catch the founder drifting from the slides.' }))));
      return;
    }
    let k = 0;
    grid.replaceChildren(...(shown.length ? shown.map((it) => {
      const anim = stagger || !seen.has(it.deck_id);
      const el = card(it, anim);
      if (anim) el.style.setProperty('--i', String(Math.min(k++, 12)));
      else el.style.animation = 'none';
      seen.add(it.deck_id);
      return el;
    }) : [empty(query ? `No decks match “${query}”.` : realOnly ? 'No real pitches here yet.' : 'Nothing in this filter yet.')]));
  }

  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw({ stagger: false }); });

  async function load() {
    grid.replaceChildren(...[1, 2, 3].map(() => h('div', { class: 'dcard skeleton' })));
    try {
      const list = await listDecks();
      items = Array.isArray(list) ? list : [];
      items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      loaded = true;
      draw();
      for (const it of items) if (it.status && it.status !== 'done' && it.status !== 'error') poll(it.deck_id);
    } catch (e) {
      grid.replaceChildren(empty(`Could not load your decks: ${e.message}`));
    }
  }
  load();

  return { destroy() { alive = false; closeMenu(); for (const t of pollers.values()) clearTimeout(t); } };
}

/** Pitch-only decks: a transcript sheet drawn in CSS (text lines + a sea-blue waveform strip). */
function transcriptPaper(m) {
  let seed = 0;
  for (const ch of String(m.id || 'x')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bars = Array.from({ length: 28 }, () => h('i', { style: { height: `${Math.round(18 + rnd() * 82)}%` } }));
  const lines = Array.from({ length: 5 }, (_, i) => h('span', { class: `tx-line${i === 1 ? ' hl-red' : i === 3 ? ' hl-green' : ''}`, style: { width: `${Math.round(55 + rnd() * 40)}%` } }));
  return h('div', { class: 'thumb tx-paper' },
    h('div', { class: 'tx-head' }, h('span', { class: 'tx-rec' }), h('span', { text: m.mode === 'live' ? 'Transcript' : 'Deck' })),
    h('div', { class: 'tx-wave' }, bars),
    h('div', { class: 'tx-lines' }, lines));
}

/** Hero illustration: stacked tilted slide sheets with verdict highlight bars and a tiny claim-graph callout. */
function heroArt() {
  const sheet = (cls, bars) => h('div', { class: `art-sheet ${cls}` },
    h('span', { class: 'art-title' }), ...bars.map(([w, tone]) => h('span', { class: `art-bar${tone ? ` ${tone}` : ''}`, style: { width: w } })));
  const svgNS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(svgNS, 'svg');
  g.setAttribute('viewBox', '0 0 120 64');
  g.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); g.append(e); };
  add('line', { x1: 24, y1: 44, x2: 60, y2: 16, class: 'ln' });
  add('line', { x1: 60, y1: 16, x2: 98, y2: 40, class: 'ln' });
  add('line', { x1: 24, y1: 44, x2: 98, y2: 40, class: 'ln dash' });
  add('circle', { cx: 60, cy: 16, r: 9, class: 'n green' });
  add('circle', { cx: 24, cy: 44, r: 7, class: 'n red' });
  add('circle', { cx: 98, cy: 40, r: 7, class: 'n amber' });
  return h('div', { class: 'hero-art', 'aria-hidden': 'true' },
    h('div', { class: 'art-glow' }),
    sheet('s3', [['70%'], ['55%'], ['80%']]),
    sheet('s2', [['80%'], ['62%', 'amber'], ['74%']]),
    sheet('s1', [['86%'], ['64%', 'red'], ['78%'], ['52%', 'green'], ['70%']]),
    h('div', { class: 'art-callout' },
      h('div', { class: 'art-callout-top' }, h('span', { class: 'art-dot' }), h('span', { text: 'Load-bearing claim' })), g,
      h('div', { class: 'art-callout-foot' }, h('span', { class: 'v red' }, '1 contradicted'), h('span', { class: 'v green' }, '3 hold'))));
}
