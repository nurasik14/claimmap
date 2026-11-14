"""Builds tests/fixtures/labloop_deck.pdf, a FICTIONAL 7-slide test deck whose claims match
data/demo_audio/sample_pitch.mp3 (the audio says 40 customers and $10B, so both are drift).
Run: uv run python tests/fixtures/make_fixture_deck.py"""
from pathlib import Path
from fpdf import FPDF

SLIDES = [
    ("LabLoop", ["Robotic sample prep for contract research labs", "Seed round deck, 2026 (fictional test company)", "labloop.example.com"]),
    ("Problem", ["Contract labs spend 30% of technician time on manual sample prep", "Errors in manual pipetting cause 1 in 20 assay re-runs"]),
    ("Traction", ["26 paying customers", "40% month-on-month revenue growth since January", "$38k monthly recurring revenue"]),
    ("Market", ["US contract-lab automation market: $4.1B TAM", "We target 2% market share by year 3"]),
    ("Competition", ["No direct competitors", "Incumbent liquid handlers are 10x the price"]),
    ("Team", ["CEO: 8 years at Thermo Fisher", "CTO: robotics PhD, ETH Zurich", "Team of 25 people"]),
    ("Financials and ask", ["Revenue forecast: $5M in year 3", "Monthly burn: $90k", "Raising $3M seed at a $15M pre-money valuation"]),
]

pdf = FPDF(orientation="L", unit="mm", format="A4")
for title, lines in SLIDES:
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 32)
    pdf.cell(0, 30, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 20)
    for line in lines:
        pdf.cell(0, 14, "- " + line, new_x="LMARGIN", new_y="NEXT")
out = Path(__file__).with_name("labloop_deck.pdf")
pdf.output(str(out))
print(out)
