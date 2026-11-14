"""LiveSession: audio in -> committed transcript -> spoken claims / questions out.

Two cooperating pieces, both driven from the event loop (blocking work runs in threads):
  * ASR: PCM is buffered; every ~2.5 s of new audio the uncommitted window is transcribed, and segments that
    end more than ~1 s before the buffer end are committed (emitted once, then trimmed from the buffer).
  * Analysis: committed text accumulates; when enough has arrived (or on a timer / stop) ONE LLM call compares
    it with the deck claims. Text that arrives while a call is in flight is coalesced into the next call.
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Awaitable, Callable

from claimmap.deck.load import score_load
from claimmap.live import analysis, asr
from claimmap.score import compute_score
from claimmap.schemas import ScoreEvent
from claimmap.schemas import (Check, Claim, ClaimAddedEvent, DeckAnalysis, ErrorEvent, Question, QuestionEvent,
                              SpokenClaimEvent, StatusEvent, TranscriptEvent, TranscriptSegment)

Emit = Callable[[dict], Awaitable[None]]
Persist = Callable[[DeckAnalysis], None]
SAVE_EVERY_S = 2.0       # debounced persistence of claims / transcript / questions

RATE = asr.SAMPLE_RATE
ASR_EVERY_S = 2.0        # transcribe after this much new audio
COMMIT_LAG_S = 0.7       # a segment is committed once it ends this long before the buffer end
MAX_WINDOW_S = 30.0      # bound on the audio re-transcribed each time
MIN_FINAL_S = 0.3        # ignore a trailing remainder shorter than this at flush
SILENCE_TRIM_S = 4.0     # no speech found in a window this long: keep only the last second
MIN_WORDS = 8            # analysis trigger: this many new words ending at a sentence boundary (brief says ~25;
                         # measured: waiting for 25 left short sentences idle for the full MAX_AGE_S)
MIN_NUMERIC_WORDS = 6    # ...or this many if they contain a digit (sentence boundary not required)
MAX_AGE_S = 10.0         # ...or the oldest pending text is this old
STOP_WAIT_S = 15.0       # bound on waiting for in-flight analysis at stop
CONTEXT_CHARS = 400
_SENTENCE_END = re.compile(r"[.!?][\"')\]]*\s*$")


class LiveSession:
    """One live pitch. Created per WebSocket connection by app.py."""

    def __init__(self, deck: DeckAnalysis, emit: Emit, transcriber: asr.Transcriber | None = None,
                 persist: Persist | None = None):
        self.deck = deck.model_copy(deep=True)  # the session owns its copy; `persist` writes it back
        self._emit_fn = emit
        self._persist = persist
        self.changed = False  # (orchestrator) True once this session added a claim or drift: triggers auto-finalize
        self._dirty = False
        self._last_save = 0.0
        self._save_task: asyncio.Task | None = None
        self.drift_events: list[dict] = []
        self._transcriber = transcriber or asr.get_transcriber()
        self._t_start = time.monotonic()
        self._stopped = False
        # audio / ASR state
        self._buf = bytearray()          # uncommitted int16 PCM
        self._buf_start = 0              # session sample index of _buf[0]
        self._fed = 0                    # total samples fed
        self._asr_mark = 0               # _fed at the last transcription snapshot
        self._asr_lock = asyncio.Lock()
        self._asr_task: asyncio.Task | None = None
        self._warm_task: asyncio.Task | None = None
        # analysis state
        self._pending: list[str] = []
        self._pending_since = 0.0
        self._pending_t1 = 0.0
        self._context = ""
        self._force = False
        self._analysis_task: asyncio.Task | None = None
        self._ticker: asyncio.Task | None = None
        self._dedupe = analysis.Deduper()
        # ids continue after any earlier live session on the same analysis
        self._n_claims = _max_suffix([c.id for c in self.deck.claims], "s")
        self._n_questions = _max_suffix([q.id for q in self.deck.questions], "lq")
        self._last_error: tuple[str, float] = ("", 0.0)

    # ------------------------------------------------------------------ public API
    async def start(self) -> None:
        # (orchestrator) the deck becomes "deck+live" only once something is actually said (see _went_live),
        # so merely opening the Live tab doesn't relabel a deck-only analysis.
        await self._emit(StatusEvent(state="transcribing", detail="Loading speech model..."))
        self._warm_task = asyncio.create_task(self._warm())
        self._ticker = asyncio.create_task(self._tick())

    async def ready(self) -> None:
        """Wait until the speech model is loaded (used by the CLI so load time is not measured)."""
        if self._warm_task:
            await asyncio.shield(self._warm_task)

    async def feed_pcm(self, pcm16: bytes) -> None:
        """Raw audio from the browser: little-endian int16 mono 16 kHz, any chunk length."""
        if self._stopped or not pcm16:
            return
        self.deck.capture = "recording" if getattr(self, "_replaying", False) else "live_mic"
        self._went_live()
        self._buf += pcm16
        self._fed += len(pcm16) // 2
        if self._fed - self._asr_mark >= ASR_EVERY_S * RATE and not self._asr_busy():
            self._asr_task = asyncio.create_task(self._asr_step(final=False))

    async def feed_text(self, text: str) -> None:
        """Inject transcript text directly (tests, and a typed fallback if the mic fails)."""
        if self.deck.capture is None:
            self.deck.capture = "text"
        self._went_live()
        text = text.strip()
        if self._stopped or not text:
            return
        t = round(self._now(), 2)
        await self._emit(TranscriptEvent(text=text, t0=t, t1=t))
        self._commit_segment(text, t, t)
        self._add_text(text, t)
        self._force = True
        self._kick()

    async def replay_file(self, path: str, speed: float = 1.0) -> None:
        """Play an audio file through the pipeline as if it were spoken live (demo fallback)."""
        self._replaying = True
        try:
            pcm = await asr.decode_file(path)
        except Exception as e:
            await self._error(str(e))
            return
        frame = RATE // 10 * 2  # 100 ms of int16
        speed = max(0.1, speed)
        t0 = time.monotonic()
        for i, off in enumerate(range(0, len(pcm), frame)):
            delay = t0 + i * 0.1 / speed - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            else:
                await asyncio.sleep(0)
            if self._stopped:
                return
            await self.feed_pcm(pcm[off:off + frame])
        await self._flush()
        await self._emit(StatusEvent(state="idle", detail="Replay finished"))

    async def stop(self) -> None:
        if self._stopped:
            return
        await self._flush()
        self._stopped = True
        for t in (self._ticker, self._warm_task):
            if t:
                t.cancel()
        await self.save()
        await self._emit(StatusEvent(state="stopped"))

    async def save(self) -> None:
        """Write the session's analysis now (waits for a debounced save in flight first)."""
        if self._save_task and not self._save_task.done():
            self._save_task.cancel()
            try:
                await self._save_task
            except (asyncio.CancelledError, Exception):
                pass
        await self._save_now()

    # ------------------------------------------------------------------ helpers
    def _went_live(self) -> None:
        if self.deck.mode == "deck":
            self.deck.mode = "deck+live"
            self._mark_dirty()

    def _now(self) -> float:
        """Session seconds: audio time once audio is flowing, wall time for text-only sessions."""
        return self._fed / RATE if self._fed else time.monotonic() - self._t_start

    async def _emit(self, ev) -> None:
        try:
            await self._emit_fn(ev.model_dump())
        except Exception:  # client went away: nothing useful to do
            pass

    async def _error(self, msg: str) -> None:
        last, at = self._last_error
        if msg == last and time.monotonic() - at < 10:
            return
        self._last_error = (msg, time.monotonic())
        await self._emit(ErrorEvent(message=msg))

    async def _warm(self) -> None:
        try:
            detail = await self._transcriber.warm()
            await self._emit(StatusEvent(state="listening", detail=f"Speech model ready: {detail}"))
        except Exception as e:
            await self._error(f"Speech model failed to load: {e}")

    def _asr_busy(self) -> bool:
        return self._asr_task is not None and not self._asr_task.done()

    # ------------------------------------------------------------------ ASR
    async def _asr_step(self, final: bool) -> None:
        async with self._asr_lock:
            n = len(self._buf) // 2
            if n == 0 or (final and n < MIN_FINAL_S * RATE):
                if final:
                    self._buf.clear()
                return
            audio = asr.pcm16_to_float(self._buf)
            base = self._buf_start / RATE
            self._asr_mark = self._fed
            window = n / RATE
            try:
                segs = await self._transcriber.transcribe(audio)
            except Exception as e:
                await self._error(f"Transcription failed: {e}")
                self._trim(n)  # drop what we could not read rather than retry forever
                return
            horizon = float("inf") if (final or window > MAX_WINDOW_S) else window - COMMIT_LAG_S
            committed_end = 0.0
            for s in segs:
                if s.end > horizon:
                    break
                t0, t1 = round(base + s.start, 2), round(base + s.end, 2)
                await self._emit(TranscriptEvent(text=s.text, t0=t0, t1=t1))
                self._commit_segment(s.text, t0, t1)
                self._add_text(s.text, t1)
                committed_end = s.end
            if final:
                self._trim(n)
            elif segs and committed_end > 0:
                self._trim(int(committed_end * RATE))
            elif not segs and window > SILENCE_TRIM_S:
                self._trim(int((window - 1.0) * RATE))
            elif window > MAX_WINDOW_S:
                self._trim(n)
        self._kick()

    def _trim(self, samples: int) -> None:
        samples = min(samples, len(self._buf) // 2)
        del self._buf[:samples * 2]
        self._buf_start += samples

    # ------------------------------------------------------------------ analysis
    def _add_text(self, text: str, t1: float) -> None:
        if not self._pending:
            self._pending_since = time.monotonic()
        self._pending.append(text)
        self._pending_t1 = max(self._pending_t1, t1)

    def _eligible(self) -> bool:
        if not self._pending:
            return False
        if self._force:
            return True
        text = " ".join(self._pending)
        words = len(text.split())
        if words >= MIN_NUMERIC_WORDS and re.search(r"\d", text):  # numbers are what we hunt for: don't wait
            return True
        if words >= MIN_WORDS and _SENTENCE_END.search(text):
            return True
        return time.monotonic() - self._pending_since >= MAX_AGE_S

    def _kick(self) -> None:
        """Start the analysis worker if there is something to do and none is running (coalescing)."""
        if self._eligible() and (self._analysis_task is None or self._analysis_task.done()):
            self._analysis_task = asyncio.create_task(self._analysis_worker())

    async def _tick(self) -> None:
        while True:
            await asyncio.sleep(0.5)
            self._kick()

    async def _analysis_worker(self) -> None:
        while self._eligible():
            text = " ".join(self._pending)
            t1 = self._pending_t1
            self._pending.clear()
            self._pending_t1 = 0.0
            self._force = False  # later text sets it again if needed
            await self._analyze(text, t1)

    async def _analyze(self, text: str, t1: float) -> None:
        await self._emit(StatusEvent(state="analyzing"))
        try:
            claims = await asyncio.to_thread(analysis.analyze_text, self.deck, self._context, text)
        except Exception as e:
            await self._error(f"Claim analysis failed: {e}")
            claims = []
        self._context = (self._context + " " + text).strip()[-CONTEXT_CHARS:]
        for c in claims:
            if not self._dedupe.accept(c):
                continue
            self._n_claims += 1
            sid = f"s{self._n_claims}"
            ev = SpokenClaimEvent(id=sid, quote=c["quote"], category=c["category"], deck_claim_id=c["deck_claim_id"],
                                  relation=c["relation"], note=c["note"], t=round(t1, 2))
            await self._emit(ev)
            if c["relation"] == "new" and c["material"]:
                await self._emit(ClaimAddedEvent(claim=self._add_claim(sid, c, round(t1, 2))))
                self.changed = True
                await self._rescore()
            elif c["relation"] == "drift":
                self.drift_events.append(ev.model_dump())
                self.deck.drift_notes.append(_drift_note(ev))
                self._mark_dirty()
                self.changed = True
                await self._rescore()
            if c["relation"] == "drift" or (c["relation"] == "new" and c["question"]):
                self._n_questions += 1
                q = Question(id=f"lq{self._n_questions}", text=c["question"] or f"{c['note']} Which is right?",
                             claim_ids=[c["deck_claim_id"]] if c["deck_claim_id"] else [sid] if c["material"] else [],
                             why=c["note"], priority=1 if c["relation"] == "drift" else 2)
                self.deck.questions.append(q)
                self._mark_dirty()
                await self._emit(QuestionEvent(question=q))
        await self._emit(StatusEvent(state="listening"))

    async def _rescore(self) -> None:
        """Recompute the ClaimMap Score live (deterministic, no LLM) and push it to the browser."""
        try:
            self.deck.score = compute_score(self.deck)
            await self._emit(ScoreEvent(score=self.deck.score))
        except Exception:  # scoring must never break the live loop
            pass

    def _add_claim(self, sid: str, c: dict, t: float) -> Claim:
        """Append a new spoken claim to the graph, wire its edges, rescore load. Returns the stored claim."""
        claim = Claim(id=sid, text=c["text"], quote=c["quote"], category=c["category"], value=c["value"],
                      unit=c["unit"], role=c["role"], depends_on=list(c["depends_on"]), source="spoken", t=t,
                      check=Check(verdict="unverified", reason="Said live, not yet checked"))
        by_id = {x.id: x for x in self.deck.claims}
        self.deck.claims.append(claim)
        by_id[sid] = claim
        for up in c["supports"]:  # an existing claim rests on the new one, unless that would close a cycle
            if up in by_id and up not in claim.depends_on and not _reaches(by_id, sid, up):
                by_id[up].depends_on.append(sid)
        score_load(self.deck.claims)
        self._mark_dirty()
        return claim

    # ------------------------------------------------------------------ persistence
    def _commit_segment(self, text: str, t0: float, t1: float) -> None:
        self.deck.transcript.append(TranscriptSegment(text=text, t0=t0, t1=t1))
        self._mark_dirty()

    def _mark_dirty(self) -> None:
        if self._persist is None:
            return
        self._dirty = True
        if self._save_task is None or self._save_task.done():
            self._save_task = asyncio.create_task(self._save_later())

    async def _save_later(self) -> None:
        wait = SAVE_EVERY_S - (time.monotonic() - self._last_save)
        if wait > 0:
            await asyncio.sleep(wait)
        await self._save_now()

    async def _save_now(self) -> None:
        if not self._dirty or self._persist is None:
            return
        self._dirty = False
        self._last_save = time.monotonic()
        snapshot = self.deck.model_copy(deep=True)
        try:
            await asyncio.to_thread(self._persist, snapshot)
        except Exception as e:
            await self._error(f"Could not save the live session: {e}")

    # ------------------------------------------------------------------ flush
    async def _flush(self) -> None:
        """Transcribe and analyse everything still pending (bounded wait). Does not emit `stopped`."""
        try:
            if self._asr_task and not self._asr_task.done():
                await asyncio.wait_for(asyncio.shield(self._asr_task), STOP_WAIT_S)
            await asyncio.wait_for(self._asr_step(final=True), STOP_WAIT_S)
            self._force = True
            self._kick()
            if self._analysis_task and not self._analysis_task.done():
                await asyncio.wait_for(asyncio.shield(self._analysis_task), STOP_WAIT_S)
        except asyncio.TimeoutError:
            await self._error("Timed out finishing the last part of the pitch")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            await self._error(f"Flush failed: {e}")
        finally:
            self._force = False


def _max_suffix(ids: list[str], prefix: str) -> int:
    nums = [int(i[len(prefix):]) for i in ids if i.startswith(prefix) and i[len(prefix):].isdigit()]
    return max(nums, default=0)


def _drift_note(ev: SpokenClaimEvent) -> str:
    note = ev.note or f"Said something that differs from claim {ev.deck_claim_id}."
    return f"{note} (said at {ev.t:.0f}s: \"{ev.quote}\"; vs claim {ev.deck_claim_id})"


def _reaches(by_id: dict[str, Claim], start: str, target: str) -> bool:
    """True if `target` is reachable from `start` along depends_on edges."""
    seen, stack = set(), [start]
    while stack:
        cur = stack.pop()
        if cur == target:
            return True
        if cur in seen or cur not in by_id:
            continue
        seen.add(cur)
        stack.extend(by_id[cur].depends_on)
    return False
