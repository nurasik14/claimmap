"""Finalize: after a live session (or any time), re-run the checks over ALL claims, deck and spoken.

Arithmetic (deck/mathcheck) -> web search on the top load-bearing unverified market/competition/traction claims
(time-boxed, API backend only, off with CLAIMMAP_DECK_NO_WEB=1) -> load scores -> questions (fresh LLM questions
merged with the live questions that still apply, at most MAX_QUESTIONS). Clears the cached brief.
"""
from __future__ import annotations

import os
import time
from typing import Callable

from claimmap import llm
from claimmap.deck import websearch
from claimmap.deck.load import score_load
from claimmap.deck.mathcheck import find_issues
from claimmap.deck.merge import add_evidence
from claimmap.deck.questions import write_questions
from claimmap.schemas import Claim, DeckAnalysis, Question, Source
from claimmap.score import compute_score

PLACEHOLDER = "Said live, not yet checked"
CHECKED_NOTHING = "Said live; no arithmetic or web evidence found yet."
MAX_QUESTIONS = 6
MAX_LIVE_QUESTIONS = 3
WEB_TARGETS = websearch.MAX_CLAIMS      # v4: every checkable claim
WEB_BUDGET_S = websearch.TOTAL_BUDGET
WEB_CATEGORIES = websearch.CATEGORIES

OnUpdate = Callable[[DeckAnalysis], None]


def finalize(a: DeckAnalysis, on_update: OnUpdate, use_web: bool | None = None) -> DeckAnalysis:
    """Never raises: on failure the analysis gets status "error" with a readable message."""
    if use_web is None:
        use_web = os.environ.get("CLAIMMAP_DECK_NO_WEB") != "1" and llm.backend() == "api" \
            and os.environ.get("CLAIMMAP_FAKE_LLM") != "1"
    t0 = time.perf_counter()

    def emit(progress: str, status: str = "checking") -> None:
        a.status, a.progress = status, progress  # type: ignore[assignment]
        try:
            on_update(a.model_copy(deep=True))
        except Exception:
            pass

    try:
        a.brief, a.error = None, None
        n_spoken = sum(c.source == "spoken" for c in a.claims)
        emit(f"Re-checking {len(a.claims)} claims ({n_spoken} spoken): arithmetic")
        for c in a.claims:  # the live placeholder is replaced by what the checks find
            if c.source == "spoken" and c.check.reason.startswith(PLACEHOLDER):
                c.check.reason = c.check.reason[len(PLACEHOLDER):].strip()
        n_math = apply_math_once(a.claims)
        score_load(a.claims)
        notes = [f"{n_math} arithmetic findings"]

        targets = pick_web_targets(a.claims) if use_web else []
        if targets:
            emit(f"{n_math} arithmetic findings. Searching the web for {len(targets)} load-bearing claims")
            context = f"{a.company or a.title}\n{a.slides[0][:500] if a.slides else _transcript_head(a)}"
            res = websearch.check_web(a.claims, context, WEB_BUDGET_S, targets=targets)
            n = websearch.apply_web(res, a.claims)
            notes.append(f"web: {n} verdicts" + (f", {'; '.join(res.notes)}" if res.notes else ""))
        else:
            notes.append("web checks off" if not use_web else "nothing to search on the web")

        for c in a.claims:
            if c.source == "spoken" and not c.check.reason:
                c.check.reason = CHECKED_NOTHING
        score_load(a.claims)
        emit("Writing the questions that decide the deal")
        a.questions = merge_questions(write_questions(a.claims, a.company or a.title), a.questions, a.claims)
        n_contra = sum(c.check.verdict == "contradicted" for c in a.claims)
        a.score = compute_score(a)
        emit(f"Finalized in {time.perf_counter() - t0:.0f}s: {len(a.claims)} claims, {n_contra} contradicted, "
             f"{len(a.questions)} questions ({'; '.join(notes)})", status="done")
    except Exception as e:
        a.error = f"{type(e).__name__}: {e}"[:500]
        emit(f"Finalize failed: {a.error}", status="error")
    return a


def apply_math_once(claims: list[Claim]) -> int:
    """Deck arithmetic over every role-tagged claim; a finding already attached is not added twice."""
    by_id = {c.id: c for c in claims}
    n = 0
    for f in find_issues(claims):
        c = by_id.get(f.claim_id)
        if c is None or any(s.kind == "math" and s.quote == f.arithmetic for s in c.check.sources):
            continue
        st = {"contradicted": "refutes", "supported": "supports"}.get(f.verdict or "", "context")
        add_evidence(c, f.verdict, f.reason, [Source(kind="math", title="Deck arithmetic", quote=f.arithmetic, stance=st)], "math")
        n += 1
    return n


def pick_web_targets(claims: list[Claim], n: int = WEB_TARGETS) -> list[Claim]:
    cands = [c for c in claims if c.category in WEB_CATEGORIES and c.check.verdict == "unverified"
             and c.role not in websearch.UNSEARCHABLE_ROLES and not any(s.kind == "web" for s in c.check.sources)
             and (c.category in websearch.ALWAYS or websearch._has_number(c))]
    return sorted(cands, key=lambda c: (-c.load, c.id))[:n]


def merge_questions(fresh: list[Question], old: list[Question], claims: list[Claim]) -> list[Question]:
    """Live drift questions first (they are what changed in the room), then the fresh ones, then other live ones."""
    ids = {c.id for c in claims}
    live = [q for q in old if q.id.startswith("lq") and all(c in ids for c in q.claim_ids)]
    drift = [q for q in live if q.priority == 1][-MAX_LIVE_QUESTIONS:]
    other_live = [q for q in live if q.priority != 1]
    covered = {cid for q in drift for cid in q.claim_ids}
    rest = [q for q in fresh if not (q.claim_ids and set(q.claim_ids) <= covered)]
    merged = (drift + rest + other_live)[:MAX_QUESTIONS]
    return [q.model_copy(update={"priority": i}) for i, q in enumerate(merged, 1)]


def _transcript_head(a: DeckAnalysis) -> str:
    return " ".join(s.text for s in a.transcript)[:500]
