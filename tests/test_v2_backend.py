"""Agent D (backend v2): slides + boxes, session / library / delete routes, live graph nodes + persistence,
self-drift, finalize and brief. Fake LLM and fake ASR only."""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

os.environ.setdefault("CLAIMMAP_FAKE_LLM", "1")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from claimmap import brief as brief_mod  # noqa: E402
from claimmap import finalize as finalize_mod  # noqa: E402
from claimmap import store  # noqa: E402
from claimmap.app import app  # noqa: E402
from claimmap.deck import slides  # noqa: E402
from claimmap.live import LiveSession  # noqa: E402
from claimmap.schemas import Check, Claim, DeckAnalysis, Question, Source  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
PDF = (FIX / "labloop_deck.pdf").read_bytes()
DECK = DeckAnalysis.model_validate_json((FIX / "sample_analysis.json").read_text())
client = TestClient(app)


# ---------------------------------------------------------------- fakes
def fake_llm(monkeypatch, live=None, questions=None, brief=None):
    """Patch call_json; dispatch on the schema. Each handler gets the user prompt. Returns the call log."""
    calls: list[tuple[str, str]] = []

    def call(system, user, schema, tier="fast", timeout=120):
        props = schema.get("properties", {})
        kind = "brief" if "recommendation" in props else "questions" if "questions" in props else "live"
        calls.append((kind, user))
        fn = {"live": live, "questions": questions, "brief": brief}[kind]
        if fn is None:
            raise RuntimeError(f"unexpected {kind} call")
        return fn(user)

    monkeypatch.setattr("claimmap.llm.call_json", call)
    return calls


def spoken(quote, cid=None, relation="new", note="", question="", category="traction", material=True,
           value=None, role=None, depends_on=(), supports=(), text=""):
    return {"quote": quote, "text": text or quote, "category": category, "deck_claim_id": cid, "relation": relation,
            "material": material, "value": value, "unit": None, "role": role, "depends_on": list(depends_on),
            "supports": list(supports), "note": note, "question": question}


class NoASR:
    detail = "fake"

    async def warm(self):
        return "fake"

    async def transcribe(self, audio):
        return []


class Recorder:
    def __init__(self):
        self.events: list[dict] = []

    async def __call__(self, ev):
        self.events.append(ev)

    def of(self, kind):
        return [e for e in self.events if e["type"] == kind]


def save_deck(**kw) -> DeckAnalysis:
    a = DECK.model_copy(deep=True, update=kw)
    store.save(a)
    return a


# ---------------------------------------------------------------- slides + boxes
@pytest.fixture(scope="module")
def pages():
    return slides.word_boxes(PDF)


def test_word_boxes_parse_fixture(pages):
    assert sorted(pages) == list(range(1, 8))
    w = next(w for w in pages[3] if w.text == "26")
    assert 0 < w.x0 < w.x1 < 1 and 0 < w.y0 < w.y1 < 1


def test_customers_quote_gets_a_box_on_slide_3(pages):
    c = Claim(id="c6", text="26 paying customers", quote="26 paying customers", slide=3)
    boxes = slides.boxes_for(c, pages)
    assert len(boxes) == 1 and boxes[0].slide == 3
    b = boxes[0]
    assert 0.03 < b.x < 0.08 and 0.18 < b.y < 0.24 and 0.15 < b.w < 0.3 and 0.01 < b.h < 0.06


def test_box_matching_tolerates_case_punctuation_and_falls_back_to_numbers(pages):
    loose = Claim(id="a", text="x", quote="40% Month-on-Month revenue growth, since January!", slide=3)
    assert [b.slide for b in slides.boxes_for(loose, pages)] == [3]
    paraphrase = Claim(id="b", text="$38k MRR", quote="MRR of $38k per month", slide=3)
    nb = slides.boxes_for(paraphrase, pages)  # words differ: the line holding "$38k" is used
    assert len(nb) == 1 and nb[0].slide == 3 and 0.3 < nb[0].y < 0.4
    nothing = Claim(id="c", text="Profitable since 2019", quote="We have been profitable since 2019", slide=3)
    assert slides.boxes_for(nothing, pages) == []


def test_match_boxes_skips_spoken_claims(pages):
    cs = [Claim(id="c1", text="26 paying customers", quote="26 paying customers", slide=3),
          Claim(id="s1", text="26 paying customers", quote="26 paying customers", source="spoken")]
    assert slides.match_boxes(cs, pages) == 1 and cs[1].boxes == []


def test_render_slides_and_route(tmp_path):
    save_deck(deck_id="slidedeck", slide_count=0)
    n = slides.render_slides(PDF, store.slides_dir("slidedeck"))
    assert n == 7
    r = client.get("/api/deck/slidedeck/slides/3.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:4] == b"\x89PNG"
    assert len(r.content) > 10_000
    assert client.get("/api/deck/slidedeck/slides/99.png").status_code == 404
    assert client.get("/api/deck/slidedeck/slides/0.png").status_code == 404
    assert client.get("/api/deck/nope/slides/1.png").status_code == 404
    for bad in ("/api/deck/..%2F..%2Fslidedeck/slides/1.png", "/api/deck/slidedeck/slides/..%2F1.png",
                "/api/deck/%2E%2E/slides/1.png", "/api/deck/slidedeck/slides/-1.png"):
        assert client.get(bad).status_code == 404, bad


def test_full_analysis_renders_slides_and_boxes(monkeypatch):
    import claimmap.deck as deck
    from test_deck_pipeline import CANNED

    fake_llm(monkeypatch)
    monkeypatch.setattr(deck, "extract_claims", lambda s: deck.extract.parse_extraction(CANNED, len(s)))
    monkeypatch.setattr(deck, "write_questions", lambda claims, company: [])
    a, _ = deck.run_analysis(PDF, "fullrun", lambda _: None, use_web=False, title="labloop_deck")
    assert a.status == "done" and a.slide_count == 7 and a.title == "LabLoop"
    assert (store.slides_dir("fullrun") / "7.png").exists()
    with_boxes = [c for c in a.claims if c.boxes]
    assert len(with_boxes) >= len(a.claims) / 2
    assert next(c for c in a.claims if c.text == "26 paying customers").boxes[0].slide == 3


# ---------------------------------------------------------------- session, library, delete
def test_create_live_session():
    r = client.post("/api/session", json={"title": "  Acme pitch  "})
    assert r.status_code == 200
    a = client.get(f"/api/deck/{r.json()['deck_id']}").json()
    assert (a["mode"], a["status"], a["title"], a["slide_count"], a["claims"]) == ("live", "done", "Acme pitch", 0, [])


LIB_KEYS = {"deck_id", "title", "company", "mode", "status", "progress", "created_at", "slide_count", "claim_count",
            "counts", "top_flag", "thumb", "score", "outcome", "outcome_won", "source_url", "capture"}  # v3 (agent G) + capture (orchestrator)


def test_library_shape_and_order():
    old = DECK.model_copy(deep=True, update={"deck_id": "lib_old", "created_at": "2020-01-01T00:00:00+00:00",
                                             "slide_count": 7, "title": "Old"})
    old.claims[0].check.verdict = "contradicted"
    old.claims[0].check.reason = "Arithmetic does not add up."
    store.save(old)
    new = client.post("/api/session", json={"title": "Newest"}).json()["deck_id"]
    items = client.get("/api/decks").json()
    assert all(set(i) == LIB_KEYS for i in items)
    assert items[0]["deck_id"] == new and items[0]["thumb"] is None and items[0]["top_flag"] is None
    assert [i["created_at"] for i in items] == sorted((i["created_at"] for i in items), reverse=True)
    o = next(i for i in items if i["deck_id"] == "lib_old")
    assert o["thumb"] == "/api/deck/lib_old/slides/1.png" and o["claim_count"] == len(DECK.claims)
    assert sum(o["counts"].values()) == len(DECK.claims) and o["counts"]["contradicted"] >= 1
    assert set(o["counts"]) == {"contradicted", "supported", "unverified", "missing"}
    assert o["top_flag"]  # the most load-bearing contradicted claim


def test_delete_removes_json_pdf_and_slides():
    save_deck(deck_id="todelete")
    store.pdf_path("todelete").write_bytes(PDF)
    slides.render_slides(PDF, store.slides_dir("todelete"))
    assert client.delete("/api/deck/todelete").json() == {"ok": True}
    assert not store.pdf_path("todelete").exists() and not (store.DECKS / "todelete").exists()
    assert client.get("/api/deck/todelete").status_code == 404
    assert client.delete("/api/deck/todelete").status_code == 404
    assert client.delete("/api/deck/..%2Fx").status_code == 404


# ---------------------------------------------------------------- live v2
def run_live(deck, texts, monkeypatch, live_fn):
    calls = fake_llm(monkeypatch, live=live_fn)
    saved: list[DeckAnalysis] = []

    async def go():
        rec = Recorder()
        s = LiveSession(deck, rec, transcriber=NoASR(), persist=saved.append)
        await s.start()
        for t in texts:
            await s.feed_text(t)
            await s._analysis_task
        await s.stop()
        return rec, s

    rec, s = asyncio.run(go())
    return rec, s, saved, calls


def test_live_new_claim_becomes_node_and_is_persisted(monkeypatch):
    def live(user):
        return {"claims": [
            spoken("we signed Pfizer as a design partner", category="customers", supports=["c1"],
                   question="Is the Pfizer deal signed?"),
            spoken("we have 40 paying customers", "c6", "drift", "Deck says 26 paying customers; founder said 40.",
                   "Which is right?"),
            spoken("nice weather today", category="other", material=False)]}

    deck = DECK.model_copy(deep=True)
    rec, s, saved, calls = run_live(deck, ["We signed Pfizer. We have 40 paying customers."], monkeypatch, live)
    added = rec.of("claim_added")
    assert len(added) == 1
    c = added[0]["claim"]
    assert c["id"] == "s1" and c["source"] == "spoken" and c["t"] is not None and c["category"] == "customers"
    assert c["check"]["verdict"] == "unverified" and c["check"]["reason"] == "Said live, not yet checked"
    assert 0 < c["load"] <= 1
    assert [e["id"] for e in rec.of("spoken_claim")] == ["s1", "s2", "s3"]
    assert deck.mode == "deck" and len(deck.claims) == len(DECK.claims)  # the caller's object is untouched
    final = saved[-1]
    assert final.mode == "deck+live"
    assert [x.id for x in final.claims if x.source == "spoken"] == ["s1"]
    assert "s1" in next(x for x in final.claims if x.id == "c1").depends_on  # "supports" edge was wired
    assert [seg.text for seg in final.transcript] == ["We signed Pfizer. We have 40 paying customers."]
    assert [q.id for q in final.questions if q.id.startswith("lq")] == ["lq1", "lq2"]
    assert len(final.drift_notes) == 1 and "26" in final.drift_notes[0] and "c6" in final.drift_notes[0]
    assert len(s.drift_events) == 1 and s.drift_events[0]["deck_claim_id"] == "c6"
    assert len(saved) <= 3  # debounced: not one save per change


def test_live_ids_continue_after_previous_session(monkeypatch):
    deck = DECK.model_copy(deep=True)
    deck.claims.append(Claim(id="s4", text="old", source="spoken"))
    deck.questions.append(Question(id="lq2", text="old?"))
    rec, _, saved, _ = run_live(deck, ["We have a robot."], monkeypatch,
                                lambda u: {"claims": [spoken("we have a robot", category="product", question="How?")]})
    assert rec.of("claim_added")[0]["claim"]["id"] == "s5"
    assert rec.of("question")[0]["question"]["id"] == "lq3"


def test_live_only_self_drift(monkeypatch):
    def live(user):
        if '"id": "s1"' not in user:  # first sentence: nothing known yet
            return {"claims": [spoken("we have 40 customers", value=40, role="customers")]}
        return {"claims": [spoken("we now have 55 customers", "s1", "drift",
                                  "Earlier said 40 customers; now says 55.", "Is it 40 or 55?")]}

    a = DeckAnalysis(deck_id="liveonly", mode="live", status="done", title="Live")
    rec, _, saved, calls = run_live(a, ["We have 40 customers.", "We now have 55 customers."], monkeypatch, live)
    assert [e["claim"]["id"] for e in rec.of("claim_added")] == ["s1"]  # the drift is not a duplicate node
    sc = rec.of("spoken_claim")
    assert [(e["id"], e["relation"], e["deck_claim_id"]) for e in sc] == [("s1", "new", None), ("s2", "drift", "s1")]
    assert '"source": "spoken"' in calls[1][1]
    final = saved[-1]
    assert final.mode == "live" and [c.id for c in final.claims] == ["s1"]
    assert final.claims[0].value == 40 and final.claims[0].role == "customers"
    assert final.drift_notes and "55" in final.drift_notes[0]
    assert final.questions[-1].claim_ids == ["s1"] and final.questions[-1].priority == 1


def test_ws_session_persists_to_store(monkeypatch):
    fake_llm(monkeypatch, live=lambda u: {"claims": [spoken("we have 40 customers", value=40, role="customers")]})
    import claimmap.live.asr as asr
    monkeypatch.setattr(asr, "get_transcriber", lambda: NoASR())
    did = client.post("/api/session", json={"title": "WS"}).json()["deck_id"]
    with client.websocket_connect(f"/ws/live/{did}") as ws:
        ws.send_json({"type": "text", "text": "We have 40 customers."})
        seen = []
        while "claim_added" not in seen:
            seen.append(ws.receive_json()["type"])
        ws.send_json({"type": "stop"})
        while ws.receive_json().get("state") != "stopped":
            pass
    a = client.get(f"/api/deck/{did}").json()
    assert [c["id"] for c in a["claims"]] == ["s1"] and a["transcript"][0]["text"] == "We have 40 customers."


# ---------------------------------------------------------------- finalize
def live_only_analysis(deck_id="fin") -> DeckAnalysis:
    a = DeckAnalysis(deck_id=deck_id, mode="live", status="done", title="Fin", created_at="2026-01-01T00:00:00+00:00")
    unv = Check(verdict="unverified", reason="Said live, not yet checked")
    a.claims = [
        Claim(id="s1", text="40 paying customers", category="traction", value=40, role="customers", source="spoken",
              t=3, check=unv.model_copy()),
        Claim(id="s2", text="$38k MRR", category="traction", value=38000, role="mrr", depends_on=["s1"],
              source="spoken", t=6, check=unv.model_copy()),
        Claim(id="s3", text="$456k ARR", category="financials", value=456000, role="arr", depends_on=["s2"],
              source="spoken", t=9, check=unv.model_copy()),
        Claim(id="s4", text="$90k monthly burn", category="financials", value=90000, role="monthly_burn",
              source="spoken", t=12, check=unv.model_copy()),
    ]
    a.questions = [Question(id="lq1", text="40 or 55 customers?", claim_ids=["s1"], priority=1),
                   Question(id="lq2", text="Who are the 40?", claim_ids=["s1"], priority=2),
                   Question(id="lq3", text="About a deleted claim", claim_ids=["s9"], priority=1)]
    a.drift_notes = ["Earlier said 40 customers; now says 55."]
    return a


def test_finalize_rechecks_merges_questions_and_clears_brief(monkeypatch):
    def questions(user):
        assert "s3" in user
        return {"questions": [{"text": f"Q{i}?", "claim_ids": [f"s{i}"], "why": "w", "evidence_to_request": "e"}
                              for i in range(1, 5)]}

    fake_llm(monkeypatch, questions=questions)
    updates: list[DeckAnalysis] = []
    stale = live_only_analysis()
    stale.brief = brief_mod.Brief(headline="stale")
    a = finalize_mod.finalize(stale, updates.append, use_web=False)
    assert a.status == "done" and a.brief is None and updates[0].status == "checking"
    s3 = next(c for c in a.claims if c.id == "s3")
    assert s3.check.verdict == "supported" and any(s.kind == "math" for s in s3.check.sources)
    assert not any(c.check.reason.startswith(finalize_mod.PLACEHOLDER) for c in a.claims)
    assert next(c for c in a.claims if c.id == "s4").check.reason == finalize_mod.CHECKED_NOTHING
    assert next(c for c in a.claims if c.id == "s1").load > next(c for c in a.claims if c.id == "s4").load
    ids = [q.id for q in a.questions]
    assert ids[0] == "lq1" and "lq3" not in ids and len(ids) <= finalize_mod.MAX_QUESTIONS
    assert "q1" not in ids  # Q1 only tests s1, which the live drift question already covers
    assert [q.priority for q in a.questions] == list(range(1, len(ids) + 1))
    again = finalize_mod.finalize(a, lambda _: None, use_web=False)  # idempotent arithmetic
    assert sum(s.kind == "math" for s in next(c for c in again.claims if c.id == "s3").check.sources) == 1


def test_finalize_web_targets_skip_checked_and_own_targets():
    cs = [Claim(id="a", text="m", category="market", load=0.9),
          Claim(id="b", text="m", category="market", load=0.8,
                check=Check(verdict="supported")),
          Claim(id="c", text="f", category="traction", load=0.7, role="revenue_forecast"),
          Claim(id="d", text="40 paying customers", category="traction", load=0.6),
          Claim(id="g", text="customers love it", category="traction", load=0.55),  # v4: nothing to search
          Claim(id="e", text="x", category="competition", load=0.5,
                check=Check(sources=[Source(kind="web", quote="q")]))]
    assert [c.id for c in finalize_mod.pick_web_targets(cs)] == ["a", "d"]


def test_finalize_route(monkeypatch):
    fake_llm(monkeypatch)  # questions call raises -> deterministic fallback questions
    store.save(live_only_analysis("finroute"))
    assert client.post("/api/deck/finroute/finalize").json() == {"status": "checking"}
    for _ in range(100):
        a = client.get("/api/deck/finroute").json()
        if a["status"] != "checking":
            break
        time.sleep(0.05)
    assert a["status"] == "done" and a["brief"] is None and a["questions"][0]["id"] == "lq1"
    assert client.post("/api/deck/nope/finalize").status_code == 404


# ---------------------------------------------------------------- brief
BRIEF = {"recommendation": "dig_deeper", "headline": "Traction is real but the numbers drifted live.",
         "summary": "LabLoop sells lab automation.", "strengths": ["Paying customers"],
         "red_flags": [{"text": "Customer count drifted from 40 to 55.", "claim_ids": ["s1", "zz"]},
                       {"text": "Same claim again.", "claim_ids": ["s1"]},
                       {"text": "Cites nothing real.", "claim_ids": ["zz"]}],
         "questions": ["40 or 55?"], "evidence_requests": ["Stripe export"], "live_notes": ["Said 55 after 40."]}


def test_brief_route_caches_and_refreshes(monkeypatch):
    calls = fake_llm(monkeypatch, brief=lambda user: BRIEF)
    store.save(live_only_analysis("brief1"))
    b = client.get("/api/deck/brief1/brief").json()
    assert b["recommendation"] == "dig_deeper" and b["generated_at"]
    assert b["red_flags"] == [{"text": "Customer count drifted from 40 to 55.", "claim_ids": ["s1"]},
                              {"text": "Same claim again.", "claim_ids": ["s1"]}]
    prompt = calls[0][1]
    assert "Earlier said 40 customers; now says 55." in prompt and "s3 [spoken at 9s" in prompt
    client.get("/api/deck/brief1/brief")
    assert len(calls) == 1  # cached on the analysis
    assert client.get("/api/deck/brief1").json()["brief"]["headline"] == BRIEF["headline"]
    client.get("/api/deck/brief1/brief?refresh=1")
    assert len(calls) == 2
    assert client.get("/api/deck/nope/brief").status_code == 404


def test_brief_md(monkeypatch):
    fake_llm(monkeypatch, brief=lambda user: BRIEF)
    store.save(live_only_analysis("brief2"))
    r = client.get("/api/deck/brief2/brief.md")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    md = r.text
    for part in ("# Fin: screening brief", "**Recommendation: Dig deeper**", "## Red flags",
                 "s1 (said live at 3s): \"40 paying customers\" - check: **unverified**", "## What changed during",
                 "  - s1: see above", "1. 40 or 55?", "## Evidence to request", "unverified does not mean false"):
        assert part in md, part


def test_brief_errors(monkeypatch):
    from claimmap import llm

    def boom(*a, **k):
        raise llm.LLMError("down")

    monkeypatch.setattr("claimmap.llm.call_json", boom)
    store.save(live_only_analysis("brief3"))
    assert client.get("/api/deck/brief3/brief").status_code == 502
    empty = client.post("/api/session", json={"title": "Empty"}).json()["deck_id"]
    assert client.get(f"/api/deck/{empty}/brief").status_code == 409


def test_brief_prompt_truncates_transcript_keeping_the_end():
    from claimmap.schemas import TranscriptSegment

    a = live_only_analysis()
    a.transcript = [TranscriptSegment(text=f"sentence {i}." * 20, t0=i, t1=i) for i in range(200)]
    p = brief_mod.brief_prompt(a)
    assert "sentence 199." in p and "sentence 0." not in p
