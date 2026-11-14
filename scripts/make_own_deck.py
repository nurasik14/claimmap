"""Builds data/demo_decks/claimmap_pitch_deck.pdf: our OWN pitch deck (every claim on it is true and sourced),
so ClaimMap can score its own pitch. Run: uv run python scripts/make_own_deck.py"""
from pathlib import Path
from fpdf import FPDF

SLIDES = [
    ("ClaimMap", ["Know what a deal rests on, before and during the pitch", "Hackathon build, 14 Nov 2026", "Team: Nurassyl Serikov (CS, City University of Hong Kong)"]),
    ("Problem", ["VCs spend 118 hours on due diligence per deal on average (survey of 885 VCs, Gompers et al. 2020)",
                 "Experienced investors say every pitch contains at least three or four common lies (Kawasaki and Reichert, 2006)",
                 "A deal usually rests on a few load-bearing claims, but decks list dozens"]),
    ("Solution", ["Claim map: every deck claim, checked with arithmetic and web evidence, ranked by how much of the deal rests on it",
                  "Live mode: transcribes the pitch and flags drift from the deck about 4-6 seconds after it is said",
                  "One-page investment memo and a 0-100 ClaimMap Score with cited criteria"]),
    ("Competition", ["GoPresent and TechTruth check deck claims and return flat lists of verdicts",
                     "Faktum and VeriFact fact-check spoken claims live, one sentence at a time",
                     "None of them compares the live pitch with the founder's own deck or ranks which claims the deal rests on"]),
    ("Traction", ["Built in one day at this hackathon", "Tested on 3 founder-published decks and 8 TechCrunch Startup Battlefield final pitches",
                  "0 paying customers so far"]),
    ("Business model", ["Per-seat subscription for funds, free tier for angels",
                        "Reference price: TechTruth charges VC funds 799 EUR for a beta trial"]),
    ("Ask", ["2-3 funds to pilot ClaimMap on their next 10 decks"]),
]

pdf = FPDF(orientation="L", unit="mm", format="A4")
for title, lines in SLIDES:
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 30)
    pdf.cell(0, 28, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 17)
    for line in lines:
        pdf.multi_cell(0, 10, "- " + line, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
out = Path(__file__).resolve().parent.parent / "data" / "demo_decks" / "claimmap_pitch_deck.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
pdf.output(str(out))
print(out)
