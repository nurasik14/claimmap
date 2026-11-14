// Entry point: theme, optional dev mock (?mock=1), hash router.
//   #/            library
//   #/d/<id>/<tab> workspace (read | map | live | brief)
//   #<id>         legacy v1 link -> #/d/<id>/map
import { h, icon, initTooltips } from './util.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';
import { renderLibrary } from './library.js';
import { createWorkspace } from './workspace.js';

initTheme();
initTooltips();

const header = document.getElementById('topbar-main');
const root = document.getElementById('app');
const themeBtn = document.getElementById('theme-toggle');
let view = null; // { kind: 'library'|'ws', id, obj }

function drawThemeBtn() {
  const dark = currentTheme() === 'dark';
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  themeBtn.title = dark ? 'Switch to light theme (T)' : 'Switch to dark theme (T)';
  themeBtn.setAttribute('aria-label', themeBtn.title);
}
themeBtn.addEventListener('click', toggleTheme);
window.addEventListener('themechange', drawThemeBtn);
drawThemeBtn();
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 't' || e.key === 'T') toggleTheme();
});

function libraryHeader() {
  header.replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': 'ClaimMap home' },
      h('span', { class: 'brand-mark' }), h('span', { text: 'ClaimMap' })));
}

function route() {
  const raw = location.hash.replace(/^#/, '');
  if (raw && !raw.startsWith('/')) { // legacy #<id>
    location.replace(`#/d/${encodeURIComponent(decodeURIComponent(raw))}/map`);
    return;
  }
  const m = raw.match(/^\/d\/([^/]+)(?:\/(\w+))?\/?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const tab = m[2] || 'map';
    if (!view || view.kind !== 'ws' || view.id !== id) {
      view?.obj?.destroy?.();
      document.body.dataset.view = 'ws';
      view = { kind: 'ws', id, obj: createWorkspace(id, { header, root }) };
    }
    view.obj.show(tab);
    return;
  }
  if (raw && raw !== '/') { location.replace('#/'); return; }
  if (view?.kind !== 'library') {
    view?.obj?.destroy?.();
    document.body.dataset.view = 'library';
    libraryHeader();
    view = { kind: 'library', obj: renderLibrary(root) };
  }
}

async function boot() {
  if (new URLSearchParams(location.search).get('mock') === '1') {
    const mock = await import('./mock.js');
    await mock.install();
  }
  window.addEventListener('hashchange', route);
  route();
}
boot();
