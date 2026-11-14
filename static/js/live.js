// Live tab: mic / replay (audible) / typed line, drift alerts, transcript; live mini-map + questions feed.
import { h, btn, icon, toast, trunc, fmtTime, empty, liveBadge, verdictOf, busy } from './util.js';
import { startMic, MicError } from './mic.js';
import { demoAudio, slideUrl } from './api.js';
import { createGraph } from './graphview.js';

const STATE_LABEL = { listening: 'Listening', transcribing: 'Transcribing…', analyzing: 'Analysing…', idle: 'Idle', stopped: 'Stopped' };
const MAX_TRANSCRIPT = 400;

export function createLive(ws) {
  let a = null;
  let sock = null;
  let everOpened = false;
  let mic = null;
  let micBusy = false;
  let replaying = false;
  let audioLoaded = false;
  let graph = null;
  let graphBuilt = false;
  let driftN = 0;
  let heardSomething = false;
  const spokenT = new Map(); // spoken claim id -> t

  // ---- left column ----
  const connPill = h('span', { class: 'pill off', text: 'Not connected' });
  const statePill = h('span', { class: 'pill', hidden: true });
  const reconnectBtn = btn('Reconnect', { iconName: 'refresh', onclick: () => connect() });
  reconnectBtn.hidden = true;
  const micStart = btn('Start mic', { kind: 'primary', iconName: 'mic', cls: 'big', title: 'Listen with your microphone (M)', onclick: () => startMicClicked() });
  const stopBtn = btn('Stop', { kind: 'secondary', iconName: 'stop', cls: 'big', title: 'Stop listening / replay (S)', onclick: () => stopAll() });
  stopBtn.disabled = true;
  const clearBtn = btn('Clear pitch', { iconName: 'trash', title: 'Remove what was said live and pitch again (the deck stays)', onclick: () => clearPitch() });
  async function clearPitch() {
    if (!window.confirm('Clear the live pitch? The transcript, spoken claims, drift alerts and live questions are removed. The deck and its checks stay.')) return;
    try { stopAll(); } catch { /* not running */ }
    try { teardown(); } catch { /* no socket */ }
    const r = await fetch(`/api/deck/${encodeURIComponent(ws.analysis?.deck_id || '')}/clear_live`, { method: 'POST' });
    if (!r.ok) { toast(r.status === 409 ? 'Still checking. Try again in a few seconds.' : `Clear failed (${r.status})`); return; }
    toast('Live pitch cleared. Ready to pitch again.', 'info', 2500);
    setTimeout(() => location.reload(), 400);
  }
  const meterFill = h('div', { class: 'meter-fill' });
  const wave = h('span', { class: 'wave', 'aria-hidden': 'true', title: 'Listening' }, h('i'), h('i'), h('i'), h('i'), h('i'));
  const fileSel = h('select', { class: 'input', 'aria-label': 'Demo audio file' });
  const speedSel = h('select', { class: 'input', 'aria-label': 'Replay speed' }, ['1', '1.25', '1.5', '2'].map((s) => h('option', { value: s, text: `${s}×` })));
  const replayBtn = btn('Replay demo', { iconName: 'play', title: 'Play a recorded pitch and analyse it as if it were live', onclick: () => busy(replayBtn, replay) });
  const textIn = h('input', { class: 'input grow', type: 'text', placeholder: 'Or type what the founder says…', 'aria-label': 'Typed transcript line' });
  const textForm = h('form', { class: 'typed', onsubmit: (e) => { e.preventDefault(); sendText(); } }, textIn, btn('', { iconName: 'send', title: 'Send line (Enter)' }));
  textForm.querySelector('button').type = 'submit';
  const micHelp = h('p', { class: 'notice', hidden: true });
  const audio = h('audio', { preload: 'none' });
  const ctaBox = h('div', { class: 'cta', hidden: true });
  const driftList = h('div', { class: 'drift-list' });
  const driftCount = h('span', { class: 'count-badge', hidden: true });
  const transcript = h('div', { class: 'transcript', 'aria-live': 'polite' });

  const left = h('section', { class: 'live-left' },
    h('div', { class: 'live-controls' },
      h('div', { class: 'row' }, micStart, stopBtn, wave, h('div', { class: 'meter', title: 'Input level' }, meterFill)),
      h('div', { class: 'row' }, fileSel, speedSel, replayBtn),
      textForm, micHelp,
      h('div', { class: 'row pills' }, connPill, statePill, reconnectBtn, h('div', { class: 'grow' }), clearBtn)),
    ctaBox,
    h('div', { class: 'drift-box' }, h('h3', { class: 'sec-h' }, 'Drift alerts ', driftCount), driftList),
    h('div', { class: 'transcript-box' }, h('h3', { class: 'sec-h', text: 'Transcript' }), transcript),
    audio);

  // ---- right column ----
  const miniCanvas = h('div', { class: 'graph-canvas mini' });
  const miniSel = h('div', { class: 'mini-sel muted small', text: 'Hover a node to see what it connects to.' });
  const nowBox = h('div', { class: 'now', hidden: true });
  const qFeed = h('div', { class: 'qfeed' });
  const right = h('section', { class: 'live-right' },
    nowBox,
    h('div', { class: 'mini-wrap' }, miniCanvas),
    miniSel,
    h('h3', { class: 'sec-h' }, 'Questions ', liveBadge()),
    qFeed);

  const el = h('div', { class: 'live' }, left, right);

  function resetLists() {
    driftN = 0;
    driftList.replaceChildren(empty('No drift yet. When the founder contradicts the deck or themselves, it shows here.', 'small'));
    driftCount.hidden = true;
    qFeed.replaceChildren(empty('Questions to ask appear here while the founder talks.', 'small'));
  }
  resetLists();

  // ---- socket ----
  const isOpen = () => sock && sock.readyState === WebSocket.OPEN;
  function setConn(text, cls) { connPill.textContent = text; connPill.className = `pill ${cls}`; }

  function connect() {
    teardown();
    reconnectBtn.hidden = true;
    setConn('Connecting…', 'wait');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let s;
    try { s = new WebSocket(`${proto}//${location.host}/ws/live/${encodeURIComponent(ws.id)}`); } catch {
      setConn('Connection failed', 'bad'); reconnectBtn.hidden = false; return;
    }
    s.binaryType = 'arraybuffer';
    sock = s;
    everOpened = false;
    s.onopen = () => { everOpened = true; setConn('Connected', 'ok'); };
    s.onmessage = (m) => {
      if (typeof m.data !== 'string') return;
      let ev;
      try { ev = JSON.parse(m.data); } catch { return; }
      handle(ev);
    };
    s.onclose = () => {
      if (sock !== s) return;
      stopMic(false);
      stopAudio();
      setConn(everOpened ? 'Disconnected' : 'Live server unreachable', 'bad');
      statePill.hidden = true;
      reconnectBtn.hidden = false;
      if (!everOpened) toast('Could not open the live connection. Check the server, then press Reconnect.');
    };
  }
  function teardown() {
    if (!sock) return;
    const s = sock;
    sock = null;
    s.onclose = s.onmessage = s.onerror = s.onopen = null;
    try { s.close(); } catch { /* ignore */ }
  }
  async function ensureOpen() {
    if (isOpen()) return true;
    if (!sock || sock.readyState === WebSocket.CLOSED) connect();
    const s = sock;
    return new Promise((resolve) => {
      const t0 = Date.now();
      const poll = () => {
        if (sock !== s) resolve(false);
        else if (s.readyState === WebSocket.OPEN) resolve(true);
        else if (s.readyState === WebSocket.CLOSED || Date.now() - t0 > 4000) resolve(false);
        else setTimeout(poll, 80);
      };
      poll();
    });
  }
  async function send(obj) {
    if (!(await ensureOpen())) { toast('Not connected to the live server. Press Reconnect.'); return false; }
    sock.send(JSON.stringify(obj));
    return true;
  }

  // ---- events ----
  function handle(ev) {
    switch (ev?.type) {
      case 'transcript': addTranscript(ev.text, ev.t0); heardSomething = true; break;
      case 'spoken_claim': addSpoken(ev); break;
      case 'claim_added': if (ev.claim) addClaim(ev.claim); break;
      case 'question': if (ev.question) addQuestion(ev.question, true); break;
      case 'score': if (ev.score) ws.setScore(ev.score); break;
      case 'checking': showChecking(ev.detail); break;
      case 'status':
        statePill.hidden = false;
        statePill.textContent = STATE_LABEL[ev.state] || ev.state || '';
        statePill.title = ev.detail || '';
        statePill.className = `pill state-${ev.state}`;
        // a finished replay ends the session, so the automatic AI fact-check runs (same as pressing Stop)
        if (ev.state === 'idle' && /replay finished/i.test(ev.detail || '') && isOpen()) sock.send(JSON.stringify({ type: 'stop' }));
        if (ev.state === 'stopped') {
          showCta();
          // the server session is over; the next Start/Replay opens a fresh one
          setTimeout(() => { teardown(); setConn('Session ended', 'ok'); reconnectBtn.hidden = true; }, 400);
        }
        break;
      case 'error': toast(ev.message || 'Live error'); break;
      default: break;
    }
  }

  function addTranscript(text, t0) {
    if (transcript.querySelector('.empty')) transcript.replaceChildren();
    transcript.append(h('div', { class: 'tline' }, h('span', { class: 'tt mono', text: fmtTime(t0) }), h('span', { text: text || '' })));
    while (transcript.children.length > MAX_TRANSCRIPT) transcript.firstElementChild.remove();
    transcript.scrollTop = transcript.scrollHeight;
  }

  function addClaim(c) {
    if (c.t != null) spokenT.set(c.id, c.t);
    ws.upsertClaim(c);
    if (graph) { graph.addClaim(c); graphBuilt = true; }
    heardSomething = true;
  }

  function addSpoken(ev) {
    heardSomething = true;
    spokenT.set(ev.id, ev.t);
    const ref = ev.deck_claim_id ? ws.claim(ev.deck_claim_id) : null;
    if (ref && ev.id) graph?.linkSaid(ev.id, ref.id);
    if (ref && ref.source !== 'spoken' && ref.slide) showNow(ref);
    if (ev.relation !== 'drift') return;
    const spokenRef = ref && ref.source === 'spoken';
    const thenLine = !ref ? 'Earlier: (matching claim not found)'
      : spokenRef ? `Earlier (${fmtTime(ref.t ?? spokenT.get(ref.id))}): ${ref.quote || ref.text}`
        : `Deck${ref.slide != null ? ` (slide ${ref.slide})` : ''}: ${ref.text}`;
    const nowLine = spokenRef ? `Now (${fmtTime(ev.t)}): ${ev.quote}` : `Said (${fmtTime(ev.t)}): ${ev.quote}`;
    if (!driftN) driftList.replaceChildren();
    driftN++;
    driftCount.textContent = String(driftN);
    driftCount.hidden = false;
    driftList.prepend(h('button', {
      class: 'drift-card', type: 'button', title: 'Open this claim',
      onclick: () => ref && ws.open(ref.id),
      onmouseenter: () => ref && graph?.highlight(ref.id), onmouseleave: () => graph?.highlight(null),
    },
    h('span', { class: 'drift-tag', text: 'Drift' }),
    h('span', { class: 'drift-then', text: thenLine }),
    h('span', { class: 'drift-now', text: nowLine }),
    ev.note ? h('span', { class: 'drift-note muted', text: ev.note }) : null));
    if (ref) graph?.markDrift(ref.id);
    if (ev.id) graph?.markDrift(ev.id);
  }

  function showNow(ref) {
    nowBox.hidden = false;
    nowBox.replaceChildren(
      ws.hasSlides() ? h('img', { class: 'now-thumb', src: slideUrl(ws.id, ref.slide), alt: '' }) : null,
      h('div', null, h('div', { class: 'muted small', text: 'Now discussing' }), h('strong', { class: 'num', text: `Slide ${ref.slide}` }), h('div', { class: 'small', text: trunc(ref.text, 70) })));
  }

  function addQuestion(q, live) {
    ws.addQuestion(q);
    if (qFeed.querySelector('.empty')) qFeed.replaceChildren();
    const cid = (q.claim_ids || [])[0];
    qFeed.prepend(h('div', { class: 'qcard', onmouseenter: () => cid && graph?.highlight(cid), onmouseleave: () => graph?.highlight(null) },
      live ? liveBadge() : null, h('p', { text: q.text }), q.why ? h('p', { class: 'muted small', text: q.why }) : null));
  }

  // ---- after stop: automatic AI fact-check (server starts finalize and sends a 'checking' event) ----
  function showChecking(detail) {
    ctaBox.hidden = false;
    ctaBox.replaceChildren(
      h('p', { class: 'cta-text' }, h('span', { class: 'spinner' }), ' ', detail || 'AI is checking what was said.'),
      h('p', { class: 'muted small', text: 'Arithmetic, web evidence, questions and the score update by themselves; the map and Brief refresh when it is done.' }),
      btn('Open Brief', { kind: 'primary', iconName: 'doc', onclick: () => ws.go('brief') }));
    setTimeout(() => ws.refresh(), 500); // the workspace polls until the check is done
  }

  // ---- after stop: finalize CTA ----
  function showCta() {
    if (ctaBox.querySelector('.spinner')) return; // the automatic check is already running
    if (!heardSomething) return;
    ctaBox.hidden = false;
    const fin = btn('Finalize: check what was said', { kind: 'primary', iconName: 'check', onclick: async () => {
      fin.disabled = true;
      fin.querySelector('span').textContent = 'Checking…';
      if (await ws.finalize()) {
        ctaBox.replaceChildren(h('p', { class: 'small', text: 'Checking claims and building questions. The Brief is ready when the status chip disappears.' }),
          btn('Open Brief', { kind: 'primary', iconName: 'doc', onclick: () => ws.go('brief') }));
      } else { fin.disabled = false; fin.querySelector('span').textContent = 'Finalize: check what was said'; }
    } });
    ctaBox.replaceChildren(h('p', { class: 'cta-text', text: 'Session stopped. Check the spoken claims and turn everything into a memo.' }),
      h('div', { class: 'row' }, fin, btn('Open Brief', { onclick: () => ws.go('brief') })));
  }

  // ---- mic / replay / text ----
  function setLevel(rms) {
    const db = rms > 0 ? 20 * Math.log10(rms) : -90;
    const lvl = Math.max(0, Math.min(1, (db + 60) / 60));
    meterFill.style.width = `${(lvl * 100).toFixed(0)}%`;
    if (mic) wave.style.setProperty('--lvl', (0.25 + 0.75 * lvl).toFixed(2));
  }
  function syncButtons() {
    // the little waveform runs while the mic or a replay is feeding the analysis
    wave.classList.toggle('on', !!mic || replaying);
    if (!mic) wave.style.removeProperty('--lvl');
    micStart.classList.toggle('busy', micBusy);
    micStart.disabled = !!mic || micBusy;
    micStart.querySelector('span').textContent = mic ? 'Listening…' : 'Start mic';
    stopBtn.disabled = !mic && !replaying;
  }
  async function startMicClicked() {
    if (mic || micBusy) return;
    micHelp.hidden = true;
    micBusy = true;
    syncButtons();
    try {
      if (!(await ensureOpen())) { toast('Not connected to the live server. Press Reconnect.'); return; }
      mic = await startMic({ onPcm: (buf) => { if (isOpen() && sock.bufferedAmount < 1_000_000) sock.send(buf); }, onLevel: setLevel });
      ctaBox.hidden = true;
    } catch (e) {
      const err = e instanceof MicError ? e : new MicError('failed', e?.message || String(e));
      const lines = {
        denied: 'Microphone permission was denied. Allow it in the address bar, reload, and press Start mic.',
        nodevice: 'No microphone was found. Plug one in and try again.',
        unsupported: 'Browsers only allow the microphone on https:// or http://localhost.',
      };
      micHelp.textContent = `${lines[err.code] || `The microphone could not be started: ${err.message}.`} You can still use Replay demo or the typed line.`;
      micHelp.hidden = false;
    } finally { micBusy = false; syncButtons(); }
  }
  function stopMic(notify) {
    if (mic) { mic.stop(); mic = null; }
    setLevel(0);
    syncButtons();
    if (notify && isOpen()) sock.send(JSON.stringify({ type: 'stop' }));
  }
  function stopAudio() {
    replaying = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    syncButtons();
  }
  function stopAll() {
    const wasRunning = !!mic || replaying;
    stopAudio();
    stopMic(true);
    if (wasRunning) setTimeout(showCta, 300);
  }
  async function replay() {
    const file = fileSel.value;
    if (!file) return;
    const speed = Number(speedSel.value) || 1;
    stopAudio();
    if (!(await send({ type: 'replay', file, speed }))) return;
    ctaBox.hidden = true;
    audio.src = `/demo-audio/${encodeURIComponent(file)}`;
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
    replaying = true;
    syncButtons();
    try { await audio.play(); } catch (e) {
      toast(`The browser blocked audio playback (${e?.message || e}). The analysis still runs.`, 'info', 5000);
    }
  }
  audio.addEventListener('ended', () => { replaying = false; syncButtons(); setTimeout(showCta, 1500); });
  async function sendText() {
    const text = textIn.value.trim();
    if (!text) return;
    if (await send({ type: 'text', text })) { textIn.value = ''; heardSomething = true; }
  }
  async function loadAudio() {
    audioLoaded = true;
    fileSel.replaceChildren();
    try {
      const files = await demoAudio();
      if (!Array.isArray(files) || !files.length) throw new Error('none');
      for (const f of files) fileSel.append(h('option', { value: f, text: f }));
      replayBtn.disabled = false;
    } catch {
      fileSel.append(h('option', { value: '', text: 'No demo audio' }));
      replayBtn.disabled = true;
      audioLoaded = false;
    }
  }

  let lastKey = '';
  let qKey = null;
  let driftRestored = false;
  const keyOf = (list) => (list || []).map((c) => `${c.id}:${c.check?.verdict}:${c.load}`).join('|');
  // saved drift line: '<note> (said at 18s: "<quote>"; vs claim c2)'
  const DRIFT_RE = /^(.*?)\s*\(said at (\d+(?:\.\d+)?)s: "(.*)"; vs claim ([\w-]+)\)\s*$/s;
  /** Coming back to the Live tab (or reloading): show the saved drift alerts and questions, not just the transcript. */
  function restoreSaved() {
    if (!driftRestored && !driftN) {
      driftRestored = true;
      for (const line of a.drift_notes || []) {
        const m = DRIFT_RE.exec(line);
        addSpoken(m ? { relation: 'drift', note: m[1], t: Number(m[2]), quote: m[3], deck_claim_id: m[4] }
          : { relation: 'drift', note: line, quote: '' });
      }
    }
    const qs = a.questions || [];
    const k = qs.map((q) => q.id).join('|');
    if (k !== qKey && !isOpen()) { // during a live session the feed is driven by events instead
      qKey = k;
      qFeed.replaceChildren();
      if (!qs.length) qFeed.append(empty('Questions to ask appear here while the founder talks.', 'small'));
      for (const q of [...qs].sort((x, y) => (y.priority || 0) - (x.priority || 0))) addQuestion(q, q.id.startsWith('lq'));
    }
  }
  function update(analysis, opts = {}) {
    a = analysis;
    if (!a) return;
    if (!transcript.children.length) {
      const segs = a.transcript || [];
      if (segs.length) { for (const s of segs) addTranscript(s.text, s.t0); heardSomething = true; } else transcript.replaceChildren(empty('Waiting for speech…', 'small'));
    }
    const key = keyOf(a.claims);
    if (graph && (!graphBuilt || (!opts.live && key !== lastKey))) {
      graph.setClaims(a.claims || [], { animate: !graphBuilt });
      graphBuilt = true;
    }
    lastKey = key;
    try { restoreSaved(); } catch (e) { console.warn('restore live results', e); } // after the graph, so drift rings show
    if (!sock && (a.transcript || []).length) setConn('Saved results', 'ok');
  }

  return {
    el, update,
    show() {
      if (!graph) {
        graph = createGraph(miniCanvas, {
          compact: true,
          onSelect: (id) => {
            const c = id && ws.claim(id);
            miniSel.replaceChildren(c ? h('span', null, h('span', { class: `vchip v-${verdictOf(c).key}` }, h('span', { class: 'dot' }), verdictOf(c).label), ' ', h('span', { text: trunc(c.text, 80) }), ' ',
              h('button', { class: 'linkish', type: 'button', onclick: () => ws.open(c.id), text: 'Open card' })) : h('span', { text: 'Hover a node to see what it connects to.' }));
          },
        });
        ws.onHover((id) => graph?.highlight(id));
        if (a) { graph.setClaims(a.claims || [], { animate: true }); graphBuilt = true; }
      } else graph.shown();
      // connect only when the user starts something (mic / replay / typed line); opening a finished pitch just shows its saved results
      if (!sock) setConn((a?.transcript || []).length ? 'Saved results' : 'Ready', 'ok');
      if (!audioLoaded) loadAudio();
    },
    onKey(e) {
      const k = e.key.toLowerCase();
      if (k === 'm') startMicClicked();
      else if (k === 's') stopAll();
    },
    destroy() { stopMic(false); stopAudio(); teardown(); graph?.destroy(); },
  };
}

export { icon };
