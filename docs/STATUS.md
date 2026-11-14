# ClaimMap: hackathon status (resume here)

Working name: ClaimMap (not final, see O-5)
Track: idea 1, "Due-diligence map for pitch decks", built as a LIVE pitch analyzer
Last updated: 2026-11-14

## Current direction

The investor uploads the startup's deck BEFORE the pitch. ClaimMap extracts the
claims, builds a dependency graph with load-bearing scores and a "Jenga pull"
view, and checks claims (deck arithmetic, Wayback website snapshots, web search).
It outputs the 3-5 questions that decide the deal. DURING the pitch it listens
(local Whisper on the GPU), extracts spoken claims and flags DRIFT from the deck
live ("deck: 26 customers / said: 40"), adding live questions (D-008, D-009).

## In progress

3 Claude Code agents are building in parallel (D-014), launched 2026-11-14 11:15:
- B live pipeline: DONE 11:22 (7 min). 22 tests pass; the orchestrator re-ran the
  real-LLM replay test and it passes. Measured speech-to-alert latency: median
  4.1 s, max 5.7 s; both expected drifts were caught. AI changes for veto: a faster
  trigger (6+ words containing a digit), re-reporting a claim if the figure
  changes, and replay ends with "idle".
- C frontend: DONE 11:22 (7 min). Orchestrator browser QA (1920x1080): the live
  replay works end to end in the browser (transcript, consistent/new claims, live
  questions). Bugs found: graph too small to read, literal "null" in the detail
  panel, broken pull-banner layout, drift cards pushed below the fold, no
  audible replay, favicon 404.
- C2 fix pass: DONE 11:30 (6 min). Orchestrator QA on the real deck
  (labloop_deck, 16 claims) at 1920x1080: the graph is readable (cards ~14 px,
  arrows), no "null" text, no console errors (128 harmless Cytoscape mapping
  warnings). Remaining look issues: 14 of 16 claims are amber "unverified", so
  the graph looks monotone; the empty detail strip wastes space; the dark
  "terminal" look isn't the BlazeLearn feel. Kept for the v2 redesign.
- A deck analysis (opus): DONE 11:28 (14 min). Orchestrator re-ran the full suite:
  47 passed, 2 skipped; .env untouched (125 B, mode 600). The real run on the
  fixture deck takes ~25 s: 16 claims, load scores (ask 1.0, "26 customers" 0.95),
  maths checks, and web search CONTRADICTS "no direct competitors" with real
  companies (Metrohm, Labman, Curiox). 4 strong questions. Limits: Wayback gets
  HTTP 429 from this network (VPN exit), so it's never verified live; claim count
  varies 16-17 between runs. No real public deck found (Airbnb PDFs are redesigns
  or behind download walls). Preloaded deck id: labloop_deck. Offline switch:
  CLAIMMAP_DECK_NO_WEB=1.
- Status files: .agents/status-{a,b,c}; reports: docs/agent-reports/{a,b,c}.md
- Afterwards: the orchestrator re-runs the tests, does browser QA with
  screenshots, then one batched fix pass.

## v2: DONE and QA'd (~12:08)

- D backend 15.5 min, E frontend 11.7 min; suite 67 passed, 2 skipped.
- Orchestrator browser QA (1920x1080 + 1280x720, light + dark): library, Read
  (slides + aligned highlights), Obsidian map (hover neighbours, pull "6 of 16
  fall"), Live replay (drift cards 26 vs 40 and $4.1B vs $10B, live mini-map,
  questions), Brief (memo + export buttons) all work.
- Orchestrator fixes: "null" in the top bar; unconnected claims placed on a
  ring (not a corner row); claim ids banned from Brief prose; briefs regenerated.
  Restored labloop_deck after a QA replay; archived a duplicate upload + the
  fixture; titled the deck+live demo; added scripts/reset_demo.sh +
  data/demo_snapshot/.
- Known minor: reopening the Live tab after a reload shows the transcript but
  not past drift cards/questions (they're in the Brief and Map).

## v2 (launched ~11:40; judging in ~2.5-3 h, so roughly 14:00-14:30)

Agents D (backend v2, opus) and E (frontend v2, opus) are running in parallel per
.agents/CONTRACT-v2.md. The v1 snapshot is in $TMPDIR/claimmap-v1. Plan: QA + fix
by ~12:45, then pitch prep and rehearsal.

## Pending decision (Nurasik)

0. Confirm the read-only Brief (D-016) and the live-only design.

1. Hours until judging and team size (O-1): still unknown. Decides how much
   polish vs pitch prep.
2. Event location (O-2): mainland China or HK? Decides whether to preload
   results in case the VPN fails.
3. Confirm the positioning (D-004) and the AI additions listed in D-014.
4. A real demo deck (O-3), e.g. Airbnb 2008. Agent A may try fetching one.

## Pitch

docs/PITCH.md: setup checklist (T-30 min), 3-minute script with timings, a click
path to rehearse, backups (typed line, screen recording, v1), Q&A answers.
Re-check the exact numbers ("5 of 16 fall") against the final v2.

## Files

- docs/DECISIONS.md, docs/JOURNAL.md, docs/BRAINSTORM.md, docs/research/
- .agents/CONTRACT.md (build contract), spikes/ (feasibility measurements)
- Run: `uv run uvicorn claimmap.app:app --port 8000` then open http://localhost:8000
