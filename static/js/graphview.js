// Obsidian-style living claim graph, shared by the Map tab and the Live mini-map.
// Cytoscape renders + handles hover/pull/selection; a continuous d3-force simulation (forcesim.js) moves the
// nodes every animation frame: spring-out on load, neighbours follow a dragged node, a calm idle drift.
// Colours come from CSS tokens (getComputedStyle) and are re-read on every theme change.
import { token, trunc, verdictKey } from './util.js';
import { edgeList, nodeSize, cascade, matchesFilter } from './graphcore.js';
import { createForceSim, settledBBox, driftNudge } from './forcesim.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function palette() {
  return {
    bg: token('--bg'), surface: token('--surface'), text: token('--text'), muted: token('--muted'),
    accent: token('--accent'), red: token('--red'), amber: token('--amber'), grey: token('--grey'),
    edge: token('--edge'), border: token('--border'), sea: token('--sea') || '#0B6E99',
  };
}

function buildStyle(compact) {
  const p = palette();
  const vcol = { contradicted: p.red, supported: p.accent, unverified: p.amber, missing: p.grey };
  const dur = reduced() ? '0ms' : '160ms';
  return [
    {
      selector: 'node',
      style: {
        shape: 'ellipse', width: 'data(size)', height: 'data(size)',
        'background-color': (n) => vcol[n.data('verdict')] || p.grey,
        'background-opacity': 0.45, // soft, translucent circles (minimal look); rings stay crisp
        'border-width': 2, 'border-color': (n) => vcol[n.data('verdict')] || p.grey, 'border-opacity': 0.9,
        label: 'data(label)', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
        'font-family': 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        'font-size': compact ? 12 : 13, 'font-weight': 400, color: p.text, 'text-wrap': 'wrap', 'text-max-width': compact ? 120 : 150,
        'text-outline-width': 3, 'text-outline-color': p.surface, 'min-zoomed-font-size': 8,
        'transition-property': 'opacity, width, height, border-color, border-width, background-color, text-opacity',
        'transition-duration': dur, 'transition-timing-function': 'ease-out',
      },
    },
    { selector: 'node.tiny', style: { 'font-size': 11, 'min-zoomed-font-size': 13 } },
    { selector: 'node.spoken', style: { 'border-style': 'dashed', 'border-width': 3, 'border-color': p.text } },
    {
      selector: 'edge',
      style: {
        width: 1, 'line-color': p.edge, 'curve-style': 'straight',
        'target-arrow-shape': 'triangle', 'target-arrow-color': p.edge, 'arrow-scale': 0.6,
        'transition-property': 'opacity, line-color, width, target-arrow-color', 'transition-duration': dur,
        'transition-timing-function': 'ease-out',
      },
    },
    { selector: 'edge.said', style: { 'line-style': 'dotted', 'target-arrow-shape': 'none', width: 1.5 } },
    { selector: '.faded', style: { opacity: 0.12, 'text-opacity': 0 } },
    { selector: '.filtered', style: { opacity: 0.15 } },
    { selector: 'node.hl', style: { opacity: 1, 'text-opacity': 1, 'min-zoomed-font-size': 0, 'z-index': 10, 'background-opacity': 0.85 } },
    { selector: 'node.focus', style: { width: 'data(sizeH)', height: 'data(sizeH)', 'border-color': p.text, 'border-width': 3, 'font-weight': 600 } },
    { selector: 'edge.hl', style: { opacity: 1, 'line-color': p.accent, 'target-arrow-color': p.accent, width: 2, 'z-index': 9 } },
    { selector: 'node.selected', style: { 'border-color': p.accent, 'border-width': 4 } },
    { selector: 'node.ping', style: { width: 'data(sizeH)', height: 'data(sizeH)', 'border-color': p.accent, 'border-width': 6 } },
    { selector: 'node.drift', style: { 'border-color': p.red, 'border-width': 4, 'border-style': 'solid' } },
    { selector: 'node.drift.pulse', style: { 'border-width': 10, 'border-opacity': 0.45 } },
    {
      selector: 'node.fallen',
      style: { width: 'data(sizeF)', height: 'data(sizeF)', 'background-color': p.red, 'border-color': p.red, 'border-style': 'dashed', 'border-width': 3, opacity: 0.5 },
    },
    { selector: 'node.pulled', style: { opacity: 1, 'border-width': 5, 'border-color': p.text } },
    { selector: 'edge.fallen', style: { 'line-color': p.red, 'target-arrow-color': p.red, 'line-style': 'dashed', width: 2 } },
    { selector: 'node:grabbed', style: { 'border-color': p.accent, 'border-width': 4 } },
    // v4: evidence satellites (proof = green, refutation = red, context = sea blue), small diamonds on dashed spokes
    {
      selector: 'node.ev',
      style: {
        shape: 'diamond', width: 14, height: 14, 'background-opacity': 0.75, 'border-width': 1.5, 'border-opacity': 1,
        'background-color': (n) => ({ supports: vcol.supported, refutes: vcol.contradicted }[n.data('stance')] || p.sea),
        'border-color': (n) => ({ supports: vcol.supported, refutes: vcol.contradicted }[n.data('stance')] || p.sea),
        'font-size': 10, 'font-weight': 500, color: p.muted, 'text-margin-y': 3, 'min-zoomed-font-size': 9,
      },
    },
    { selector: 'node.ev.hl', style: { color: p.text, 'font-size': 11, 'background-opacity': 1 } },
    {
      selector: 'edge.ev',
      style: {
        width: 1.2, 'line-style': 'dashed', 'target-arrow-shape': 'none', opacity: 0.8,
        'line-color': (e) => ({ supports: vcol.supported, refutes: vcol.contradicted }[e.data('stance')] || p.sea),
      },
    },
  ];
}

/** v4: one small node per proof / refutation source of a claim (max 3; the deck/transcript itself is not evidence). */
const EV_KINDS = new Set(['web', 'math', 'wayback', 'website', 'registry']);
function sourceName(s) {
  if (s.kind === 'math') return 'Arithmetic';
  if (s.kind === 'wayback') return 'Wayback';
  let t = (s.title || '').split(/ [|\u2014\u2013-] /)[0].trim();
  if (!t && s.url) { try { t = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ } }
  return trunc(t || s.kind, 24);
}
export function evidenceOf(c) {
  const v = c?.check?.verdict;
  const infer = v === 'contradicted' ? 'refutes' : v === 'supported' ? 'supports' : 'context';
  return (c?.check?.sources || []).filter((s) => EV_KINDS.has(s.kind)).slice(0, 3).map((s, i) => ({
    id: `ev:${c.id}:${i}`, claim: c.id, stance: s.stance || infer, label: sourceName(s), url: s.url || null,
    quote: s.quote || '',
  }));
}

function nodeData(c) {
  const size = nodeSize(c.load);
  return {
    id: c.id, label: trunc(c.text || c.quote || c.id, 44), size, sizeH: Math.round(size * 1.18), sizeF: Math.round(size * 0.8),
    verdict: verdictKey(c), source: c.source || 'deck',
  };
}

export function createGraph(container, { onSelect, onHover, compact = false } = {}) {
  if (!window.cytoscape) {
    container.textContent = 'Graph library failed to load.';
    return null;
  }
  const cy = window.cytoscape({
    container, elements: [], style: buildStyle(compact), wheelSensitivity: 0.25, minZoom: 0.2, maxZoom: 3,
    boxSelectionEnabled: false, autoungrabify: false,
  });
  let claims = [];
  let locked = null;
  let selected = null;
  let pulled = [];
  let filter = 'all';
  const timers = new Set();
  let pulseTimer = null;
  const drifted = new Set();
  const saidLinks = new Map(); // spokenId -> deckId

  const classesFor = (c) => [c.source === 'spoken' ? 'spoken' : '', (c.load || 0) < 0.3 ? 'tiny' : ''].filter(Boolean).join(' ');
  const pad = compact ? 44 : 120; // generous padding: the map opens zoomed out, with room around the cluster
  const d3 = window.d3;
  const fsim = d3 ? createForceSim(d3, { compact }) : null;
  const simNode = (c) => ({ id: c.id, r: nodeSize(c.load) / 2 });
  const simLinks = () => cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id(), said: e.hasClass('said'), ev: e.hasClass('ev') }));

  // ---- the living layout: one requestAnimationFrame loop drives Cytoscape from the d3 simulation ----
  let raf = 0;
  let onScreen = true;
  let userMovedView = false; // stop auto-framing once the user zooms or pans
  let settleFitPending = false;
  let lastIdle = 0;
  let dragging = false;
  const drift = () => !reduced();

  function frame(t) {
    raf = 0;
    if (!fsim || !onScreen || document.hidden || cy.destroyed()) return;
    const moving = fsim.active();
    const idle = !moving && drift() && !dragging;
    if (idle && t - lastIdle < 33) { kick(); return; } // idle drift at ~30 fps is plenty and halves the cost
    if (idle) {
      lastIdle = t;
      // calm "alive" drift: zero-mean nudges + a whisper of alpha so links pull things back
      fsim.nodes.forEach((d, i) => { if (d.fx == null) { const n = driftNudge(t, i); d.vx += n.vx; d.vy += n.vy; } });
      if (fsim.alpha() < 0.004) fsim.sim.alpha(0.004);
    }
    if (moving || idle) {
      fsim.tick();
      cy.batch(() => {
        for (const d of fsim.nodes) {
          const n = cy.getElementById(d.id);
          if (n.nonempty() && !n.grabbed()) n.position({ x: d.x, y: d.y });
        }
      });
    }
    if (settleFitPending && fsim.alpha() < 0.08) {
      settleFitPending = false;
      if (!userMovedView) cy.animate({ fit: { eles: cy.nodes(), padding: pad } }, { duration: 500, easing: 'ease-out-cubic' });
    }
    if (moving || idle) kick();
  }
  function kick() {
    if (!raf && fsim && onScreen && !document.hidden && !cy.destroyed()) raf = requestAnimationFrame(frame);
  }

  /** Reduced motion: no spring-out, jump straight to the settled layout. */
  function settleNow() {
    fsim.tick(300);
    fsim.sim.alpha(0);
    cy.batch(() => { for (const d of fsim.nodes) cy.getElementById(d.id).position({ x: d.x, y: d.y }); });
  }

  function layout({ animate = true } = {}) {
    if (!cy.nodes().length) return;
    if (!fsim) { cy.layout({ name: 'cose', animate: false, fit: true, padding: pad }).run(); return; }
    const list = cy.nodes().map((n) => ({ id: n.id(), r: n.data('size') / 2 }));
    fsim.setData(list, simLinks(), { keep: false });
    // frame the viewport on where the cluster WILL settle, then let it spring out from the centre
    const { bbox } = settledBBox(d3, list, simLinks(), { compact });
    cy.resize();
    const w = cy.width() || 800, hgt = cy.height() || 600;
    const z = Math.max(0.2, Math.min(compact ? 1.4 : 1.6, Math.min((w - 2 * pad) / bbox.w, (hgt - 2 * pad) / bbox.h)));
    cy.zoom(z);
    cy.pan({ x: w / 2 - z * (bbox.x1 + bbox.x2) / 2, y: hgt / 2 - z * (bbox.y1 + bbox.y2) / 2 });
    userMovedView = false;
    if (!animate || reduced()) { settleNow(); return; }
    cy.batch(() => { for (const d of fsim.nodes) cy.getElementById(d.id).position({ x: d.x, y: d.y }); });
    settleFitPending = true;
    kick();
  }

  // ---- drag: pin the node, reheat so neighbours follow on their springs, release to settle ----
  cy.on('grab', 'node', (e) => {
    if (!fsim) return;
    dragging = true;
    const p = e.target.position();
    fsim.pin(e.target.id(), p.x, p.y);
    kick();
  });
  cy.on('drag', 'node', (e) => {
    if (!fsim) return;
    const p = e.target.position();
    fsim.pin(e.target.id(), p.x, p.y);
    kick();
  });
  cy.on('free', 'node', (e) => {
    if (!fsim) return;
    dragging = false;
    fsim.unpin(e.target.id(), 0);
    fsim.reheat(0.15);
    kick();
  });
  cy.on('viewport', () => { if (cy.scratch('_userInput')) userMovedView = true; });
  container.addEventListener('wheel', () => { userMovedView = true; }, { passive: true });
  container.addEventListener('pointerdown', () => { cy.scratch('_userInput', true); });
  container.addEventListener('pointerup', () => { cy.scratch('_userInput', false); });

  // pause when the tab is hidden or the graph is off-screen
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((ents) => { onScreen = ents.some((x) => x.isIntersecting); if (onScreen) kick(); })
    : null;
  io?.observe(container);
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const onMotionPref = () => { cy.style(buildStyle(compact)); kick(); };
  mq?.addEventListener?.('change', onMotionPref);

  function addSaidEdges() {
    for (const [s, d] of saidLinks) {
      const id = `said:${s}->${d}`;
      if (cy.getElementById(s).nonempty() && cy.getElementById(d).nonempty() && cy.getElementById(id).empty()) {
        cy.add({ group: 'edges', data: { id, source: s, target: d }, classes: 'said' });
        if (fsim?.byId.has(s) && fsim.byId.has(d)) { fsim.addLink({ source: s, target: d, said: true }); kick(); }
      }
    }
  }

  function addEvidence(c) {
    if (compact) return; // the Live mini-map stays claims-only
    for (const ev of evidenceOf(c)) {
      if (cy.getElementById(ev.id).nonempty()) continue;
      cy.add({ group: 'nodes', data: { id: ev.id, label: ev.label, size: 14, claim: ev.claim, stance: ev.stance, url: ev.url, quote: ev.quote }, classes: 'ev', position: { x: 0, y: 0 } });
      cy.add({ group: 'edges', data: { id: `${ev.id}--`, source: ev.id, target: ev.claim, stance: ev.stance }, classes: 'ev' });
    }
  }
  const claimOf = (id) => (id && id.startsWith('ev:') ? cy.getElementById(id).data('claim') : id);

  function setClaims(list, { animate = true } = {}) {
    claims = (list || []).filter((c) => c && c.id);
    cy.elements().remove();
    cy.add(claims.map((c) => ({ group: 'nodes', data: nodeData(c), classes: classesFor(c), position: { x: 0, y: 0 } })));
    cy.add(edgeList(claims).map((e) => ({ group: 'edges', data: e })));
    claims.forEach(addEvidence);
    for (const [s, d] of saidLinks) {
      if (cy.getElementById(s).nonempty() && cy.getElementById(d).nonempty()) cy.add({ group: 'edges', data: { id: `said:${s}->${d}`, source: s, target: d }, classes: 'said' });
    }
    for (const id of drifted) cy.getElementById(id).addClass('drift');
    applyFilter();
    layout({ animate });
    if (selected) cy.getElementById(selected).addClass('selected');
    if (pulled.length) applyPull(false);
  }

  /** Live: add (or update) one claim. It pops in near what it rests on and the cluster makes room. */
  function addClaim(c) {
    if (!c?.id) return;
    const i = claims.findIndex((x) => x.id === c.id);
    if (i >= 0) {
      claims[i] = c;
      cy.getElementById(c.id).data(nodeData(c));
      fsim?.setRadius(c.id, nodeSize(c.load) / 2);
      applyFilter();
      return;
    }
    claims.push(c);
    const deps = (c.depends_on || []).filter((d) => cy.getElementById(d).nonempty());
    // claims that already rest on the new one (rare, but keep the edges honest)
    const dependents = claims.filter((x) => x.id !== c.id && (x.depends_on || []).includes(c.id) && cy.getElementById(x.id).nonempty());
    const newLinks = [...deps.map((d) => ({ source: c.id, target: d })), ...dependents.map((x) => ({ source: x.id, target: c.id }))];
    const anchors = [...deps, ...dependents.map((x) => x.id)];
    const d = fsim ? fsim.addNode(simNode(c), anchors, newLinks) : null;
    const node = cy.add({ group: 'nodes', data: nodeData(c), classes: classesFor(c), position: d ? { x: d.x, y: d.y } : { x: 0, y: 0 } });
    for (const l of newLinks) {
      const id = `${l.source}->${l.target}`;
      if (cy.getElementById(id).empty()) cy.add({ group: 'edges', data: { id, source: l.source, target: l.target } });
    }
    addSaidEdges();
    if (!reduced()) {
      const size = nodeSize(c.load);
      node.style({ width: 1, height: 1 });
      node.animate({ style: { width: size, height: size } }, { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', complete: () => node.removeStyle('width height') });
    }
    applyFilter();
    if (!fsim) { layout({ animate: false }); return; }
    if (claims.length === 1) { layout({ animate: true }); return; }
    if (reduced()) settleNow(); else kick();
    // keep the newcomer in view if the user has not taken over the camera
    if (!userMovedView) setTimeout(() => { if (!cy.destroyed() && !userMovedView) cy.animate({ fit: { eles: cy.nodes(), padding: pad } }, { duration: 500, easing: 'ease-out-cubic' }); }, reduced() ? 0 : 700);
  }

  function linkSaid(spokenId, deckId) {
    if (!spokenId || !deckId) return;
    saidLinks.set(spokenId, deckId);
    addSaidEdges();
  }

  // ---- Obsidian hover / lock ----
  function clearFocus() {
    cy.elements().removeClass('faded hl focus');
  }
  function focus(id) {
    clearFocus();
    const n = id ? cy.getElementById(id) : null;
    if (!n || n.empty()) return;
    const nb = n.closedNeighborhood();
    cy.batch(() => {
      cy.elements().not(nb).addClass('faded');
      nb.nodes().addClass('hl');
      n.connectedEdges().addClass('hl');
      n.addClass('focus');
    });
  }
  /** External hover (claim chip, question, list row): highlight a node and its neighbours. */
  let pingT = null;
  function highlight(id) {
    if (id && !reduced()) { // cross-highlight: the matching node pulses once, even when a node is locked
      const n = cy.getElementById(id);
      clearTimeout(pingT);
      cy.nodes('.ping').removeClass('ping');
      if (n.nonempty()) { n.addClass('ping'); pingT = setTimeout(() => n.removeClass('ping'), 320); }
    }
    if (locked) return;
    if (id) focus(id); else clearFocus();
  }

  cy.on('mouseover', 'node', (e) => {
    container.style.cursor = 'pointer';
    if (!locked) focus(e.target.id());
    onHover?.(claimOf(e.target.id()));
  });
  cy.on('mouseout', 'node', () => {
    container.style.cursor = '';
    if (!locked) clearFocus();
    else focus(locked);
    onHover?.(null);
  });
  cy.on('tap', 'node', (e) => {
    let id = e.target.id();
    if (e.target.hasClass('ev')) { // evidence: open the source and select its claim
      const url = e.target.data('url');
      if (url && /^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      id = claimOf(id);
    }
    locked = id;
    focus(id);
    select(id, false);
    onSelect?.(id);
  });
  cy.on('tap', (e) => {
    if (e.target !== cy) return;
    locked = null;
    clearFocus();
    select(null, false);
    onSelect?.(null);
  });

  function select(id, center = true) {
    cy.nodes().removeClass('selected');
    selected = id;
    if (!id) {
      if (center) { locked = null; clearFocus(); }
      return;
    }
    const n = cy.getElementById(id);
    if (n.empty()) return;
    n.addClass('selected');
    if (center) {
      userMovedView = true;
      locked = id;
      focus(id);
      cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1) }, { duration: reduced() ? 0 : 250 });
    }
  }

  // ---- filter ----
  function applyFilter() {
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const c = claims.find((x) => x.id === claimOf(n.id()));
        n.toggleClass('filtered', !!c && !matchesFilter(c, filter));
      });
      cy.edges().forEach((e) => e.toggleClass('filtered', e.source().hasClass('filtered') || e.target().hasClass('filtered')));
    });
  }
  function setFilter(f) { filter = f; applyFilter(); }

  // ---- Jenga pull ----
  function clearTimers() { for (const t of timers) clearTimeout(t); timers.clear(); }
  function applyPull(animated = true) {
    clearTimers();
    cy.elements().removeClass('fallen pulled');
    const order = cascade(claims, pulled);
    const step = animated && !reduced() ? 350 : 0;
    for (const { id, level } of order) {
      const run = () => {
        const n = cy.getElementById(id);
        n.addClass('fallen');
        if (level === 0) n.addClass('pulled');
        n.incomers('edge').addClass('fallen');
        n.outgoers('edge').filter((e) => e.target().hasClass('fallen')).addClass('fallen');
      };
      if (step && level) { const t = setTimeout(() => { timers.delete(t); run(); }, step * level); timers.add(t); } else run();
    }
    return order;
  }
  function pull(id) {
    if (!id || pulled.includes(id) || cy.getElementById(id).empty()) return null;
    pulled.push(id);
    return applyPull(true);
  }
  function reset() {
    pulled = [];
    clearTimers();
    cy.elements().removeClass('fallen pulled');
    drifted.clear();
    cy.nodes().removeClass('drift pulse');
    locked = null;
    clearFocus();
  }

  // ---- drift ----
  function markDrift(id) {
    if (!id || cy.getElementById(id).empty()) return;
    drifted.add(id);
    cy.getElementById(id).addClass('drift');
    if (!pulseTimer && !reduced()) {
      pulseTimer = setInterval(() => cy.nodes('.drift').toggleClass('pulse'), 650);
    }
  }

  function fit() {
    cy.resize();
    userMovedView = false;
    if (cy.nodes().length) cy.animate({ fit: { eles: cy.nodes(), padding: pad } }, { duration: reduced() ? 0 : 320, easing: 'ease-out-cubic' });
  }
  /** Call when the container becomes visible (tabs hide it with display:none). */
  function shown() {
    cy.resize();
    if (cy.nodes().length && !userMovedView) cy.fit(cy.nodes(), pad);
    onScreen = true;
    kick();
  }

  const onTheme = () => cy.style(buildStyle(compact));
  window.addEventListener('themechange', onTheme);
  const ro = new ResizeObserver(() => cy.resize());
  ro.observe(container);

  function destroy() {
    clearTimers();
    clearInterval(pulseTimer);
    clearTimeout(pingT);
    if (raf) cancelAnimationFrame(raf);
    fsim?.sim.stop();
    ro.disconnect();
    io?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    mq?.removeEventListener?.('change', onMotionPref);
    window.removeEventListener('themechange', onTheme);
    cy.destroy();
  }

  return {
    cy, sim: fsim, setClaims, addClaim, linkSaid, highlight, select, setFilter, pull, reset, markDrift, fit, shown, destroy,
    getPulled: () => [...pulled], getSelected: () => selected,
  };
}
