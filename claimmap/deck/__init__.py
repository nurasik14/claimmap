"""Deck analysis (OWNED BY AGENT A). Public entry point: analyze_deck (signature fixed by the contract).

Stages: PDF text (pdf.py) -> claims + dependency graph (extract.py) -> load scores (load.py) -> deck arithmetic
(mathcheck.py) -> archived website (wayback.py) and public web (websearch.py), in parallel -> questions
(questions.py). Set CLAIMMAP_DECK_NO_WEB=1 to skip the network checks.
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable

from claimmap import llm, store
from claimmap.deck import pdf, slides, wayback, websearch
from claimmap.deck.extract import extract_claims
from claimmap.deck.load import score_load
from claimmap.deck.mathcheck import apply_math
from claimmap.deck.questions import write_questions
from claimmap.schemas import DeckAnalysis
from claimmap.score import compute_score

OnUpdate = Callable[[DeckAnalysis], None]


class DeckError(Exception):
    """A failure with a message that can be shown to the user as is."""


def analyze_deck(pdf_bytes: bytes, deck_id: str, on_update: OnUpdate, title: str = "",
                 created_at: str = "") -> DeckAnalysis:
    """Parse the PDF, render slides, extract claims + dependency graph, score load, run checks, write questions.

    Calls on_update(analysis) after each stage. Never raises: on failure returns status="error" with `error`.
    `title` (e.g. the file name stem) is used when the deck names no company.
    """
    return run_analysis(pdf_bytes, deck_id, on_update, title=title, created_at=created_at)[0]


def _direct_api_ok() -> bool:
    return llm.backend() == "api" and os.environ.get("CLAIMMAP_FAKE_LLM") != "1"


def run_analysis(pdf_bytes: bytes, deck_id: str, on_update: OnUpdate, use_web: bool | None = None,
                 title: str = "", created_at: str = "") -> tuple[DeckAnalysis, dict[str, float]]:
    """Like analyze_deck but also returns seconds per stage. use_web=None reads CLAIMMAP_DECK_NO_WEB."""
    if use_web is None:
        use_web = os.environ.get("CLAIMMAP_DECK_NO_WEB") != "1"
    a = DeckAnalysis(deck_id=deck_id, status="parsing", progress="Reading the PDF", title=title,
                     created_at=created_at or datetime.now(timezone.utc).isoformat(timespec="seconds"))
    timings: dict[str, float] = {}
    t_start = time.perf_counter()

    def emit(status: str | None = None, progress: str | None = None) -> None:
        if status:
            a.status = status  # type: ignore[assignment]
        if progress:
            a.progress = progress
        try:
            on_update(a.model_copy(deep=True))
        except Exception:
            pass  # a failing UI callback must not kill the analysis

    stage_t = [time.perf_counter()]

    def lap(name: str) -> None:
        now = time.perf_counter()
        timings[name] = round(now - stage_t[0], 2)
        stage_t[0] = now

    try:
        emit()
        notes = _parse(pdf_bytes, a, emit)
        lap("parse")
        # Slide images + word boxes need no LLM: run them while the claims are being extracted.
        render_pool = ThreadPoolExecutor(max_workers=2)
        f_render = render_pool.submit(slides.render_slides, pdf_bytes, store.slides_dir(deck_id))
        f_words = render_pool.submit(slides.word_boxes, pdf_bytes)
        render_pool.shutdown(wait=False)

        emit("extracting", f"Extracting claims (slide text: {len(a.slides)} pages)")
        ext = extract_claims(a.slides)
        a.company, a.website, a.claims = ext.company, ext.website, ext.claims
        a.title = a.company or a.title or deck_id
        score_load(a.claims)
        lap("extract")
        notes += _attach_slides(a, f_render, f_words)
        lap("slides_wait")
        emit("checking", f"Found {len(a.claims)} claims; checking the deck's arithmetic")

        findings = apply_math(a.claims, ext.growth_period_months)
        lap("math")
        notes += _network_checks(a, emit, use_web, len(findings), lap)

        emit("checking", "Writing the questions that decide the deal")
        a.questions = write_questions(a.claims, a.company)
        lap("questions")

        timings["total"] = round(time.perf_counter() - t_start, 2)
        n_contra = sum(c.check.verdict == "contradicted" for c in a.claims)
        a.score = compute_score(a)
        summary = (f"Done in {timings['total']:.0f}s: {len(a.claims)} claims, {n_contra} contradicted, "
                   f"{len(a.questions)} questions")
        emit("done", summary + (f" ({'; '.join(notes)})" if notes else ""))
    except Exception as e:
        timings["total"] = round(time.perf_counter() - t_start, 2)
        a.error = _readable(e)
        emit("error", f"Analysis failed: {a.error}")
    return a, timings


def _parse(pdf_bytes: bytes, a: DeckAnalysis, emit) -> list[str]:
    notes: list[str] = []
    try:
        pages = pdf.extract_pages(pdf_bytes)
    except Exception as e:
        raise DeckError(f"Could not read this PDF ({type(e).__name__}); is it a valid, unencrypted PDF?") from e
    if not pages:
        raise DeckError("The PDF has no pages.")
    images = pdf.image_pages(pages)
    if pdf.mostly_images(pages):
        if _direct_api_ok():
            emit("parsing", f"{len(images)} of {len(pages)} pages are images; reading them with Claude")
            try:
                read = pdf.read_with_claude(pdf_bytes, len(pages))
                pages = [r if len(r) > len(p) else p for p, r in zip(pages, read)]
                images = pdf.image_pages(pages)
            except Exception as e:
                notes.append(f"could not read image pages ({type(e).__name__})")
        else:
            notes.append(f"{len(images)} image-only pages skipped")
    elif images:
        notes.append(f"{len(images)} image-only page(s) skipped")
    if not any(p.strip() for p in pages):
        raise DeckError("No readable text in this PDF: the slides are images and could not be transcribed.")
    a.slides = pages
    return notes


def _attach_slides(a: DeckAnalysis, f_render, f_words) -> list[str]:
    try:
        a.slide_count = f_render.result(timeout=60)
        slides.match_boxes(a.claims, f_words.result(timeout=60))
    except Exception as e:
        return [f"slide images failed ({type(e).__name__})"]
    return [] if a.slide_count else ["slide images unavailable"]


def _network_checks(a: DeckAnalysis, emit, use_web: bool, n_math: int, lap) -> list[str]:
    if not use_web:
        emit("checking", f"Deck arithmetic: {n_math} findings (web checks off)")
        return ["web checks off"]
    n_way = len([c for c in a.claims if c.category in wayback.CHECK_CATEGORIES]) if a.website else 0
    n_web = len(websearch.pick_claims(a.claims)) if _direct_api_ok() else 0
    parts = []
    if n_way:
        parts.append(f"{n_way} claims against the archived website ({a.website})")
    if n_web:
        parts.append(f"{n_web} market/competition claims on the web")
    if not parts:
        return ["no website for archive checks" if not a.website else "nothing to check online"]
    emit("checking", f"Deck arithmetic: {n_math} findings. Checking " + " and ".join(parts))

    with ThreadPoolExecutor(max_workers=2) as ex:
        f_way = ex.submit(wayback.check_wayback, a.website, a.claims) if n_way else None
        context = f"{a.company}\n{a.slides[0][:500] if a.slides else ''}"  # name + title-slide pitch
        f_web = ex.submit(websearch.check_web, a.claims, context) if n_web else None
        way_res = f_way.result() if f_way else None
        web_res = f_web.result() if f_web else None
    notes: list[str] = []
    if way_res is not None:
        n = wayback.apply_wayback(way_res, a.claims)
        notes.append(f"wayback: {way_res.note}" if way_res.note else f"wayback: {n} verdicts from {len(way_res.snapshots)} snapshots")
    if web_res is not None:
        n = websearch.apply_web(web_res, a.claims)
        notes.append(f"web: {n} verdicts" + (f", {'; '.join(web_res.notes)}" if web_res.notes else ""))
    lap("web_checks")
    return notes


def _readable(e: Exception) -> str:
    if isinstance(e, DeckError):
        return str(e)
    if isinstance(e, llm.LLMError):
        return f"The claim-extraction model call failed: {e}"[:500]
    return f"{type(e).__name__}: {e}"[:500]
