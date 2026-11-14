// Thin fetch wrappers for the ClaimMap HTTP contract.

async function j(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText || `HTTP ${r.status}`;
    try {
      const b = await r.json();
      if (typeof b.detail === 'string') msg = b.detail;
      else if (b.detail) msg = JSON.stringify(b.detail);
    } catch { /* keep status text */ }
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export function uploadDeck(file) {
  const fd = new FormData();
  fd.append('file', file);
  return j('/api/deck', { method: 'POST', body: fd });
}
export const getDeck = (id) => j('/api/deck/' + encodeURIComponent(id));
export const listDecks = () => j('/api/decks');
export const demoAudio = () => j('/api/demo-audio');
