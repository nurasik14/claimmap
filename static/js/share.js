// v4: share + delete actions for a deck, used by library cards ("..." menu) and the workspace top bar.
// Every item does real work: copy the deck link, download the Brief (.md) / data (.json), native share, delete.
import { h, icon, btn, toast, modal, busy } from './util.js';
import { getDeck, getBriefMd, deleteDeck } from './api.js';

export const deckLink = (id) => `${location.origin}/#/d/${encodeURIComponent(id)}`;
const fileBase = (title) => String(title || 'claimmap').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'claimmap';

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  // Fallback (plain http on a LAN IP): a selected, read-only text input + execCommand('copy').
  const ta = h('input', { type: 'text', value: text, readonly: true, style: { position: 'fixed', top: '-1000px', opacity: '0' } });
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export async function copyLink(id) {
  const link = deckLink(id);
  if (await copyText(link)) { toast('Link copied', 'info', 2500); return; }
  // Last resort: show the link selected so it can be copied by hand.
  const input = h('input', { class: 'input', type: 'text', value: link, readonly: true, 'aria-label': 'Deck link' });
  modal({ title: 'Copy this link', body: h('div', null, h('p', { class: 'muted', text: 'Your browser blocked the clipboard. Press Ctrl+C to copy.' }), input),
    actions: (close) => [btn('Done', { kind: 'primary', onclick: close })] });
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadBrief(id, title) {
  try {
    toast('Writing the Brief… (can take a few seconds)', 'info', 2500);
    download(await getBriefMd(id), `${fileBase(title)}-brief.md`, 'text/markdown');
  } catch (e) { toast(e.notAvailable ? 'Markdown export is not available on the server yet.' : `Download failed: ${e.message}`); }
}

export async function downloadJson(id, title) {
  try {
    const a = await getDeck(id);
    download(JSON.stringify(a, null, 2), `${fileBase(title)}-claimmap.json`, 'application/json');
  } catch (e) { toast(`Download failed: ${e.message}`); }
}

export async function nativeShare(id, title) {
  try { await navigator.share({ title: `${title} · ClaimMap`, text: `ClaimMap analysis: ${title}`, url: deckLink(id) }); }
  catch (e) { if (e?.name !== 'AbortError') copyLink(id); }
}

/** The existing confirm modal + deleteDeck. onDeleted runs after a successful delete. */
export function confirmDelete({ id, title }, onDeleted) {
  modal({
    title: 'Delete this deck?',
    body: h('p', { text: `“${title}” and its analysis will be removed. This cannot be undone.` }),
    actions: (close) => [
      btn('Cancel', { onclick: close }),
      btn('Delete', { kind: 'danger', iconName: 'trash', onclick: (ev) => busy(ev.currentTarget, async () => {
        try {
          await deleteDeck(id);
          toast('Deleted.', 'info', 3000);
          onDeleted?.();
        } catch (e) { toast(e.notAvailable ? 'Delete is not available on the server yet.' : `Delete failed: ${e.message}`); }
        close();
      }) }),
    ],
  });
}

/** Menu items for one deck. */
export function deckActions({ id, title }, { onDeleted } = {}) {
  const items = [
    { label: 'Copy link', iconName: 'link', run: () => copyLink(id) },
    typeof navigator !== 'undefined' && navigator.share ? { label: 'Share…', iconName: 'share', run: () => nativeShare(id, title) } : null,
    { sep: true },
    { label: 'Download Brief (.md)', iconName: 'doc', run: () => downloadBrief(id, title) },
    { label: 'Download data (.json)', iconName: 'download', run: () => downloadJson(id, title) },
    { sep: true },
    { label: 'Delete', iconName: 'trash', danger: true, run: () => confirmDelete({ id, title }, onDeleted) },
  ];
  return items.filter(Boolean);
}

// ---- one floating menu at a time, anchored to its trigger button ----
let openMenu = null;
function closeMenu() {
  if (!openMenu) return;
  const { el, anchor, onDoc, onKey } = openMenu;
  el.remove();
  anchor.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onDoc, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
  openMenu = null;
}

export function showMenu(anchor, items) {
  const same = openMenu?.anchor === anchor;
  closeMenu();
  if (same) return;
  const el = h('div', { class: 'pop-menu', role: 'menu' }, items.map((it) => (it.sep
    ? h('div', { class: 'pop-sep', role: 'separator' })
    : h('button', { class: `menu-item${it.danger ? ' danger' : ''}`, type: 'button', role: 'menuitem',
      onclick: (e) => { e.stopPropagation(); closeMenu(); it.run(); } }, icon(it.iconName, 16), h('span', { text: it.label })))));
  el.addEventListener('click', (e) => e.stopPropagation());
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, ht = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + ht > innerHeight - 8) top = Math.max(8, r.top - ht - 6);
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  anchor.setAttribute('aria-expanded', 'true');
  const onDoc = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  const onKey = (e) => {
    const btns = [...el.querySelectorAll('.menu-item')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeMenu(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === 'Tab') closeMenu();
  };
  openMenu = { el, anchor, onDoc, onKey };
  document.addEventListener('pointerdown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  el.querySelector('.menu-item')?.focus({ preventScroll: true });
}
export { closeMenu };

/** Round "..." trigger button for a deck's menu. */
export function moreButton(deck, opts = {}) {
  const get = () => (typeof deck === 'function' ? deck() : deck);
  const b = h('button', { class: `icon-btn more-btn ${opts.cls || ''}`, type: 'button', 'aria-label': typeof deck === 'function' ? 'More actions' : `More actions for ${deck.title}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Share, download or delete',
    onclick: (e) => { e.stopPropagation(); showMenu(b, deckActions(get(), opts)); },
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); } }, icon('more', 18));
  return b;
}
