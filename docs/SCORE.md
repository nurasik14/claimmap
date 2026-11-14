# ClaimMap Score v1 (0-100)

**What it measures:** how well a pitch's claims hold up against the evidence ClaimMap could find. It does
**not** predict whether a company will succeed or win. The formula was fixed before any real-world outcome
was looked at, and it must not be tuned to match outcomes. Code: `claimmap/score.py`. It is deterministic
and makes no LLM calls.

Notation: claims = every claim in the analysis (deck and spoken). The weight of a claim is
w = max(load, 0.05). If every load is 0, every claim gets w = 1 instead.

| Part | Max | Formula |
| --- | --- | --- |
| A. Evidence balance | 40 | s = (Σw[supported] − 2·Σw[contradicted]) / Σw, clamped to [−1, 1]; points = 40·(s+1)/2. If every claim is unverified, the result is 20. |
| B. Specificity | 20 | 20 × the share of claims that have a numeric `value`, or whose category is traction, growth, financials, customers or market and whose text contains a digit. |
| C. Consistency | 20 | 20 − 6 × (claims contradicted by arithmetic, `check.method == "math"`) − 5 × (drift notes: numbers that changed during the pitch). Never below 0. |
| D. Verifiable core | 20 | Take the 5 highest-load claims. Score 20 × the share of them that are either supported, or were checked by arithmetic, web or Wayback and not contradicted. |

total = round(A + B + C + D, 1). Each part has a one-sentence `detail` that gives the numbers behind it.
`summary` names the strongest and the weakest part (measured as a share of each part's maximum). Version: "v1".

**When it is computed:**
- when a deck analysis finishes;
- at the end of Finalize;
- with `uv run python -I scripts/score_all.py`, a backfill that needs no LLM;
- when the API reads an analysis that is done but has no score yet (for example a restored demo snapshot).

`GET /api/decks` items carry `score` (the total, or null), `outcome`, `outcome_won` and `source_url`.

**Caveats:**
- A contradiction counts double, because a claim that is checked and found false says more than an
  unchecked one.
- Unverified claims are neutral in A but earn nothing in D, so a pitch with nothing checkable scores near 40.
- Any differences between pitches are differences in evidence, not in quality.
