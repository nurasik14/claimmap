# ClaimMap pitch workflow

Format assumed: 3-minute pitch + Q&A, investor judges, Nurasik presenting from his laptop.
If the real format differs (time, solo or team), the "Adjust" notes say what to cut.
Every number in this script is either from our own demo or a vendor's own site (see Sources).
Do not add market statistics we haven't checked: the judges are investors, and this product's
whole point is catching unbacked claims.

------------------------------------------------------------------------
## 1. Before you go on stage (T-30 min)

Machine
- [ ] Laptop plugged in, Do Not Disturb on, notifications off, other apps closed.
- [ ] ProtonVPN connected (the Claude API needs it). Test: `curl -s -o /dev/null -w '%{http_code}' https://api.anthropic.com` gives 404 or 401 (reachable), not a timeout.
- [ ] Start the app: `cd ~/Projects/claimmap && uv run uvicorn claimmap.app:app --port 8000`
- [ ] Open http://localhost:8000 in the browser, full screen (F11), zoom 100-110%. Light or dark
      theme: pick whichever reads better on the venue projector (check during setup).
- [ ] Run `scripts/reset_demo.sh` AFTER the last rehearsal (each live replay adds spoken claims to the deck).
- [ ] Library shows 3 cards: LabLoop (Deck), LabLoop (deck + live demo), LabLoop pitch (live only).
      Briefs are pre-generated and cached, so the Brief tab opens instantly.
- [ ] Live tab: press Replay once at 4x and stop it, so the speech model is warm (first load is slow).
- [ ] Sound: laptop volume up, or HDMI audio routed to the room. Replay audio must be audible.
- [ ] If the venue Wi-Fi is weak: `CLAIMMAP_DECK_NO_WEB=1` before starting skips live web checks
      (the preloaded deck already has its checks saved).

Backups (in this order)
1. Saved results: the demo uses the preloaded deck, so nothing depends on the internet except the
   live drift step.
2. Typed fallback: in the Live tab, type "We have 40 paying customers" + Enter, which triggers the same drift.
3. Screen recording: record one clean run of the demo path (section 3) beforehand
   (`wf-recorder` or OBS) and keep the file open in a second window. If the app fails, play it and say
   "here's the recorded run".
4. v1 snapshot: `~/.hermes/cache/scratch/claimmap-v1/` (the older one-screen version).

------------------------------------------------------------------------
## 2. The 3-minute script (what to say)

Timings are cumulative. [Brackets] = what you do on screen.

0:00-0:20 Hook (no slides, look at the judges)
  "You've all read a pitch deck this month. A typical deck makes dozens of claims: customers,
  growth, market size, 'no competitors'. But a deal usually rests on three or four of them. If one of
  those is false, the deal falls. Finding which ones, before the meeting, is what ClaimMap does."

0:20-0:45 Why now / competition (say it before they ask)
  "Investors already pay for AI that checks decks: GoPresent and TechTruth give you a list of claims marked
  true or false. Live fact-checkers exist too, like Faktum and VeriFact, which check each sentence on its
  own. ClaimMap does what neither does: it shows which claims the deal RESTS on, and during the pitch it
  checks what the founder says against their own deck and their own earlier words."

0:45-1:15 Demo 1: the deck [Library -> open LabLoop -> Read tab]
  "This is a sample deck we wrote for a fictional lab-robotics startup, LabLoop. Every claim is
  highlighted on the slide; red means public data contradicts it." [click the red "No direct competitors" highlight]
  "The deck says no direct competitors. ClaimMap found Metrohm, Labman and Curiox selling the same thing,
  with sources." [point at the source links]

1:15-1:45 Demo 2: the map [Map tab]
  "Here's the same deck as a map. Bigger circles carry more of the deal." [hover "26 paying customers":
  its neighbours light up] "Everything here rests on the customer count: growth, revenue, the valuation."
  [click it, press P] "If that one claim is false, six claims fall, including the ask. That's the
  question you open the meeting with."

1:45-2:25 Demo 3: live [Live tab -> Replay, audible]
  "Now the founder pitches. ClaimMap listens." [play the replay; wait for the red card]
  "The deck said 26 customers. The founder just said 40. ClaimMap caught it about five seconds
  after it was said, and it's already written the question to ask." [point at the drift card and the
  new question] "It also flagged 'over 10 billion' against the deck's 4.1 billion."

2:25-2:45 Demo 4: the Brief [Brief tab]
  "After the pitch you get a one-page memo for your partners: the recommendation, red flags tied to
  the claims, what changed during the pitch, and the documents to ask for. One click to export."

2:45-3:00 Close + ask
  "ClaimMap: know what a deal rests on before the meeting, and catch what changes during it. We're
  looking for two or three funds to try it on their next ten decks. If that's you, talk to us after."

Adjust
- 2 minutes: cut Demo 1 (Read) and say its line over the Map.
- 5 minutes: add live-only mode: "It also works with no deck at all: every claim the founder says
  becomes a node, and it catches them contradicting themselves." Show the live-only library card.
- With a teammate: one person drives the laptop, the other talks. Rehearse the hand-off at 0:45.

Optional bold closer (only if the mic tested well in the room)
  Start a live-only session on your own mic at 0:00 and leave it running in a background tab. At 2:45
  switch to it: "ClaimMap has been listening to this pitch too. Here's every claim I made, and none is
  contradicted." Risk: room noise, and it may mark some of your own lines "unverified". Only do it
  if a rehearsal in the room came out clean.

------------------------------------------------------------------------
## 3. Click path (rehearse this exact sequence 3 times)

1. Library -> LabLoop card
2. Read tab -> click the red "No direct competitors" highlight -> card shows sources
3. Map tab -> hover "26 paying customers" (neighbours light up) -> click it -> press P -> banner "6 of 16 claims fall, including the ask" -> press R
4. Live tab -> "Replay demo" (1x, sound on) -> first red drift card (26 vs 40 customers) appears ~10 s in; the market one ($4.1B vs $10B) a few seconds later
5. Brief tab -> scroll once -> point at "Export"
Total demo time ~2:00. If something lags, keep talking; never wait in silence.
("6 of 16" measured on the v2 build at ~12:05; run the click path on the LabLoop (Deck) card, then reset.)

------------------------------------------------------------------------
## 4. Q&A prep (likely questions, short honest answers)

"How is this different from GoPresent / TechTruth?"
  "Deck checkers give a flat list of verdicts; live fact-checkers (Faktum, VeriFact) check single
  sentences against the web. We rank which claims the deal depends on, show it as a map with the
  'pull' test, and catch the founder drifting from their own deck live. Honest note: our own deck first
  said nobody checks pitches live, and ClaimMap contradicted us with Faktum, VeriFact and ClaimLens.
  We fixed the slide."

"What if the AI is wrong?"
  "Every red flag shows its source and the exact quote. 'Unverified' never means false; it becomes a
  question, not a verdict. The arithmetic checks are plain code, not AI."

"Is it accurate? Have you measured it?"
  Honest answer: "Not yet at scale. We built it today and tested it on one deck. The next step is
  running it on a set of real decks with known outcomes." (Don't invent an accuracy number.)

"Where do the decks go? Privacy?"
  "Decks are processed and stored locally in this build. We don't train on them. A fund could run it
  on its own infrastructure."

"Business model?"
  "Per-seat subscription for funds; a free tier for angels. For reference, TechTruth charges VC funds
  €799 for a beta trial, so funds do pay for this." (Vendor-published price, checked 2026-11-14.)

"What's the moat?"
  "Claim memory: when the same founder comes back next round, we know what they claimed last time
  and whether they hit it. That history builds up with every deck a fund uploads."

"Why live? Founders won't like being fact-checked live."
  "The founder doesn't see it; the investor does, on their laptop. It's the analyst who used to sit
  in the meeting taking notes."

"Does it work for Chinese decks / Chinese companies?"
  "The engine is language-agnostic. Chinese company registries (Qichacha, Tianyancha) are the next data
  source on our roadmap." (Roadmap, not built.)

"How much does a deck cost to run?"
  Honest answer: "We haven't measured cost per deck yet; analysis takes about 25 seconds per deck."

"What did you build today vs before?"
  "All of it today, at this hackathon." (True: everything was built on 2026-11-14.)

------------------------------------------------------------------------
## 5. Sources for numbers used above
- GoPresent: claim ledger (Supported / Contradicted / Unverifiable / Missing), https://www.gopresent.ai/ (checked 2026-11-14)
- TechTruth: "€799 trial fee", https://www.techtruth.ai/ (checked 2026-11-14)
- Competitors of the demo deck (Metrohm, Labman, Curiox): found by ClaimMap's own web search on the fictional LabLoop deck (agent A run).
- 26 vs 40 customers, $4.1B vs $10B, ~4-6 s alert latency: our own demo data and agent B's measurement (spikes + docs/agent-reports/b.md).
- LabLoop is FICTIONAL: say "a sample deck" on stage, never present it as a real company.
