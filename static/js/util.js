// Small helpers. Every piece of deck/transcript text goes through h() -> textContent, never innerHTML.
// Colours are NEVER hard-coded here: verdicts map to CSS classes (v-<verdict>) that set --v from tokens.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** Static stroke icons (our own constant path data, never user data). */
const ICONS = {
  back: 'M15 18l-6-6 6-6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  pin: 'M9 4h6l-1 6 4 4H6l4-4zM12 14v7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6 6 18',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  play: 'M7 5v14l11-7z',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12l5 5 9-10',
  map: 'M12 5a2 2 0 1 0 0 .01M5 17a2 2 0 1 0 0 .01M19 17a2 2 0 1 0 0 .01M11 7l-5 8M13 7l5 8M7 17h10',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  send: 'M4 12l16-8-6 16-3-7z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  pdf: 'M7 3h7l5 5v13H7zM14 3v5h5M9.5 16v-4h1.5a1.25 1.25 0 0 1 0 2.5H9.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  share: 'M12 15V3M7 8l5-5 5 5M5 12v8h14v-8',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4',
};
export function icon(name, size = 18) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.5');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('icon');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', ICONS[name] || '');
  s.append(p);
  return s;
}

export const VERDICTS = {
  contradicted: { key: 'contradicted', label: 'Contradicted', token: '--red' },
  supported: { key: 'supported', label: 'Supported', token: '--accent' },
  unverified: { key: 'unverified', label: 'Unverified', token: '--amber' },
  missing: { key: 'missing', label: 'Missing', token: '--grey' },
};
export const VERDICT_ORDER = ['contradicted', 'unverified', 'supported', 'missing'];
export const verdictKey = (claim) => (VERDICTS[claim?.check?.verdict] ? claim.check.verdict : 'unverified');
export const verdictOf = (claim) => VERDICTS[verdictKey(claim)];

/** Read a design token (CSS custom property) from the current theme. */
export function token(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const CAT_LABEL = {
  market: 'Market', traction: 'Traction', growth: 'Growth', team: 'Team', competition: 'Competition',
  product: 'Product', financials: 'Financials', customers: 'Customers', ask: 'Ask', other: 'Other',
};
export const catLabel = (c) => CAT_LABEL[c] || String(c || 'other');

export const MODE_LABEL = { deck: 'Deck only', live: 'Pitch only', 'deck+live': 'Deck + pitch' };
/** How the spoken pitch was captured (orchestrator addition). */
export const CAPTURE_LABEL = { live_mic: 'Live transcribed', recording: 'Recorded pitch', text: 'Typed transcript' };

export function trunc(s, n) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Only http(s) links are ever made clickable (sources come from untrusted pages). */
export function safeUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}

export function counts(claims) {
  const c = { contradicted: 0, supported: 0, unverified: 0, missing: 0 };
  for (const cl of claims || []) c[verdictKey(cl)]++;
  return c;
}

export function dots(cnt, { zeros = false, animate = true } = {}) {
  return h('span', { class: 'dots' }, VERDICT_ORDER.filter((k) => zeros || cnt?.[k]).map((k) =>
    h('span', { class: `dotn v-${k}`, title: `${VERDICTS[k].label}: ${cnt?.[k] || 0}` },
      h('span', { class: 'dot' }), counter(cnt?.[k] || 0, animate))));
}

/** A number that counts up when it first appears. */
export function counter(n, animate = true) {
  const s = h('span', { class: 'num', text: String(n) });
  if (animate && typeof requestAnimationFrame !== 'undefined') { s.textContent = '0'; countUp(s, n, { ms: 600 }); }
  return s;
}

export function verdictChip(claim, big = false) {
  const v = verdictOf(claim);
  return h('span', { class: `vchip v-${v.key}${big ? ' big' : ''}` }, h('span', { class: 'dot' }), v.label);
}

export function liveBadge(text = 'LIVE') {
  return h('span', { class: 'live-badge', title: 'Said during the live pitch' }, h('span', { class: 'live-dot' }), text);
}

export function toast(message, kind = 'error', ms = 7000) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-msg', text: String(message) }),
    h('button', { class: 'icon-btn toast-x', 'aria-label': 'Dismiss', onclick: () => leave(el) }, icon('close', 16)));
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  if (ms) setTimeout(() => leave(el), ms);
}

/** Remove an element after its exit animation (instant under reduced motion). */
function leave(el) {
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 190);
}

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animate a number in `el` from its current value (or 0) to `to` (ease-out, ~600 ms). */
export function countUp(el, to, { ms = 650, decimals = 0 } = {}) {
  const target = Number(to) || 0;
  const fmt = (v) => v.toFixed(decimals);
  if (reducedMotion() || typeof requestAnimationFrame === 'undefined') { el.textContent = fmt(target); return; }
  const from = Number(el.dataset.v ?? 0) || 0;
  el.dataset.v = String(target);
  if (from === target) { el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (target - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = fmt(from);
  requestAnimationFrame(step);
}

/** Score 0..100 -> verdict-ish colour class (holds up / mixed / weak). */
export function scoreClass(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'v-missing';
  return n >= 70 ? 'v-supported' : n >= 40 ? 'v-unverified' : 'v-contradicted';
}

/** Ring dial 0..100 with an animated arc and a counting number in the centre. */
export function scoreDial(value, { size = 44, stroke = 4, cls = '', animate = true } = {}) {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');
  const mk = (c) => {
    const e = document.createElementNS(SVGNS, 'circle');
    e.setAttribute('cx', size / 2); e.setAttribute('cy', size / 2); e.setAttribute('r', r);
    e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', stroke); e.setAttribute('class', c);
    return e;
  };
  const track = mk('track');
  const arc = mk('arc');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', C.toFixed(2));
  arc.setAttribute('stroke-dashoffset', C.toFixed(2));
  svg.append(track, arc);
  const val = h('span', { class: 'val', text: '0' });
  const el = h('span', { class: `dial ${scoreClass(n)} ${cls}`, role: 'img', 'aria-label': `ClaimMap score ${Math.round(n)} of 100` }, svg, val);
  const go = () => { arc.style.strokeDashoffset = (C * (1 - n / 100)).toFixed(2); countUp(val, Math.round(n), { ms: 900 }); };
  if (!animate || reducedMotion() || typeof requestAnimationFrame === 'undefined') { arc.setAttribute('stroke-dashoffset', (C * (1 - n / 100)).toFixed(2)); val.textContent = String(Math.round(n)); } else requestAnimationFrame(() => requestAnimationFrame(go));
  return el;
}

/** Button feedback while an async action runs: spinner + disabled, restored afterwards. */
export async function busy(button, fn) {
  if (!button) return fn();
  button.classList.add('busy');
  button.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { button.classList.remove('busy'); button.removeAttribute('aria-busy'); }
}

/**
 * Delayed tooltips: any element with a `title` gets a styled tip after ~350 ms hover (or on keyboard focus).
 * The title is parked in data-tip while hovered so the native tooltip does not double up.
 */
export function initTooltips() {
  if (typeof document === 'undefined' || document.body.dataset.tips) return;
  document.body.dataset.tips = '1';
  const tip = h('div', { class: 'tip', role: 'tooltip' });
  document.body.append(tip);
  let timer = null;
  let cur = null;
  const hide = () => {
    clearTimeout(timer);
    tip.classList.remove('on');
    if (cur && cur.dataset.tip != null) { cur.setAttribute('title', cur.dataset.tip); delete cur.dataset.tip; }
    cur = null;
  };
  const show = (el) => {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    tip.textContent = text;
    const r = el.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top = r.bottom + 8;
    if (top + th > innerHeight - 8) top = r.top - th - 8;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
    tip.style.top = `${Math.max(8, top)}px`;
    tip.classList.add('on');
  };
  const enter = (e) => {
    const el = e.target.closest?.('[title]');
    if (!el || el === cur || el.closest('.graph-canvas')) return;
    hide();
    cur = el;
    el.dataset.tip = el.getAttribute('title');
    el.removeAttribute('title');
    timer = setTimeout(() => show(el), e.type === 'focusin' ? 0 : 350);
  };
  document.addEventListener('pointerover', enter);
  document.addEventListener('focusin', (e) => { if (e.target.matches?.(':focus-visible')) enter(e); });
  document.addEventListener('pointerout', (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

export function empty(text, cls = '') {
  return h('div', { class: `empty ${cls}`, text });
}

/** Slide title = first non-empty line of the slide text (bullets stripped). */
export function slideTitle(text, n) {
  const line = String(text || '').split('\n').map((s) => s.replace(/^[-•*\s]+/, '').trim()).find(Boolean);
  return line ? trunc(line, 48) : `Slide ${n}`;
}

export function btn(label, opts = {}) {
  const { kind = 'ghost', iconName, title, onclick, disabled, cls = '' } = opts;
  return h('button', { class: `btn ${kind} ${cls}`, title, onclick, disabled, type: 'button' },
    iconName ? icon(iconName, 16) : null, label ? h('span', { text: label }) : null);
}

export function modal({ title, body, actions }) {
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } });
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.append(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { text: title }), body, h('div', { class: 'modal-actions' }, actions(close))));
  document.body.append(back);
  return close;
}
