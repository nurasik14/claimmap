"""Combine evidence from several checkers into one Check per claim."""
from __future__ import annotations

from typing import Literal, Optional

from claimmap.schemas import Claim, Source

RANK = {"contradicted": 3, "supported": 2, "unverified": 1, "missing": 0}
Method = Literal["math", "wayback", "web", "llm", "none"]


def add_evidence(claim: Claim, verdict: Optional[str], reason: str, sources: list[Source], method: Method) -> None:
    """Attach evidence to a claim.

    verdict=None means "a note only": the reason and sources are added but the verdict is unchanged.
    Otherwise the stronger verdict wins (contradicted > supported > unverified); its method is recorded and
    its reason goes first. Reasons from all checkers are kept, in that order."""
    ch = claim.check
    reason = reason.strip()
    stronger = verdict is not None and RANK.get(verdict, 0) > RANK.get(ch.verdict, 0)
    if stronger:
        ch.verdict = verdict  # type: ignore[assignment]
        ch.method = method
        ch.reason = f"{reason} {ch.reason}".strip()
        ch.sources = list(sources) + ch.sources
    else:
        if ch.method == "none":
            ch.method = method
        if reason and reason not in ch.reason:
            ch.reason = f"{ch.reason} {reason}".strip()
        ch.sources.extend(sources)
