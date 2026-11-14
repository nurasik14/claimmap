"""WebSocket, real-Whisper (gpu) and real-LLM (live_llm) tests for the live pipeline."""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from claimmap.live import LiveSession, asr
from claimmap.schemas import DeckAnalysis

FIX = Path(__file__).parent / "fixtures"
DECK = DeckAnalysis.model_validate_json((FIX / "sample_analysis.json").read_text())
MP3 = FIX / "labloop_pitch.mp3"


class NoASR:
    detail = "fake"

    async def warm(self):
        return "fake"

    async def transcribe(self, audio):
        return []


def test_websocket_text_drift(monkeypatch):
    from claimmap import app as app_module

    def fake_llm(system, user, schema, tier="fast", timeout=120):
        assert "<transcript>" in user
        return {"claims": [{"quote": "we have 40 paying customers", "category": "traction", "deck_claim_id": "c6",
                            "relation": "drift", "note": "Deck says 26 paying customers; founder said 40.",
                            "question": "Which number is right?"}]}

    monkeypatch.setattr("claimmap.llm.call_json", fake_llm)
    monkeypatch.setattr("claimmap.live.asr.get_transcriber", lambda: NoASR())
    monkeypatch.setattr(app_module.store, "load", lambda deck_id: DECK if deck_id == "fixture" else None)

    with TestClient(app_module.app) as client, client.websocket_connect("/ws/live/fixture") as ws:
        ws.send_json({"type": "text", "text": "We have 40 paying customers."})
        seen = []
        for _ in range(20):
            ev = ws.receive_json()
            seen.append(ev)
            if ev["type"] == "question":
                break
        spoken = [e for e in seen if e["type"] == "spoken_claim"]
        assert [(e["relation"], e["deck_claim_id"]) for e in spoken] == [("drift", "c6")]
        assert any(e["type"] == "transcript" and "40" in e["text"] for e in seen)
        assert seen[-1]["question"]["priority"] == 1
        ws.send_json({"type": "stop"})
        for _ in range(10):
            if ws.receive_json().get("state") == "stopped":
                break
        else:
            pytest.fail("no stopped status")
        ws.send_json({"type": "stop"})  # idempotent: must not break the socket


def test_websocket_unknown_deck_is_error(monkeypatch):
    from claimmap import app as app_module

    monkeypatch.setattr(app_module.store, "load", lambda deck_id: None)
    with TestClient(app_module.app) as client, client.websocket_connect("/ws/live/nope") as ws:
        assert ws.receive_json()["type"] == "error"


async def replay(llm_fn=None, speed=4.0):
    events: list[dict] = []

    async def emit(ev):
        events.append(ev)

    s = LiveSession(DECK, emit)  # real Whisper singleton
    await s.start()
    await s.ready()
    await s.replay_file(str(MP3), speed)
    await s.stop()
    return events


@pytest.mark.gpu
def test_real_whisper_replay_transcribes_pitch(monkeypatch):
    monkeypatch.setattr("claimmap.llm.call_json", lambda *a, **k: {"claims": []})
    events = asyncio.run(replay())
    text = " ".join(e["text"] for e in events if e["type"] == "transcript").lower()
    assert "40" in text and "customers" in text, text
    assert "thermo fisher" in text
    ts = [e for e in events if e["type"] == "transcript"]
    assert all(a["t1"] <= b["t0"] + 0.5 for a, b in zip(ts, ts[1:]))   # ordered, no re-emitted overlap
    assert events[-1]["state"] == "stopped"


@pytest.mark.live_llm
@pytest.mark.skipif(os.environ.get("CLAIMMAP_LIVE_LLM") != "1", reason="set CLAIMMAP_LIVE_LLM=1 to call the real LLM")
def test_live_end_to_end_flags_customer_drift():
    events = asyncio.run(replay(speed=4.0))
    drifts = [e for e in events if e["type"] == "spoken_claim" and e["relation"] == "drift"]
    assert any(e["deck_claim_id"] == "c6" for e in drifts), [e for e in events if e["type"] == "spoken_claim"]
    assert any(e["type"] == "question" and "c6" in e["question"]["claim_ids"] for e in events)
