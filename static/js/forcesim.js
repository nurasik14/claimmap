// Continuous d3-force simulation for the claim graph (Obsidian-style living layout).
// DOM-free: pass the d3 namespace in, so node can test the maths headlessly.
//   const sim = createForceSim(d3, { compact });
//   sim.setData([{id, r}], [{source, target}]);  sim.tick(); sim.positions() -> Map(id -> {x, y})
// The caller (graphview.js) owns the animation frame; this module never schedules anything itself.

/** Collision radius = circle radius + room for the label underneath. */
export function collideRadius(r, compact = false) {
  return r + (compact ? 14 : 22);
}

export function createForceSim(d3, { compact = false, linkDistance = compact ? 70 : 90, charge = compact ? -160 : -220 } = {}) {
  const nodes = [];
  const byId = new Map();
  let links = [];
  const degree = new Map();

  const link = d3.forceLink([]).id((d) => d.id)
    .distance((l) => (l.ev ? linkDistance * 0.45 : linkDistance)) // evidence satellites sit close to their claim
    // Obsidian-like: springs on well-connected nodes are softer so hubs do not get yanked around.
    .strength((l) => 1 / Math.max(1, Math.min(degree.get(l.source.id) || 1, degree.get(l.target.id) || 1)) * 0.7);
  const sim = d3.forceSimulation(nodes)
    .force('link', link)
    .force('charge', d3.forceManyBody().strength(charge).distanceMax(compact ? 400 : 600))
    .force('center', d3.forceCenter(0, 0).strength(0.05))
    .force('collide', d3.forceCollide((d) => collideRadius(d.r || 10, compact)).strength(0.8).iterations(2))
    // weak pull to the middle so orphans orbit the cluster instead of drifting off
    .force('x', d3.forceX(0).strength(0.045))
    .force('y', d3.forceY(0).strength(0.045))
    .alphaDecay(0.028)
    .velocityDecay(0.38)
    .stop(); // manual ticking from requestAnimationFrame

  function rebuildDegree() {
    degree.clear();
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      degree.set(s, (degree.get(s) || 0) + 1);
      degree.set(t, (degree.get(t) || 0) + 1);
    }
  }

  function applyLinks() {
    const ok = links.filter((l) => byId.has(l.source?.id ?? l.source) && byId.has(l.target?.id ?? l.target));
    links = ok.map((l) => ({ ...l, source: l.source?.id ?? l.source, target: l.target?.id ?? l.target }));
    rebuildDegree();
    link.links(links);
  }

  /** Spring-out start: every node starts near the centre on a tiny spiral and the sim pushes them out. */
  function setData(list, linkList, { keep = true } = {}) {
    const old = new Map(byId);
    nodes.length = 0;
    byId.clear();
    list.forEach((n, i) => {
      const prev = keep ? old.get(n.id) : null;
      const a = i * 2.39996; // golden angle
      const rad = 4 + 3 * Math.sqrt(i);
      const d = prev ? Object.assign(prev, { r: n.r }) : { id: n.id, r: n.r, x: rad * Math.cos(a), y: rad * Math.sin(a), vx: 0, vy: 0 };
      nodes.push(d);
      byId.set(n.id, d);
    });
    sim.nodes(nodes);
    links = linkList.slice();
    applyLinks();
    sim.alpha(1);
  }

  /** Insert one node near its anchors (mean position) or the centre, then reheat a little. */
  function addNode(n, anchorIds = [], newLinks = []) {
    if (byId.has(n.id)) { byId.get(n.id).r = n.r; return byId.get(n.id); }
    const anchors = anchorIds.map((id) => byId.get(id)).filter(Boolean);
    const cx = anchors.length ? anchors.reduce((s, a) => s + a.x, 0) / anchors.length : 0;
    const cyy = anchors.length ? anchors.reduce((s, a) => s + a.y, 0) / anchors.length : 0;
    const j = () => (Math.random() - 0.5) * 30;
    const d = { id: n.id, r: n.r, x: cx + j(), y: cyy + j(), vx: 0, vy: 0 };
    nodes.push(d);
    byId.set(n.id, d);
    sim.nodes(nodes);
    links = links.concat(newLinks);
    applyLinks();
    sim.alpha(Math.max(sim.alpha(), 0.5));
    return d;
  }

  function addLink(l) {
    links = links.concat([l]);
    applyLinks();
    sim.alpha(Math.max(sim.alpha(), 0.2));
  }

  function setRadius(id, r) { const d = byId.get(id); if (d) d.r = r; sim.force('collide').radius((x) => collideRadius(x.r || 10, compact)); }

  // ---- drag: pin, reheat, release ----
  function pin(id, x, y) {
    const d = byId.get(id);
    if (!d) return;
    d.fx = x; d.fy = y;
    sim.alphaTarget(0.3);
    if (sim.alpha() < 0.3) sim.alpha(0.3);
  }
  function unpin(id, idleTarget = 0) {
    const d = byId.get(id);
    if (!d) return;
    d.fx = null; d.fy = null;
    sim.alphaTarget(idleTarget);
  }

  function positions() {
    const m = new Map();
    for (const d of nodes) m.set(d.id, { x: d.x, y: d.y });
    return m;
  }

  /** Bounding box of the current positions, including label room. */
  function bbox() {
    if (!nodes.length) return { x1: -1, y1: -1, x2: 1, y2: 1, w: 2, h: 2 };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const d of nodes) {
      const r = collideRadius(d.r || 10, compact);
      x1 = Math.min(x1, d.x - r); x2 = Math.max(x2, d.x + r);
      y1 = Math.min(y1, d.y - r); y2 = Math.max(y2, d.y + r);
    }
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  }

  return {
    sim, nodes, byId, bbox,
    setData, addNode, addLink, setRadius, pin, unpin, positions,
    tick: (n = 1) => sim.tick(n),
    alpha: () => sim.alpha(),
    alphaTarget: (t) => (t == null ? sim.alphaTarget() : sim.alphaTarget(t)),
    reheat: (a = 0.3) => { if (sim.alpha() < a) sim.alpha(a); },
    /** True while the simulation is still moving things in a visible way. */
    active: () => sim.alpha() > Math.max(sim.alphaMin(), sim.alphaTarget()) || sim.alphaTarget() > 0,
  };
}

/**
 * Where will this graph settle? Runs a throwaway copy to convergence (d3-force is deterministic for the same
 * start), so the viewport can be framed before the visible spring-out begins.
 */
export function settledBBox(d3, list, linkList, opts = {}) {
  const s = createForceSim(d3, opts);
  s.setData(list, linkList, { keep: false });
  s.tick(300);
  return { bbox: s.bbox(), positions: s.positions() };
}

/** Tiny zero-mean wobble for the idle drift (velocity nudge per node; px per frame). */
export function driftNudge(t, i, amp = 0.012) {
  const ph = i * 1.7;
  return { vx: Math.sin(t * 0.0007 + ph) * amp, vy: Math.cos(t * 0.0005 + ph * 1.3) * amp };
}
