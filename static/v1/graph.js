// Claim graph (Cytoscape) + the Jenga "pull" cascade.
// Edge direction: claim -> each claim in its depends_on (the claim "rests on" the target), arrowhead at the
// foundation, so the ask (nothing rests on it) sits on top and its foundations hang below it.
// Nodes are verdict-coloured cards with the label INSIDE, so on-screen text size = font size x zoom and the
// layout never has to guess label extents.
import { verdictOf, trunc, catLabel } from './util.js';

const RED = '#ff5d5d';
const ACCENT = '#4cc3ff';
const EDGE = '#9db2cf';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const MAX_FIT_ZOOM = 1.5;
const FIT_PAD = 26;

function styles() {
  return [
    { selector: 'node', style: {
      shape: 'round-rectangle', width: 'data(w)', height: 'data(h)',
      'background-color': 'data(fill)', 'border-color': 'data(stroke)', 'border-width': 3,
      label: 'data(label)', color: 'data(ink)', 'font-size': 'data(fs)', 'font-weight': 700,
      'font-family': 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
      'text-wrap': 'wrap', 'text-max-width': 'data(tmw)', 'line-height': 1.15,
      'text-valign': 'center', 'text-halign': 'center',
      'min-zoomed-font-size': 0,
      'overlay-opacity': 0, 'overlay-color': ACCENT, 'overlay-padding': 6,
      'outline-width': 0, 'outline-color': RED, 'outline-offset': 3, 'outline-opacity': 1,
      'transition-property': 'background-color, border-color, border-width, opacity, overlay-opacity, overlay-padding, width, height, outline-width, outline-color',
      'transition-duration': '0.45s',
    } },
    { selector: 'edge', style: {
      width: 3.5, 'line-color': EDGE, 'target-arrow-color': EDGE, 'target-arrow-shape': 'triangle',
      'curve-style': 'bezier', 'arrow-scale': 1.7, 'target-distance-from-node': 3, 'source-distance-from-node': 2,
      'transition-property': 'line-color, target-arrow-color, opacity, width', 'transition-duration': '0.45s',
    } },
    { selector: 'node:selected', style: {
      'border-color': '#ffffff', 'border-width': 6, 'overlay-opacity': 0.22, 'overlay-color': ACCENT, 'overlay-padding': 8,
    } },
    { selector: 'node.hl', style: { 'outline-width': 6, 'outline-color': ACCENT, 'outline-offset': 4, 'overlay-opacity': 0.2, 'overlay-color': ACCENT } },
    { selector: '.dim', style: { opacity: 0.28 } },
    // pulled / fallen: faded dark fill, red dashed border, scaled down, support links turn red
    { selector: 'node.fallen', style: {
      'background-color': '#2b1316', 'border-color': RED, 'border-style': 'dashed', 'border-width': 4,
      opacity: 0.62, color: '#ff9a9a', width: 'data(wf)', height: 'data(hf)',
    } },
    { selector: 'node.pulled', style: {
      'background-color': '#6b1a20', 'border-color': RED, 'border-style': 'dashed', 'border-width': 6,
      opacity: 1, color: '#ffffff',
    } },
    { selector: 'edge.fallen', style: { 'line-color': RED, 'target-arrow-color': RED, 'line-style': 'dashed', width: 4.5, opacity: 1 } },
    // live drift: persistent red ring that pulses until Reset
    { selector: 'node.drifted', style: { 'outline-width': 6, 'outline-color': RED, 'outline-offset': 4, 'overlay-color': RED, 'overlay-opacity': 0.12, 'overlay-padding': 10 } },
    { selector: 'node.drifted.pulse', style: { 'outline-width': 13, 'overlay-opacity': 0.4, 'overlay-padding': 16 } },
  ];
}

export function createGraph(container, handlers = {}) {
  let cy = null;
  let claims = [];
  const byId = new Map();
  const dependents = new Map(); // id -> ids of claims that directly rest on it
  let order = [];               // claims by load desc (keyboard stepping)
  const pulled = new Set();
  const fallenIds = new Set();
  let fallTimers = [];
  let pulseTimer = null;
  let pulseOn = false;
  let selected = null;

  function stopPulse() {
    clearInterval(pulseTimer);
    pulseTimer = null;
    pulseOn = false;
  }

  function destroy() {
    fallTimers.forEach(clearTimeout);
    fallTimers = [];
    stopPulse();
    pulled.clear();
    fallenIds.clear();
    selected = null;
    if (cy) { cy.destroy(); cy = null; }
  }

  /** Size/label data per node. Re-run on resize because tiny canvases switch to compact cards. */
  function applyDims() {
    const compact = claims.length > 12 || (container?.clientHeight || 600) < 400;
    const baseW = compact ? 206 : 236;
    const baseH = compact ? 64 : 84;
    const fs = compact ? 14 : 15;
    const tmw = baseW - 32;
    const textLen = compact ? 44 : 58;
    cy.batch(() => {
      for (const c of claims) {
        const v = verdictOf(c);
        const load = Math.min(1, Math.max(0, Number(c.load) || 0));
        const s = 0.93 + load * 0.17; // size = load, but never so small that the label overflows
        const w = Math.round(baseW * s);
        const hh = Math.round(baseH * s);
        const head = `${catLabel(c.category).toUpperCase()} · ${Math.round(load * 100)}%`;
        const body = trunc(c.text, textLen);
        cy.getElementById(c.id).data({
          w, h: hh, wf: Math.round(w * 0.86), hf: Math.round(hh * 0.86), fs, tmw: tmw * s,
          fill: v.fill, stroke: v.stroke, ink: v.ink,
          labelOk: `${v.glyph} ${head}\n${body}`,
          labelFall: `✕ FALLS · ${catLabel(c.category).toUpperCase()}\n${body}`,
          label: fallenIds.has(c.id) ? `✕ FALLS · ${catLabel(c.category).toUpperCase()}\n${body}` : `${v.glyph} ${head}\n${body}`,
        });
      }
    });
  }

  function runLayout() {
    if (!cy) return;
    const w = Math.max(200, cy.width());
    const hgt = Math.max(160, cy.height());
    const rootSet = new Set(claims.filter((c) => !(dependents.get(c.id) || []).length).map((c) => c.id));
    const layout = {
      name: 'breadthfirst', directed: true, padding: 0, spacingFactor: 1, avoidOverlap: true,
      nodeDimensionsIncludeLabels: false, fit: false, animate: false,
      boundingBox: { x1: 0, y1: 0, w, h: hgt },
    };
    if (rootSet.size) layout.roots = cy.nodes().filter((n) => rootSet.has(n.id()));
    cy.layout(layout).run();
  }

  /** Fit all nodes inside the canvas with padding (never zoomed past MAX_FIT_ZOOM, so small graphs do not balloon). */
  function fitView() {
    if (!cy || !cy.nodes().length) return;
    const bb = cy.elements().boundingBox({ includeOverlays: false, includeLabels: false });
    const W = cy.width();
    const H = cy.height();
    if (!bb.w || !bb.h || W < 10 || H < 10) { cy.fit(undefined, FIT_PAD); return; }
    let z = Math.min((W - 2 * FIT_PAD) / bb.w, (H - 2 * FIT_PAD) / bb.h, MAX_FIT_ZOOM);
    z = Math.max(z, cy.minZoom());
    cy.viewport({ zoom: z, pan: { x: (W - z * (bb.x1 + bb.x2)) / 2, y: (H - z * (bb.y1 + bb.y2)) / 2 } });
  }

  /** Returns true if a graph was drawn (false for an empty deck). Throws on a layout failure. */
  function build(list) {
    destroy();
    claims = []; byId.clear(); dependents.clear();
    for (const c of list || []) {
      if (!c || c.id == null || byId.has(c.id)) continue; // untrusted: skip duplicate ids
      claims.push(c); byId.set(c.id, c);
    }
    for (const c of claims) {
      for (const d of new Set(c.depends_on || [])) {
        if (d !== c.id && byId.has(d)) {
          if (!dependents.has(d)) dependents.set(d, []);
          dependents.get(d).push(c.id);
        }
      }
    }
    order = [...claims].sort((a, b) => (b.load || 0) - (a.load || 0));
    if (!claims.length) return false;

    const elements = [];
    for (const c of claims) elements.push({ group: 'nodes', data: { id: c.id } });
    for (const c of claims) {
      for (const d of new Set(c.depends_on || [])) {
        if (d !== c.id && byId.has(d)) {
          elements.push({ group: 'edges', data: { id: `e:${c.id}>${d}`, source: c.id, target: d } });
        }
      }
    }
    cy = cytoscape({
      container, headless: !container, elements, style: styles(), minZoom: 0.2, maxZoom: 2.5,
      boxSelectionEnabled: false, selectionType: 'single',
    });
    applyDims();
    runLayout();
    fitView();

    cy.on('tap', 'node', (e) => select(e.target.id()));
    cy.on('tap', (e) => { if (e.target === cy) select(null); });
    cy.on('mouseover', 'node', (e) => { container.style.cursor = 'pointer'; handlers.onHover?.(e.target.id()); });
    cy.on('mouseout', 'node', () => { container.style.cursor = ''; handlers.onHover?.(null); });
    return true;
  }

  function select(id) {
    if (!cy) return;
    cy.nodes(':selected').unselect();
    selected = id && byId.has(id) ? id : null;
    if (selected) cy.getElementById(selected).select();
    handlers.onSelect?.(selected);
  }

  /** Map of id -> depth for the pulled claims and everything that transitively rests on them. */
  function cascade(ids) {
    const depth = new Map();
    const queue = [];
    for (const id of ids) if (byId.has(id) && !depth.has(id)) { depth.set(id, 0); queue.push(id); }
    while (queue.length) {
      const id = queue.shift();
      for (const d of dependents.get(id) || []) {
        if (!depth.has(d)) { depth.set(d, depth.get(id) + 1); queue.push(d); }
      }
    }
    return depth;
  }

  function summary() {
    const depth = cascade(pulled);
    return {
      pulled: [...pulled],
      fallen: [...depth.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
      total: claims.length,
    };
  }

  function markFallen(n, nid) {
    fallenIds.add(nid);
    n.addClass('fallen');
    n.data('label', n.data('labelFall'));
    // the support links into a fallen claim are broken: turn them red
    n.connectedEdges().filter((e) => e.target().id() === nid).addClass('fallen');
  }

  function pull(id) {
    if (!cy || !byId.has(id) || pulled.has(id)) return summary();
    pulled.add(id);
    const depth = cascade(pulled);
    for (const [nid, dp] of depth) {
      const n = cy.getElementById(nid);
      if (pulled.has(nid)) n.addClass('pulled');
      if (n.hasClass('fallen')) continue;
      if (reduceMotion || dp === 0) markFallen(n, nid);
      else fallTimers.push(setTimeout(() => { if (cy) markFallen(n, nid); }, dp * 380));
    }
    const s = summary();
    handlers.onPull?.(s);
    refit();
    return s;
  }

  function pullSelected() {
    if (!selected) return null;
    return pull(selected);
  }

  /** Clears pulls AND live-drift rings. */
  function reset() {
    fallTimers.forEach(clearTimeout);
    fallTimers = [];
    pulled.clear();
    fallenIds.clear();
    stopPulse();
    if (cy) {
      cy.batch(() => {
        cy.elements().removeClass('fallen pulled drifted pulse');
        for (const n of cy.nodes()) n.data('label', n.data('labelOk'));
      });
    }
    handlers.onPull?.(null);
    refit();
  }

  function highlight(ids) {
    if (!cy) return;
    cy.elements().removeClass('hl dim');
    const set = new Set((ids || []).filter((i) => byId.has(i)));
    if (!set.size) return;
    cy.nodes().forEach((n) => n.addClass(set.has(n.id()) ? 'hl' : 'dim'));
    cy.edges().addClass('dim');
  }

  /** Red ring that keeps pulsing until reset(). */
  function markDrift(id) {
    if (!cy || !byId.has(id)) return;
    cy.getElementById(id).addClass('drifted');
    if (reduceMotion || pulseTimer) return;
    pulseTimer = setInterval(() => {
      if (!cy) { stopPulse(); return; }
      pulseOn = !pulseOn;
      cy.nodes('.drifted').toggleClass('pulse', pulseOn);
    }, 650);
    pulseOn = true;
    cy.nodes('.drifted').addClass('pulse');
  }

  function step(dir) {
    if (!order.length) return;
    const i = order.findIndex((c) => c.id === selected);
    const next = order[(i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length)];
    select(next.id);
  }

  /** Re-measure, re-layout for the current canvas size and fit. Call on resize/after layout-affecting changes. */
  function fit() {
    if (!cy) return;
    cy.resize();
    applyDims();
    runLayout();
    fitView();
  }

  /** Cheap re-fit (no re-layout), run on the next frame so DOM changes have settled. */
  function refit() {
    requestAnimationFrame(() => { if (cy) { cy.resize(); fitView(); } });
  }

  return {
    build, destroy, select, pull, pullSelected, reset, highlight, markDrift, step, fit, refit, cascade,
    get selected() { return selected; },
    has: (id) => byId.has(id),
    get pulledCount() { return pulled.size; },
  };
}
