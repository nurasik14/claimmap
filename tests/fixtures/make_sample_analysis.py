"""Builds tests/fixtures/sample_analysis.json: a hand-written DeckAnalysis for the fictional LabLoop deck.
The deck stub returns it, and the frontend agent uses it as mock data. The Wayback/web sources in it
are EXAMPLES, not real evidence. Run: uv run python tests/fixtures/make_sample_analysis.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pypdf import PdfReader  # noqa: E402
from claimmap.schemas import Check, Claim, DeckAnalysis, Question, Source  # noqa: E402

HERE = Path(__file__).resolve().parent
slides = [p.extract_text() for p in PdfReader(HERE / "labloop_deck.pdf").pages]


def S(kind, title, quote, url=None, date=None):
    return Source(kind=kind, title=title, quote=quote, url=url, date=date)


claims = [
    Claim(id="c1", text="Raising $3M seed at $15M pre-money", quote="Raising $3M seed at a $15M pre-money valuation", slide=7,
          category="ask", value=15e6, unit="USD", depends_on=["c2", "c6"], load=1.0,
          check=Check(verdict="unverified", reason="The valuation rests on the year-3 revenue forecast and current traction.")),
    Claim(id="c2", text="$5M revenue in year 3", quote="Revenue forecast: $5M in year 3", slide=7, category="financials",
          value=5e6, unit="USD", depends_on=["c3", "c4", "c5"], load=0.85,
          check=Check(verdict="supported", method="math",
                      reason="TAM x target share = $82M, so a $5M forecast is within the deck's own market maths.",
                      sources=[S("math", "Deck arithmetic", "$4.1B x 2% = $82M >= $5M")])),
    Claim(id="c3", text="TAM of $4.1B (US contract-lab automation)", quote="US contract-lab automation market: $4.1B TAM",
          slide=4, category="market", value=4.1e9, unit="USD", load=0.6,
          check=Check(verdict="unverified", method="web", reason="Top-down figure with no source on the slide.")),
    Claim(id="c4", text="2% market share by year 3", quote="We target 2% market share by year 3", slide=4, category="market",
          value=0.02, unit="ratio", depends_on=["c7"], load=0.55,
          check=Check(verdict="unverified", reason="A target, not evidence. It depends on there being no strong competitor.")),
    Claim(id="c5", text="40% month-on-month revenue growth", quote="40% month-on-month revenue growth since January", slide=3,
          category="growth", value=0.4, unit="ratio_per_month", depends_on=["c6"], load=0.7,
          check=Check(verdict="unverified", method="math",
                      reason="Self-reported. 40% a month for 10 months would be about 29x growth, so MRR in January would have been about $1.3k.",
                      sources=[S("math", "Deck arithmetic", "1.4^10 = 28.9; $38k / 28.9 = $1.3k")])),
    Claim(id="c6", text="26 paying customers", quote="26 paying customers", slide=3, category="traction", value=26,
          unit="customers", load=0.9,
          check=Check(verdict="contradicted", method="wayback",
                      reason="The company's customers page archived 3 months ago lists 4 pilots, none paying. (Fixture example, not real data.)",
                      sources=[S("wayback", "labloop.example.com/customers (archived)", "Our pilot partners: 4 labs",
                                 "https://web.archive.org/web/2026/labloop.example.com/customers", "2026-08-02")])),
    Claim(id="c7", text="No direct competitors", quote="No direct competitors", slide=5, category="competition", load=0.5,
          check=Check(verdict="contradicted", method="web",
                      reason="Example only: funded companies sell robotic sample prep to contract labs.",
                      sources=[S("web", "Fixture example", "Example competitor sells automated sample prep to CROs",
                                 "https://example.com/competitor")])),
    Claim(id="c8", text="Team of 25 people", quote="Team of 25 people", slide=6, category="team", value=25, unit="people",
          load=0.3,
          check=Check(verdict="contradicted", method="math",
                      reason="A $90k monthly burn with 25 people is $3.6k per person per month, which is below US salary levels.",
                      sources=[S("math", "Deck arithmetic", "$90k / 25 = $3.6k per person per month")])),
    Claim(id="c9", text="$38k monthly recurring revenue", quote="$38k monthly recurring revenue", slide=3, category="traction",
          value=38000, unit="USD_per_month", depends_on=["c6"], load=0.6,
          check=Check(verdict="unverified", method="math", reason="Self-reported. $38k / 26 customers = $1.5k per customer per month.",
                      sources=[S("math", "Deck arithmetic", "$38k / 26 = $1.46k")])),
]
questions = [
    Question(id="q1", priority=1, claim_ids=["c6"],
             text="Your deck says 26 paying customers, but your site listed 4 pilots three months ago. How many are paying today, and since when?",
             why="Traction holds up the growth rate, the revenue forecast and the valuation.",
             evidence_to_request="A customer list with contract start dates and the last 3 months of invoices"),
    Question(id="q2", priority=2, claim_ids=["c7", "c4"],
             text="Who else sells robotic sample prep to contract labs, and why do labs pick you?",
             why="The 2% share target assumes no strong competitor.",
             evidence_to_request="Win/loss notes from the last 10 deals"),
    Question(id="q3", priority=3, claim_ids=["c8"], text="How do 25 people fit in a $90k monthly burn?",
             why="Either the team size or the burn rate is wrong, and the runway depends on which.",
             evidence_to_request="Payroll summary and the last 6 months of bank statements"),
]
a = DeckAnalysis(deck_id="fixture", status="done", progress="Done", company="LabLoop (fictional)",
                 website="labloop.example.com", slides=slides, claims=claims, questions=questions,
                 created_at="2026-11-14T00:00:00+00:00")
(HERE / "sample_analysis.json").write_text(a.model_dump_json(indent=2))
print(len(claims), "claims written")
