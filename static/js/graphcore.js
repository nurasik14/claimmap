// Pure (DOM-free) helpers shared by the Read, Map and Live views; testable with plain node.
import { MODE_LABEL, trunc } from './util.js';

/** Map id -> claim and id -> ids of claims that directly rest on it. Ignores dangling/self deps. */
export function buildIndex(claims) {
  const byId = new Map();
  for (const c of claims || []) if (c && c.id && !byId.has(c.id)) byId.set(c.id, c);
  const dependents = new Map([...byId.keys()].map((id) => [id, []]));
  for (const c of byId.values()) {
    for (const d of new Set(c.depends_on || [])) {
      if (d !== c.id && byId.has(d)) dependents.get(d).push(c.id);
    }
  }
  return { byId, dependents };
}

export function edgeList(claims) {
  const { byId } = buildIndex(claims);
  const out = [];
  for (const c of byId.values()) {
    for (const d of new Set(c.depends_on || [])) {
      if (d !== c.id && byId.has(d)) out.push({ id: `${c.id}->${d}`, source: c.id, target: d });
    }
  }
  return out;
}

/**
 * Jenga pull: the pulled claims fall, then every claim that rests on a fallen claim falls too.
 * Returns [{id, level}] in fall order (level 0 = pulled). Handles cycles.
 */
export function cascade(claims, pulledIds) {
  const { byId, dependents } = buildIndex(claims);
  const seen = new Map();
  let frontier = [...new Set(pulledIds)].filter((id) => byId.has(id));
  let level = 0;
  const order = [];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.set(id, level);
      order.push({ id, level });
      for (const dep of dependents.get(id) || []) if (!seen.has(dep)) next.push(dep);
    }
    frontier = next;
    level++;
  }
  return order;
}

/** The ask = the "ask" category claim, else the highest-load claim nothing rests on. */
export function findAsk(claims) {
  const { byId, dependents } = buildIndex(claims);
  const all = [...byId.values()];
  return all.find((c) => c.category === 'ask')
    || all.filter((c) => !(dependents.get(c.id) || []).length).sort((a, b) => (b.load || 0) - (a.load || 0))[0]
    || null;
}

export function pullSummary(claims, pulledIds) {
  const fallen = cascade(claims, pulledIds);
  const total = buildIndex(claims).byId.size;
  const ask = findAsk(claims);
  const fallenSet = new Set(fallen.map((f) => f.id));
  const askFalls = !!ask && fallenSet.has(ask.id) && !pulledIds.includes(ask.id);
  const names = pulledIds.map((id) => claims.find((c) => c.id === id)?.text).filter(Boolean);
  const label = names.length === 1 ? `“${trunc(names[0], 60)}”` : `${names.length} claims`;
  let text = `Pull ${label} → ${fallen.length} of ${total} claims fall`;
  if (askFalls) text += ', including the ask';
  else if (ask && pulledIds.includes(ask.id)) text += ' (you pulled the ask itself)';
  else if (ask) text += '; the ask still stands';
  return { fallen, fallenSet, total, askFalls, text };
}

/** Self + what it rests on + what rests on it (Obsidian-style hover set). */
export function neighbourIds(claims, id) {
  const { byId, dependents } = buildIndex(claims);
  const c = byId.get(id);
  if (!c) return new Set();
  return new Set([id, ...(c.depends_on || []).filter((d) => byId.has(d)), ...(dependents.get(id) || [])]);
}

export const FILTERS = ['all', 'contradicted', 'unverified', 'spoken'];
export function matchesFilter(claim, filter) {
  switch (filter) {
    case 'contradicted': return claim?.check?.verdict === 'contradicted';
    case 'unverified': return (claim?.check?.verdict || 'unverified') === 'unverified';
    case 'spoken': return claim?.source === 'spoken';
    default: return true;
  }
}

/** Node diameter in model px (18..60) from load 0..1. */
export function nodeSize(load) {
  const l = Math.max(0, Math.min(1, Number(load) || 0));
  return Math.round(18 + 42 * l);
}

export function questionsFor(questions, claimId) {
  return (questions || []).filter((q) => (q.claim_ids || []).includes(claimId))
    .sort((a, b) => (a.priority || 9) - (b.priority || 9));
}

export function dependentsOf(claims, id) {
  return buildIndex(claims).dependents.get(id) || [];
}

/** Display model of one library card (the DOM layer only lays it out). */
export function libraryCardModel(item) {
  const c = item?.counts || {};
  const busy = item?.status && item.status !== 'done' && item.status !== 'error';
  const mode = item?.mode || 'deck';
  return {
    id: item?.deck_id,
    title: item?.title || item?.company || 'Untitled deck',
    mode,
    modeLabel: MODE_LABEL[mode] || 'Deck',
    capture: item?.capture || null,
    thumb: item?.thumb || null,
    date: item?.created_at || '',
    counts: { contradicted: c.contradicted || 0, supported: c.supported || 0, unverified: c.unverified || 0, missing: c.missing || 0 },
    claimCount: item?.claim_count ?? 0,
    slideCount: item?.slide_count ?? 0,
    flag: item?.top_flag ? trunc(item.top_flag, 110) : null,
    busy: !!busy,
    error: item?.status === 'error',
    statusLine: item?.status === 'error' ? 'Analysis failed' : busy ? (item.progress || 'Analysing…') : '',
    // v3 (optional, render only when present)
    score: scoreValue(item?.score),
    outcome: item?.outcome || null,
    outcomeWon: typeof item?.outcome_won === 'boolean' ? item.outcome_won : null,
    sourceUrl: item?.source_url || null,
    sourceKind: /youtu\.?be|vimeo/i.test(item?.source_url || '') ? 'video' : (item?.source_url ? 'pdf' : null),
  };
}

/** Score as a number 0..100 from either a bare number (list item) or a PitchScore object; null if absent. */
export function scoreValue(raw) {
  if (raw == null) return null;
  const v = Number(typeof raw === 'object' ? raw.total : raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

/** Library ordering: 'newest' (created_at desc) or 'score' (high to low, unscored last). */
export function sortItems(items, how = 'newest') {
  const out = [...(items || [])];
  if (how === 'score') {
    const sc = (x) => libraryCardModel(x).score;
    out.sort((a, b) => (sc(b) ?? -1) - (sc(a) ?? -1) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  } else out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return out;
}

/** Build a LibraryItem from a full DeckAnalysis (used by the mock and to refresh a card while analysing). */
export function libraryItemFromAnalysis(a) {
  const cnt = { contradicted: 0, supported: 0, unverified: 0, missing: 0 };
  for (const cl of a.claims || []) {
    const v = cl?.check?.verdict;
    cnt[v in cnt ? v : 'unverified']++;
  }
  const flag = (a.claims || []).filter((c) => c.check?.verdict === 'contradicted')
    .sort((x, y) => (y.load || 0) - (x.load || 0))[0];
  const slideCount = a.slide_count || 0;
  return {
    deck_id: a.deck_id, title: a.title || a.company || '', company: a.company || '', mode: a.mode || 'deck',
    status: a.status, progress: a.progress || '', created_at: a.created_at || '', slide_count: slideCount,
    claim_count: (a.claims || []).length, counts: cnt,
    top_flag: flag ? `${flag.text}: ${flag.check.reason || 'contradicted'}` : null,
    thumb: slideCount ? `/api/deck/${encodeURIComponent(a.deck_id)}/slides/1.png` : null,
    score: scoreValue(a.score), outcome: a.outcome ?? null, outcome_won: a.outcome_won ?? null, source_url: a.source_url ?? null,
  };
}
