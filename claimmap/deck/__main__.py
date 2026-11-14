"""CLI: analyse a deck and save it to the store (so the demo can preload decks).

uv run python -m claimmap.deck <file.pdf> [--deck-id X] [--no-web]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from claimmap import store
from claimmap.deck import run_analysis
from claimmap.schemas import DeckAnalysis


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m claimmap.deck", description=__doc__.splitlines()[0])
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--deck-id", help="store id (default: file name)")
    ap.add_argument("--no-web", action="store_true", help="skip the Wayback and web-search checks")
    args = ap.parse_args(argv)

    data = args.pdf.read_bytes()
    deck_id = args.deck_id or re.sub(r"[^a-z0-9_-]+", "-", args.pdf.stem.lower()).strip("-") or "deck"

    def on_update(a: DeckAnalysis) -> None:
        store.save(a)
        print(f"  [{a.status}] {a.progress}", file=sys.stderr, flush=True)

    store.DECKS.mkdir(parents=True, exist_ok=True)
    store.pdf_path(deck_id).write_bytes(data)
    a, timings = run_analysis(data, deck_id, on_update, use_web=not args.no_web, title=args.pdf.stem)
    store.save(a)
    print(summary(a, timings))
    return 0 if a.status == "done" else 1


def summary(a: DeckAnalysis, timings: dict[str, float]) -> str:
    lines = [f"deck_id={a.deck_id} company={a.company!r} website={a.website} status={a.status}",
             f"slides={a.slide_count} claims with boxes={sum(bool(c.boxes) for c in a.claims)}/{len(a.claims)}"]
    if a.error:
        lines.append(f"ERROR: {a.error}")
    lines.append(f"progress: {a.progress}")
    lines.append("claims (by load):")
    for c in sorted(a.claims, key=lambda c: (-c.load, c.id)):
        deps = ",".join(c.depends_on) or "-"
        lines.append(f"  {c.id:>3} load={c.load:.2f} {c.check.verdict:<12} {c.check.method:<7} s{c.slide} "
                     f"[{c.category}{'/' + c.role if c.role else ''}] {c.text}  <- {deps}")
        if c.check.reason:
            lines.append(f"        {c.check.reason[:220]}")
    lines.append("questions:")
    for q in a.questions:
        lines.append(f"  {q.priority}. {q.text}  ({','.join(q.claim_ids)})")
        lines.append(f"     why: {q.why} | ask for: {q.evidence_to_request}")
    lines.append("timings (s): " + ", ".join(f"{k}={v}" for k, v in timings.items()))
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
