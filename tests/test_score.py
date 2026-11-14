"""ClaimMap Score v1: formula as written in docs/SCORE.md, deterministic, wired into finalize and the library."""
from fastapi.testclient import TestClient

from claimmap import store
from claimmap.app import app
from claimmap.schemas import Check, Claim, DeckAnalysis
from claimmap.score import compute_score


def _claims(verdicts, loads=None, methods=None, values=None):
    out = []
    for i, v in enumerate(verdicts):
        out.append(Claim(id=f"c{i + 1}", text=f"claim {i + 1}", category="product",
                         load=(loads or [0.5] * len(verdicts))[i],
                         value=(values or [None] * len(verdicts))[i],
                         check=Check(verdict=v, method=(methods or ["none"] * len(verdicts))[i])))
    return out


def _a(claims, drift=0):
    return DeckAnalysis(deck_id="t", status="done", claims=claims, drift_notes=[f"d{i}" for i in range(drift)])


def parts(s):
    return {p.name: p.points for p in s.parts}


def test_all_unverified_gives_20_for_evidence_and_specified_rest():
    s = compute_score(_a(_claims(["unverified"] * 4)))
    p = parts(s)
    assert p["Evidence balance"] == 20.0
    assert p["Specificity"] == 0.0        # no numbers
    assert p["Consistency"] == 20.0       # nothing contradicted, no drift
    assert p["Verifiable core"] == 0.0    # nothing checked
    assert s.total == 40.0 and s.version.startswith("v1")


def test_contradicted_load_bearing_claim_lowers_evidence():
    base = compute_score(_a(_claims(["unverified", "unverified", "unverified"], loads=[0.9, 0.2, 0.2])))
    bad = compute_score(_a(_claims(["contradicted", "unverified", "unverified"], loads=[0.9, 0.2, 0.2])))
    minor = compute_score(_a(_claims(["unverified", "unverified", "contradicted"], loads=[0.9, 0.2, 0.2])))
    assert parts(bad)["Evidence balance"] < parts(minor)["Evidence balance"] < parts(base)["Evidence balance"]
    # s = (0 - 2*0.9) / 1.3 -> clamped to -1 -> 0 points
    assert parts(bad)["Evidence balance"] == 0.0


def test_supported_raises_evidence_and_core():
    s = compute_score(_a(_claims(["supported", "unverified"], loads=[0.5, 0.5])))
    assert parts(s)["Evidence balance"] == 30.0   # s = 0.5 -> 40 * 1.5 / 2
    assert parts(s)["Verifiable core"] == 10.0    # 1 of 2 top claims


def test_math_contradiction_and_drift_lower_consistency():
    s = compute_score(_a(_claims(["contradicted", "unverified"], methods=["math", "none"]), drift=1))
    assert parts(s)["Consistency"] == 20 - 6 - 5
    many = compute_score(_a(_claims(["contradicted"] * 5, methods=["math"] * 5)))
    assert parts(many)["Consistency"] == 0.0


def test_specificity_and_checked_core():
    cl = _claims(["unverified", "unverified", "unverified", "unverified"], values=[26, None, None, None],
                 methods=["web", "none", "none", "none"])
    cl[1].category, cl[1].text = "traction", "grew 40% month on month"
    cl[2].category, cl[2].text = "team", "3 founders"           # digit but not a quantitative category
    s = compute_score(_a(cl))
    assert parts(s)["Specificity"] == 10.0        # 2 of 4
    assert parts(s)["Verifiable core"] == 7.5     # v1.1: web-checked claim (1) + one concrete unchecked claim (0.5) of 4


def test_zero_loads_use_count_and_empty_is_safe():
    s = compute_score(_a(_claims(["supported", "contradicted"], loads=[0.0, 0.0])))
    assert parts(s)["Evidence balance"] == 10.0   # (1 - 2) / 2 = -0.5
    e = compute_score(_a([]))
    assert e.total == 40.0 and e.summary


def test_deterministic_and_details():
    a = _a(_claims(["supported", "contradicted", "unverified"], loads=[0.7, 0.4, 0.1], methods=["web", "math", "none"]))
    s1, s2 = compute_score(a), compute_score(a.model_copy(deep=True))
    assert s1 == s2
    assert all(p.detail for p in s1.parts) and "Strongest" in s1.summary
    assert sum(p.max_points for p in s1.parts) == 100
    assert 0 <= s1.total <= 100


def test_library_exposes_score_and_outcome():
    a = _a(_claims(["supported"]))
    a.deck_id, a.title = "score_lib_t", "Real pitch"
    a.source_url, a.outcome, a.outcome_won, a.outcome_source = "https://youtube.com/x", "Won", True, "https://tc/x"
    a.score = compute_score(a)
    store.save(a)
    items = {i["deck_id"]: i for i in TestClient(app).get("/api/decks").json()}
    it = items["score_lib_t"]
    assert it["score"] == a.score.total and it["outcome"] == "Won" and it["outcome_won"] is True
    assert it["source_url"] == "https://youtube.com/x"
    store.delete("score_lib_t")


def test_finalize_sets_score(monkeypatch):
    from claimmap import finalize as fin

    monkeypatch.setattr(fin, "write_questions", lambda claims, company: [])
    a = _a(_claims(["unverified", "unverified"]))
    out = fin.finalize(a, lambda x: None, use_web=False)
    assert out.status == "done" and out.score is not None and out.score.total == compute_score(out).total
