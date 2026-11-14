// Map tab: Obsidian-style graph, filter chips, legend, Jenga pull (P / R), claim card in a right drawer.
import { h, btn, icon, empty } from './util.js';
import { createGraph } from './graphview.js';
import { pullSummary, FILTERS } from './graphcore.js';
import { renderClaimCard } from './card.js';

const FILTER_LABEL = { all: 'All', contradicted: 'Contradicted', unverified: 'Unverified', spoken: 'Spoken' };

export function createMap(ws) {
  let a = null;
  let graph = null;
  let selected = null;
  let filter = 'all';
  let builtKey = '';
  let builtIds = new Set();

  const canvas = h('div', { class: 'graph-canvas', 'aria-label': 'Claim graph' });
  const drawer = h('aside', { class: 'drawer', hidden: true });
  const banner = h('div', { class: 'pull-banner', hidden: true });
  const pullBtn = btn('Pull', { kind: 'secondary', title: 'Pull the selected claim out: what falls with it? (P)', onclick: () => doPull() });
  const resetBtn = btn('Reset', { title: 'Reset pulls and highlights (R)', onclick: () => doReset() });
  const fitBtn = btn('Fit', { iconName: 'fit', title: 'Fit the graph to the screen (F)', onclick: () => graph?.fit() });
  const chips = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter claims' }, FILTERS.map((f) =>
    h('button', { class: `fchip${f === filter ? ' on' : ''}`, type: 'button', 'data-f': f, onclick: () => setFilter(f) }, FILTER_LABEL[f])));
  const legend = h('div', { class: 'legend', 'aria-label': 'Legend' },
    ...[['contradicted', 'Contradicted'], ['supported', 'Supported'], ['unverified', 'Unverified'], ['missing', 'Missing']].map(([k, l]) =>
      h('span', { class: `lg v-${k}` }, h('span', { class: 'dot' }), l)),
    h('span', { class: 'lg' }, h('span', { class: 'ring solid' }), 'Deck'),
    h('span', { class: 'lg' }, h('span', { class: 'ring dashed' }), 'Spoken'),
    h('span', { class: 'lg' }, h('span', { class: 'diamond pro' }), 'Proof'),
    h('span', { class: 'lg' }, h('span', { class: 'diamond con' }), 'Refutation'),
    h('span', { class: 'lg' }, h('span', { class: 'diamond ctx' }), 'Context'),
    h('span', { class: 'lg muted' }, 'Size = load · arrow = rests on'));
  const emptyMsg = h('div', { class: 'graph-empty', hidden: true });

  const el = h('div', { class: 'map' },
    h('div', { class: 'map-main' },
      h('div', { class: 'map-bar' }, chips, h('div', { class: 'grow' }), pullBtn, resetBtn, fitBtn),
      banner,
      h('div', { class: 'graph-wrap' }, canvas, legend, emptyMsg)),
    drawer);

  function ensureGraph() {
    if (graph) return;
    graph = createGraph(canvas, {
      onSelect: (id) => { selected = id; drawDrawer(); },
    });
    ws.onHover((id) => graph?.highlight(id));
  }

  function setFilter(f) {
    filter = f;
    for (const b of chips.children) b.classList.toggle('on', b.dataset.f === f);
    graph?.setFilter(f);
  }

  function ctx() {
    return {
      analysis: a, pins: ws.pins, togglePin: ws.togglePin, open: openClaim, hover: (id) => graph?.highlight(id),
      showInMap: null, close: () => openClaim(null),
    };
  }

  function drawDrawer() {
    const c = selected ? ws.claim(selected) : null;
    drawer.hidden = !c;
    pullBtn.disabled = !c;
    if (!c) { drawer.replaceChildren(); return; }
    drawer.replaceChildren(renderClaimCard(c, ctx()),
      ws.hasSlides() && c.source !== 'spoken' && c.slide ? btn('Show on slide', { iconName: 'doc', cls: 'drawer-extra', onclick: () => ws.showInRead(c.id) }) : null);
  }

  function openClaim(id) {
    selected = id;
    graph?.select(id, true);
    drawDrawer();
  }

  function doPull() {
    if (!selected || !graph) return;
    if (!graph.pull(selected)) return;
    const s = pullSummary(a.claims || [], graph.getPulled());
    banner.hidden = false;
    banner.replaceChildren(h('strong', { class: 'num', text: `${s.fallen.length} of ${s.total} fall` }), h('span', { text: s.text }));
  }
  function doReset() {
    graph?.reset();
    banner.hidden = true;
    selected = null;
    graph?.select(null, false);
    drawDrawer();
  }

  function update(analysis, opts = {}) {
    a = analysis;
    if (!a) return;
    const claims = a.claims || [];
    emptyMsg.hidden = claims.length > 0;
    emptyMsg.replaceChildren(empty(a.status === 'done' ? 'No claims yet. Upload a deck or go Live to add some.' : 'Claims appear here when the analysis is done.'));
    if (el.hidden && !graph) return; // build lazily on first show
    ensureGraph();
    const key = claims.map((c) => `${c.id}:${c.check?.verdict}:${(c.depends_on || []).join('+')}:${c.load}`).join('|');
    if (key !== builtKey) {
      const ids = new Set(claims.map((c) => c.id));
      const incremental = opts.live && builtIds.size && [...builtIds].every((id) => ids.has(id));
      builtKey = key;
      // live: new claims pop into the running simulation (and changed ones update in place), no re-layout
      if (incremental) { for (const c of claims) graph.addClaim(c); } else graph.setClaims(claims, { animate: true });
      builtIds = ids;
      graph.setFilter(filter);
    }
    drawDrawer();
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'p') doPull();
    else if (k === 'r') doReset();
    else if (k === 'f') graph?.fit();
    else if (e.key === 'Escape') openClaim(null);
  }

  return {
    el, update, openClaim, onKey,
    show() { ensureGraph(); if (a) { update(a); graph.shown(); } },
    destroy() { graph?.destroy(); },
  };
}

export { icon };
