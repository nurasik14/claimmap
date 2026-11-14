# AI usage declaration: ClaimMap

Author: Nurassyl Serikov (CS, City University of Hong Kong)
Event: investor-judged hackathon, 14 November 2026
Repository: this folder. Every decision referenced below is logged with its date and source in
`docs/DECISIONS.md` (D-001 to D-020) and `docs/JOURNAL.md` (Entries 1 to 24).

## Summary

ClaimMap was built in one day with AI doing most of the code writing. I did the product direction,
the system design, the review and the judgement. I treated the AI as an engineering team I lead,
not as an autocomplete. My working view is that a developer's job today is mostly system design:
deciding what should exist, how the parts fit together, how each part will be checked, and when a
result is not good enough. The code itself can be delegated; those decisions can't.

Plainly:

- Most application code was written by AI coding agents (Claude Code) working from specs.
- The product idea came from the hackathon's track brief. The choice to pursue it, the positioning,
  the core feature (live pitch analysis), the three use modes, the scoring requirements, the design
  direction and every scope change were my decisions. Each one is logged with my own words.
- AI suggestions I accepted are marked "Tentative (AI proposal)" in `DECISIONS.md`, so it is always
  clear who decided what.
- Everything shown in the demo runs for real. Nothing in this declaration or the pitch is a made-up
  number: where something has not been measured (accuracy, cost per deck), the docs say so.

## Tools used

| Tool | Role |
| --- | --- |
| Hermes Agent (Claude Opus) | My main assistant and the build orchestrator: research, brainstorming, decision log, writing agent specs, browser QA, small fixes |
| Claude Code CLI (Opus, Sonnet) | 9 build agents (A to H plus a fix pass), each owning a fixed set of files |
| Claude API (Haiku, Sonnet) inside the product | Claim extraction, web fact-checking with the web search tool, investor questions, the Brief |
| faster-whisper (small.en, local GPU) | Live speech-to-text during a pitch, on my laptop, no cloud audio |
| Playwright | Screenshots and interaction checks of the real app at 1920x1080 and 1280x720, both themes |
| Hardlight UI design skill | Design method, colour contrast checks for every text/background pair |
| Text-to-speech | Generated the audio for our fictional sample pitch (LabLoop) |

Open-source libraries in the product: FastAPI, Cytoscape.js, d3-force, Fontsource fonts (OFL).

## How I worked

### 1. Research before building

Before writing any code I had the AI research two candidate ideas from the hackathon brief: the
pitch-deck claim map (idea 1) and a meeting decision graph (idea 5). For each one I asked for the
existing products, not just the concept. That turned up GoPresent, TechTruth, DDR, VentureOS and
several Chinese tools for idea 1, and Acta, Sentra and others for idea 5 (`docs/research/`). I
chose idea 1 because the judges are investors, so they are the buyer sitting in the room (D-001).

The research also told me what *not* to build: existing tools already label deck claims true or
false. So the question I put to the AI was "how can I be different from what's out there", and the
answer we converged on became the product's two differentiators (D-004, D-008):

1. a dependency graph that shows which claims the deal rests on, with a "pull" test that shows what
   falls if one claim is false;
2. live analysis during the pitch: catching when the founder says something different from their
   own deck.

### 2. Brainstorming, with a written decision log

I asked the AI to keep a decision log "like VibeWise does, or better" (Query 7): every decision with
its status (decided by me, or a tentative AI proposal), the reason, and my exact words. That log is
`docs/DECISIONS.md` and `docs/JOURNAL.md`. It let me steer a fast-moving build without losing track
of what had been agreed, and it is how I caught a drift early: when the brainstorm treated live
analysis as one optional extra, I pointed out that we had agreed it was the core product (Query 9,
D-008). I then chose how "live" should work from three options: deck uploaded first, then the
pitch is listened to and compared against it (D-009).

The brainstorm itself is in `docs/BRAINSTORM.md`; section G is the product-shape plan I asked for
after showing the AI a reference app whose UX I wanted to match.

### 3. Proving the risky parts first

Before committing to live mode, the riskiest part was measured, not assumed (`spikes/`):

- local Whisper on my RTX 4050 transcribes 23 s of speech in 0.35 to 0.69 s, so live is feasible;
- Claude API latency for claim extraction, to size the live loop.

Only after those numbers did the build start.

### 4. System design and delegation

I asked for the build to be split across parallel agents to go faster and keep quality up (Query
11). The structure we used:

- a written contract (`.agents/CONTRACT.md`, `CONTRACT-v2.md`): shared data schema, routes, events,
  and an ownership table so no two agents edit the same file;
- the shared schema and app entry point owned by the orchestrator, not by any agent;
- one shared fictional test deck (LabLoop) with deliberate planted contradictions, and a matching
  spoken pitch that contradicts the deck on purpose ("26 customers" on the slide, "40 customers"
  out loud), so every part could be tested end to end against known answers;
- safety rules in the launcher itself: agents cannot read the API key file, commit, or rewrite git
  history; tests write to a temporary folder, never the real data.

| Agent | Model | Built | Time |
| --- | --- | --- | --- |
| A | Opus | Deck analysis: claim extraction, arithmetic checks, Wayback and web checks, questions | 13.8 min |
| B | Sonnet | Live pipeline: microphone audio, Whisper, drift detection | 7.1 min |
| C, C2 | Sonnet | First frontend, then a fix pass from my QA findings | 7.3 + 5.8 min |
| D | Opus | v2 backend: three modes, the Brief, library | 15.5 min |
| E | Opus | v2 frontend: library, Read / Map / Live / Brief tabs | 11.7 min |
| F | Opus | Motion and the living, Obsidian-style map | 11.8 min |
| G | Opus | Real decks, real pitch videos, the scoring engine | 8.6 min |
| H | Opus | v4 visual redesign, share and delete | 6.7 min |

About 90 minutes of agent time in total. Expensive models were used only where judgement mattered;
routine work ran on cheaper ones, because I asked for my plan budget to be used carefully (Query 18).

### 5. Constant design review, driven by examples

I reviewed the design after every version and gave direction with concrete references rather than
adjectives:

- **Reference app.** I showed BlazeLearn as the bar: "this feels like a real application I would
  use in the wild" (Query 14). The layout was rebuilt around it: a library of decks, then a
  workspace with Read, Map, Live and Brief tabs.
- **The map.** "Circular and connected just like Obsidian" (Query 15); hovering a circle must light
  up the connected ones (Query 16); then "too rigid, make it moving like Obsidian, responsive to
  user action" (Query 19). Result: a physics-based map that springs, drifts and follows a dragged node.
- **Visual identity.** First minimal black, white and green in light and dark themes (Query 16);
  later "too white and dead", with screenshots of the reference showing what I meant: multiple
  fonts and sizes, a sea-blue accent, and paper cards that tilt on hover (v4).
- **Small things I caught in review.** Translucent map circles and a zoomed-out starting view, a
  missing score on a card, an italic headline that was hard to read, and tags that say how each
  pitch was captured (deck only, pitch only, deck + pitch; live, recorded or typed).

Every version was checked in a real browser by screenshot before I saw it, and I compared it
against the references.

### 6. Holding the AI to evidence

The parts I care most about are the ones where I pushed for rigour:

- **A score has to be justified.** When the 0 to 100 score appeared, I required that every part of
  it be grounded in published sources, and that each score explain which claims moved it (Query 20).
  The result is `docs/SCORE_RATIONALE.md`: four parts, each tied to research such as the survey of
  885 venture capitalists by Gompers et al. (2020), with quotes checked against the sources, and a
  per-claim list of what raised or lowered the number.
- **Testing on real data.** I asked for real founder-published decks and real recorded pitches,
  not only our sample (Query 19): 3 public decks and 8 TechCrunch Startup Battlefield final pitches,
  with winners taken from TechCrunch's own reporting.
- **Asking the uncomfortable question.** I asked whether the score clearly separates winning
  pitches from the rest. It doesn't (the 2 winners do not score higher than the 6 finalists), and
  we kept that result instead of tuning the formula to fit 2 examples. The pitch now says what the
  score is for (how well claims hold up) and what it is not (a predictor of who wins).
- **Using the product on ourselves.** We wrote a deck for ClaimMap containing only claims we
  believed true and ran it through ClaimMap. It contradicted our own competition slide by finding
  live fact-checking tools (Faktum, VeriFact, ClaimLens) that our earlier research had missed. I
  checked those sites myself, and we corrected the slide and the pitch.

### 7. Automating what an investor would otherwise have to remember

As the product took shape I kept turning manual steps into defaults: every uploaded deck and every
live session is now checked and scored automatically (Query 21, D-020); the score updates live
during the pitch; proofs and refutations are drawn on the map as coloured evidence nodes, and every
checkable claim is searched for refutations, not just the top three (Entry 24).

## What the AI did not do

- It did not choose the idea, the target user, the core feature or the scope. Those are mine and are
  logged as such.
- It did not decide what "good enough" looked like: each design round and each scope change came
  from my review.
- It was not allowed to present invented numbers. Unmeasured quantities are labelled "not measured
  yet" in the pitch materials.

## Limitations I'm aware of

- The code was written quickly by agents under a deadline. It has 76 automated tests and was
  checked in the browser, but it has not had a careful human code review line by line.
- The live contradiction detector sometimes flags rewording or a misheard name as a contradiction.
- The score has been tested on a small set (11 real pitches and decks). It measures how well claims
  hold up; it does not predict outcomes, and it does not assess the team.
- LabLoop, the main demo deck, is fictional and is presented as a sample deck we wrote.
