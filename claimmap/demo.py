"""Build demo analyses: replay a pitch recording through a real LiveSession (Whisper + LLM), finalize, brief.

uv run python -m claimmap.demo --title "LabLoop pitch (live only)" --deck-id labloop_live   # live only
uv run python -m claimmap.demo --onto labloop                                                # deck + live
Options: --audio data/demo_audio/labloop_pitch.mp3 --speed 1.0 --no-brief
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from claimmap import brief, store
from claimmap.finalize import finalize
from claimmap.live import LiveSession
from claimmap.schemas import DeckAnalysis


async def replay(a: DeckAnalysis, audio: str, speed: float) -> DeckAnalysis:
    async def emit(ev: dict) -> None:
        kind = ev["type"]
        if kind == "spoken_claim":
            print(f"  {ev['id']} {ev['relation']:10} {ev['deck_claim_id']} \"{ev['quote']}\" {ev['note']}", file=sys.stderr)
        elif kind == "claim_added":
            c = ev["claim"]
            print(f"  + node {c['id']} [{c['category']}] {c['text']} <- {c['depends_on']} load={c['load']}", file=sys.stderr)
        elif kind == "error":
            print(f"  ERROR {ev['message']}", file=sys.stderr)

    s = LiveSession(a, emit, persist=store.save)
    await s.start()
    await s.ready()
    await s.replay_file(audio, speed)
    await s.stop()
    return s.deck


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m claimmap.demo", description=__doc__.splitlines()[0])
    ap.add_argument("--onto", help="existing analysis id to run the live pitch on (deck + live)")
    ap.add_argument("--deck-id", default="labloop_live", help="id for a new live-only session")
    ap.add_argument("--title", default="LabLoop pitch (live only)")
    ap.add_argument("--audio", default=str(store.DEMO_AUDIO / "labloop_pitch.mp3"))
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--no-brief", action="store_true")
    args = ap.parse_args(argv)

    if args.onto:
        a = store.load(args.onto)
        if a is None:
            print(f"unknown analysis {args.onto}", file=sys.stderr)
            return 1
    else:
        a = DeckAnalysis(deck_id=args.deck_id, status="done", mode="live", title=args.title,
                         created_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds"))
        store.save(a)
    print(f"replaying {args.audio} into {a.deck_id} ({a.mode})", file=sys.stderr)
    a = asyncio.run(replay(a, args.audio, args.speed))
    a = finalize(a, lambda x: (store.save(x), print(f"  [{x.status}] {x.progress}", file=sys.stderr)))
    if not args.no_brief and a.status == "done":
        a.brief = brief.generate_brief(a)
        store.save(a)
        print(brief.to_markdown(a, a.brief))
    return 0 if a.status == "done" else 1


if __name__ == "__main__":
    raise SystemExit(main())
