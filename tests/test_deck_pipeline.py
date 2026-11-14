"""Agent A: deck pipeline unit tests (no network, no real LLM)."""
import os
from pathlib import Path

os.environ.setdefault("CLAIMMAP_FAKE_LLM", "1")

import httpx  # noqa: E402
import pytest  # noqa: E402

import claimmap.deck as deck  # noqa: E402
from claimmap.deck import extract, load, mathcheck, pdf, questions, wayback, websearch  # noqa: E402
from claimmap.deck.merge import add_evidence  # noqa: E402
from claimmap.schemas import Claim, DeckAnalysis, Source  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
PDF = (FIX / "labloop_deck.pdf").read_bytes()


def _c(id, text, slide, cat, value, unit, role, deps, mat=3, quote=None):
    return {"id": id, "text": text, "quote": quote or text, "slide": slide, "category": cat, "value": value,
            "unit": unit, "role": role, "depends_on": deps, "materiality": mat}


CANNED = {
    "company": "LabLoop", "website": "https://www.LabLoop.example.com/", "growth_period_months": 10,
    "claims": [
        _c("c1", "Raising $3M seed at $15M pre-money", 7, "ask", 15e6, "USD", "pre_money", ["c2", "c6"], 5,
           "Raising $3M seed at a $15M pre-money valuation"),
        _c("c2", "$5M revenue in year 3", 7, "financials", 5e6, "USD", "revenue_forecast", ["c3", "c4", "c5"], 5),
        _c("c3", "$4.1B US TAM", 4, "market", 4.1e9, "USD", "tam", [], 4),
        _c("c4", "2% market share by year 3", 4, "market", 2, "percent", "market_share_target", ["c7"], 4),
        _c("c5", "40% month-on-month revenue growth", 3, "growth", 0.4, "ratio_per_month", "growth_rate_monthly", ["c6"], 4),
        _c("c6", "26 paying customers", 3, "traction", 26, "customers", "customers", [], 5),
        _c("c7", "No direct competitors", 5, "competition", None, None, None, [], 3),
        _c("c8", "Team of 25 people", 6, "team", 25, "people", "team_size", [], 2),
        _c("c9", "$38k MRR", 3, "traction", 38000, "USD_per_month", "mrr", ["c6"], 4),
        _c("c10", "$90k monthly burn", 7, "financials", 90000, "USD_per_month", "monthly_burn", [], 3),
        _c("c11", "Raising $3M seed", 7, "ask", 3e6, "USD", "raise_amount", ["c2", "c6"], 5),
    ],
}

CANNED_QUESTIONS = {"questions": [
    {"text": "How many of the 26 customers pay today?", "claim_ids": ["c6", "zzz"], "why": "Traction holds up the ask.",
     "evidence_to_request": "Invoices"},
    {"text": "How do 25 people fit in a $90k burn?", "claim_ids": ["c8", "c10"], "why": "Team vs burn.",
     "evidence_to_request": "Payroll summary"},
    {"text": "Who else sells robotic sample prep?", "claim_ids": ["c7"], "why": "Share rests on it.",
     "evidence_to_request": "Win/loss notes"},
]}


def fake_call_json(system, user, schema, tier="fast", timeout=120):
    if "questions" in schema.get("properties", {}):
        return CANNED_QUESTIONS
    if "claims" in schema.get("properties", {}):
        return CANNED
    raise AssertionError("unexpected LLM call")


@pytest.fixture
def claims():
    cs = extract.validate_claims(CANNED["claims"], 7)
    load.score_load(cs)
    return cs


# ---------- pdf ----------

def test_pdf_pages_from_fixture():
    pages = pdf.extract_pages(PDF)
    assert len(pages) == 7
    assert "26 paying customers" in pages[2]
    assert pages[6].startswith("Financials and ask")
    assert pdf.image_pages(pages) == [] and not pdf.mostly_images(pages)


def test_image_page_detection():
    assert pdf.image_pages(["", "  \n ", "A real slide with plenty of text on it"]) == [1, 2]
    assert pdf.mostly_images(["", "", "text " * 20])


# ---------- extraction validation ----------

def test_validate_ids_deps_cycles_and_ratios():
    items = [
        _c("a", "A", 1, "ask", None, None, None, ["b", "a", "ghost", "b"]),
        _c("b", "B", 2, "financials", None, None, None, ["c"]),
        _c("c", "C", 3, "market", 40, "%", "market_share_target", ["a"]),  # cycle a->b->c->a
        _c("a", "dup id", 99, "weird", None, None, "nonsense", []),
        {"id": "x", "text": "   "},  # empty: dropped
    ]
    cs = extract.validate_claims(items, 7)
    assert [c.id for c in cs] == ["c1", "c2", "c3", "c4"]
    assert cs[0].depends_on == ["c2"]          # self loop, unknown and duplicate dropped
    assert cs[1].depends_on == ["c3"]
    assert cs[2].depends_on == []              # back edge c3->c1 broken
    assert cs[2].value == pytest.approx(0.4)   # 40 -> 0.4 for a ratio role
    assert cs[3].category == "other" and cs[3].role is None and cs[3].slide is None


def test_validate_caps_by_materiality():
    items = [_c(f"k{i}", f"claim {i}", 1, "other", None, None, None, [], mat=5 if i % 2 else 1) for i in range(40)]
    cs = extract.validate_claims(items, 3, cap=10)
    assert len(cs) == 10 and all(c.text.endswith(("1", "3", "5", "7", "9")) for c in cs)


def test_parse_extraction_normalises_website():
    ext = extract.parse_extraction(CANNED, 7)
    assert ext.website == "labloop.example.com" and ext.company == "LabLoop" and ext.growth_period_months == 10
    assert extract.normalise_website("not a site") is None


# ---------- load ----------

def test_load_scores(claims):
    by = {c.id: c for c in claims}
    assert by["c1"].load == 1.0 and by["c11"].load == 1.0          # ask / valuation roots
    assert all(0.0 <= c.load <= 1.0 for c in claims)
    non_root = sorted((c for c in claims if c.category != "ask"), key=lambda c: -c.load)
    assert non_root[0].id == "c6"                                    # customers: most rests on it
    assert by["c6"].load > by["c2"].load > by["c8"].load
    assert by["c7"].load > by["c8"].load                              # competition supports share -> forecast
    assert by["c8"].load == load.FLOOR                                # nothing rests on team size here
    again = extract.validate_claims(CANNED["claims"], 7)
    load.score_load(again)
    assert [c.load for c in again] == [c.load for c in claims]        # deterministic


def test_load_without_ask():
    cs = [Claim(id="c1", text="a", depends_on=["c2"]), Claim(id="c2", text="b")]
    load.score_load(cs)
    assert cs[1].load == 1.0 and cs[0].load == load.FLOOR


# ---------- math ----------

def _by(cs):
    return {c.id: c for c in cs}


def test_math_fixture_numbers(claims):
    findings = mathcheck.apply_math(claims, growth_period_months=10)
    by = _by(claims)
    # TAM x share >= forecast -> consistent
    assert by["c2"].check.verdict == "supported" and by["c2"].check.method == "math"
    assert "$4.1B x 2% = $82M" in by["c2"].check.sources[0].quote
    # team 25 / burn $90k -> flagged with the number
    team = by["c8"].check
    assert "$3.6k" in team.reason and team.sources[0].kind == "math" and "$90k / 25" in team.sources[0].quote
    # growth compounding
    assert "28.9x" in by["c5"].check.reason and "$1.3k" in by["c5"].check.reason
    # revenue per customer, runway, valuation multiple
    assert "$1.5k per customer" in by["c9"].check.reason
    assert "33 months" in by["c11"].check.reason
    assert "33x current ARR" in by["c1"].check.reason
    assert all(f.arithmetic for f in findings)
    assert not any(c.check.verdict == "contradicted" for c in claims)  # deck's own numbers can all be true


def _num(id, role, value, cat="financials"):
    return Claim(id=id, text=role, category=cat, value=value, role=role)


def test_math_contradictions():
    cs = [_num("c1", "tam", 1e8), _num("c2", "market_share_target", 0.01), _num("c3", "revenue_forecast", 5e6)]
    mathcheck.apply_math(cs)
    assert cs[2].check.verdict == "contradicted" and "$1M" in cs[2].check.sources[0].quote

    cs = [_num("c1", "tam", 1e6), _num("c2", "revenue_forecast", 5e6)]
    mathcheck.apply_math(cs)
    assert cs[1].check.verdict == "contradicted"

    cs = [_num("c1", "mrr", 50_000), _num("c2", "arr", 1.2e6)]
    mathcheck.apply_math(cs)
    assert cs[1].check.verdict == "contradicted"
    cs = [_num("c1", "mrr", 50_000), _num("c2", "arr", 6e5)]
    mathcheck.apply_math(cs)
    assert cs[1].check.verdict == "supported"

    cs = [_num("c1", "team_size", 40, "team"), _num("c2", "monthly_burn", 20_000)]
    mathcheck.apply_math(cs)
    assert cs[0].check.verdict == "contradicted" and "$500" in cs[0].check.reason

    cs = [_num("c1", "raise_amount", 2e6), _num("c2", "monthly_burn", 1e5), _num("c3", "runway_months", 18)]
    mathcheck.apply_math(cs)
    assert cs[2].check.verdict == "supported" and "20 months" in cs[2].check.sources[0].quote


def test_math_never_invents():
    cs = [_num("c1", "tam", 4e9), Claim(id="c2", text="No competitors", category="competition")]
    assert mathcheck.apply_math(cs) == []
    assert all(c.check.verdict == "unverified" and not c.check.sources for c in cs)


def test_merge_rules():
    c = Claim(id="c1", text="x")
    add_evidence(c, None, "note", [], "math")
    assert c.check.verdict == "unverified" and c.check.method == "math"
    add_evidence(c, "supported", "fits", [Source(kind="math")], "math")
    add_evidence(c, "contradicted", "site says otherwise", [Source(kind="wayback", quote="q")], "wayback")
    add_evidence(c, "supported", "web agrees", [], "web")
    assert c.check.verdict == "contradicted" and c.check.method == "wayback"
    assert c.check.reason.startswith("site says otherwise") and c.check.sources[0].kind == "wayback"


# ---------- wayback ----------

HTML = """<html><head><title>t</title><style>.x{color:red}</style><script>var a="26 customers";</script></head>
<body><nav>Home | About</nav><h1>LabLoop</h1><p>Our pilot partners:&nbsp;4 labs</p><ul><li>Lab A</li><li>Lab&amp;B</li></ul>
<!-- comment --><p>Team of <b>6</b></p></body></html>"""


def test_html_to_text():
    t = wayback.html_to_text(HTML)
    assert "var a" not in t and "color" not in t and "comment" not in t
    assert "Our pilot partners: 4 labs" in t and "Lab&B" in t and "Team of 6" in t
    assert t.splitlines()[0] == "Home | About"


def test_pick_pages():
    urls = ["http://x.com/", "http://x.com/blog/post-1", "http://x.com/customers/acme-case", "http://x.com/customers",
            "http://x.com/about-us", "http://x.com/pricing"]
    assert wayback.pick_pages(urls, "x.com") == ["http://x.com/customers", "http://x.com/about-us"]


class _FakeClient:
    """Stands in for httpx.Client: routes availability / CDX / snapshot URLs to canned responses."""

    def __init__(self, handler):
        self.handler = handler

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, url, params=None, timeout=None, **kw):
        return self.handler(url, params or {})


def _resp(url, status=200, json=None, text=None):
    req = httpx.Request("GET", url)
    if json is not None:
        return httpx.Response(status, json=json, request=req)
    return httpx.Response(status, text=text or "", request=req)


def _wayback_handler(url, params):
    if url == wayback.CDX:
        return _resp(url, 429)
    if url == wayback.AVAILABLE:
        u = params["url"]
        if u.endswith("/team"):
            return _resp(url, json={"archived_snapshots": {}})
        return _resp(url, json={"archived_snapshots": {"closest": {
            "available": True, "status": "200", "timestamp": "20260802120000",
            "url": f"http://web.archive.org/web/20260802120000/https://{u}"}}})
    return _resp(url, text=HTML)


def test_wayback_end_to_end_with_fake_http(monkeypatch, claims):
    monkeypatch.setattr(wayback.httpx, "Client", lambda **kw: _FakeClient(_wayback_handler))
    calls = []

    def fake_llm(system, user, schema, tier="fast", timeout=120):
        calls.append(user)
        assert "<snapshot" in user and "Our pilot partners: 4 labs" in user
        return {"results": [
            {"claim_id": "c6", "verdict": "contradicted", "reason": "Site lists 4 pilots.",
             "quote": "Our pilot partners: 4 labs", "snapshot": 1},
            {"claim_id": "c8", "verdict": "contradicted", "reason": "Invented quote.", "quote": "We are 3 people",
             "snapshot": 1},
            {"claim_id": "c99", "verdict": "supported", "reason": "x", "quote": "LabLoop", "snapshot": 1},
        ]}

    monkeypatch.setattr(wayback.llm, "call_json", fake_llm)
    res = wayback.check_wayback("labloop.example.com", claims)
    assert len(res.snapshots) == 3 and res.snapshots[0].date == "2026-08-02"   # home + customers + about
    assert [e[0] for e in res.evidence] == ["c6"]                              # non-verbatim / unknown dropped
    assert wayback.apply_wayback(res, claims) == 1
    c6 = _by(claims)["c6"].check
    assert c6.verdict == "contradicted" and c6.method == "wayback"
    assert c6.sources[0].url.startswith("https://web.archive.org/web/20260802120000/")


def test_wayback_rate_limited_and_timeouts(monkeypatch, claims):
    monkeypatch.setattr(wayback.httpx, "Client", lambda **kw: _FakeClient(lambda u, p: _resp(u, 429)))
    res = wayback.check_wayback("labloop.example.com", claims)
    assert res.evidence == [] and "429" in res.note

    def slow(url, params):
        raise httpx.ReadTimeout("slow", request=httpx.Request("GET", url))

    monkeypatch.setattr(wayback.httpx, "Client", lambda **kw: _FakeClient(slow))
    res = wayback.check_wayback("labloop.example.com", claims)
    assert res.evidence == [] and "timed out" in res.note

    res = wayback.check_wayback("labloop.example.com", claims, total_budget=0.1)  # budget already used up
    assert res.evidence == [] and res.note
    assert all(c.check.method != "wayback" for c in claims)


def test_wayback_skips_without_website(claims):
    assert wayback.check_wayback(None, claims).note == "no website in the deck"


# ---------- web search ----------

def test_websearch_picks_market_and_competition(claims):
    picked = websearch.pick_claims(claims)
    ids = [c.id for c in picked]
    assert "c3" in ids and "c7" in ids  # TAM + competition (v4: plus every other checkable numeric claim)
    assert all(c.role not in websearch.UNSEARCHABLE_ROLES for c in picked)  # the share target is not searchable
    assert all(c.category in websearch.CATEGORIES for c in picked) and len(picked) <= websearch.MAX_CLAIMS
    assert picked == sorted(picked, key=lambda c: -c.load)


def test_websearch_errors_are_skipped(monkeypatch, claims):
    def boom(claim, company, timeout):
        raise RuntimeError("tool error")

    monkeypatch.setattr(websearch, "search_claim", boom)
    res = websearch.check_web(claims, "LabLoop")
    assert res.evidence == [] and len(res.notes) == len(websearch.pick_claims(claims))
    assert websearch.apply_web(res, claims) == 0


def test_websearch_apply(monkeypatch, claims):
    src = Source(kind="web", url="https://x.com", quote="Acme sells robotic sample prep to CROs.")
    monkeypatch.setattr(websearch, "search_claim", lambda c, co, t: ("contradicted", "Acme competes.", [src])
                        if c.category == "competition" else ("unverified", "No independent estimate.", []))
    res = websearch.check_web(claims, "LabLoop")
    assert websearch.apply_web(res, claims) == 1
    c7 = _by(claims)["c7"].check
    assert c7.verdict == "contradicted" and c7.method == "web" and c7.sources[0].quote.startswith("Acme")


def test_websearch_parse_json():
    assert websearch._parse_json('Here: {"verdict": "unverified", "sources": []} done')["verdict"] == "unverified"


# ---------- questions ----------

def test_questions_parse_and_fallback(monkeypatch, claims):
    monkeypatch.setattr(questions.llm, "call_json", fake_call_json)
    qs = questions.write_questions(claims, "LabLoop")
    assert [q.id for q in qs] == ["q1", "q2", "q3"] and [q.priority for q in qs] == [1, 2, 3]
    assert qs[0].claim_ids == ["c6"]  # unknown id dropped

    def down(*a, **k):
        raise RuntimeError("down")

    monkeypatch.setattr(questions.llm, "call_json", down)
    _by(claims)["c7"].check.verdict = "contradicted"
    qs = questions.fallback_questions(claims)
    assert qs[0].claim_ids == ["c7"] and len(questions.write_questions(claims, "x")) == 3


def test_questions_prompt_has_dependents(claims):
    p = questions.claims_prompt(claims, "LabLoop")
    assert "<claims>" in p and "rests on it:" in p and p.index("c1 [load 1.00") < p.index("c8 [load")


# ---------- orchestration ----------

def test_analyze_deck_offline(monkeypatch):
    monkeypatch.setattr(extract.llm, "call_json", fake_call_json)
    updates: list[DeckAnalysis] = []
    a, timings = deck.run_analysis(PDF, "t1", updates.append, use_web=False)
    assert a.status == "done", a.error
    assert a.company == "LabLoop" and len(a.slides) == 7 and len(a.claims) == 11 and len(a.questions) == 3
    statuses = [u.status for u in updates]
    assert statuses[0] == "parsing" and "extracting" in statuses and "checking" in statuses and statuses[-1] == "done"
    assert any(u.progress == "Extracting claims (slide text: 7 pages)" for u in updates)
    assert {"parse", "extract", "math", "questions", "total"} <= timings.keys()
    DeckAnalysis.model_validate_json(a.model_dump_json())


def test_analyze_deck_never_raises(monkeypatch):
    def boom(*a, **k):
        raise ValueError("kaboom")

    monkeypatch.setattr(extract.llm, "call_json", boom)
    seen = []
    a = deck.analyze_deck(PDF, "t2", seen.append)
    assert a.status == "error" and "kaboom" in a.error and seen[-1].status == "error"

    a = deck.analyze_deck(b"%PDF-1.4 garbage", "t3", lambda _: None)
    assert a.status == "error" and "PDF" in a.error

    def bad_update(_):
        raise RuntimeError("ui broke")

    monkeypatch.setattr(extract.llm, "call_json", fake_call_json)
    a = deck.analyze_deck(PDF, "t4", bad_update)
    assert a.status in ("done", "error")


def test_analyze_deck_fake_llm_errors_cleanly():
    a = deck.analyze_deck(PDF, "t5", lambda _: None)  # CLAIMMAP_FAKE_LLM=1: extraction call raises
    assert a.status == "error" and a.error


# ---------- live (real LLM; skipped unless CLAIMMAP_LIVE_LLM=1) ----------

@pytest.mark.live_llm
@pytest.mark.skipif(os.environ.get("CLAIMMAP_LIVE_LLM") != "1", reason="set CLAIMMAP_LIVE_LLM=1")
def test_live_fixture_deck(monkeypatch):
    monkeypatch.delenv("CLAIMMAP_FAKE_LLM", raising=False)
    a, timings = deck.run_analysis(PDF, "live-fixture", lambda _: None, use_web=True)
    assert a.status == "done", a.error
    texts = " ".join(c.text.lower() + " " + c.quote.lower() for c in a.claims)
    assert "26" in texts and "4.1" in texts and "25" in texts
    roots = [c for c in a.claims if c.load == 1.0]
    assert roots and any(c.category == "ask" for c in roots)
    assert any(c.check.method == "math" for c in a.claims)
    assert 3 <= len(a.questions) <= 5
    assert timings["total"] < 180
