// Light/dark theme: default follows prefers-color-scheme, the user's choice persists in localStorage.
const KEY = 'claimmap.theme';
const mq = window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme() {
  return document.documentElement.dataset.theme || 'light';
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* private mode */ }
  apply(saved === 'dark' || saved === 'light' ? saved : (mq?.matches ? 'dark' : 'light'));
  mq?.addEventListener?.('change', (e) => {
    let s = null;
    try { s = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!s) apply(e.matches ? 'dark' : 'light');
  });
}

let fadeT = null;
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  // cross-fade every surface/colour for one beat (CSS: html.theme-fade), only on an explicit toggle
  const root = document.documentElement;
  root.classList.add('theme-fade');
  clearTimeout(fadeT);
  fadeT = setTimeout(() => root.classList.remove('theme-fade'), 320);
  apply(next);
}
