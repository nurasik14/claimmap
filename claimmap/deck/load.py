"""Deterministic load-bearing score ("how much of the deal falls if this block is pulled").

Graph: an edge x -> y means "x rests on y" (y in x.depends_on). The dependents of y are all claims that
transitively rest on y; pulling y makes them all wobble (Jenga).

Formula, for every claim y:
    raw(y) = sum over d in {y} + dependents(y) of  w(d) * DECAY ** dist(d, y)
where dist is the shortest number of depends_on hops from d down to y (0 for y itself),
w(d) = ROOT_WEIGHT for the ask/valuation claims (category "ask" or role raise_amount/pre_money/post_money)
and 1 for every other claim, and DECAY = 0.7. So a claim scores high when many claims rest on it, when they
are close to it, and especially when the ask itself rests on it (directly or through a short chain).

Scaling: ask/valuation claims get load 1.0. Every other claim gets
    load = FLOOR + (TOP - FLOOR) * (raw - 1) / (max_raw - 1)
with FLOOR = 0.1 (nothing rests on it) and TOP = 0.95 (the most load-bearing non-ask claim). If the deck has no
ask claim, the same scaling applies with TOP = 1.0. Results are rounded to 2 decimals.
"""
from __future__ import annotations

from collections import deque

from claimmap.schemas import Claim

DECAY = 0.7
ROOT_WEIGHT = 3.0
FLOOR = 0.1
TOP = 0.95
ROOT_ROLES = {"raise_amount", "pre_money", "post_money"}


def is_root(c: Claim) -> bool:
    return c.category == "ask" or c.role in ROOT_ROLES


def score_load(claims: list[Claim]) -> None:
    """Set `load` on every claim in place."""
    if not claims:
        return
    ids = {c.id for c in claims}
    dependents: dict[str, list[str]] = {c.id: [] for c in claims}  # y -> claims that rest directly on y
    for c in claims:
        for d in c.depends_on:
            if d in ids:
                dependents[d].append(c.id)
    weight = {c.id: (ROOT_WEIGHT if is_root(c) else 1.0) for c in claims}

    raw: dict[str, float] = {}
    for c in claims:
        dist = {c.id: 0}
        q = deque([c.id])
        while q:  # BFS upward through dependents gives shortest distances
            cur = q.popleft()
            for up in dependents[cur]:
                if up not in dist:
                    dist[up] = dist[cur] + 1
                    q.append(up)
        raw[c.id] = sum(weight[d] * DECAY ** k for d, k in dist.items())

    has_root = any(is_root(c) for c in claims)
    top = TOP if has_root else 1.0
    others = [raw[c.id] for c in claims if not is_root(c)]
    max_raw = max(others, default=1.0)
    for c in claims:
        if is_root(c):
            c.load = 1.0
        elif max_raw <= 1.0:
            c.load = FLOOR if has_root else 0.5  # flat graph: nothing to rank by
        else:
            c.load = round(FLOOR + (top - FLOOR) * (raw[c.id] - 1.0) / (max_raw - 1.0), 2)
