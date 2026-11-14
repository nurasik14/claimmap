"""Build the real-material showcase: analyse real decks / replay real pitches, finalize, score, brief.

uv run python -I scripts/real_run.py decks [slug ...]          # PDFs in data/real_decks/ -> real_<slug>
uv run python -I scripts/real_run.py pitches [slug ...]        # data/real_audio/<slug>.mp3 (or .txt transcript) -> yt_<slug>
Counts real LLM calls (call_json + web searches) and prints the total. Never touches data/demo_snapshot.
"""
from __future__ import annotations

import asyncio
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from claimmap import brief, llm, store  # noqa: E402
from claimmap.deck import run_analysis, websearch  # noqa: E402
from claimmap.finalize import finalize  # noqa: E402
from claimmap.score import compute_score  # noqa: E402
from claimmap.schemas import DeckAnalysis  # noqa: E402
from real_items import DECKS, PITCHES  # noqa: E402

CALLS = {"llm": 0, "web": 0}
_calls_lock = threading.Lock()


def _count(kind, fn):
    def wrapped(*a, **k):
        with _calls_lock:
            CALLS[kind] += 1
        return fn(*a, **k)
    return wrapped


llm.call_json = _count("llm", llm.call_json)
websearch.search_claim = _count("web", websearch.search_claim)
for mod in list(sys.modules.values()):  # modules that imported call_json by name
    if getattr(mod, "__name__", "").startswith("claimmap") and getattr(mod, "call_json", None) is not None \
            and mod is not llm:
        mod.call_json = llm.call_json


def log(slug: str, msg: str) -> None:
    print(f"[{slug}] {msg}", file=sys.stderr, flush=True)


def _meta(a: DeckAnalysis, item: dict) -> DeckAnalysis:
    for k in ("source_url", "outcome", "outcome_won", "outcome_source"):
        setattr(a, k, item.get(k))
    a.title = item["title"]
    return a


def _finish(a: DeckAnalysis, item: dict) -> DeckAnalysis:
    _meta(a, item)
    if a.status == "done":
        a.score = compute_score(a)
        store.save(a)
        try:
            a.brief = brief.generate_brief(a)
        except Exception as e:
            log(item["slug"], f"brief failed: {e}")
    store.save(a)
    log(item["slug"], f"{a.status}: {len(a.claims)} claims, score {a.score.total if a.score else None}")
    return a


def run_deck(item: dict) -> DeckAnalysis:
    data = (ROOT / item["pdf"]).read_bytes()
    deck_id = item["deck_id"]
    store.DECKS.mkdir(parents=True, exist_ok=True)
    store.pdf_path(deck_id).write_bytes(data)

    def on_update(a: DeckAnalysis) -> None:
        store.save(_meta(a, item))
        log(item["slug"], f"[{a.status}] {a.progress}")

    a, _ = run_analysis(data, deck_id, on_update, use_web=True, title=item["title"])
    return _finish(a, item)


def _chunks(text: str, words: int = 70) -> list[str]:
    """Sentence-aligned chunks of about `words` words, so each analysis call sees whole statements."""
    out, cur = [], []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        cur.append(sent)
        if sum(len(s.split()) for s in cur) >= words:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


async def _feed(a: DeckAnalysis, text: str, slug: str) -> DeckAnalysis:
    from claimmap.live import LiveSession

    class _NoASR:  # transcript is fed as text, the speech model is not needed in the session
        async def warm(self):
            return "text"

        async def transcribe(self, audio):
            return []

    async def emit(ev: dict) -> None:
        if ev["type"] == "claim_added":
            c = ev["claim"]
            log(slug, f"+ {c['id']} [{c['category']}] {c['text']}")
        elif ev["type"] == "spoken_claim" and ev["relation"] == "drift":
            log(slug, f"DRIFT {ev['quote']} :: {ev['note']}")
        elif ev["type"] == "error":
            log(slug, f"ERROR {ev['message']}")

    s = LiveSession(a, emit, transcriber=_NoASR(), persist=store.save)
    await s.start()
    for chunk in _chunks(text):
        await s.feed_text(chunk)
        await asyncio.sleep(0.6)
        while s._analysis_task is not None and not s._analysis_task.done():  # one chunk per analysis call
            await asyncio.sleep(0.2)
    await s.stop()
    return s.deck


def transcribe(audio: Path) -> str:
    """Whole-file Whisper transcription (GPU when available)."""
    from claimmap.live import asr

    t = asr.get_transcriber()

    async def go():
        await t.warm()
        pcm = await asr.decode_file(str(audio))
        segs = await t.transcribe(asr.pcm16_to_float(pcm))
        return " ".join(getattr(s, "text", s[2] if isinstance(s, tuple) else str(s)).strip() for s in segs)

    return asyncio.run(go())


def run_pitch(item: dict) -> DeckAnalysis | None:
    base = ROOT / "data" / "real_audio" / item["slug"]
    txt = base.with_suffix(".txt")
    if not txt.exists():
        audio = base.with_suffix(".mp3")
        if not audio.exists():
            log(item["slug"], "no audio or transcript; skipped")
            return None
        txt.write_text(transcribe(audio))
    text = txt.read_text()
    log(item["slug"], f"transcript {len(text.split())} words")
    a = DeckAnalysis(deck_id=item["deck_id"], status="done", mode="live", title=item["title"],
                     created_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds"))
    store.save(_meta(a, item))
    a = asyncio.run(_feed(a, text, item["slug"]))
    a = finalize(a, lambda x: (store.save(_meta(x, item)), log(item["slug"], f"[{x.status}] {x.progress}")))
    return _finish(a, item)


def main(argv: list[str]) -> int:
    if "--fake" in argv:  # smoke test of the plumbing: no real LLM / web calls
        import os
        os.environ["CLAIMMAP_FAKE_LLM"] = "1"
        argv = [x for x in argv if x != "--fake"]
    kind, want = argv[0], set(argv[1:])
    items = [i for i in (DECKS if kind == "decks" else PITCHES) if not want or i["slug"] in want]
    fn = run_deck if kind == "decks" else run_pitch
    if kind == "pitches":  # transcribe serially on the GPU first, then analyse in parallel
        for i in items:
            base = ROOT / "data" / "real_audio" / i["slug"]
            if not base.with_suffix(".txt").exists() and base.with_suffix(".mp3").exists():
                log(i["slug"], "transcribing")
                base.with_suffix(".txt").write_text(transcribe(base.with_suffix(".mp3")))
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(fn, items))
    for i, a in zip(items, results):
        if a is not None:
            print(f"{a.deck_id}\t{a.status}\t{len(a.claims)} claims\tscore={a.score.total if a.score else None}\t"
                  f"won={i.get('outcome_won')}")
    print(f"real calls: {CALLS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
