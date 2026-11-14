// Small helpers. Every piece of deck/transcript text goes through h() -> textContent, never innerHTML.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const VERDICTS = {
  contradicted: { key: 'contradicted', label: 'Contradicted', fill: '#ff5d5d', stroke: '#ffb0b0', ink: '#1c0606', glyph: '✕' },
  supported: { key: 'supported', label: 'Supported', fill: '#3ddc97', stroke: '#b4f3d9', ink: '#04210f', glyph: '✓' },
  unverified: { key: 'unverified', label: 'Unverified', fill: '#f5b83d', stroke: '#fbe0a1', ink: '#241800', glyph: '?' },
  missing: { key: 'missing', label: 'Missing', fill: '#1a2434', stroke: '#9aa9bd', ink: '#e8eef6', glyph: '–' },
};

export const verdictOf = (claim) => VERDICTS[claim?.check?.verdict] || VERDICTS.unverified;

export const CAT_LABEL = {
  market: 'Market', traction: 'Traction', growth: 'Growth', team: 'Team', competition: 'Competition',
  product: 'Product', financials: 'Financials', customers: 'Customers', ask: 'Ask', other: 'Other',
};
export const catLabel = (c) => CAT_LABEL[c] || String(c || 'other');

export function trunc(s, n) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Only http(s) links are ever made clickable (sources come from untrusted pages). */
export function safeUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}

export function toast(message, kind = 'error', ms = 12000) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: `toast ${kind}`, role: 'alert' },
    h('span', { class: 'toast-msg', text: String(message) }),
    h('button', { class: 'toast-x', 'aria-label': 'Dismiss', text: '×', onclick: () => el.remove() }));
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  if (ms) setTimeout(() => el.remove(), ms);
}
