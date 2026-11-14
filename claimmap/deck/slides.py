"""Slide images (pdftoppm) and word boxes (pdftotext -bbox-layout) -> highlight boxes for claim quotes.

render_slides writes data/decks/<id>/slides/<n>.png (about WIDTH px wide). word_boxes returns every word with
its position as fractions of the page. match_boxes maps each deck claim's verbatim quote to the words on its
slide: best in-order token span first, then the line holding the claim's key number; no confident match ->
no boxes. CLI (backfill a stored deck): uv run python -m claimmap.deck.slides <deck_id> [...]
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from claimmap.schemas import Box, Claim

WIDTH = 1600
MIN_SCORE = 0.6       # fraction of quote tokens found in order inside the span
MIN_SCORE_OTHER = 0.8  # same, when the quote is searched on slides other than the claim's own
TIMEOUT = 60


@dataclass
class Word:
    text: str
    norm: str
    line: int        # line index within the page (words on one visual line share it)
    x0: float
    y0: float
    x1: float
    y1: float        # fractions of the page size


def render_slides(pdf_bytes: bytes, out_dir: Path, width: int = WIDTH) -> int:
    """Render every page to out_dir/<n>.png. Returns the number of images written (0 on failure)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = out_dir / "p"
    try:
        subprocess.run(["pdftoppm", "-png", "-scale-to-x", str(width), "-scale-to-y", "-1", "-", str(prefix)],
                       input=pdf_bytes, capture_output=True, timeout=TIMEOUT, check=True)
    except (OSError, subprocess.SubprocessError):
        return 0
    n = 0
    for p in out_dir.glob("p-*.png"):  # pdftoppm zero-pads page numbers to the page count's width
        m = re.fullmatch(r"p-0*(\d+)\.png", p.name)
        if m:
            p.replace(out_dir / f"{int(m.group(1))}.png")
            n = max(n, int(m.group(1)))
    return n


_PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
_LINE = re.compile(r"<line [^>]*>(.*?)</line>", re.S)
_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S)


def word_boxes(pdf_bytes: bytes) -> dict[int, list[Word]]:
    """1-based page -> words in reading order. Empty dict on failure."""
    try:
        p = subprocess.run(["pdftotext", "-bbox-layout", "-", "-"], input=pdf_bytes, capture_output=True,
                           timeout=TIMEOUT, check=True)
    except (OSError, subprocess.SubprocessError):
        return {}
    return parse_bbox(p.stdout.decode("utf-8", errors="replace"))


def parse_bbox(xhtml: str) -> dict[int, list[Word]]:
    pages: dict[int, list[Word]] = {}
    for i, m in enumerate(_PAGE.finditer(xhtml), 1):
        pw, ph = float(m.group(1)) or 1.0, float(m.group(2)) or 1.0
        words: list[Word] = []
        for li, lm in enumerate(_LINE.finditer(m.group(3))):
            for wm in _WORD.finditer(lm.group(1)):
                text = html.unescape(wm.group(5))
                words.append(Word(text, norm(text), li, float(wm.group(1)) / pw, float(wm.group(2)) / ph,
                                  float(wm.group(3)) / pw, float(wm.group(4)) / ph))
        pages[i] = words
    return pages


def norm(token: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", token.lower())


def tokens(s: str) -> list[str]:
    return [t for t in (norm(x) for x in s.split()) if t]


def _best_span(q: list[str], words: list[Word]) -> tuple[float, int, int]:
    """Best (score, start, end) span of `words` matching quote tokens `q` in order (greedy, small skips)."""
    best = (0.0, -1, -1)
    for i, w in enumerate(words):
        if w.norm != q[0] and (len(q) < 2 or w.norm != q[1]):
            continue
        qi = 0 if w.norm == q[0] else 1
        matched, j, last = 0, i, i
        while qi < len(q) and j < len(words) and j - last <= 3:
            if words[j].norm == q[qi]:
                matched += 1
                last = j
                qi += 1
                j += 1
            elif qi + 1 < len(q) and words[j].norm == q[qi + 1]:
                qi += 1  # quote word missing on the slide
            else:
                j += 1
        score = matched / len(q)
        if score > best[0]:
            best = (score, i, last)
    return best


def _numbers(s: str) -> list[str]:
    return [n.replace(",", "").replace(".", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s)]


def _number_line(c: Claim, words: list[Word]) -> list[Word]:
    """Words of the line holding the claim's key number(s), if exactly identifiable."""
    nums = _numbers(c.quote or c.text)[:3]
    if not nums:
        return []
    lines: dict[int, list[Word]] = {}
    for w in words:
        lines.setdefault(w.line, []).append(w)
    qt = set(tokens(c.quote or c.text))
    cands = []
    for li, ws in lines.items():
        norms = [w.norm for w in ws]
        if all(any(re.fullmatch(re.escape(n) + r"[a-z]{0,3}", x) for x in norms) for n in nums):
            cands.append((len(qt & set(norms)), li))
    if not cands:
        return []
    cands.sort(reverse=True)
    if len(cands) > 1 and cands[0][0] == cands[1][0]:
        return []  # two equally good lines: not confident
    return lines[cands[0][1]]


def _to_boxes(slide: int, ws: list[Word]) -> list[Box]:
    by_line: dict[int, list[Word]] = {}
    for w in ws:
        by_line.setdefault(w.line, []).append(w)
    out = []
    for line_words in by_line.values():
        x0, y0 = min(w.x0 for w in line_words), min(w.y0 for w in line_words)
        x1, y1 = max(w.x1 for w in line_words), max(w.y1 for w in line_words)
        out.append(Box(slide=slide, x=round(x0, 4), y=round(y0, 4), w=round(x1 - x0, 4), h=round(y1 - y0, 4)))
    return out


def boxes_for(c: Claim, pages: dict[int, list[Word]]) -> list[Box]:
    q = tokens(c.quote or c.text)
    if not q or not pages:
        return []
    order = ([c.slide] if c.slide in pages else []) + [p for p in pages if p != c.slide]
    for p in order:
        score, i, j = _best_span(q, pages[p])
        if score >= (MIN_SCORE if p == c.slide or c.slide is None else MIN_SCORE_OTHER):
            return _to_boxes(p, pages[p][i:j + 1])
    if c.slide in pages:
        ws = _number_line(c, pages[c.slide])
        if ws:
            return _to_boxes(c.slide, ws)
    return []


def match_boxes(claims: list[Claim], pages: dict[int, list[Word]]) -> int:
    """Set `boxes` on every deck claim in place. Returns how many claims got at least one box."""
    n = 0
    for c in claims:
        if c.source != "deck":
            continue
        c.boxes = boxes_for(c, pages)
        n += bool(c.boxes)
    return n


def backfill(deck_id: str) -> str:
    """Render slides and boxes for a stored deck from its stored PDF (no LLM)."""
    from claimmap import store

    a = store.load(deck_id)
    pdf = store.pdf_path(deck_id)
    if a is None or not pdf.exists():
        return f"{deck_id}: no analysis or no PDF"
    data = pdf.read_bytes()
    a.slide_count = render_slides(data, store.slides_dir(deck_id))
    n = match_boxes(a.claims, word_boxes(data))
    if not a.title:
        a.title = a.company or deck_id
    store.save(a)
    deck_claims = sum(c.source == "deck" for c in a.claims)
    return f"{deck_id}: {a.slide_count} slides, boxes for {n}/{deck_claims} deck claims"


if __name__ == "__main__":
    for d in sys.argv[1:]:
        print(backfill(d))
