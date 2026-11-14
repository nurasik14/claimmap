"""Deterministic arithmetic over the deck's own role-tagged numbers.

A finding is CONTRADICTED only when the deck's numbers cannot all be true at once; "supported" means they are
consistent; verdict None adds the arithmetic as a note without changing the verdict. Never invents numbers.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from claimmap.deck.merge import add_evidence
from claimmap.schemas import Claim, Source

IMPOSSIBLE_PER_HEAD = 1_500   # USD/person/month below which a team cannot be paid at all
LOW_PER_HEAD = 5_000          # below this, flag the number


@dataclass
class Finding:
    claim_id: str
    verdict: Optional[str]  # "supported" | "contradicted" | None (note only)
    reason: str
    arithmetic: str


def usd(x: float) -> str:
    a = abs(x)
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if a >= div:
            v = x / div
            return f"${v:.1f}{suf}".replace(".0" + suf, suf) if v < 100 else f"${v:.0f}{suf}"
    return f"${x:.0f}"


def pct(x: float) -> str:
    return f"{x * 100:.1f}%".replace(".0%", "%")


def _by_role(claims: list[Claim]) -> dict[str, Claim]:
    out: dict[str, Claim] = {}
    for c in claims:
        if c.role and c.value is not None and c.value > 0 and c.role not in out:
            out[c.role] = c
    return out


def find_issues(claims: list[Claim], growth_period_months: float | None = None) -> list[Finding]:
    r = _by_role(claims)
    v = {k: c.value for k, c in r.items()}
    out: list[Finding] = []

    # 1. TAM x share vs revenue forecast
    market = r.get("tam") or r.get("sam")
    fc = r.get("revenue_forecast")
    if fc and market:
        mkt_name = "TAM" if market.role == "tam" else "SAM"
        share = v.get("market_share_target")
        if fc.value > market.value:
            out.append(Finding(fc.id, "contradicted",
                               f"The {usd(fc.value)} forecast is larger than the whole {usd(market.value)} {mkt_name}.",
                               f"{usd(fc.value)} > {mkt_name} {usd(market.value)}"))
        elif share and share <= 1:
            cap = market.value * share
            sym = f"{usd(market.value)} x {pct(share)} = {usd(cap)}"
            if fc.value <= cap * 1.1:
                out.append(Finding(fc.id, "supported",
                                   f"{mkt_name} x target share = {usd(cap)}, so a {usd(fc.value)} forecast fits the deck's own market maths.",
                                   f"{sym} >= {usd(fc.value)}"))
            else:
                out.append(Finding(fc.id, "contradicted",
                                   f"{mkt_name} x target share is only {usd(cap)}, below the {usd(fc.value)} forecast: the share target and forecast cannot both hold.",
                                   f"{sym} < {usd(fc.value)}"))
        else:
            out.append(Finding(fc.id, None, f"The forecast is {pct(fc.value / market.value)} of the {mkt_name}.",
                               f"{usd(fc.value)} / {usd(market.value)} = {pct(fc.value / market.value)}"))
    som = r.get("som")
    if fc and som and fc.value > som.value * 1.1:
        out.append(Finding(fc.id, "contradicted",
                           f"The {usd(fc.value)} forecast exceeds the deck's own obtainable market (SOM {usd(som.value)}).",
                           f"{usd(fc.value)} > SOM {usd(som.value)}"))

    # 2. Compounded monthly growth vs current MRR
    g, mrr = r.get("growth_rate_monthly"), r.get("mrr")
    if g and mrr and g.value < 5:
        if growth_period_months:
            n = round(growth_period_months)
            mult = (1 + g.value) ** n
            start = mrr.value / mult
            out.append(Finding(g.id, None,
                               f"{pct(g.value)} a month for {n} months is {mult:.1f}x growth, so MRR {n} months ago would have been about {usd(start)}.",
                               f"{1 + g.value:g}^{n} = {mult:.1f}; {usd(mrr.value)} / {mult:.1f} = {usd(start)}"))
        else:
            mult = (1 + g.value) ** 12
            out.append(Finding(g.id, None,
                               f"If {pct(g.value)} monthly growth held for 12 more months, MRR would reach {usd(mrr.value * mult)} ({mult:.0f}x).",
                               f"{usd(mrr.value)} x {1 + g.value:g}^12 = {usd(mrr.value * mult)}"))

    # 3. MRR x 12 vs ARR
    arr = r.get("arr")
    if mrr and arr:
        implied = mrr.value * 12
        sym = f"{usd(mrr.value)} x 12 = {usd(implied)} vs ARR {usd(arr.value)}"
        if abs(implied - arr.value) / max(arr.value, implied) <= 0.25:
            out.append(Finding(arr.id, "supported", "MRR x 12 matches the stated ARR.", sym))
        else:
            out.append(Finding(arr.id, "contradicted",
                               f"MRR x 12 is {usd(implied)}, which does not match the stated {usd(arr.value)} ARR.", sym))

    # 4. Revenue per customer
    cust = r.get("customers")
    if mrr and cust:
        per = mrr.value / cust.value
        out.append(Finding(mrr.id, None, f"{usd(mrr.value)} / {cust.value:g} customers = {usd(per)} per customer per month.",
                           f"{usd(mrr.value)} / {cust.value:g} = {usd(per)}"))
    elif arr and cust:
        per = arr.value / cust.value
        out.append(Finding(arr.id, None, f"{usd(arr.value)} / {cust.value:g} customers = {usd(per)} per customer per year.",
                           f"{usd(arr.value)} / {cust.value:g} = {usd(per)}"))

    # 5. Burn per head
    burn, team = r.get("monthly_burn"), r.get("team_size")
    if burn and team and team.value >= 1:
        per = burn.value / team.value
        sym = f"{usd(burn.value)} / {team.value:g} = {usd(per)} per person per month"
        if per < IMPOSSIBLE_PER_HEAD:
            out.append(Finding(team.id, "contradicted",
                               f"A {usd(burn.value)} monthly burn cannot pay {team.value:g} people ({usd(per)} each per month, salaries included).",
                               sym))
        elif per < LOW_PER_HEAD:
            out.append(Finding(team.id, None,
                               f"Red flag: a {usd(burn.value)} monthly burn with {team.value:g} people is only {usd(per)} per person per month, below typical fully-loaded salaries; either the team size or the burn is off (or most of the team is unpaid, part-time or offshore).",
                               sym))
            out.append(Finding(burn.id, None, f"Only {usd(per)} per team member per month.", sym))

    # 6. Runway = raise / burn
    raise_ = r.get("raise_amount")
    if raise_ and burn:
        months = raise_.value / burn.value
        sym = f"{usd(raise_.value)} / {usd(burn.value)} per month = {months:.0f} months"
        runway = r.get("runway_months")
        if runway:
            if abs(months - runway.value) / max(runway.value, months) <= 0.3:
                out.append(Finding(runway.id, "supported", f"Raise / current burn gives about {months:.0f} months, consistent with the stated runway.", sym))
            else:
                out.append(Finding(runway.id, None, f"Raise / current burn gives {months:.0f} months, not {runway.value:g}; ask what burn the plan assumes.", sym))
        else:
            out.append(Finding(raise_.id, None, f"At the current burn the raise lasts about {months:.0f} months.", sym))

    # 7. Valuation multiple (context only)
    pre = r.get("pre_money")
    if pre:
        base = arr.value if arr else (mrr.value * 12 if mrr else None)
        parts, syms = [], []
        if base:
            parts.append(f"{pre.value / base:.0f}x current ARR ({usd(base)})")
            syms.append(f"{usd(pre.value)} / {usd(base)} = {pre.value / base:.0f}x")
        if fc:
            parts.append(f"{pre.value / fc.value:.1f}x the forecast revenue ({usd(fc.value)})")
            syms.append(f"{usd(pre.value)} / {usd(fc.value)} = {pre.value / fc.value:.1f}x")
        if parts:
            out.append(Finding(pre.id, None, f"The {usd(pre.value)} pre-money is " + " and ".join(parts) + ".", "; ".join(syms)))
    return out


def apply_math(claims: list[Claim], growth_period_months: float | None = None) -> list[Finding]:
    by_id = {c.id: c for c in claims}
    findings = find_issues(claims, growth_period_months)
    for f in findings:
        if f.claim_id in by_id:
            add_evidence(by_id[f.claim_id], f.verdict, f.reason,
                         [Source(kind="math", title="Deck arithmetic", quote=f.arithmetic)], "math")
    return findings
