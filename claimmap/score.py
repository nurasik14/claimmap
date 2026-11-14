"""ClaimMap Score v1 (0-100): how well a pitch's claims hold up. Deterministic, no LLM.

The formula was fixed before any real-world outcome was looked at and must not be tuned towards outcomes.
It measures evidence, specificity and internal consistency; it does NOT predict success. See docs/SCORE.md.

A. Evidence balance (40): s = (sum w[supported] - 2 * sum w[contradicted]) / sum w, clamped to [-1, 1];
   points = 40 * (s + 1) / 2, with w = max(load, 0.05) (if every load is 0, w = 1 per claim).
B. Specificity (20): share of claims with a numeric value, or in a quantitative category
   (traction, growth, financials, customers, market) whose text contains a digit.
C. Consistency (20): 20 - 6 * (claims contradicted by arithmetic) - 5 * (drift notes), min 0.
D. Verifiable core (20): of the 5 highest-load claims, the share that is supported, or was checked by
   arithmetic / web / Wayback without being contradicted.
"""
from __future__ import annotations

import re

from claimmap.schemas import Claim, DeckAnalysis, PitchScore, ScoreDriver, ScorePart

VERSION = "v1.1"  # v1.1: half credit in D for concrete-but-unchecked core claims ("unverified is not false")
MIN_W = 0.05
QUANT_CATEGORIES = {"traction", "growth", "financials", "customers", "market"}
CHECKED_METHODS = {"math", "web", "wayback"}
CORE_N = 5
_DIGIT = re.compile(r"\d")


def _weights(claims: list[Claim]) -> list[float]:
    if sum(c.load for c in claims) <= 0:
        return [1.0] * len(claims)
    return [max(c.load, MIN_W) for c in claims]


def evidence_part(claims: list[Claim]) -> ScorePart:
    if not claims:
        return ScorePart(name="Evidence balance", points=20.0, max_points=40,
                         detail="No claims, so the evidence balance is neutral (20 of 40).")
    w = _weights(claims)
    total = sum(w)
    sup = sum(wi for wi, c in zip(w, claims) if c.check.verdict == "supported")
    con = sum(wi for wi, c in zip(w, claims) if c.check.verdict == "contradicted")
    s = max(-1.0, min(1.0, (sup - 2 * con) / total))
    n_sup = sum(c.check.verdict == "supported" for c in claims)
    n_con = sum(c.check.verdict == "contradicted" for c in claims)
    return ScorePart(name="Evidence balance", points=round(40 * (s + 1) / 2, 1), max_points=40,
                     detail=f"{n_sup} supported and {n_con} contradicted of {len(claims)} claims; "
                            f"load-weighted {sup / total:.0%} backed and {con / total:.0%} contradicted.")


def is_specific(c: Claim) -> bool:
    return c.value is not None or (c.category in QUANT_CATEGORIES and bool(_DIGIT.search(c.text)))


def specificity_part(claims: list[Claim]) -> ScorePart:
    n = sum(is_specific(c) for c in claims)
    share = n / len(claims) if claims else 0.0
    return ScorePart(name="Specificity", points=round(20 * share, 1), max_points=20,
                     detail=f"{n} of {len(claims)} claims carry a concrete number.")


def consistency_part(a: DeckAnalysis) -> ScorePart:
    n_math = sum(c.check.verdict == "contradicted" and c.check.method == "math" for c in a.claims)
    n_drift = len(a.drift_notes)
    pts = max(0.0, 20 - 6 * n_math - 5 * n_drift)
    return ScorePart(name="Consistency", points=round(pts, 1), max_points=20,
                     detail=f"{n_math} arithmetic contradictions and {n_drift} numbers that changed during the pitch.")


def is_verifiable(c: Claim) -> bool:
    return c.check.verdict == "supported" or (c.check.method in CHECKED_METHODS and c.check.verdict != "contradicted")


def core_credit(c: Claim) -> float:
    """v1.1: 1 if backed/checked; 0.5 if not yet checked but concrete enough to check ("unverified is not false");
    0 if contradicted or vague."""
    if is_verifiable(c):
        return 1.0
    if c.check.verdict != "contradicted" and is_specific(c):
        return 0.5
    return 0.0


def core_part(claims: list[Claim]) -> ScorePart:
    top = sorted(claims, key=lambda c: (-c.load, c.id))[:CORE_N]
    n = sum(is_verifiable(c) for c in top)
    half = sum(core_credit(c) == 0.5 for c in top)
    share = sum(core_credit(c) for c in top) / len(top) if top else 0.0
    return ScorePart(name="Verifiable core", points=round(20 * share, 1), max_points=20,
                     detail=f"{n} of the {len(top)} most load-bearing claims are backed or independently checked; "
                            f"{half} more are concrete but not yet checked (half credit).")


def drivers(a: DeckAnalysis, limit: int = 8) -> list[ScoreDriver]:
    """Which claims moved the number: each driver's effect is the points gained or lost compared with the same
    claim being neutral (unverified, specific, consistent, checked). Derived from the formulas above."""
    claims = a.claims
    out: list[ScoreDriver] = []
    if claims:
        w = _weights(claims)
        total = sum(w)
        for wi, c in zip(w, claims):
            if c.check.verdict == "supported":
                out.append(ScoreDriver(claim_id=c.id, text=c.text, part="A", effect=round(20 * wi / total, 1),
                                       reason="Backed by evidence; the deal leans on it, so it adds trust."))
            elif c.check.verdict == "contradicted":
                out.append(ScoreDriver(claim_id=c.id, text=c.text, part="A", effect=round(-40 * wi / total, 1),
                                       reason=(c.check.reason or "Contradicted by evidence.")[:220]))
        for c in claims:
            if not is_specific(c):
                out.append(ScoreDriver(claim_id=c.id, text=c.text, part="B", effect=round(-20 / len(claims), 1),
                                       reason="Carries no concrete number, so it cannot be checked against data."))
            if c.check.verdict == "contradicted" and c.check.method == "math":
                out.append(ScoreDriver(claim_id=c.id, text=c.text, part="C", effect=-6.0,
                                       reason="The deck's own numbers can't all be true."))
        top = sorted(claims, key=lambda c: (-c.load, c.id))[:CORE_N]
        for c in top:
            credit = core_credit(c)
            if credit < 1:
                out.append(ScoreDriver(claim_id=c.id, text=c.text, part="D", effect=round(-20 * (1 - credit) / len(top), 1),
                                       reason=f"One of the {len(top)} claims the deal rests on most ({c.load:.0%} load); "
                                              + ("concrete, but nobody has checked it yet." if credit else
                                                 "it could not be checked.")))
    for note in a.drift_notes:
        out.append(ScoreDriver(claim_id="", text=note[:160], part="C", effect=-5.0,
                               reason="The founder said something different live."))
    out.sort(key=lambda d: (-abs(d.effect), d.part, d.claim_id))
    return out[:limit]


def compute_score(a: DeckAnalysis) -> PitchScore:
    parts = [evidence_part(a.claims), specificity_part(a.claims), consistency_part(a), core_part(a.claims)]
    total = round(sum(p.points for p in parts), 1)
    ratio = [p.points / p.max_points for p in parts]
    best = parts[max(range(4), key=lambda i: (ratio[i], -i))]
    worst = parts[min(range(4), key=lambda i: (ratio[i], i))]
    if best is worst:
        summary = f"All parts score alike; {best.name.lower()} {best.points:g}/{best.max_points:g}."
    else:
        summary = (f"Strongest: {best.name.lower()} ({best.points:g}/{best.max_points:g}); "
                   f"weakest: {worst.name.lower()} ({worst.points:g}/{worst.max_points:g}).")
    return PitchScore(total=total, parts=parts, summary=summary, version=VERSION, drivers=drivers(a))


def apply_score(a: DeckAnalysis) -> DeckAnalysis:
    """Set a.score in place (only for finished analyses) and return a."""
    if a.status == "done":
        a.score = compute_score(a)
    return a
