// Read tab (BlazeLearn-style): outline + pinned on the left, real slide images with claim highlights in
// the centre, the claim card (or "Ask these first") on the right.
import { h, icon, dots, counts, slideTitle, verdictOf, trunc, empty } from './util.js';
import { slideUrl } from './api.js';
import { renderClaimCard, renderAskFirst, claimChip } from './card.js';

export function createRead(ws) {
  let selected = null;
  let a = null;
  let builtKey = '';
  const outline = h('ol', { class: 'outline' });
  const pinned = h('div', { class: 'pinned' });
  const pages = h('div', { class: 'pages' });
  const right = h('aside', { class: 'read-right', 'aria-live': 'polite' });
  const tip = h('div', { class: 'hl-tip', role: 'tooltip', hidden: true });
  const center = h('main', { class: 'read-center' }, pages, tip);
  const el = h('div', { class: 'read' },
    h('aside', { class: 'read-left' },
      h('h4', { class: 'side-h', text: 'Outline' }), outline,
      h('h4', { class: 'side-h', text: 'Pinned' }), pinned),
    center, right);

  const ctx = () => ({
    analysis: a, pins: ws.pins, togglePin: ws.togglePin, open: openClaim, hover: hoverClaim,
    showInMap: ws.showInMap, close: () => openClaim(null),
  });

  function hoverClaim(id) {
    for (const r of pages.querySelectorAll('.hl.hover')) r.classList.remove('hover');
    if (id) for (const r of pages.querySelectorAll(`.hl[data-id="${CSS.escape(id)}"]`)) r.classList.add('hover');
    ws.hover(id);
  }

  function claimsOnSlide(n) {
    return (a.claims || []).filter((c) => c.source !== 'spoken' && c.slide === n);
  }

  function buildPages() {
    const n = a.slide_count || 0;
    const key = `${n}:${(a.claims || []).filter((c) => c.source !== 'spoken').map((c) => `${c.id}${verdictOf(c).key}${(c.boxes || []).length}`).join(',')}`;
    if (key === builtKey) return;
    builtKey = key;
    pages.replaceChildren();
    outline.replaceChildren();
    if (!n) { pages.append(empty('No slide images for this deck.')); return; }
    for (let i = 1; i <= n; i++) {
      const cs = claimsOnSlide(i);
      const layer = h('div', { class: 'hl-layer' });
      const margin = h('div', { class: 'margin' });
      const unplaced = [];
      for (const c of cs) {
        const boxes = (c.boxes || []).filter((b) => b.slide === i || b.slide == null);
        if (!boxes.length) { unplaced.push(c); continue; }
        const v = verdictOf(c).key;
        boxes.forEach((b, k) => {
          const r = h('button', {
            class: `hl v-${v}`, type: 'button', 'data-id': c.id, 'aria-label': `${c.text} (${verdictOf(c).label})`,
            style: { left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) },
            onclick: () => openClaim(c.id),
            onmouseenter: (e) => { showTip(e.currentTarget, c); hoverClaim(c.id); },
            onmouseleave: () => { tip.hidden = true; hoverClaim(null); },
            onfocus: (e) => showTip(e.currentTarget, c), onblur: () => { tip.hidden = true; },
          });
          layer.append(r);
          if (k === 0) {
            margin.append(h('button', {
              class: `mmark v-${v}`, type: 'button', title: c.text, 'data-id': c.id, style: { top: pct(b.y + b.h / 2) },
              onclick: () => openClaim(c.id), onmouseenter: () => hoverClaim(c.id), onmouseleave: () => hoverClaim(null),
            }, h('span', { class: 'dot' })));
          }
        });
      }
      // shimmer placeholder (16:9) until the PNG has loaded, then the slide fades in
      const frame = h('div', { class: 'slide-frame loading' });
      const img = h('img', { class: 'slide-img', alt: `Slide ${i}`, loading: i > 2 ? 'lazy' : 'eager', decoding: 'async',
        onload: () => frame.classList.remove('loading'),
        onerror: (e) => { frame.classList.remove('loading'); e.target.replaceWith(h('div', { class: 'slide-missing muted', text: `Slide ${i} image is not available.` })); } });
      img.src = slideUrl(a.deck_id, i);
      frame.append(img, layer, margin);
      pages.append(h('section', { class: 'page', id: `slide-${i}`, 'data-n': i },
        h('div', { class: 'page-num muted mono', text: `${i}` }),
        frame,
        unplaced.length ? h('div', { class: 'unplaced' },
          h('span', { class: 'muted small', text: 'Not located on the slide:' }),
          h('div', { class: 'chips' }, unplaced.map((c) => claimChip(c, ctx())))) : null));
      outline.append(h('li', null, h('button', {
        class: 'oitem', type: 'button', onclick: () => document.getElementById(`slide-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      },
      h('span', { class: 'onum mono', text: String(i) }),
      h('span', { class: 'otitle', text: slideTitle(a.slides?.[i - 1], i) }),
      h('span', { class: 'ometa' }, dots(counts(cs))))));
    }
  }

  function pct(x) { return `${(Math.max(0, Math.min(1, Number(x) || 0)) * 100).toFixed(3)}%`; }

  function showTip(target, c) {
    tip.replaceChildren(h('span', { class: `vchip v-${verdictOf(c).key}` }, h('span', { class: 'dot' }), verdictOf(c).label), h('span', { class: 'tip-text', text: trunc(c.text, 140) }));
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const cr = center.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(r.left - cr.left, cr.width - 340))}px`;
    tip.style.top = `${r.bottom - cr.top + center.scrollTop + 8}px`;
  }

  function drawPinned() {
    const ps = [...ws.pins].map((id) => ws.claim(id)).filter(Boolean);
    pinned.replaceChildren(ps.length ? h('div', { class: 'pin-list' }, ps.map((c) => h('button', {
      class: `pin-item v-${verdictOf(c).key}`, type: 'button', onclick: () => openClaim(c.id), title: c.text,
    }, h('span', { class: 'dot' }), h('span', { class: 'pin-text', text: trunc(c.text, 60) }),
    c.slide != null ? h('span', { class: 'muted small num', text: `p.${c.slide}` }) : null))) : empty('Pin a claim card to keep it here.', 'small'));
  }

  function drawRight() {
    const c = selected ? ws.claim(selected) : null;
    right.replaceChildren(c ? renderClaimCard(c, ctx()) : renderAskFirst(a, ctx()));
    for (const r of pages.querySelectorAll('.hl.sel, .mmark.sel')) r.classList.remove('sel');
    if (c) for (const r of pages.querySelectorAll(`[data-id="${CSS.escape(c.id)}"]`)) r.classList.add('sel');
  }

  function openClaim(id) {
    selected = id;
    if (!a) return;
    drawRight();
    const c = id ? ws.claim(id) : null;
    if (c && c.source !== 'spoken' && c.slide) {
      const target = pages.querySelector(`.hl[data-id="${CSS.escape(id)}"]`) || document.getElementById(`slide-${c.slide}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function update(analysis) {
    a = analysis;
    if (!a) return;
    buildPages();
    drawPinned();
    drawRight();
  }

  function onKey(e) {
    if (e.key === 'Escape') openClaim(null);
  }

  return { el, update, openClaim, onKey };
}

export { icon };
