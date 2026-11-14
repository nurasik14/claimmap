# Agent B report: live pipeline

## What I built (`claimmap/live/`)
- `session.py`: `LiveSession(deck, emit, transcriber=None)`, same public API as the stub (`start`, `feed_pcm`,
  `feed_text`, `replay_file`, `stop`) plus `ready()` (awaits model load; used by the CLI).
- `asr.py`: lazy `WhisperTranscriber` singleton (small.en, CUDA float16 -> CPU int8 fallback with the reason in the
  status detail; the model is probed once so CUDA problems surface at load, not mid-pitch), runs in `asyncio.to_thread`;
  ffmpeg decoding to s16le/16 kHz (`decode_file`). Always passes float32 numpy to Whisper.
- `analysis.py`: LLM prompt + JSON schema, `analyze_text()` (calls `llm.call_json(..., tier="smart")`), `Deduper`.
- `__main__.py`: CLI with timeline + latency measurement.

How it works
- ASR: PCM is buffered; every 2 s of new audio the uncommitted window is transcribed (vad_filter, beam 1, en).
  Segments ending >0.7 s before the window end are committed (one `transcript` event each, session-second t0/t1), then
  trimmed from the buffer, so text is never re-emitted. Window bounded to 30 s; silence-only windows are trimmed.
  Only one ASR step at a time; audio keeps buffering meanwhile.
- Analysis: committed text accumulates. One LLM call is triggered when: >=6 words containing a digit, OR >=8 words
  ending at a sentence boundary, OR the oldest pending text is 10 s old, OR `feed_text` / stop / end of replay.
  Only one call in flight; text arriving meanwhile is coalesced into the next call. The previous ~400 chars go along as
  `<context>`. Output -> `spoken_claim` (s1..), plus `question` (lq1..; priority 1 for drift, 2 for a new claim with a
  question). Dedupe: same deck_claim_id + relation + same figures, or near-identical quote (difflib >= 0.85).
  Deliberate deviation: a *different* figure for the same claim (40 customers, later 55) is reported again.
  Invalid `deck_claim_id` -> null/"new". The deck "verdict" is passed as background only; transcript/context are tagged data-only.
- Errors (ASR, LLM, ffmpeg, closed socket) -> `ErrorEvent` (same message rate-limited to once per 10 s); never raised.
- `stop()` flushes pending audio + text, waits <=15 s for in-flight analysis, emits `stopped`; second call is a no-op.
  `replay_file` feeds 100 ms frames on an absolute schedule (real time / speed), cancellable, then flushes and emits
  `status idle "Replay finished"` (not `stopped`).
- Status events: `transcribing` ("Loading speech model...") at start, `listening` when the model is ready, `analyzing` /
  `listening` around each LLM call. Model load happens in a background task so `start()` returns immediately and
  text-only use is not delayed by Whisper.

## How to run
```
uv run python -m claimmap.live --deck tests/fixtures/sample_analysis.json --audio tests/fixtures/labloop_pitch.mp3 --speed 1.0
```

## Verified
- `uv run pytest -q` (whole suite, gpu test included): 22 passed, 1 skipped (the `live_llm` test).
- Tests: `tests/test_live_pipeline.py` (fake ASR with scripted segments + patched `call_json`: segmentation / no duplicate
  text / bounded window / ASR error / drift+question / invalid ids / dedupe / one-call-in-flight coalescing / trigger rules /
  LLM error / stop idempotent / closed socket / replay / cancel), `tests/test_live_audio.py` (WebSocket via TestClient with
  `{"type":"text"}` -> drift `spoken_claim` c6 + priority-1 question + stop; `@gpu` real-Whisper replay at speed 4 asserting
  "40", "customers", "Thermo Fisher" in the transcript; `@live_llm` end-to-end drift on c6).
- CLI at speed 1.0, real Whisper + real LLM (event timeline, status lines omitted; audio is 23 s):
```
  9.69s transcript    [0.0-5.6] So, where we are today, we have 40 paying customers, mostly mid-sized labs, and we're
 12.81s spoken_claim  s1 drift      c6 "we have 40 paying customers" | Deck says 26 paying customers; founder said 40.
 12.81s question      lq1 p1 Deck says 26 paying customers but you said 40 - which is correct, and how many are paying vs. pilots?
 12.81s spoken_claim  s2 new        None "mostly mid-sized labs" | Customer segment not described in deck claims.
 15.68s transcript    [5.6-12.8] growing about 40% every month. The market for lab automation is huge, over $10 billion,
 17.62s transcript    [12.8-15.2] And honestly nobody else is doing what we do.
 18.40s spoken_claim  s3 consistent c5 "growing about 40% every month"
 18.40s spoken_claim  s4 drift      c3 "The market for lab automation is huge, over $10 billion" | Deck says $4.1B TAM ... over $10B ...
 18.40s question      lq3 p1 Which market is $10B+ ...? How does it reconcile with the $4.1B US contract-lab TAM in your deck?
 20.91s spoken_claim  s5 consistent c7 "nobody else is doing what we do"
 24.76s transcript    [15.7-22.7] Our founding team came out of Thermo Fisher, and we plan to reach $5 million in revenue by year 3.
 27.30s spoken_claim  s6 new        None "Our founding team came out of Thermo Fisher"
 27.30s spoken_claim  s7 consistent c2 "we plan to reach $5 million in revenue by year 3"
```
  (timestamps are wall-clock since process start; the first ~1.5 s is model load, so audio starts at ~1.5 s.)
  **Latency, end of spoken sentence (transcript t1) -> matching spoken_claim: median 4.1 s, max 5.7 s**
  (customers drift +5.7 s, market drift +4.1 s). Breakdown: ~2.2 s ASR cadence + commit lag, ~2-3 s LLM call.
  First iteration (25-word rule, 2.5 s cadence) measured median 11.1 s / max 18.3 s; fixed by the digit trigger,
  the 8-word sentence trigger and a faster ASR cadence. Both expected drifts (c6 customers, c3 market) are caught.
- Server on port 8012 (`/tmp/b_ws_client.py` starts uvicorn, drives it, kills it by PID), deck "fixture" saved in
  `data/decks/fixture.json`, sent `{"type":"replay","file":"labloop_pitch.mp3","speed":2}` over `/ws/live/fixture`:
  received 4 transcript, 7 spoken_claim (drift c6, drift c3, ...), 4 question, 12 status events, then `idle`, and after
  `{"type":"stop"}` `stopped`; first spoken_claim at 7.4 s wall (audio 23 s at 2x). Server killed (rc 143 = SIGTERM).

## Not done / known limits
- **The `CLAIMMAP_LIVE_LLM=1 uv run pytest -m live_llm ...` command could not be run**: the sandbox here requires
  interactive approval for commands with an env-var prefix, and this session cannot grant it. I did not work around it.
  The test is written (`tests/test_live_audio.py::test_live_end_to_end_flags_customer_drift`, same replay path as the
  CLI runs above, which did flag c6 as drift); please run it once. It skips without the env var.
- Whisper is only as good as small.en on 16 kHz mic audio; garbled numbers go to the LLM as heard. No diarization.
- Dedupe is heuristic. A founder repeating a claim with different wording and a different number is reported again.
- CPU fallback works but is ~2.5 s per 23 s of audio, so latency would be a few seconds worse.
- Each connection warms the shared model singleton once; if two sessions run at once they share the GPU lock.

## Contract additions / incidents
- No schema changes, no new dependencies. Added `LiveSession.ready()` and an optional `transcriber=` constructor arg (for tests).
- `data/decks/fixture.json` was created (deck_id "fixture", copy of the sample analysis) as the prompt asked.
- Real LLM calls used: ~7 (three CLI runs of 2-4 calls each; the live_llm test was not run). Within the ~40 budget.
