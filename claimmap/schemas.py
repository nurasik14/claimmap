"""Shared data contract. Owned by the orchestrator: agents may READ but not change field names or
types here. If an agent needs a new optional field, it adds it at the end with a default and notes it in
its report (other agents must not depend on it)."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

Category = Literal["market", "traction", "growth", "team", "competition", "product", "financials",
                   "customers", "ask", "other"]
Verdict = Literal["supported", "contradicted", "unverified", "missing"]


class Source(BaseModel):
    """Evidence for a check. `quote` is the exact sentence from the source (required for contradicted)."""
    kind: Literal["deck", "math", "wayback", "website", "web", "registry", "transcript"]
    title: str = ""
    url: Optional[str] = None
    quote: str = ""
    date: Optional[str] = None  # ISO date of the evidence (snapshot date, article date)
    # (orchestrator v4) does this source back the claim, refute it, or only give context? None = infer from verdict
    stance: Optional[Literal["supports", "refutes", "context"]] = None


class Check(BaseModel):
    verdict: Verdict = "unverified"
    reason: str = ""          # one plain sentence an investor can read
    sources: list[Source] = Field(default_factory=list)
    method: Literal["math", "wayback", "web", "llm", "none"] = "none"


class Box(BaseModel):
    """Where a claim's quote sits on a slide image; x, y, w, h are fractions (0..1) of the page size."""
    slide: int                # 1-based
    x: float
    y: float
    w: float
    h: float


class Claim(BaseModel):
    id: str                   # "c1", "c2", ... stable within a deck
    text: str                 # normalised claim, e.g. "26 paying customers"
    quote: str = ""           # verbatim from the deck
    slide: Optional[int] = None  # 1-based slide/page number
    category: Category = "other"
    value: Optional[float] = None   # numeric value if any (26, 0.40, 4.1e9)
    unit: Optional[str] = None      # "customers", "USD", "ratio_per_month", ...
    depends_on: list[str] = Field(default_factory=list)  # ids of claims this one rests on
    load: float = 0.0         # 0..1 load-bearing score (how much of the deal rests on it)
    check: Check = Field(default_factory=Check)
    role: Optional[str] = None  # (agent A addition) arithmetic role: tam, mrr, team_size, monthly_burn, ...
    # v2 additions
    source: Literal["deck", "spoken"] = "deck"   # spoken = said during a live session
    t: Optional[float] = None                    # spoken claims: seconds into the live session
    boxes: list[Box] = Field(default_factory=list)  # highlight rectangles on slide images (deck claims)


class Question(BaseModel):
    id: str                   # "q1", ...
    text: str                 # the question to ask the founder
    claim_ids: list[str] = Field(default_factory=list)
    why: str = ""             # why it matters (which load-bearing claim it tests)
    evidence_to_request: str = ""  # e.g. "Stripe export of the last 6 months"
    priority: int = 1         # 1 = ask first


class DeckAnalysis(BaseModel):
    deck_id: str
    status: Literal["queued", "parsing", "extracting", "checking", "done", "error"] = "queued"
    progress: str = ""        # human-readable progress line for the UI
    error: Optional[str] = None
    company: str = ""
    website: Optional[str] = None
    slides: list[str] = Field(default_factory=list)   # text per slide/page
    claims: list[Claim] = Field(default_factory=list)
    questions: list[Question] = Field(default_factory=list)
    created_at: str = ""
    # v2 additions
    mode: Literal["deck", "live", "deck+live"] = "deck"   # deck only / live only / deck then live
    title: str = ""            # display name (company, or the title typed for a live-only session)
    slide_count: int = 0       # rendered slide images available at /api/deck/{id}/slides/{n}.png
    transcript: list["TranscriptSegment"] = Field(default_factory=list)  # committed live transcript
    brief: Optional["Brief"] = None   # cached investment memo
    # v3 additions (real-pitch showcase + scoring)
    source_url: Optional[str] = None   # where a real deck/pitch came from (YouTube URL, PDF URL)
    outcome: Optional[str] = None      # verified real-world outcome label, e.g. "Won TechCrunch Disrupt SF 2019 Startup Battlefield"
    outcome_won: Optional[bool] = None # True = won/deal, False = did not win/no deal, None = unknown
    outcome_source: Optional[str] = None  # URL proving the outcome
    score: Optional["PitchScore"] = None
    drift_notes: list[str] = Field(default_factory=list)  # (agent D addition) live drift, one line each, for the Brief
    # (orchestrator) how the pitch was captured: live microphone, a recording (replay / video), or typed text
    capture: Optional[Literal["live_mic", "recording", "text"]] = None


class ScorePart(BaseModel):
    name: str                  # e.g. "Load-bearing claims backed"
    points: float              # earned
    max_points: float
    detail: str = ""           # one sentence with the numbers behind it


class PitchScore(BaseModel):
    """ClaimMap Score (0-100): how well a pitch's claims hold up. Formula fixed BEFORE looking at outcomes."""
    total: float
    parts: list[ScorePart] = Field(default_factory=list)
    summary: str = ""
    version: str = "v1"
    # (orchestrator addition) which claims moved the number, e.g. "'No direct competitors' contradicted: -6.2 (A)"
    drivers: list["ScoreDriver"] = Field(default_factory=list)


class ScoreDriver(BaseModel):
    claim_id: str
    text: str                  # the claim
    part: str                  # "A" | "B" | "C" | "D"
    effect: float              # points gained (+) or lost (-) versus a neutral/unverified claim
    reason: str = ""           # one plain sentence


class TranscriptSegment(BaseModel):
    text: str
    t0: float
    t1: float


class RedFlag(BaseModel):
    text: str
    claim_ids: list[str] = Field(default_factory=list)


class Brief(BaseModel):
    """One-page investment memo an analyst would send partners after screening."""
    recommendation: Literal["take_meeting", "dig_deeper", "pass"] = "dig_deeper"
    headline: str = ""         # one sentence: the verdict and the reason
    summary: str = ""          # 3-5 sentences: what the company claims and what held up
    strengths: list[str] = Field(default_factory=list)
    red_flags: list[RedFlag] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)          # top questions for the next meeting
    evidence_requests: list[str] = Field(default_factory=list)  # documents to ask for
    live_notes: list[str] = Field(default_factory=list)         # what changed during the live pitch (drift etc.)
    generated_at: str = ""


# ---- Live events: server -> browser over WS /ws/live/{deck_id} (JSON, one object per message) ----

class TranscriptEvent(BaseModel):
    type: Literal["transcript"] = "transcript"
    text: str
    t0: float                 # seconds since session start
    t1: float


class SpokenClaimEvent(BaseModel):
    type: Literal["spoken_claim"] = "spoken_claim"
    id: str                   # "s1", "s2", ...
    quote: str                # what the founder said
    category: Category = "other"
    deck_claim_id: Optional[str] = None
    relation: Literal["consistent", "drift", "new"] = "new"
    note: str = ""            # e.g. "Deck says 26 customers; founder said 40"
    t: float = 0.0


class QuestionEvent(BaseModel):
    type: Literal["question"] = "question"
    question: Question


class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    state: Literal["listening", "transcribing", "analyzing", "idle", "stopped"]
    detail: str = ""


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class ClaimAddedEvent(BaseModel):
    """v2: a spoken claim was added to the analysis graph (live-only and deck+live sessions)."""
    type: Literal["claim_added"] = "claim_added"
    claim: Claim


class ScoreEvent(BaseModel):
    """(orchestrator addition) the ClaimMap Score was recomputed during a live session."""
    type: Literal["score"] = "score"
    score: PitchScore


class CheckingEvent(BaseModel):
    """(orchestrator addition) the session stopped and the automatic AI fact-check (finalize) started."""
    type: Literal["checking"] = "checking"
    detail: str = ""


DeckAnalysis.model_rebuild()
