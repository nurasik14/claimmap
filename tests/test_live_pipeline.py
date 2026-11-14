"""Unit tests for the live pipeline with a fake ASR and a monkeypatched LLM (no GPU, no network)."""
from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path

import numpy as np
import pytest

from claimmap.live import LiveSession, analysis, asr
from claimmap.schemas import DeckAnalysis

FIXTURE = Path(__file__).parent / "fixtures" / "sample_analysis.json"
DECK = DeckAnalysis.model_validate_json(FIXTURE.read_text())
RATE = asr.SAMPLE_RATE
FRAME = RATE // 10  # 100 ms


# ---------------------------------------------------------------- helpers
def claim(quote, cid=None, relation="new", note="", question="", category="other"):
    return {"quote": quote, "category": category, "deck_claim_id": cid, "relation": relation,
            "note": note, "question": question}


def patch_llm(monkeypatch, fn):
    """fn(user: str) -> list of raw claim dicts (the LLM's output); records every user prompt."""
    calls: list[str] = []

    def fake(system, user, schema, tier="fast", timeout=120):
        calls.append(user)
        return {"claims": fn(user)}

    monkeypatch.setattr("claimmap.llm.call_json", fake)
    return calls


def numbered_pcm(seconds: float) -> bytes:
    """PCM whose 100 ms frame k is the constant k+1, so a fake ASR can tell where its window starts."""
    n = int(seconds * 10)
    return b"".join(np.full(FRAME, k + 1, "<i2").tobytes() for k in range(n))


class ScriptedASR:
    """Fake transcriber that 'hears' a fixed script [(start, end, text)] in absolute session seconds."""

    detail = "fake"

    def __init__(self, script):
        self.script = script
        self.windows: list[tuple[float, float]] = []

    async def warm(self):
        return "fake"

    async def transcribe(self, audio):
        wstart = (round(float(audio[0]) * 32768) - 1) / 10
        wend = wstart + len(audio) / RATE
        self.windows.append((wstart, wend))
        return [asr.Seg(s - wstart, min(e, wend) - wstart, t) for s, e, t in self.script
                if s >= wstart and s < wend - 0.2]


class Recorder:
    def __init__(self):
        self.events: list[dict] = []

    async def __call__(self, ev):
        self.events.append(ev)

    def of(self, kind):
        return [e for e in self.events if e["type"] == kind]


async def make(transcriber=None):
    rec = Recorder()
    s = LiveSession(DECK, rec, transcriber=transcriber or ScriptedASR([]))
    await s.start()
    return s, rec


async def feed_audio(s, seconds, realtime_step=0.0):
    pcm = numbered_pcm(seconds)
    for off in range(0, len(pcm), FRAME * 2):
        await s.feed_pcm(pcm[off:off + FRAME * 2])
        await asyncio.sleep(realtime_step)


# ---------------------------------------------------------------- ASR segmentation
SCRIPT = [(0.2, 2.4, "Hello everyone."), (3.0, 6.0, "We have forty customers."),
          (7.0, 9.5, "Growing fast every month."), (11.0, 12.5, "Thank you.")]


def test_segments_committed_once_in_order_with_session_times(monkeypatch):
    patch_llm(monkeypatch, lambda u: [])

    async def go():
        fake = ScriptedASR(SCRIPT)
        s, rec = await make(fake)
        await feed_audio(s, 13.0, realtime_step=0.003)
        await s.stop()
        return rec, fake

    rec, fake = asyncio.run(go())
    texts = [e["text"] for e in rec.of("transcript")]
    assert texts == [t for _, _, t in SCRIPT]           # each exactly once, in order
    for e, (s0, s1, _) in zip(rec.of("transcript"), SCRIPT):
        assert abs(e["t0"] - s0) < 0.01 and abs(e["t1"] - s1) < 0.3
    assert len(fake.windows) >= 3                        # transcribed incrementally, not just at the end
    starts = [w[0] for w in fake.windows]
    assert starts == sorted(starts) and starts[-1] > 0   # buffer was trimmed after commits
    assert rec.events[-1] == {"type": "status", "state": "stopped", "detail": ""}


def test_window_is_bounded(monkeypatch):
    patch_llm(monkeypatch, lambda u: [])

    async def go():
        fake = ScriptedASR([])  # silence: nothing to commit, so the buffer must still not grow without bound
        s, rec = await make(fake)
        await feed_audio(s, 60.0)
        await s.stop()
        return fake

    fake = asyncio.run(go())
    assert max(e - s for s, e in fake.windows) <= 31.0


def test_transcriber_error_becomes_error_event_and_session_survives(monkeypatch):
    patch_llm(monkeypatch, lambda u: [claim("We have 40 customers", "c6", "drift", "26 vs 40")])

    class Broken(ScriptedASR):
        async def transcribe(self, audio):
            raise RuntimeError("cuda exploded")

    async def go():
        s, rec = await make(Broken([]))
        await feed_audio(s, 6.0)
        await asyncio.sleep(0.05)
        await s.feed_text("We have 40 paying customers.")
        await s.stop()
        return rec

    rec = asyncio.run(go())
    assert any("cuda exploded" in e["message"] for e in rec.of("error"))
    assert [e["relation"] for e in rec.of("spoken_claim")] == ["drift"]   # text path still works
    assert rec.events[-1]["state"] == "stopped"


# ---------------------------------------------------------------- analysis
def test_text_drift_emits_spoken_claim_and_priority1_question(monkeypatch):
    calls = patch_llm(monkeypatch, lambda u: [
        claim("we have 40 paying customers", "c6", "drift", "Deck says 26 paying customers; founder said 40.",
              "Which is right?", "traction"),
        claim("we plan $5M by year three", "c2", "consistent"),
        claim("our team came out of Thermo Fisher", None, "new", "Not in deck", "Who exactly?", "team"),
        claim("we love our customers", None, "new")])

    async def go():
        s, rec = await make()
        await s.feed_text("We have 40 paying customers.")
        await s.stop()
        return rec

    rec = asyncio.run(go())
    sc = rec.of("spoken_claim")
    assert [(e["id"], e["relation"], e["deck_claim_id"]) for e in sc] == [
        ("s1", "drift", "c6"), ("s2", "consistent", "c2"), ("s3", "new", None), ("s4", "new", None)]
    assert sc[0]["note"].startswith("Deck says 26")
    qs = [e["question"] for e in rec.of("question")]
    # v2: the material new claim (team, s3) became a graph node, so its question cites it
    assert [(q["id"], q["priority"], q["claim_ids"]) for q in qs] == [("lq1", 1, ["c6"]), ("lq2", 2, ["s3"])]
    assert [e["claim"]["id"] for e in rec.of("claim_added")] == ["s3"]   # "we love our customers" is not material
    assert rec.of("transcript")[0]["text"] == "We have 40 paying customers."
    assert len(calls) == 1 and "<transcript>\nWe have 40 paying customers.\n</transcript>" in calls[0]
    assert '"id": "c6"' in calls[0]                       # deck claims are passed along


def test_invalid_deck_claim_id_is_dropped(monkeypatch):
    patch_llm(monkeypatch, lambda u: [claim("x is 5", "c99", "drift", "bad id"), claim("", "c1", "drift")])

    async def go():
        s, rec = await make()
        await s.feed_text("x is 5 yes.")
        await s.stop()
        return rec

    sc = asyncio.run(go()).of("spoken_claim")
    assert [(e["deck_claim_id"], e["relation"]) for e in sc] == [(None, "new")]  # empty quote ignored too


def test_dedupe_same_claim_same_figures(monkeypatch):
    answers = iter([[claim("we have 40 paying customers", "c6", "drift", "n")],
                    [claim("Forty... we have 40 paying customers today", "c6", "drift", "n")],   # same figures
                    [claim("actually 55 customers now", "c6", "drift", "n")],                    # new figure
                    [claim("nobody else does this", None, "new"), claim("Nobody else does this!", None, "new")]])
    patch_llm(monkeypatch, lambda u: next(answers))

    async def go():
        s, rec = await make()
        for text in ["one.", "two.", "three.", "four."]:
            await s.feed_text(text)
            await asyncio.sleep(0.05)
            await s._flush()
        await s.stop()
        return rec

    rec = asyncio.run(go())
    assert [e["quote"] for e in rec.of("spoken_claim")] == [
        "we have 40 paying customers", "actually 55 customers now", "nobody else does this"]
    assert len(rec.of("question")) == 2   # only the two drifts


def test_llm_calls_never_overlap_and_text_is_coalesced(monkeypatch):
    gate = threading.Event()
    state = {"running": 0, "max": 0, "users": []}
    lock = threading.Lock()

    def fake(system, user, schema, tier="fast", timeout=120):
        with lock:
            state["running"] += 1
            state["max"] = max(state["max"], state["running"])
            state["users"].append(user)
            first = len(state["users"]) == 1
        if first:
            gate.wait(5)
        with lock:
            state["running"] -= 1
        return {"claims": []}

    monkeypatch.setattr("claimmap.llm.call_json", fake)

    async def go():
        s, rec = await make()
        await s.feed_text("alpha has 1 thing.")
        await asyncio.sleep(0.1)                  # first call now in flight (blocked)
        for t in ["beta has 2 things.", "gamma has 3 things.", "delta has 4 things."]:
            await s.feed_text(t)
        await asyncio.sleep(0.2)
        assert len(state["users"]) == 1           # still only the one call
        gate.set()
        await s.stop()

    asyncio.run(go())
    assert state["max"] == 1
    assert len(state["users"]) == 2
    second = state["users"][1]
    assert all(w in second for w in ("beta", "gamma", "delta")) and "alpha has 1 thing." in second.split("<context>")[1].split("</context>")[0]


def test_analysis_waits_for_enough_text_then_stop_flushes(monkeypatch):
    calls = patch_llm(monkeypatch, lambda u: [])

    async def go():
        s, rec = await make()
        s._add_text("we", 1.0)                         # tiny, no digits, no sentence end: not eligible
        s._kick()
        await asyncio.sleep(0.05)
        assert calls == []
        s._add_text("have 40 paying customers today", 2.0)   # a digit and >= 6 words: eligible at once
        s._kick()
        await asyncio.sleep(0.1)
        assert len(calls) == 1
        s._add_text("and more words without anything notable", 3.0)
        s._kick()
        await asyncio.sleep(0.05)
        assert len(calls) == 1
        await s.stop()                                  # stop flushes what is pending
        assert len(calls) == 2

    asyncio.run(go())


def test_llm_error_becomes_error_event_and_session_continues(monkeypatch):
    n = {"i": 0}

    def fake(system, user, schema, tier="fast", timeout=120):
        n["i"] += 1
        if n["i"] == 1:
            raise RuntimeError("api down")
        return {"claims": [claim("we have 40 customers", "c6", "drift", "26 vs 40")]}

    monkeypatch.setattr("claimmap.llm.call_json", fake)

    async def go():
        s, rec = await make()
        await s.feed_text("first.")
        await asyncio.sleep(0.1)
        await s.feed_text("second has 40 customers.")
        await s.stop()
        return rec

    rec = asyncio.run(go())
    assert any("api down" in e["message"] for e in rec.of("error"))
    assert [e["relation"] for e in rec.of("spoken_claim")] == ["drift"]


def test_stop_is_idempotent(monkeypatch):
    patch_llm(monkeypatch, lambda u: [])

    async def go():
        s, rec = await make()
        await s.stop()
        await s.stop()
        await s.feed_text("ignored after stop")
        await s.feed_pcm(b"\0\0" * 100)
        return rec

    rec = asyncio.run(go())
    assert [e["state"] for e in rec.of("status")].count("stopped") == 1
    assert rec.of("transcript") == []


def test_emit_failure_does_not_crash(monkeypatch):
    patch_llm(monkeypatch, lambda u: [claim("40 customers", "c6", "drift", "n")])

    async def bad_emit(ev):
        raise ConnectionError("socket closed")

    async def go():
        s = LiveSession(DECK, bad_emit, transcriber=ScriptedASR([]))
        await s.start()
        await s.feed_text("we have 40 customers.")
        await s.stop()

    asyncio.run(go())


def test_replay_file_decodes_and_feeds_then_flushes(monkeypatch, tmp_path):
    patch_llm(monkeypatch, lambda u: [])
    wav = Path(__file__).parent / "fixtures" / "labloop_pitch.mp3"

    class LenASR(ScriptedASR):
        async def transcribe(self, audio):                    # real audio is not numbered: just record lengths
            self.windows.append((0.0, len(audio) / RATE))
            return []

    async def go():
        fake = LenASR([])
        s, rec = await make(fake)
        await s.replay_file(str(wav), speed=50)
        return s, rec, fake

    s, rec, fake = asyncio.run(go())
    assert fake.windows and sum(e for _, e in fake.windows) > 20   # the whole 23 s clip went through ASR
    assert rec.of("status")[-1]["state"] == "idle"            # replay does not emit "stopped"


def test_replay_missing_file_is_error_event(monkeypatch):
    async def go():
        s, rec = await make()
        await s.replay_file("/nonexistent/file.mp3")
        return rec

    assert asyncio.run(go()).of("error")


def test_replay_is_cancellable(monkeypatch):
    patch_llm(monkeypatch, lambda u: [])
    wav = Path(__file__).parent / "fixtures" / "labloop_pitch.mp3"

    async def go():
        s, rec = await make()
        t = asyncio.create_task(s.replay_file(str(wav), speed=1.0))
        await asyncio.sleep(0.5)
        t.cancel()
        with pytest.raises(asyncio.CancelledError):
            await t
        await s.stop()
        return rec

    asyncio.run(go())


def test_deduper_unit():
    d = analysis.Deduper()
    assert d.accept(claim("26 customers", "c6", "consistent"))
    assert not d.accept(claim("we have 26 customers", "c6", "consistent"))
    assert d.accept(claim("we have 40 customers", "c6", "drift"))
    assert json.dumps(d._seen[0][2:3], default=sorted)  # smoke: figures recorded
