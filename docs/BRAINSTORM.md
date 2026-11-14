# Brainstorm pool (Session 1, 2026-11-14, Query 8)

Everything here is unconfirmed (AI ideas) unless it's marked as Nurasik's pick.
Picked ideas move to DECISIONS.md.

## A. What the investor sees
- A1 Jenga view: click a claim to "pull" it. Every claim that depends on it
  falls, and the deck shows what's left of the deal. This is an interactive
  version of D-004.
- A2 Deal spine: one chain from the ask and valuation, through the revenue
  forecast, down to the 3-5 assumptions underneath.
- A3 Questions with a cost: each question also says what to request as
  evidence (e.g. "Stripe export of the last 6 months of revenue").
- A4 Colour by claim type: market, traction, team, competition, product/tech,
  financials, customer logos and partnerships.

## B. How claims get checked (cheapest first)
- B1 Maths inside the deck: TAM x share vs revenue forecast, chart vs text,
  team size vs burn rate. Offline and reliable.
- B2 Deck vs the startup's own website now and in the Wayback Machine (it has
  a free API; to check). "Deck says 26 customers; the site 3 months ago
  listed 4."
- B3 Public data: company registries, LinkedIn headcount, app store
  reviews/rank, GitHub activity, news, the competitors' own sites.
- B4 Only the founder can prove it: this becomes a question, not a verdict.

## C. Demo ideas
- C1 Success vs failure: one famous success deck where the graph holds
  (Airbnb 2008) and one famous failure where it collapses. To check: which
  failure decks are really public (WeWork 2014? Fyre?).
- C2 Time travel: check claims only against evidence that existed on the
  deck's date (Wayback snapshots). This avoids "hindsight cheating"; a judge
  may well ask about that.
- C3 Live mode on our own pitch (D-005 stretch goal).

## D. Workflow and buyer
- D1 Forward the deck to an email address and get the map back. Investors
  receive decks by email.
- D2 Handle DocSend links, not just PDFs. Many decks arrive that way.
  Unverified pain point; ask the judges.
- D3 Push results into the CRMs investors already use (Affinity, Notion,
  Airtable). Pitch only.
- D4 Ask the judges in Q&A how they screen decks today: customer discovery
  on stage.

## E. Trust and risk
- E1 Every "contradicted" label must quote the exact source sentence. A wrong
  red flag is worse than none.
- E2 "Unverified" is not "false": stated on screen.
- E3 Deck privacy: decks are never used for training; there's a local option.

## F. Names (working name ClaimMap)
- Keystone, Loadbearing, Jenga-style names, Redline, DeckSpine. None checked
  for availability yet.

## G. "Real app" UX, modelled on BlazeLearn (Query 14, AI proposals)

Reference: https://blazelearn-web.sky-orbit-main.workers.dev (/documents needs a
login; seen via its landing page product screenshot and login page). Its
pattern: a document library, then a workspace per PDF. The top bar has the doc
title, page count and tabs Read / Explore / Map, plus Share and Listen. A left
"Outline / My notes" sidebar, the real PDF in the centre with colour
highlights and margin icons, and explanation cards on the right that can be
pinned. Light, warm, calm, one orange accent.

Mapped to ClaimMap:
- G1 Library page (/decks): deck cards (company, stage, upload date, status
  chip, verdict counts, top red flag), a big "Upload deck" dropzone, search,
  sort, and a preloaded sample deck for first-time users.
- G2 Deck workspace top bar: company + "7 slides", tabs **Read | Map | Live |
  Brief**, Export/Share on the right.
- G3 Read tab: the REAL slides rendered as images (poppler `pdftoppm` is
  installed) with claims highlighted ON the slide in verdict colours (word boxes
  from `pdftotext -bbox-layout`, no new dependency). Margin icons open a claim
  card on the right: verdict, why, evidence quote + link, "rests on / holds up",
  the question to ask. Cards can be pinned.
- G4 Left sidebar: the slide outline with verdict dots and claim counts per
  slide, plus "Pinned" (the investor's own shortlist).
- G5 Map tab: the claim graph + Jenga pull (what exists now, made legible).
- G6 Live tab: drift alerts pinned at the top, transcript, and the deck slide
  that matches what the founder is saying, highlighted automatically.
- G7 Brief tab: auto memo (one-paragraph verdict, red flags, top questions,
  evidence requests), editable, with export to Markdown/PDF and a copy button.
- G8 Light theme like the reference (it also projects better than dark), with
  verdict colours as the highlight palette.
- G9 Skipped for the hackathon: real accounts/login. A fake signed-in investor
  (avatar + name) makes it feel real without the risk.
