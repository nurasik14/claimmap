# Hackathon journal

Entry tags: Decided (Nurasik's call), Tentative (AI proposal), Open,
Corrected (a fact or premise fixed). Each user message is quoted verbatim, typos
included, as "Query N", and listed again in the query log at the end.

## Session 1 (2026-11-14)

### Entry 1: choosing a deliverable for idea 1

> Query 1: "1. Due-diligence map for pitch decks / A startup deck goes in. AI pulls out every claim (market size, traction, growth, "no competitors") and labels each as backed by evidence, contradicted by public data, or unverified. It draws the graph and lists the questions an investor should ask. / Buyer: VCs and angels who screen hundreds of decks. / Exists: some AI deal-screening tools, but they summarise decks rather than check claims. / Bonus for today: the judges are likely investors, as they were at the Fuzhou round, so they're your customer, sitting right there."

> Query 2 (clarify answers): "Build a working demo (deck PDF in -> claim map + investor questions)" / "/steer find the existing start ups or anytjing" / "Claude API (I have a key)"

- Decided: the deliverable is a working demo (D-002). The LLM is the Claude API (D-003).
- Open: hours and team size were never answered (O-1).

### Entry 2: competitor research for idea 1

> Query 3: "find existing start apps or etc"

- Corrected: the brief's premise that existing tools only summarise is wrong.
  GoPresent does almost exactly this idea (a 4-state evidence ledger plus
  questions for the founder). See research/competitors.md and O-6.
- Tentative: three possible ways to stand out: the dependency graph, Chinese
  and Asian evidence, live pitch mode.

### Entry 3: researching idea 5

> Query 4: "Research this one 5. Meeting decision graph / Meeting transcripts go in. AI maps the decisions, who argued what, the evidence used, and the open objections, and flags when a new decision contradicts an earlier one. / Buyer: any company with too many meetings. / Exists: Otter and Fireflies summarise but don't map reasoning. This is a crowded area."

- Corrected: "they summarise but don't map reasoning" is out of date.
  Acta tracks "decision drift" and Sentra maps who said what and why
  decisions shifted.
- Tentative: open angles are objections nobody answered and decisions whose
  evidence later changed.

### Entry 4: feasibility of either idea

> Query 5: "Can I work either of them?"

- AI view: both are buildable. Idea 5 is easier (about 4-6 h); idea 1 is
  harder (about 6-10 h) but its buyer is on the judging panel. These are
  estimates, not measurements.
- Risk: the Claude API needs a VPN in mainland China and HK (D-003).

### Entry 5: picking idea 1 and how to stand out

> Query 6: "Can I work on pitch deck claim map? Like how can I be different and pitch mine from other out there products"

- Decided: idea 1 (D-001).
- Tentative: positioning (D-004), the build split (D-005), naming competitors
  in the pitch (D-006), using a real public deck (D-007).

### Entry 6: setting up this log

> Query 7: "Can you keep logging the decision and stuff about this track and project direction for my hackathon like vibe wise does or better."

- Decided: keep this log updated after every exchange, without being asked
  (standing preference).
- Set up docs/STATUS.md, DECISIONS.md, JOURNAL.md and research/. Created the
  `hackathon-decision-log` skill so future sessions keep the same format.

### Entry 7: brainstorm

> Query 8: "Lets brainstorm this idea"

- Tentative: AI put a first idea pool in docs/BRAINSTORM.md (sections A-F).
  Strongest candidates: A1 Jenga view, B2 Wayback checks, C1 success vs
  failure deck, C2 time-travel evidence.
- Open: Nurasik's own ideas and picks from the pool.

### Entry 8: live analyzer as the core

> Query 9: "What is this have not we agreed on the Live Pitch deck analyzer?"

- Corrected (log check): live mode was only an AI stretch-goal proposal (D-005);
  it hadn't been confirmed. The brainstorm reply wrongly treated it as one
  option among many instead of asking about it first.
- Decided: the live pitch analyzer is the core (D-008).
- Open: what "live" means (O-7).

### Entry 9: live = deck + listen

> Query 10: "lets go with c option"

- Decided: option (c), deck uploaded before the pitch, then live listening
  with deck-vs-speech drift checks (D-009).
- Next: AI runs a feasibility check (Claude API latency over the VPN,
  local Whisper on the RTX 4050, microphone).

### Entry 10: feasibility spikes and switching to delegated build

> Query 11: "what is being done now? If it is a project building can you delegate the task to subagents to increase the build faster or maybe quality work output."

- Evidence: Whisper small.en on the GPU took 0.35-0.69 s per 23 s of audio
  (spike 002). Claude via the CLI took ~5.5 s per chunk, with drift detected
  correctly (spike 001b). The live loop is feasible: claims appear about
  6-7 s after they're spoken, plus the chunk window.
- Corrected: "I have a key" isn't true on this machine; the API key in
  ~/.hermes/.env is empty. The CLI backend is the default (D-010).
- Decided: delegate the build to parallel Claude Code agents (D-012).

### Entry 11: API key and build launch

> Query 12: "here is the claude api key, it expires in a day so it is okay that I pasted here sk-ant-usr-[REDACTED in this log]"

- Decided: use the API key (D-013). Stored in ./.env (600, gitignored), never printed.
- AI: wrote the foundation (schemas, llm, app, store, stubs, fixtures, smoke tests;
  4 passing), then launched 3 parallel Claude Code agents (D-014).
- Note: `uv init` created an empty .git in the project (no commits). The AI didn't
  run git init itself; Nurasik can keep or delete it.

### Entry 12: what the build will produce

> Query 13: "So will this output prototype already of the project?"

- AI answer: yes, a working prototype (upload deck, claim graph, questions, live
  listening with drift alerts, replay fallback) once the agents finish and the
  orchestrator's QA plus fix pass are done. It isn't yet tested on a real deck, and
  the pitch slides/script aren't part of the build.

### Entry 13: feature run-through and "real app" UX

> Query 14: "Lets run through the features and also could it be working like this: https://blazelearn-web.sky-orbit-main.workers.dev/documents / The convinience of UI/UX design like how everything is located is intuitive. This feels like a real application I would use in the wild. Like lets brainstorm to make the project complete like this"

- Evidence: the reference /documents redirects to a login page; its structure
  was read from the landing page's product screenshot.
- Tentative: an app-shell redesign, BRAINSTORM section G (library, workspace
  tabs Read/Map/Live/Brief, slides with highlighted claims, pinned cards, brief
  export, light theme).
- Open: Nurasik's picks from G1-G9.

### Entry 14: v2 scope

> Query 15: "I feel like map must be circular and connected just like the obsidians mapping. / Lets develop for cases like: deck only, live only, deck + live / Proposed features: / Lets implement all the Gs / I have 2.5 -3 hours / Wdym brief memo? What is it?"

- Decided: all of G, three use cases, Obsidian-style map, 2.5-3 h left (D-015).
- Tentative: a read-only Brief with export (D-016); the live-only design.
- Time plan (AI): v2 build ~45 min, QA + fixes ~30 min, then ~1 h for pitch
  prep and rehearsal.

### Entry 15: hover highlighting and visual direction

> Query 16: "each hover over the maps circle must highlight the connected other ones like obsidian or project I showcased https://blazelearn-web.sky-orbit-main.workers.dev/documents / Also use your designing skill to make the application more minimalistic and ligth and dark colors like white and black with additional green maybe"

- Decided: Obsidian-style neighbour highlight on hover; minimalist black/white
  with a green accent, light + dark themes (D-017).
- AI: loaded the hardlight frontend-design skill and contrast-checked the tokens.
  Restarted agent E early with the new spec instead of restyling afterwards.

### Entry 16: process status and pitch workflow

> Query 17: "What is the current processes? What is the estimate time to completion of another version? Are subagents using design skill? Do you think this 3 sub agents are enough to complete this problem?"

> Query 18: "lets go. Also create a workflow for pitch. Like what to do during it and what to say. If you think my claude plan will not be enough for it dont do it"

- AI: estimated D at 12:00-12:10 and E at 12:05-12:20; v2 working ~12:30-12:45.
  Agents can't load Hermes skills, so the hardlight skill was applied in the spec
  and QA, and copied to .claude/skills/frontend-design for the fix pass.
- AI: wrote docs/PITCH.md (setup checklist, 3-minute script with click path,
  backups, Q&A, sources) itself, instead of starting a third agent, to keep the
  Claude plan for the build.
- Found: backend tests write test decks (t1, t2, t4, t5) into the real data/decks,
  so the library would show junk. Goes in the fix pass.

### Entry 17: v2 finished and QA'd

- Evidence: browser QA screenshots in ~/.hermes/cache/scratch/{v2_*,q_*}.png. The
  v2 pull on labloop_deck gives "6 of 16 claims fall, including the ask".
- AI fixes listed in STATUS. PITCH.md updated with the v2 numbers and the reset step.

### Entry 18: v3 requests

> Query 19: "1) Does the map update with the live mode also in live? Does the live mode really live, like during the presenting it transcribes during the process and updates? / 2) Also now include the real decks from the internet and real pitches to showcase the working of the project / 3) Also choose won/not won youtube pitches and score the won high and not won lower. Make a 100 out of scoring. / 4) Make design attentive like in the https://blazelearn-web.sky-orbit-main.workers.dev/documents. Not it looks bulky and rigid without animations, transitions and stuff. Also map looks too rigid, make it moving like obsidians. Make it responsive to user action"

- Decided: real material, a /100 score, motion, a moving graph (D-018).
- Corrected: the score is pre-registered, not tuned to outcomes (D-018).

### Entry 19: grounding the score

> Query 20: "The judging must have a critiria, have a sources or grounds from maybe articles or statistics that certain thing is better or book. Point out the summary about that identified points that rely on the score being that number."

- Decided: cited grounds per criterion + per-score drivers (D-019).
- Corrected (AI): no source supports "specific wording persuades investors"
  (Parhankangas & Renko found style hardly matters for commercial pitches), so
  criterion B is justified by checkability instead, and the caveat is shown.

### Entry 20: agent G results, YouTube via Zen cookies, score drivers

- G (8.6 min): score.py v1 exactly as specified; 3 real founder-published decks (Equals
  seed 50.4, CrowdSec pre-seed 48.1, CrowdSec Series A 54.0). YouTube was blocked
  (bot check on the VPN IP).
- Decided (Nurasik, clarify): use his Zen browser cookies for yt-dlp. It also needed
  `--js-runtimes node --remote-components ejs:github`. All 8 TechCrunch Battlefield
  final pitches downloaded (winners: Pi SF 2017, Seenit London 2016; 6 finalists that
  didn't win). Processing via scripts/real_run.py pitches (background, ~12:33).
- AI: implemented PitchScore.drivers in score.py (claims that moved the number, with
  +/- points); backfilled; updated data/demo_snapshot. Copied score_criteria.json to
  static/ for the popover.

### Entry 21: automatic AI checks and scoring for every deck and live session

> Query 21: "Now made that work for every uploaded deck and live transcibation. Like that AI checks"

- Decided + built (D-020). F finished (11.8 min): d3-force living graph, motion, score UI.
- Real pitches (in progress): winners Seenit 62.4, Pi 19.4; non-winners Future Family 64.0,
  Oneva 50.8, Augmedics 42.7, Matic 34.3. Winners do NOT score higher (means 40.9 vs
  48.0 so far, n = 2 vs 4). Pi's 19 comes from many self-"drift" flags in a monologue
  (consistency 0); that may be over-flagging by the live pipeline, so it's worth reviewing.

### Entry 22: real-pitch run finished

- All 8 Battlefield pitches done (112 LLM + 24 web calls). Final: winners 40.9 (n=2),
  non-winners 45.7 (n=6). Written up honestly in docs/SCORE_RATIONALE.md.
- Pending: Nurasik's call on tightening the live drift detector and rerunning.

### Entry 23: map, looser score v1.1, mode tags, our own score, separation check, v4 redesign

- Map: node fill 45% opacity with a crisp ring; fit padding 120px (opens zoomed out).
- Tags: Deck only / Pitch only / Deck + pitch, plus capture: Live transcribed / Recorded pitch /
  Typed transcript (new DeckAnalysis.capture). A deck now becomes deck+live only once something is said.
- Score v1.1 (AI, asked "abit looser"): Verifiable core gives half credit for concrete but unchecked
  core claims ("unverified is not false"). Weights unchanged. All decks re-scored.
- Separation (Nurasik: "can we see won and not won separated clearly?"): NO. Battlefield winners
  Seenit 62.4, Pi 19.4 vs finalists 34.3-68.0; AUC 0.42 (0.5 = chance). Not tuned further: fitting
  weights to 2 winners would be overfitting and dishonest in front of investors.
- Our own deck (scripts/make_own_deck.py, only true claims): first run 42.9. ClaimMap CONTRADICTED our
  "no tool checks pitches live" with Faktum, VeriFact, ClaimLens (verified by hand). Slide fixed and
  competitors.md / PITCH.md updated; re-run 47.8.
- Decided (Nurasik): v4 visual redesign (BlazeLearn-like: dark hero, multiple fonts, sea blue + green,
  tilting paper cards, share/delete). Agent H (opus) launched 12:50; fonts vendored in static/fonts;
  token pairs contrast-checked. v3 snapshot at $TMPDIR/claimmap-v3/.

### Entry 24: evidence in the graph + web check on every checkable claim

- Decided (Nurasik: "do it"): proofs/refutations as diamond nodes on the map (green proof, red refutation,
  sea-blue context; click opens the source). Source.stance added; web pass now covers up to 12 checkable
  claims (market/competition always; others only if they carry a number), 6 in parallel, 90 s budget, and the
  prompt actively looks for refutations.
- Re-checked LabLoop x3, our own deck and the 3 real decks; Battlefield pitches kept from the earlier run
  (recheck took ~10 min per batch, stopped to keep the API free before judging).
- Result: most LabLoop claims stay amber. LabLoop is fictional, so the web finds context, not proof.
  Real decks gained verdicts (CrowdSec Series A 2 -> 7 checked claims).

## Query log

1. Query 1: idea 1 brief (Entry 1)
2. Query 2: clarify answers: demo, find startups, Claude API (Entry 1)
3. Query 3: "find existing start apps or etc" (Entry 2)
4. Query 4: idea 5 brief (Entry 3)
5. Query 5: "Can I work either of them?" (Entry 4)
6. Query 6: "Can I work on pitch deck claim map? ..." (Entry 5)
7. Query 7: "Can you keep logging the decision ..." (Entry 6)
8. Query 8: "Lets brainstorm this idea" (Entry 7)
9. Query 9: "What is this have not we agreed on the Live Pitch deck analyzer?" (Entry 8)
10. Query 10: "lets go with c option" (Entry 9)
11. Query 11: "what is being done now? ... delegate the task to subagents ..." (Entry 10)
12. Query 12: API key pasted (redacted) (Entry 11)
13. Query 13: "So will this output prototype already of the project?" (Entry 12)
14. Query 14: "Lets run through the features ... like this: <BlazeLearn link> ..." (Entry 13)
15. Query 15: "I feel like map must be circular ... I have 2.5 -3 hours ..." (Entry 14)
16. Query 16: "each hover over the maps circle must highlight ... white and black with additional green" (Entry 15)
17. Query 17: "What is the current processes? ..." (Entry 16)
18. Query 18: "lets go. Also create a workflow for pitch ..." (Entry 16)
19. Query 19: "1) Does the map update with the live mode ... 4) Make design attentive ..." (Entry 18)
20. Query 20: "The judging must have a critiria, have a sources ..." (Entry 19)
21. Query 21: "Now made that work for every uploaded deck and live transcibation ..." (Entry 21)
