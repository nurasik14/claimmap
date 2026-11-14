"""Re-check stored analyses with the v4 web pass (every checkable claim, proofs + refutations), then re-score.
usage: uv run python -I scripts/recheck_all.py [deck_id ...]   (no args = demo decks first, then the rest)"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from claimmap import store  # noqa: E402
from claimmap.finalize import finalize  # noqa: E402

if "-h" in sys.argv or "--help" in sys.argv:
    print(__doc__)
    sys.exit(0)

FIRST = ["labloop_deck", "labloop", "labloop_live", "claimmap_own"]
ids = sys.argv[1:] or FIRST + sorted(p.stem for p in Path("data/decks").glob("*.json") if p.stem not in FIRST)


def run(deck_id: str) -> str:
    a = store.load(deck_id)
    if a is None:
        return f"{deck_id}: missing"
    t0 = time.time()
    before = sum(c.check.verdict != "unverified" for c in a.claims)
    finalize(a, store.save, use_web=True)
    after = sum(c.check.verdict != "unverified" for c in a.claims)
    ev = sum(len([s for s in c.check.sources if s.kind in ("web", "math")]) for c in a.claims)
    return (f"{deck_id}: {a.status} in {time.time() - t0:.0f}s, checked {before}->{after} of {len(a.claims)}, "
            f"{ev} evidence, score {a.score.total if a.score else None} | {a.progress[-160:]}")


with ThreadPoolExecutor(max_workers=3) as ex:
    for line in ex.map(run, ids):
        print(line, flush=True)
