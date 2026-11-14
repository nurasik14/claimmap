// Workspace (#/d/<id>/<tab>): top bar + tabs Read | Map | Live | Brief. Tabs are created once and kept.
import { h, icon, btn, MODE_LABEL, CAPTURE_LABEL, toast, empty, scoreDial, safeUrl, busy } from './util.js';
import { getDeck, finalize } from './api.js';
import { scoreValue } from './graphcore.js';
import { loadPins, savePins } from './card.js';
import { createRead } from './read.js';
import { createMap } from './map.js';
import { createLive } from './live.js';
import { createBrief } from './brief.js';
import { moreButton, copyLink, nativeShare, closeMenu } from './share.js';

const TABS = [
  { key: 'read', label: 'Read', key1: '1' },
  { key: 'map', label: 'Map', key1: '2' },
  { key: 'live', label: 'Live', key1: '3' },
  { key: 'brief', label: 'Brief', key1: '4' },
];
const MAKERS = { read: createRead, map: createMap, live: createLive, brief: createBrief };

export function createWorkspace(id, { header, root }) {
  const listeners = new Set();
  const hoverListeners = new Set();
  const panes = {};
  let current = null;
  let pollT = null;
  let alive = true;

  const ws = {
    id, analysis: null, pins: loadPins(id),
    onChange(fn) { listeners.add(fn); },
    onHover(fn) { hoverListeners.add(fn); },
    hover(cid) { for (const fn of hoverListeners) fn(cid); },
    claim(cid) { return ws.analysis?.claims?.find((c) => c.id === cid) || null; },
    togglePin(cid) {
      if (ws.pins.has(cid)) ws.pins.delete(cid); else ws.pins.add(cid);
      savePins(id, ws.pins);
      emit();
    },
    /** Open a claim card in the current tab (Read: right panel; elsewhere: the Map drawer). */
    open(cid) {
      if (current === 'read' && panes.read) panes.read.openClaim(cid);
      else go('map', () => panes.map.openClaim(cid));
    },
    showInMap(cid) { go('map', () => panes.map.openClaim(cid)); },
    showInRead(cid) { go('read', () => panes.read.openClaim(cid)); },
    /** Replace/merge a live-added claim locally so every tab sees it. */
    upsertClaim(c) {
      if (!ws.analysis || !c?.id) return;
      const list = ws.analysis.claims || (ws.analysis.claims = []);
      const i = list.findIndex((x) => x.id === c.id);
      if (i >= 0) list[i] = c; else list.push(c);
      if (ws.analysis.mode === 'deck' && c.source === 'spoken') ws.analysis.mode = 'deck+live';
      emit({ live: true });
      drawHeader();
    },
    /** Live score update from the server (deterministic rescore after each new claim or drift). */
    setScore(s) {
      if (!ws.analysis || !s) return;
      ws.analysis.score = s;
      drawHeader();
    },
    addQuestion(q) {
      if (!ws.analysis || !q?.id) return;
      const list = ws.analysis.questions || (ws.analysis.questions = []);
      if (!list.some((x) => x.id === q.id)) list.push(q);
    },
    refresh,
    finalize: doFinalize,
    go,
    hasSlides: () => (ws.analysis?.slide_count || 0) > 0,
  };

  function emit(opts = {}) { for (const fn of listeners) fn(ws.analysis, opts); }

  function go(tab, then) {
    location.hash = `#/d/${encodeURIComponent(id)}/${tab}`;
    // the router calls show(tab) synchronously on hashchange; run `then` once the tab exists
    setTimeout(() => { if (panes[tab]) then?.(); }, 0);
  }

  // ---- header ----
  const tabEls = {};
  const finalizeBtn = btn('Finalize', { kind: 'secondary', iconName: 'check', title: 'Re-check everything, including what was said live', onclick: () => doFinalize() });
  const exportBtn = btn('Export', { kind: 'ghost', iconName: 'download', title: 'Export the investment brief', onclick: () => go('brief', () => panes.brief.exportMenu?.()) });
  const titleEl = h('div', { class: 'ws-title' });
  const metaEl = h('div', { class: 'ws-meta muted' });
  const tabsEl = h('nav', { class: 'tabs', role: 'tablist' }, TABS.map((t) => {
    const b = h('button', { class: 'tab', role: 'tab', type: 'button', title: `${t.label} (${t.key1})`, onclick: () => { if (!b.disabled) go(t.key); } }, t.label);
    tabEls[t.key] = b;
    return b;
  }));

  // ---- v3: ClaimMap score dial + breakdown popover (rendered only when the analysis has a score) ----
  const scoreSlot = h('div', { class: 'score-slot' });
  let scoreKey = '';
  let pop = null;
  function closePop() {
    if (!pop) return;
    pop.remove();
    pop = null;
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onPopKey, true);
    scoreSlot.querySelector('.score-btn')?.setAttribute('aria-expanded', 'false');
  }
  const onDocDown = (e) => { if (pop && !pop.contains(e.target) && !scoreSlot.contains(e.target)) closePop(); };
  const onPopKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
  function openPop(anchor) {
    if (pop) { closePop(); return; }
    const a = ws.analysis;
    const s = a?.score;
    if (!s) return;
    const outSrc = safeUrl(a.outcome_source);
    pop = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'ClaimMap score breakdown' },
      h('div', { class: 'score-head' }, scoreDial(s.total, { size: 64, stroke: 5, cls: 'lg' }),
        h('div', null, h('h3', { text: 'ClaimMap score' }), s.summary ? h('p', { class: 'muted small', text: s.summary }) : null)),
      (s.parts || []).length ? h('ul', { class: 'score-parts' }, s.parts.map((p, i) => {
        const frac = p.max_points ? Math.max(0, Math.min(1, p.points / p.max_points)) : 0;
        const crit = criteria?.parts?.['ABCD'[i]];
        return h('li', { class: 'score-part' },
          h('div', { class: 'row' }, h('span', { text: p.name }), h('span', { class: 'num muted', text: `${fmtPts(p.points)} / ${fmtPts(p.max_points)}` })),
          h('div', { class: 'bar' }, h('i', { style: { width: `${(frac * 100).toFixed(1)}%`, animationDelay: `${80 * i}ms` } })),
          p.detail ? h('p', { class: 'muted small', text: p.detail }) : null,
          crit ? h('details', { class: 'score-basis' }, h('summary', { class: 'small', text: 'Why this counts' }),
            h('p', { class: 'small', text: crit.basis }),
            ...(crit.sources || []).map((src) => h('p', { class: 'small muted' },
              src.quote ? `“${src.quote}” ` : '',
              safeUrl(src.url) ? h('a', { href: safeUrl(src.url), target: '_blank', rel: 'noopener noreferrer', class: 'src-link' }, src.title, icon('external', 12)) : src.title))) : null);
      })) : null,
      (s.drivers || []).length ? h('div', { class: 'score-drivers' },
        h('h4', { class: 'small', text: 'What moved this score' }),
        h('ul', null, s.drivers.slice(0, 6).map((d) => h('li', {
          class: `driver ${d.effect < 0 ? 'neg' : 'pos'}`, title: d.reason,
          onclick: () => { if (d.claim_id && ws.claim(d.claim_id)) { closePop(); ws.open(d.claim_id); } },
        },
        h('span', { class: 'num eff', text: `${d.effect > 0 ? '+' : ''}${fmtPts(d.effect)}` }),
        h('span', { class: 'dtext' }, h('strong', { text: d.text }), h('span', { class: 'muted small', text: ` ${d.reason}` }),
          h('span', { class: 'muted small', text: ` (${PART_NAME[d.part] || d.part})` })))))) : null,
      criteria?.not_measured ? h('p', { class: 'muted small', text: `Not measured: ${criteria.not_measured}` }) : null,
      a.outcome ? h('p', { class: 'small' }, h('strong', { text: 'Real outcome: ' }), a.outcome, ' ',
        outSrc ? h('a', { href: outSrc, target: '_blank', rel: 'noopener noreferrer', class: 'src-link' }, 'source', icon('external', 12)) : null) : null,
      h('p', { class: 'score-note', text: 'The score measures how well claims hold up; it does not predict success.' }));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onPopKey, true);
  }
  const PART_NAME = { A: 'Evidence balance', B: 'Specificity', C: 'Consistency', D: 'Verifiable core' };
  let criteria = null; // grounds + sources for each score part (docs/SCORE_RATIONALE.md)
  fetch('/static/score_criteria.json').then((r) => (r.ok ? r.json() : null)).then((c) => { criteria = c; }).catch(() => {});
  const fmtPts = (x) => (Number.isInteger(Number(x)) ? String(x) : Number(x).toFixed(1));
  function drawScore(a) {
    const v = scoreValue(a?.score);
    const key = v == null ? '' : `${v}`;
    if (key === scoreKey) return;
    scoreKey = key;
    closePop();
    if (v == null) { scoreSlot.replaceChildren(); return; }
    const b = h('button', { class: 'score-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'How well the claims hold up (click for the breakdown)',
      onclick: (e) => openPop(e.currentTarget) },
    scoreDial(v, { size: 34, stroke: 3.5 }), h('span', { class: 'lbl' }, 'Score', h('br'), h('span', { class: 'muted', text: 'of 100' })));
    scoreSlot.replaceChildren(b);
  }

  function drawHeader() {
    const a = ws.analysis;
    drawScore(a);
    titleEl.textContent = a ? (a.title || a.company || 'Untitled deck') : 'Loading…';
    metaEl.replaceChildren();
    if (a) {
      const n = (a.claims || []).length;
      const slides = a.slide_count || 0;
      metaEl.append(...[
        h('span', { class: 'num', text: slides ? `${slides} slides · ${n} claims` : `${n} claims` }),
        h('span', { class: 'chip', text: MODE_LABEL[a.mode] || 'Deck' }),
        a.capture && CAPTURE_LABEL[a.capture] && a.mode !== 'deck' ? h('span', { class: `chip cap cap-${a.capture}`, text: CAPTURE_LABEL[a.capture] }) : null,
        a.status !== 'done' ? h('span', { class: `chip status ${a.status === 'error' ? 'err' : ''}` }, a.status === 'error' ? null : h('span', { class: 'spinner' }), a.status === 'checking' ? 'Checking…' : (a.status === 'error' ? 'Error' : 'Analysing…')) : null,
      ].filter(Boolean));
      const noSlides = !slides;
      tabEls.read.disabled = noSlides;
      tabEls.read.title = noSlides ? 'No slides: this is a live-only session (or slides are still rendering)' : 'Read (1)';
    }
    for (const t of TABS) {
      tabEls[t.key].classList.toggle('active', t.key === current);
      tabEls[t.key].setAttribute('aria-selected', String(t.key === current));
    }
    moveInd();
    finalizeBtn.disabled = !a || a.status === 'checking' || (a.status !== 'done' && a.status !== 'error');
    finalizeBtn.querySelector('span').textContent = a?.status === 'checking' ? 'Checking…' : 'Finalize';
  }

  // v4: Share (copy link / native share) + "..." menu (link, downloads, delete)
  const deckRef = () => ({ id, title: ws.analysis ? (ws.analysis.title || ws.analysis.company || 'Untitled deck') : 'this deck' });
  const shareBtn = btn('Share', { kind: 'ghost', iconName: 'link', cls: 'share-btn', title: 'Copy a link to this analysis',
    onclick: () => (navigator.share && matchMedia('(pointer: coarse)').matches ? nativeShare(id, deckRef().title) : copyLink(id)) });
  const wsMore = moreButton(deckRef, { cls: 'ws-more', onDeleted: () => { location.hash = '#/'; } });
  const tabInd = h('span', { class: 'tab-ind', 'aria-hidden': 'true' });
  tabsEl.append(tabInd);

  header.replaceChildren(
    h('a', { class: 'icon-btn back', href: '#/', title: 'Back to library (Esc twice)', 'aria-label': 'Back to library' }, icon('back')),
    h('div', { class: 'ws-id' }, titleEl, metaEl),
    tabsEl,
    h('div', { class: 'grow' }),
    scoreSlot, finalizeBtn, exportBtn, shareBtn, wsMore);

  /** Slide the pill indicator under the active tab. */
  function moveInd() {
    const t = tabEls[current];
    if (!t || !t.offsetWidth) { tabInd.style.opacity = '0'; return; }
    tabInd.style.opacity = '1';
    tabInd.style.width = `${t.offsetWidth}px`;
    tabInd.style.transform = `translateX(${t.offsetLeft}px)`;
    tabInd.classList.toggle('live', current === 'live');
  }
  const onResize = () => moveInd();
  window.addEventListener('resize', onResize);
  document.fonts?.ready?.then(() => { if (alive) moveInd(); });

  const body = h('div', { class: 'ws-body' });
  root.replaceChildren(body);

  // ---- data ----
  async function refresh() {
    try {
      const a = await getDeck(id);
      if (!alive) return;
      ws.analysis = a;
      drawHeader();
      emit();
      clearTimeout(pollT);
      if (a.status !== 'done' && a.status !== 'error') pollT = setTimeout(refresh, 1000);
      return a;
    } catch (e) {
      if (!alive) return;
      if (e.status === 404) {
        body.replaceChildren(h('div', { class: 'center-msg' }, h('h2', { text: 'Deck not found' }), h('p', { class: 'muted', text: 'It may have been deleted.' }), h('a', { class: 'btn primary', href: '#/' }, 'Back to library')));
      } else {
        toast(`Could not load the deck: ${e.message}`);
        pollT = setTimeout(refresh, 3000);
      }
    }
  }

  async function doFinalize() {
    return busy(finalizeBtn, doFinalizeInner);
  }
  async function doFinalizeInner() {
    finalizeBtn.disabled = true;
    try {
      await finalize(id);
      if (ws.analysis) ws.analysis.status = 'checking';
      drawHeader();
      toast('Checking everything that was said and shown. This takes up to a minute.', 'info', 4000);
      clearTimeout(pollT);
      pollT = setTimeout(refresh, 1000);
      return true;
    } catch (e) {
      toast(e.notAvailable ? 'Finalize is not available on the server yet.' : `Finalize failed: ${e.message}`);
      drawHeader();
      return false;
    }
  }

  function show(tab) {
    if (!MAKERS[tab]) tab = 'map';
    if (tab === 'read' && ws.analysis && !ws.hasSlides()) {
      location.replace(`#/d/${encodeURIComponent(id)}/${ws.analysis.mode === 'live' ? 'live' : 'map'}`);
      return;
    }
    let created = false;
    if (!panes[tab]) {
      created = true;
      panes[tab] = MAKERS[tab](ws);
      panes[tab].el.classList.add('pane');
      body.append(panes[tab].el);
      if (ws.analysis) panes[tab].update?.(ws.analysis, {});
      ws.onChange((a, o) => panes[tab].update?.(a, o));
    }
    for (const [k, p] of Object.entries(panes)) {
      if (k !== tab && !p.el.hidden) { p.el.hidden = true; p.hide?.(); }
    }
    if (created || current !== tab || panes[tab].el.hidden) {
      panes[tab].el.hidden = false;
      panes[tab].show?.();
    }
    current = tab;
    drawHeader();
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = TABS.find((x) => x.key1 === e.key);
    if (t && !tabEls[t.key].disabled) { go(t.key); return; }
    panes[current]?.onKey?.(e);
  }
  document.addEventListener('keydown', onKey);

  drawHeader();
  const ready = refresh();

  return {
    id, ready,
    async show(tab) {
      if (!ws.analysis) {
        body.replaceChildren(h('div', { class: 'center-msg' }, h('span', { class: 'spinner big' }), h('p', { class: 'muted', text: 'Loading…' })));
        await ready;
        if (!alive || !ws.analysis) return;
        body.replaceChildren(...Object.values(panes).map((p) => p.el));
        if (!body.children.length && !ws.analysis.claims) body.append(empty('Nothing here yet.'));
      }
      show(tab);
    },
    destroy() {
      alive = false;
      closePop();
      closeMenu();
      window.removeEventListener('resize', onResize);
      clearTimeout(pollT);
      document.removeEventListener('keydown', onKey);
      for (const p of Object.values(panes)) p.destroy?.();
    },
  };
}
