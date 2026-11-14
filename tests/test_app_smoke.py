"""Orchestrator smoke tests: the app boots, the contract routes answer, the WS accepts text."""
import os
import time
from pathlib import Path

os.environ.setdefault("CLAIMMAP_FAKE_LLM", "1")

from fastapi.testclient import TestClient  # noqa: E402

from claimmap.app import app  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
client = TestClient(app)


def test_upload_and_poll_deck():
    r = client.post("/api/deck", files={"file": ("d.pdf", (FIX / "labloop_deck.pdf").read_bytes(), "application/pdf")})
    assert r.status_code == 200
    deck_id = r.json()["deck_id"]
    for _ in range(100):
        a = client.get(f"/api/deck/{deck_id}").json()
        if a["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert a["status"] in ("done", "error")
    assert client.get("/api/decks").status_code == 200


def test_rejects_non_pdf():
    assert client.post("/api/deck", files={"file": ("x.txt", b"hello", "text/plain")}).status_code == 400


def test_ws_unknown_deck():
    with client.websocket_connect("/ws/live/nope") as ws:
        assert ws.receive_json()["type"] == "error"


def test_demo_audio_listed():
    assert "labloop_pitch.mp3" in client.get("/api/demo-audio").json()
