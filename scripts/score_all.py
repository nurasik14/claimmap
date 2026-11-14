"""Backfill: compute and store the ClaimMap Score (v1) for every finished analysis in data/decks/. No LLM calls.

uv run python -I scripts/score_all.py            # data/demo_snapshot is never touched
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from claimmap import store  # noqa: E402
from claimmap.score import compute_score  # noqa: E402

for a in store.list_all():
    if a.status != "done":
        print(f"{a.deck_id:28} {a.status:10} (skipped)")
        continue
    a.score = compute_score(a)
    store.save(a)
    print(f"{a.deck_id:28} {a.score.total:5.1f}  " + "  ".join(f"{p.name} {p.points:g}" for p in a.score.parts))
