// The claim card (Read right panel, Map drawer) and the per-deck pin store.
import { h, icon, btn, verdictChip, verdictOf, catLabel, safeUrl, fmtDate, fmtTime, trunc, empty, liveBadge } from './util.js';
import { questionsFor, dependentsOf } from './graphcore.js';

const PIN_KEY = (id) => `claimmap.pins.${id}`;
export function loadPins(deckId) {
  try { return new Set(JSON.parse(localStorage.getItem(PIN_KEY(deckId)) || '[]')); } catch { return new Set(); }
}
export function savePins(deckId, set) {
  try { localStorage.setItem(PIN_KEY(deckId), JSON.stringify([...set])); } catch { /* ignore */ }
}

const KIND_LABEL = { deck: 'Deck', math: 'Arithmetic', wayback: 'Archived website', website: 'Website', web: 'Web', registry: 'Registry', transcript: 'Transcript' };

/** Small clickable claim chip; hovering it highlights the node + neighbours in the graphs. */
export function claimChip(c, ctx) {
  return h('button', {
    class: `cchip v-${verdictOf(c).key}`, type: 'button', title: `${c.text} (${verdictOf(c).label})`,
    onclick: () => ctx.open(c.id),
    onmouseenter: () => ctx.hover?.(c.id), onmouseleave: () => ctx.hover?.(null),
  }, h('span', { class: 'dot' }), trunc(c.text, 48));
}

/**
 * ctx: { analysis, pins:Set, togglePin(id), open(id), hover(id), showInMap(id)|null, close()|null }
 */
export function renderClaimCard(claim, ctx) {
  const a = ctx.analysis;
  const byId = new Map((a.claims || []).map((c) => [c.id, c]));
  const v = verdictOf(claim);
  const load = Math.round(Math.max(0, Math.min(1, claim.load || 0)) * 100);
  const pinned = ctx.pins.has(claim.id);
  const restsOn = (claim.depends_on || []).map((id) => byId.get(id)).filter(Boolean);
  const holdsUp = dependentsOf(a.claims, claim.id).map((id) => byId.get(id)).filter(Boolean);
  const qs = questionsFor(a.questions, claim.id);
  // live drift saved for this claim: '<note> (said at 84s: "<quote>"; vs claim c2)'
  const drifts = (a.drift_notes || []).map((line) => /^(.*?)\s*\(said at (\d+(?:\.\d+)?)s: "(.*)"; vs claim ([\w-]+)\)\s*$/s.exec(line))
    .filter((m) => m && m[4] === claim.id)
    .map((m) => h('div', { class: 'drift-card' }, h('span', { class: 'drift-tag', text: 'Drift' }),
      h('span', { class: 'drift-now', text: `Said (${Math.floor(m[2] / 60)}:${String(Math.floor(m[2] % 60)).padStart(2, '0')}): ${m[3]}` }),
      h('span', { class: 'drift-note muted', text: m[1] })));
  const where = claim.source === 'spoken'
    ? ['Said live', claim.t != null ? ` at ${fmtTime(claim.t)}` : '']
    : [claim.slide != null ? `Slide ${claim.slide}` : 'Deck'];

  const sources = (claim.check?.sources || []).map((s) => {
    const url = safeUrl(s.url);
    return h('li', { class: 'source' },
      h('div', { class: 'src-head' },
        h('span', { class: 'src-kind', text: KIND_LABEL[s.kind] || s.kind || 'Source' }),
        s.date ? h('span', { class: 'src-date mono', text: fmtDate(s.date) }) : null),
      s.title ? h('div', { class: 'src-title', text: s.title }) : null,
      s.quote ? h('blockquote', { class: 'src-quote', text: s.quote }) : null,
      url ? h('a', { class: 'src-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, trunc(url.replace(/^https?:\/\//, ''), 60), icon('external', 14)) : null);
  });

  const section = (title, body) => h('section', { class: 'card-sec' }, h('h4', { text: title }), body);

  return h('article', { class: `claim-card v-${v.key}` },
    h('div', { class: 'card-top' },
      verdictChip(claim, true),
      claim.source === 'spoken' ? liveBadge('SPOKEN') : null,
      h('span', { class: 'grow' }),
      ctx.close ? h('button', { class: 'icon-btn', 'aria-label': 'Close', title: 'Close (Esc)', onclick: ctx.close }, icon('close')) : null),
    h('h3', { class: 'card-title', text: claim.text }),
    h('div', { class: 'card-meta muted' }, h('span', { text: catLabel(claim.category) }), h('span', { text: ' · ' }), h('span', { text: where.join('') })),
    claim.check?.reason ? h('p', { class: 'card-reason', text: claim.check.reason }) : null,
    claim.quote ? h('blockquote', { class: 'card-quote', text: `“${claim.quote}”` }) : null,
    h('div', { class: 'loadbar', title: 'Load: how many other claims rest on this one' },
      h('div', { class: 'loadbar-label' }, h('span', { text: 'How much of the deal rests on this' }), h('strong', { class: 'num', text: `${load}%` })),
      h('div', { class: 'loadbar-track' }, h('div', { class: 'loadbar-fill', style: { width: `${load}%` } }))),
    drifts.length ? section(`Said differently in the pitch (${drifts.length})`, h('div', { class: 'card-drifts' }, drifts)) : null,
    qs.length ? section('Ask the founder', h('div', null, qs.slice(0, 2).map((q) => h('p', { class: 'card-q', text: q.text })))) : null,
    section(`Evidence${sources.length ? ` (${sources.length})` : ''}`, sources.length ? h('ul', { class: 'sources' }, sources) : empty('No external evidence was found for this claim yet.')),
    restsOn.length ? section('Rests on', h('div', { class: 'chips' }, restsOn.map((c) => claimChip(c, ctx)))) : null,
    holdsUp.length ? section('Holds up', h('div', { class: 'chips' }, holdsUp.map((c) => claimChip(c, ctx)))) : null,
    h('div', { class: 'card-actions' },
      btn(pinned ? 'Unpin' : 'Pin', { kind: pinned ? 'secondary' : 'ghost', iconName: 'pin', title: 'Pin this card (keeps it in the sidebar)', onclick: () => ctx.togglePin(claim.id) }),
      ctx.showInMap ? btn('Show in map', { iconName: 'map', onclick: () => ctx.showInMap(claim.id) }) : null));
}

/** "Ask these first" panel, used when no claim is selected. */
export function renderAskFirst(a, ctx) {
  const qs = [...(a.questions || [])].sort((x, y) => (x.priority || 9) - (y.priority || 9));
  const byId = new Map((a.claims || []).map((c) => [c.id, c]));
  return h('div', { class: 'ask-first' },
    h('h3', { text: 'Ask these first' }),
    h('p', { class: 'muted small', text: 'The questions that decide the deal. Select a highlight or a node to see the evidence.' }),
    qs.length ? h('ol', { class: 'qlist' }, qs.slice(0, 6).map((q) => {
      const cs = (q.claim_ids || []).map((id) => byId.get(id)).filter(Boolean);
      return h('li', {
        class: 'qitem',
        onmouseenter: () => cs[0] && ctx.hover?.(cs[0].id), onmouseleave: () => ctx.hover?.(null),
      },
      h('p', { class: 'q-text', text: q.text }),
      q.why ? h('p', { class: 'q-why muted small', text: q.why }) : null,
      cs.length ? h('div', { class: 'chips' }, cs.map((c) => claimChip(c, ctx))) : null);
    })) : empty('No questions yet. They appear once the analysis (or Finalize) is done.'));
}
