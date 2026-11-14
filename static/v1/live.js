// Live panel: WebSocket session, microphone, replay, typed fallback, transcript and spoken-claim feed.
import { h, toast, trunc, fmtTime } from './util.js';
import { startMic, MicError } from './mic.js';
import { demoAudio } from './api.js';

const STATE_LABEL = {
  listening: 'Listening', transcribing: 'Transcribing…', analyzing: 'Analysing…', idle: 'Idle', stopped: 'Stopped',
};
const MAX_FEED = 80;
const MAX_TRANSCRIPT = 300;

export function createLive({ root, getClaim, onSpoken, onQuestion, onFocusClaim }) {
  const $ = (id) => root.querySelector('#' + id);
  const els = {
    conn: $('conn-pill'), state: $('state-pill'), reconnect: $('btn-reconnect'),
    micStart: $('btn-mic-start'), micStop: $('btn-mic-stop'), meter: $('meter-fill'),
    file: $('replay-file'), speed: $('replay-speed'), replay: $('btn-replay'),
    form: $('text-form'), input: $('text-input'), help: $('mic-help'),
    feed: $('spoken-feed'), transcript: $('transcript'),
    driftBox: $('drift-box'), driftList: $('drift-list'), driftCount: $('drift-count'),
    audio: $('replay-audio'),
  };
  let driftN = 0;
  let replaying = false;
  let deckId = null;
  let ws = null;
  let everOpened = false;
  let mic = null;
  let micBusy = false;
  let audioLoaded = false;

  const isOpen = () => ws && ws.readyState === WebSocket.OPEN;

  function setConn(text, cls) {
    els.conn.textContent = text;
    els.conn.className = `pill ${cls}`;
  }

  function resetDrift() {
    driftN = 0;
    els.driftList.replaceChildren(h('div', { class: 'drift-none muted', text: 'No drift yet. When the founder contradicts the deck, it shows here.' }));
    els.driftBox.classList.add('empty');
    els.driftCount.hidden = true;
  }

  function resetUi() {
    stopAudio();
    resetDrift();
    els.feed.replaceChildren(emptyFeed());
    els.transcript.replaceChildren(h('div', { class: 'muted', text: 'Waiting for speech…' }));
    els.state.hidden = true;
    els.help.hidden = true;
    els.reconnect.hidden = true;
    setConn('Not connected', 'off');
    setMicUi(false);
    setLevel(0);
  }

  function emptyFeed() {
    return h('div', { class: 'feed-empty muted', text: 'Nothing heard yet. Start the mic, replay the demo audio, or type a line.' });
  }

  function setDeck(id) {
    disconnect();
    deckId = id;
    resetUi();
  }

  // ---- connection ----
  function connect() {
    if (!deckId) return;
    teardownSocket();
    els.reconnect.hidden = true;
    els.help.hidden = true;
    setConn('Connecting…', 'wait');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let sock;
    try {
      sock = new WebSocket(`${proto}//${location.host}/ws/live/${encodeURIComponent(deckId)}`);
    } catch (e) {
      setConn('Connection failed', 'bad');
      els.reconnect.hidden = false;
      return;
    }
    sock.binaryType = 'arraybuffer';
    ws = sock;
    everOpened = false;
    sock.onopen = () => { everOpened = true; setConn('Connected', 'ok'); };
    sock.onmessage = (m) => {
      if (typeof m.data !== 'string') return;
      let ev;
      try { ev = JSON.parse(m.data); } catch { return; }
      handle(ev);
    };
    sock.onclose = () => {
      if (ws !== sock) return; // superseded by a newer socket
      stopMic(false);
      stopAudio();
      setConn(everOpened ? 'Disconnected' : 'Live server unreachable', 'bad');
      els.state.hidden = true;
      els.reconnect.hidden = false;
      if (!everOpened) toast('Could not open the live connection. Check the server, then press Reconnect.');
    };
    sock.onerror = () => { /* onclose follows and reports it */ };
  }

  function teardownSocket() {
    if (!ws) return;
    const s = ws;
    ws = null;
    s.onclose = s.onmessage = s.onerror = s.onopen = null;
    try { s.close(); } catch { /* ignore */ }
  }

  function disconnect() {
    stopMic(false);
    stopAudio();
    teardownSocket();
  }

  /** Called when the Live tab is shown: connect once, load demo audio list once. */
  function activate() {
    if (!deckId) return;
    if (!ws) connect();
    if (!audioLoaded) loadAudio();
  }

  async function ensureOpen() {
    if (isOpen()) return true;
    if (!ws || ws.readyState === WebSocket.CLOSED) connect();
    const sock = ws;
    if (!sock) return false;
    return new Promise((resolve) => {
      const t0 = Date.now();
      const poll = () => {
        if (ws !== sock) resolve(false);
        else if (sock.readyState === WebSocket.OPEN) resolve(true);
        else if (sock.readyState === WebSocket.CLOSED || Date.now() - t0 > 4000) resolve(false);
        else setTimeout(poll, 80);
      };
      poll();
    });
  }

  async function send(obj) {
    if (!(await ensureOpen())) {
      toast('Not connected to the live server. Press Reconnect.');
      return false;
    }
    ws.send(JSON.stringify(obj));
    return true;
  }

  // ---- events ----
  function handle(ev) {
    switch (ev?.type) {
      case 'transcript': addTranscript(ev); break;
      case 'spoken_claim': addSpoken(ev); break;
      case 'question':
        if (ev.question) {
          addFeedLine('new', 'New question', ev.question.text || '');
          onQuestion?.(ev.question);
        }
        break;
      case 'status': {
        els.state.hidden = false;
        els.state.textContent = STATE_LABEL[ev.state] || ev.state || '';
        if (ev.detail) els.state.title = ev.detail;
        els.state.className = `pill state-${ev.state}`;
        break;
      }
      case 'error': toast(ev.message || 'Live error'); break;
      default: break;
    }
  }

  function addTranscript(ev) {
    const first = els.transcript.firstElementChild;
    if (first && first.classList.contains('muted')) els.transcript.replaceChildren();
    els.transcript.append(h('div', { class: 'tline' },
      h('span', { class: 'tt', text: fmtTime(ev.t0) }), h('span', { text: ev.text || '' })));
    while (els.transcript.children.length > MAX_TRANSCRIPT) els.transcript.firstElementChild.remove();
    els.transcript.scrollTop = els.transcript.scrollHeight;
  }

  function pushFeed(node) {
    const first = els.feed.firstElementChild;
    if (first && first.classList.contains('feed-empty')) els.feed.replaceChildren();
    els.feed.prepend(node); // newest on top so alerts are never below the fold
    while (els.feed.children.length > MAX_FEED) els.feed.lastElementChild.remove();
    els.feed.scrollTop = 0;
  }

  function addFeedLine(kind, label, text) {
    pushFeed(h('div', { class: `fline ${kind}` }, h('span', { class: 'fl-tag', text: label }), h('span', { class: 'fl-text', text })));
  }

  function addSpoken(ev) {
    const dc = ev.deck_claim_id ? getClaim?.(ev.deck_claim_id) : null;
    const said = ev.quote || '';
    if (ev.relation === 'drift') {
      const deckLine = dc
        ? `Deck${dc.slide != null ? ` (slide ${dc.slide})` : ''}: ${dc.text}`
        : 'Deck: (matching claim not found)';
      const card = h('button', { class: 'drift-card', title: 'Show this claim in the graph', onclick: () => dc && onFocusClaim?.(dc.id) },
        h('span', { class: 'drift-tag', text: 'DRIFT' }),
        h('span', { class: 'drift-time muted', text: fmtTime(ev.t) }),
        h('span', { class: 'drift-deck', text: deckLine }),
        h('span', { class: 'drift-said', text: `Said: ${said}` }),
        ev.note ? h('span', { class: 'drift-note', text: ev.note }) : null);
      // drift gets its own pinned section above the feed, newest first
      if (driftN === 0) els.driftList.replaceChildren();
      driftN++;
      els.driftList.prepend(card);
      els.driftList.scrollTop = 0;
      els.driftBox.classList.remove('empty');
      els.driftCount.textContent = String(driftN);
      els.driftCount.hidden = false;
    } else if (ev.relation === 'consistent') {
      addFeedLine('ok', '✓ Consistent', dc ? `“${trunc(said, 90)}” matches deck: ${trunc(dc.text, 60)}` : `“${trunc(said, 120)}”`);
    } else {
      addFeedLine('new', 'New claim', `“${trunc(said, 140)}”${ev.note ? ` — ${trunc(ev.note, 100)}` : ''}`);
    }
    onSpoken?.(ev, dc);
  }

  // ---- microphone ----
  function setMicUi(running) {
    els.micStart.disabled = running || micBusy;
    els.micStop.disabled = !running && !replaying;
    els.micStart.textContent = running ? 'Listening…' : 'Start mic';
  }

  // ---- audible replay ----
  function stopAudio() {
    replaying = false;
    const a = els.audio;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    if (els.micStop) els.micStop.disabled = !mic;
  }

  async function playAudio(file, speed) {
    const a = els.audio;
    if (!a) return;
    a.src = `/demo-audio/${encodeURIComponent(file)}`;
    a.defaultPlaybackRate = speed;
    a.playbackRate = speed;
    replaying = true;
    els.micStop.disabled = false;
    try {
      await a.play();
    } catch (e) {
      replaying = false;
      els.micStop.disabled = !mic;
      toast(`Could not play the audio in the browser (${e?.message || e}). The analysis still runs.`, 'info', 6000);
    }
  }

  function setLevel(rms) {
    // map -60 dB..0 dB onto 0..100 %
    const db = rms > 0 ? 20 * Math.log10(rms) : -90;
    els.meter.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100)).toFixed(0)}%`;
  }

  function showMicHelp(err) {
    const lines = {
      denied: 'Microphone permission was denied. Click the lock/camera icon in the address bar, set Microphone to Allow, then reload and press Start mic.',
      nodevice: 'No microphone was found. Plug one in (or pick one in your system sound settings) and try again.',
      unsupported: 'This page cannot use the microphone (browsers only allow it on https:// or http://localhost).',
      failed: `The microphone could not be started: ${err.message}`,
    };
    els.help.textContent = `${lines[err.code] || lines.failed} You can still use Replay or the typed line below.`;
    els.help.hidden = false;
  }

  async function startMicClicked() {
    if (mic || micBusy) return;
    els.help.hidden = true;
    micBusy = true;
    setMicUi(false);
    try {
      if (!(await ensureOpen())) { toast('Not connected to the live server. Press Reconnect.'); return; }
      mic = await startMic({
        onPcm: (buf) => { if (isOpen() && ws.bufferedAmount < 1_000_000) ws.send(buf); },
        onLevel: setLevel,
      });
    } catch (e) {
      showMicHelp(e instanceof MicError ? e : new MicError('failed', e?.message || String(e)));
    } finally {
      micBusy = false;
      setMicUi(!!mic);
    }
  }

  function stopMic(notify = true) {
    if (mic) { mic.stop(); mic = null; }
    setMicUi(false);
    setLevel(0);
    if (notify && isOpen()) ws.send(JSON.stringify({ type: 'stop' }));
  }

  // ---- replay + typed ----
  async function loadAudio() {
    audioLoaded = true;
    els.file.replaceChildren();
    try {
      const files = await demoAudio();
      if (!Array.isArray(files) || !files.length) throw new Error('none');
      for (const f of files) els.file.append(h('option', { value: f, text: f }));
      els.replay.disabled = false;
    } catch {
      els.file.append(h('option', { value: '', text: 'No demo audio found' }));
      els.replay.disabled = true;
      audioLoaded = false; // retry next time the tab opens
    }
  }

  els.micStart.addEventListener('click', startMicClicked);
  els.micStop.addEventListener('click', () => {
    stopAudio();
    stopMic(true); // also tells the server to stop (replay or mic)
  });
  els.audio.addEventListener('ended', () => { replaying = false; els.micStop.disabled = !mic; });
  els.reconnect.addEventListener('click', connect);
  els.replay.addEventListener('click', async () => {
    const file = els.file.value;
    if (!file) return;
    const speed = Number(els.speed.value) || 1;
    stopAudio(); // a second Replay restarts the sound together with the server-side replay
    if (await send({ type: 'replay', file, speed })) await playAudio(file, speed);
  });
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    if (await send({ type: 'text', text })) els.input.value = '';
  });

  resetUi();
  return { setDeck, activate, disconnect, connect };
}
