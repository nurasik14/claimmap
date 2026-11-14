"""FastAPI app. Routes and message formats are the contract (.agents/CONTRACT.md + CONTRACT-v2.md).
Run: uv run uvicorn claimmap.app:app --port 8000"""
from __future__ import annotations

import asyncio
import json
import threading
import uuid
from datetime import datetime, timezone

from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from claimmap import brief as brief_mod
from claimmap import llm, store
from claimmap.deck import analyze_deck
from claimmap.finalize import finalize
from claimmap.live import LiveSession
from claimmap.schemas import Brief, CheckingEvent, DeckAnalysis, ErrorEvent
from claimmap.score import compute_score

BUSY = {"queued", "parsing", "extracting", "checking"}

app = FastAPI(title="ClaimMap")
STATIC = store.ROOT / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")
store.DEMO_AUDIO.mkdir(parents=True, exist_ok=True)
# Demo audio files, so the browser can play a replayed pitch audibly while the server analyses it.
app.mount("/demo-audio", StaticFiles(directory=store.DEMO_AUDIO), name="demo-audio")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.post("/api/deck")
async def upload_deck(file: UploadFile):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Please upload a PDF deck.")
    deck_id = uuid.uuid4().hex[:10]
    store.DECKS.mkdir(parents=True, exist_ok=True)
    store.pdf_path(deck_id).write_bytes(data)
    title = Path(file.filename or "").stem[:120] or "Untitled deck"
    a = DeckAnalysis(deck_id=deck_id, status="queued", progress="Queued", title=title, created_at=_now())
    store.save(a)

    def run():
        try:
            final = analyze_deck(data, deck_id, store.save, title=title, created_at=a.created_at)
            store.save(final)
        except Exception as e:  # analyze_deck should not raise; belt and braces
            store.save(a.model_copy(update={"status": "error", "error": f"{type(e).__name__}: {e}"}))

    threading.Thread(target=run, daemon=True).start()
    return {"deck_id": deck_id}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _load_or_404(deck_id: str) -> DeckAnalysis:
    a = store.load(deck_id)
    if a is None:
        raise HTTPException(404, "Unknown deck")
    return _with_score(a)


def _with_score(a: DeckAnalysis) -> DeckAnalysis:
    """Analyses saved before the score existed (e.g. restored demo snapshots) get it computed on read."""
    if a.score is None and a.status == "done" and a.claims:
        a.score = compute_score(a)
    return a


class SessionIn(BaseModel):
    title: str = ""


@app.post("/api/session")
def new_session(body: SessionIn):
    deck_id = uuid.uuid4().hex[:10]
    title = body.title.strip()[:120] or "Live pitch"
    store.save(DeckAnalysis(deck_id=deck_id, status="done", mode="live", title=title, progress="Ready to listen",
                            created_at=_now()))
    return {"deck_id": deck_id}


@app.get("/api/deck/{deck_id}")
def get_deck(deck_id: str) -> DeckAnalysis:
    return _load_or_404(deck_id)


@app.delete("/api/deck/{deck_id}")
def delete_deck(deck_id: str):
    if not store.delete(deck_id):
        raise HTTPException(404, "Unknown deck")
    return {"ok": True}


@app.get("/api/deck/{deck_id}/slides/{n}.png")
def slide_image(deck_id: str, n: str):
    p = store.slide_path(deck_id, int(n)) if n.isdigit() and len(n) <= 4 else None
    if p is None:
        raise HTTPException(404, "No such slide")
    return FileResponse(p, media_type="image/png")


def library_item(a: DeckAnalysis) -> dict:
    counts = {k: 0 for k in ("contradicted", "supported", "unverified", "missing")}
    for c in a.claims:
        counts[c.check.verdict] += 1
    contra = sorted((c for c in a.claims if c.check.verdict == "contradicted"), key=lambda c: (-c.load, c.id))
    top_flag = None
    if contra:
        top_flag = f"{contra[0].text}: {contra[0].check.reason}".strip().rstrip(":")[:200]
    elif a.drift_notes:
        top_flag = a.drift_notes[0][:200]
    return {"deck_id": a.deck_id, "title": a.title or a.company or a.deck_id, "company": a.company, "mode": a.mode,
            "status": a.status, "progress": a.progress, "created_at": a.created_at, "slide_count": a.slide_count,
            "claim_count": len(a.claims), "counts": counts, "top_flag": top_flag,
            "thumb": f"/api/deck/{a.deck_id}/slides/1.png" if a.slide_count else None,
            # v3: ClaimMap Score + real-world provenance (rendered by the library cards)
            "score": a.score.total if a.score else None, "outcome": a.outcome, "outcome_won": a.outcome_won,
            "source_url": a.source_url, "capture": a.capture}


@app.get("/api/decks")
def list_decks():
    return [library_item(_with_score(a)) for a in store.list_all()]


def start_finalize(a: DeckAnalysis, progress: str = "Finalizing: re-checking every claim") -> bool:
    """Start the AI fact-check (arithmetic + web checks + questions + score) in the background. False if busy."""
    if a.status in BUSY:
        return False
    a.status, a.progress, a.brief = "checking", progress, None
    store.save(a)
    threading.Thread(target=finalize, args=(a, store.save), daemon=True).start()
    return True


@app.post("/api/deck/{deck_id}/clear_live")
def clear_live(deck_id: str):
    """(orchestrator) Remove everything said live (transcript, spoken claims, drift, live questions) to re-pitch.
    The deck's own claims and their checks are kept."""
    a = _load_or_404(deck_id)
    if a.status in BUSY:
        raise HTTPException(409, f"Analysis is busy ({a.status}); try again when it is done")
    spoken = {c.id for c in a.claims if c.source == "spoken"}
    a.claims = [c for c in a.claims if c.id not in spoken]
    for c in a.claims:
        c.depends_on = [d for d in c.depends_on if d not in spoken]
    a.questions = [q for q in a.questions if not q.id.startswith("lq") and not (set(q.claim_ids) & spoken)]
    a.transcript, a.drift_notes, a.capture, a.brief = [], [], None, None
    if a.mode == "deck+live":
        a.mode = "deck"
    try:
        a.score = compute_score(a) if a.claims else None
    except Exception:
        a.score = None
    a.progress = "Live pitch cleared; ready to pitch again"
    store.save(a)
    return {"cleared": len(spoken), "mode": a.mode}


@app.post("/api/deck/{deck_id}/finalize")
def finalize_deck(deck_id: str):
    a = _load_or_404(deck_id)
    if not start_finalize(a):
        raise HTTPException(409, f"Analysis is busy ({a.status}); try again when it is done")
    return {"status": "checking"}


async def _auto_finalize(session: LiveSession, deck_id: str, emit) -> None:
    """(orchestrator) Every live session that added claims or drift is fact-checked automatically on stop."""
    if not getattr(session, "changed", False) or getattr(session, "_auto_done", False):
        return
    session._auto_done = True
    a = store.load(deck_id)
    if a is not None and start_finalize(a, "Checking what was said live: arithmetic, web evidence, questions, score"):
        try:
            await emit(CheckingEvent(detail="AI is checking what was said: arithmetic, web evidence, questions and score.").model_dump())
        except Exception:
            pass


_brief_locks: dict[str, threading.Lock] = {}
_brief_locks_guard = threading.Lock()


def _brief(deck_id: str, refresh: bool) -> tuple[DeckAnalysis, Brief]:
    a = _load_or_404(deck_id)
    if a.brief is not None and not refresh:
        return a, a.brief
    with _brief_locks_guard:
        lock = _brief_locks.setdefault(deck_id, threading.Lock())
    with lock:  # one generation per deck at a time; a concurrent request reuses the result
        a = _load_or_404(deck_id)
        if a.brief is not None and not refresh:
            return a, a.brief
        if not a.claims and not a.transcript:
            raise HTTPException(409, "Nothing to brief yet: no claims and no transcript")
        try:
            b = brief_mod.generate_brief(a)
        except llm.LLMError as e:
            raise HTTPException(502, f"Brief generation failed: {e}"[:300])
        latest = store.load(deck_id) or a  # keep changes saved while the model was writing
        latest.brief = b
        store.save(latest)
        return latest, b


@app.get("/api/deck/{deck_id}/brief")
def get_brief(deck_id: str, refresh: int = 0) -> Brief:
    return _brief(deck_id, bool(refresh))[1]


@app.get("/api/deck/{deck_id}/brief.md")
def get_brief_md(deck_id: str, refresh: int = 0):
    a, b = _brief(deck_id, bool(refresh))
    return PlainTextResponse(brief_mod.to_markdown(a, b), media_type="text/markdown; charset=utf-8")


@app.get("/api/demo-audio")
def demo_audio():
    store.DEMO_AUDIO.mkdir(parents=True, exist_ok=True)
    return sorted(p.name for p in store.DEMO_AUDIO.iterdir() if p.suffix in {".mp3", ".wav", ".m4a", ".ogg", ".webm"})


@app.websocket("/ws/live/{deck_id}")
async def live(ws: WebSocket, deck_id: str):
    await ws.accept()
    deck = store.load(deck_id)
    if deck is None:
        await ws.send_json(ErrorEvent(message="Unknown deck").model_dump())
        await ws.close()
        return
    send_lock = asyncio.Lock()

    async def emit(event: dict):
        async with send_lock:
            await ws.send_json(event)

    session = LiveSession(deck, emit, persist=store.save)
    await session.start()
    tasks: set[asyncio.Task] = set()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                await session.feed_pcm(msg["bytes"])
                continue
            try:
                cmd = json.loads(msg.get("text") or "{}")
            except json.JSONDecodeError:
                await emit(ErrorEvent(message="Bad message").model_dump())
                continue
            if cmd.get("type") == "text":
                await session.feed_text(str(cmd.get("text", "")))
            elif cmd.get("type") == "replay":
                name = str(cmd.get("file", ""))
                path = store.DEMO_AUDIO / name
                if "/" in name or ".." in name or not path.exists():
                    await emit(ErrorEvent(message=f"Unknown demo audio: {name}").model_dump())
                    continue
                t = asyncio.create_task(session.replay_file(str(path), float(cmd.get("speed", 1.0))))
                tasks.add(t)
                t.add_done_callback(tasks.discard)
            elif cmd.get("type") == "stop":
                await session.stop()
                await _auto_finalize(session, deck_id, emit)
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        try:
            await session.stop()
            await _auto_finalize(session, deck_id, emit)
        except Exception:
            pass
