"""JSON-file store for deck analyses: data/decks/<id>.json, <id>.pdf and <id>/slides/<n>.png."""
from __future__ import annotations

import re
import shutil
import threading
from pathlib import Path

from claimmap.schemas import DeckAnalysis

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DECKS = DATA / "decks"
DEMO_AUDIO = DATA / "demo_audio"
_lock = threading.Lock()
_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def valid_id(deck_id: str) -> bool:
    return bool(_ID.fullmatch(deck_id or ""))


def save(a: DeckAnalysis) -> None:
    DECKS.mkdir(parents=True, exist_ok=True)
    tmp = DECKS / f"{a.deck_id}.json.tmp"
    with _lock:
        tmp.write_text(a.model_dump_json(indent=2))
        tmp.replace(DECKS / f"{a.deck_id}.json")


def load(deck_id: str) -> DeckAnalysis | None:
    if not valid_id(deck_id):
        return None
    p = DECKS / f"{deck_id}.json"
    if not p.exists():
        return None
    return DeckAnalysis.model_validate_json(p.read_text())


def list_all() -> list[DeckAnalysis]:
    """Every readable analysis, newest first (unreadable files are skipped)."""
    DECKS.mkdir(parents=True, exist_ok=True)
    out = []
    for p in DECKS.glob("*.json"):
        try:
            out.append(DeckAnalysis.model_validate_json(p.read_text()))
        except Exception:
            continue
    return sorted(out, key=lambda a: (a.created_at, a.deck_id), reverse=True)


def pdf_path(deck_id: str) -> Path:
    return DECKS / f"{deck_id}.pdf"


def slides_dir(deck_id: str) -> Path:
    return DECKS / deck_id / "slides"


def slide_path(deck_id: str, n: int) -> Path | None:
    """Path of slide image n (1-based) if the id is valid and the file exists."""
    if not valid_id(deck_id) or n < 1:
        return None
    p = slides_dir(deck_id) / f"{n}.png"
    return p if p.is_file() else None


def delete(deck_id: str) -> bool:
    """Remove the analysis JSON, the PDF and the slide images. Returns False if nothing existed."""
    if not valid_id(deck_id):
        return False
    found = False
    with _lock:
        for p in (DECKS / f"{deck_id}.json", pdf_path(deck_id)):
            if p.exists():
                p.unlink()
                found = True
        d = DECKS / deck_id
        if d.is_dir():
            shutil.rmtree(d)
            found = True
    return found
