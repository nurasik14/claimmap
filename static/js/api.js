// Fetch wrappers for the ClaimMap HTTP contract (CONTRACT-v2).
// Errors carry .status and .notAvailable (route not built yet on the server: 404 "Not Found" or 405).

let mock = null; // set by mock.js when the page is opened with ?mock=1
export function useMock(m) { mock = m; }
export const isMock = () => !!mock;

async function req(url, opts, kind = 'json') {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText || `HTTP ${r.status}`;
    let detail = null;
    try {
      const b = await r.json();
      detail = b.detail;
      if (typeof b.detail === 'string') msg = b.detail;
      else if (b.detail) msg = JSON.stringify(b.detail);
    } catch { /* keep status text */ }
    const err = new Error(msg);
    err.status = r.status;
    err.notAvailable = r.status === 405 || (r.status === 404 && (detail === 'Not Found' || detail == null));
    if (err.notAvailable) err.message = 'This feature is not available on the server yet.';
    throw err;
  }
  return kind === 'text' ? r.text() : r.json();
}

const enc = encodeURIComponent;
const jsonPost = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function uploadDeck(file) {
  const fd = new FormData();
  fd.append('file', file);
  return req('/api/deck', { method: 'POST', body: fd });
}
export const getDeck = (id) => req('/api/deck/' + enc(id));
export const listDecks = () => req('/api/decks');
export const deleteDeck = (id) => req('/api/deck/' + enc(id), { method: 'DELETE' });
export const createSession = (title) => req('/api/session', jsonPost({ title }));
export const finalize = (id) => req(`/api/deck/${enc(id)}/finalize`, { method: 'POST' });
export const getBrief = (id, refresh = false) => req(`/api/deck/${enc(id)}/brief${refresh ? '?refresh=1' : ''}`);
export const getBriefMd = (id) => req(`/api/deck/${enc(id)}/brief.md`, undefined, 'text');
export const demoAudio = () => req('/api/demo-audio');

export function slideUrl(id, n) {
  if (mock?.slideUrl) {
    const u = mock.slideUrl(id, n);
    if (u) return u;
  }
  return `/api/deck/${enc(id)}/slides/${n}.png`;
}
