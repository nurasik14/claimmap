"""CLI: replay an audio file through the live pipeline and print every event with wall-clock timing.

uv run python -m claimmap.live --deck tests/fixtures/sample_analysis.json --audio tests/fixtures/labloop_pitch.mp3 [--speed 1.0]
"""
from __future__ import annotations

import argparse
import asyncio
import re
import time

from claimmap.live import LiveSession
from claimmap.schemas import DeckAnalysis


def _words(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9$%.]+", s.lower()))


async def main(deck_path: str, audio: str, speed: float) -> None:
    deck = DeckAnalysis.model_validate_json(open(deck_path).read())
    events: list[tuple[float, dict]] = []
    t0 = time.monotonic()

    async def emit(ev: dict) -> None:
        now = time.monotonic() - t0
        events.append((now, ev))
        kind = ev["type"]
        if kind == "transcript":
            body = f'[{ev["t0"]:.1f}-{ev["t1"]:.1f}] {ev["text"]}'
        elif kind == "spoken_claim":
            body = f'{ev["id"]} {ev["relation"]:10} {ev["deck_claim_id"]} "{ev["quote"]}" | {ev["note"]}'
        elif kind == "question":
            q = ev["question"]
            body = f'{q["id"]} p{q["priority"]} {q["text"]}'
        elif kind == "status":
            body = f'{ev["state"]} {ev["detail"]}'
        else:
            body = ev.get("message", "")
        print(f"{now:6.2f}s {kind:13} {body}", flush=True)

    session = LiveSession(deck, emit)
    await session.start()
    await session.ready()
    start = time.monotonic() - t0
    await session.replay_file(audio, speed)
    await session.stop()

    # Latency: when did the audio at transcript t1 get fed (wall) vs when did the claim event arrive?
    segs = [(e["text"], e["t1"]) for _, e in events if e["type"] == "transcript"]
    print("\nlatency from end of the spoken sentence (transcript t1) to spoken_claim event:")
    lats = []
    for when, e in events:
        if e["type"] != "spoken_claim" or not segs:
            continue
        qw = _words(e["quote"])
        text, t1 = max(segs, key=lambda s: len(qw & _words(s[0])))
        lat = when - (start + t1 / speed)
        lats.append(lat)
        print(f'  {e["id"]} {e["relation"]:10} "{e["quote"][:50]}" sentence-end t1={t1:.1f}s -> +{lat:.1f}s')
    if lats:
        print(f"  median {sorted(lats)[len(lats) // 2]:.1f}s, max {max(lats):.1f}s (speed {speed})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--deck", required=True, help="DeckAnalysis JSON")
    ap.add_argument("--audio", required=True)
    ap.add_argument("--speed", type=float, default=1.0)
    a = ap.parse_args()
    asyncio.run(main(a.deck, a.audio, a.speed))
