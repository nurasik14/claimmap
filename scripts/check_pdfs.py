"""Check downloaded decks: genuine PDF (magic bytes), page count and text-layer word count.

uv run python -I scripts/check_pdfs.py data/real_decks/*.pdf
"""
import subprocess
import sys
from pathlib import Path

for arg in sys.argv[1:]:
    p = Path(arg)
    head = p.read_bytes()[:5]
    if head != b"%PDF-":
        print(f"{p.name}: NOT A PDF (starts with {head!r}, {p.stat().st_size} bytes)")
        continue
    info = subprocess.run(["pdfinfo", str(p)], capture_output=True, text=True).stdout
    pages = next((ln.split()[-1] for ln in info.splitlines() if ln.startswith("Pages:")), "?")
    text = subprocess.run(["pdftotext", str(p), "-"], capture_output=True, text=True).stdout
    print(f"{p.name}: PDF, {pages} pages, {len(text.split())} words, {p.stat().st_size // 1024} kB | {' '.join(text.split()[:25])}")
