# Decision register

Statuses: Decided (Nurasik confirmed), Tentative (AI proposal, not yet
confirmed), Open (question with no answer yet), Superseded (replaced; see the
"Supersedes" field). Entries are never deleted. A changed decision gets a new
entry that names the one it replaces.

## Decisions

### D-001: Work on idea 1 (pitch deck claim map), not idea 5
- Status: Decided (Nurasik, 2026-11-14, Query 6)
- Why: after comparing both, Nurasik asked to work on the pitch deck claim map.
  AI's earlier reasoning (Query 5 reply): the buyer (investors) is the judging
  panel, and idea 5 faces funded players (Sentra, Acta).
- Alternatives: idea 5, the meeting decision graph (parked; research kept in
  docs/research/idea5-meeting-graph.md). Doing both on a shared engine was
  rejected as a weaker pitch.

### D-002: The deliverable is a working demo
- Status: Decided (Nurasik, 2026-11-14, clarify answer in Query 2)
- What: a deck PDF goes in, and a claim map plus investor questions come out.

### D-003: The LLM is the Claude API
- Status: Decided (Nurasik, 2026-11-14, Query 2: "Claude API (I have a key)")
- Risk noted: the Claude API is blocked in mainland China and HK without a VPN,
  so venue Wi-Fi plus VPN can fail during the demo. Mitigation (AI proposal):
  run the demo decks in advance and save the results. A Qwen or DeepSeek API is
  the fallback; the local Ollama models are too weak for this.

### D-004: Positioning is "load-bearing claims + ranked investor questions"
- Status: Tentative (AI proposal, Query 6 reply)
- What: don't compete on "we check claims", because GoPresent already does
  that. Show the claim dependency graph (a contradicted bottom claim turns the
  claims above it red), rank claims by how much of the deal rests on them, and
  output the 3 questions to ask first.
- Pitch line: "Other tools tell you which claims are false. We tell you which
  ones matter."
- Why: every competitor checked outputs a flat ledger or a score (see
  research/competitors.md). This is a limited search, not proof that nobody
  does it.

### D-005: Build vs pitch-only split
- Status: Tentative (AI proposal, Query 6 reply)
- Build: deck in, claims extracted, the dependency graph, the maths checks
  (TAM x share vs revenue forecast, chart vs text growth, team size vs burn
  rate), a few web checks, and the ranked investor questions.
- Stretch goal: live pitch mode (local Whisper transcribes the pitch and the map
  builds itself), demoed on our OWN pitch. Other teams only with their and the
  organisers' permission.
- Pitch only (roadmap): Chinese and Asian evidence sources (Qichacha,
  Tianyancha) and claim memory across funding rounds (the long-term advantage).

### D-006: Name the competitors in the pitch, before the judges do
- Status: Tentative (AI proposal, Query 6 reply)
- Script line: "GoPresent and TechTruth prove investors pay for claim-checking."

### D-007: Demo with a real public deck, not a fictional one
- Status: Tentative (AI proposal, Query 6 reply)
- Candidate: Airbnb's 2008 deck, because judges know how its claims turned
  out. GoPresent's own sample is fictional, so a real deck already sets us
  apart.

### D-008: The live pitch analyzer is the core product, not a stretch goal
- Status: Decided (Nurasik, 2026-11-14, Query 9: "have not we agreed on the
  Live Pitch deck analyzer?")
- Supersedes: the "stretch goal" part of D-005. The rest of D-005 waits for
  a re-check against the live version.
- Log note: before Query 9, live mode had only been proposed by the AI (Query 3
  and Query 6 replies, D-005 stretch goal). It was not confirmed earlier.
- Still to define: O-7.

### D-009: "Live" means option (c), deck + listen
- Status: Decided (Nurasik, 2026-11-14, Query 10: "lets go with c option")
- What: the investor uploads the deck before the pitch, and it's analysed
  in advance (claims, graph, maths and public-data checks). During the pitch
  it listens (speech-to-text), extracts spoken claims, checks them against
  the deck and the earlier checks, flags drift ("deck says 26 customers,
  founder just said 40"), and suggests questions before Q&A.
- Why (AI's reasoning, which Nurasik accepted): drift between the spoken
  pitch and the deck is new and easy for judges to understand, and the
  analysis done in advance keeps the live part fast.
- Answers O-7.

### D-010: The LLM runs through the Claude Code CLI (Max plan) by default; API key optional
- Status: Tentative (AI decision, 2026-11-14). Forced by a fact: ANTHROPIC_API_KEY
  in ~/.hermes/.env is empty, so there's no API key on this machine yet.
- What: llm.py calls `claude -p --tools "" --json-schema ...` (Max plan login),
  and switches to the Anthropic API automatically if ANTHROPIC_API_KEY is set.
- Evidence (spikes/001b, 2026-11-14): live claim extraction with drift
  detection took median 5.6 s (haiku) and 5.4 s (sonnet) per ~20 s transcript
  chunk. The output was correct: 26 vs 40 customers and $4.1B vs $10B flagged
  as drift.
- Risk: plan limits are shared with the build agents; the venue VPN risk is
  the same as D-003.

### D-011: Speech-to-text is local faster-whisper small.en on the GPU
- Status: Tentative (AI decision, 2026-11-14)
- Evidence (spikes/002): 23 s of audio transcribed in 0.35-0.69 s on the RTX
  4050 (CPU int8: 2.2-2.5 s). distil-large-v3 was no more accurate on this
  sample and took 5 min to download.
- Known issue: the bundled PyAV rejects faster-whisper's file decoding, so
  decode with system ffmpeg or send PCM.

### D-013: API key stored in ./.env (mode 600, gitignored); API is the LLM backend
- Status: Decided (Nurasik, 2026-11-14, Query 12: pasted the key, "it expires in a day so it is okay")
- Evidence (spikes/001c): API sonnet-5-5 median 3.4 s, haiku-5-5 4.6 s per live chunk,
  same drift results. haiku-5-5 rejects forced tool_choice, so llm.py uses
  structured outputs (output_config json_schema).
- Risk noted: the key was pasted into chat, so this session's transcript holds it.
  It expires within a day; build agents are denied Read(.env).

### D-014: Build stack and agent split (AI decisions, delegated build)
- Status: Tentative (AI decisions under D-012; Nurasik can veto any)
- Stack: Python FastAPI + plain HTML/JS + vendored Cytoscape.js (no CDN, since
  venue internet is unreliable), JSON-file store, WebSocket carrying raw PCM16
  16 kHz from the browser mic.
- Agents: A deck analysis (opus), B live pipeline (sonnet), C frontend (sonnet).
  The contract is in .agents/CONTRACT.md; the orchestrator owns schemas, llm, app
  and store.
- Additions nobody asked for: a "Jenga pull" interaction (from BRAINSTORM A1),
  Wayback + web-search checks (B2/B3), deck arithmetic checks (B1), a demo-audio
  replay mode (a fallback if the mic or venue fails), and a fictional
  "LabLoop" test deck + TTS pitch audio as fixtures. All of these are AI choices.

### D-015: v2 scope: all of BRAINSTORM G, three use cases, Obsidian-style map
- Status: Decided (Nurasik, 2026-11-14, Query 15)
- "Lets implement all the Gs": library, workspace tabs Read/Map/Live/Brief,
  slides with highlighted claims, pinned cards, Brief, light theme, fake user.
- Use cases: deck only, live only, deck + live.
- The map must be "circular and connected just like the obsidians mapping": a
  force-directed round graph, circle nodes, hover dims non-neighbours.
- Time: 2.5-3 h until judging (answers O-1 for hours; team size still unknown).

### D-017: Visual direction is minimalist black/white + green accent, light AND dark theme; Obsidian hover
- Status: Decided (Nurasik, 2026-11-14, Query 16)
- Hovering a map node highlights it, its neighbours and the connecting edges; everything
  else fades (like Obsidian / BlazeLearn's map).
- Tokens (AI, contrast-checked with hardlight_contrast; every text pair >= 4.5:1):
  light bg #FFFFFF / text #0A0A0A / muted #666666 / accent #15803D;
  dark bg #0A0A0A / text #FAFAFA / muted #A3A3A3 / accent #22C55E.
  Verdicts: red, green (= accent), amber, grey. Colour only carries meaning.
- AI reading of "light and dark colors like white and black": both a theme toggle
  AND a monochrome palette. Supersedes the "warm light theme" of BRAINSTORM G8.
- Agent E was relaunched (~11:42) with this spec; its first run was 2 min in.

### D-018: v3: real decks + real YouTube pitches, a 0-100 ClaimMap Score, motion and a living graph
- Status: Decided (Nurasik, 2026-11-14, Query 19), with one AI-imposed change:
- Corrected: "score the won high and not won lower" would mean tuning the score
  to known outcomes (overfitting), and in front of investors that's exactly the
  kind of unbacked claim the product catches. AI instead fixed the formula BEFORE
  looking at outcomes: A evidence balance 40, B specificity 20, C consistency 20,
  D verifiable core 20 (docs/SCORE.md). It reports honestly whether winners score
  higher; n is tiny, so no predictive claim. Nurasik can veto this.
- Agents F (frontend motion + d3-force living graph + score UI, opus) and G (real
  data + score, opus), launched 12:18. v2 snapshot: $TMPDIR/claimmap-v2.
- Live-mode facts (answering Query 19 part 1): the transcript updates every ~2 s,
  and claims become nodes in the Live mini-map within ~4-6 s. The Map tab picked
  them up only on tab switch; F makes that live too. The real-microphone path is
  still untested in a browser (only replay was tested).

### D-019: Each score criterion is grounded in cited sources; scores explain which claims drove them
- Status: Decided (Nurasik, 2026-11-14, Query 20)
- Sources (verbatim quotes checked with the grounded-citations ledger): Gompers et al.
  2020 JFE/NBER w22587 (118 h of due diligence, 10 references; the team ranked
  most important); Kawasaki & Reichert 2006 "Top Ten Lies of Entrepreneurs";
  Kleinert 2023 ETP (cheap talk vs credible signals); Parhankangas & Renko 2017
  JBV (counter-evidence: style hardly matters for commercial pitches).
- Files: docs/SCORE_RATIONALE.md (human-readable), docs/score_criteria.json (for the UI).
- Honest limits shown in the UI: the score leaves out the team (the factor VCs rank
  first) and predicts nothing.
- Schema: PitchScore.drivers (claim, part, +/- points, reason). Orchestrator wires
  the drivers + criteria into score.py and the score popover after agents F and G finish.

### D-020: Every deck and every live session is AI-checked and scored automatically
- Status: Decided (Nurasik, 2026-11-14, Query 21: "made that work for every uploaded deck and live transcibation. Like that AI checks")
- Uploads: the analysis already runs the arithmetic + web checks and scores at the end.
- Live (AI implementation): the score is recomputed after every new spoken claim or
  drift and pushed as a `score` event (the dial updates live). On Stop, or when a
  replay finishes, the server starts finalize automatically (arithmetic, web
  evidence, questions, score) and sends a `checking` event. The UI shows "AI is
  checking what was said" and refreshes the map, score and Brief when done. The
  manual Finalize button stays as a fallback.
- Verified by spikes/qa_auto_check.py against the real server: live scores 60 -> 55 -> 50
  (drift), checking event, finalized in 16 s, 1 contradicted, drivers listed.
- Score popover: "Why this counts" (grounds + quotes + source links per part),
  "What moved this score" (the claims with +/- points, click to open), and a
  "Not measured" note.

### D-016: The Brief is read-only with export (Copy / .md / Print-to-PDF)
- Status: Tentative (AI default because of time; Nurasik asked what a brief is)
- Live-only mode: spoken claims become graph nodes; drift between spoken
  claims counts; a "Finalize" step runs the checks after the pitch (AI design).
- Built by agents D (backend, opus) and E (frontend, opus) in parallel, launched
  ~11:40. Contract in .agents/CONTRACT-v2.md.

### D-012: Build with parallel Claude Code agents
- Status: Decided (Nurasik, 2026-11-14, Query 11: "delegate the task to
  subagents to increase the build faster or maybe quality work output")

## Open questions

- O-1: Partly answered (Query 15): 2.5-3 h, so judging is ~14:00-14:30. Team size still open. Original: Hours until judging? Team size and who does what?
- O-2: Event location today (mainland China or HK)? This decides the VPN and
  API risk in D-003.
- O-3: Which 2-3 demo decks? Their PDFs must be obtainable and have a text
  layer.
- O-4: Answered by D-008 (live mode is the core).
- O-5: Final product name (ClaimMap is a working name).
- O-7: Answered by D-009 (option c). Original question: what "live" means. (a) It listens to a spoken pitch and builds the
  map in real time, (b) a deck uploaded during the meeting and analysed in
  seconds, or (c) both: deck uploaded first, then it listens to the pitch and
  checks what's said against the deck.
- O-6: Corrected premise: the brief says existing tools "summarise decks
  rather than check claims". That's false (GoPresent, TechTruth, DDR check
  claims), so the pitch must not repeat it.
