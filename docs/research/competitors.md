# Competitors: pitch deck claim checking (checked 2026-11-14)

All facts below come from each product's own site (web_extract) on the check
date. These are vendor claims, not independently verified.

## Claim-level checking (direct competitors)

| Product | What it does | How we differ |
| --- | --- | --- |
| GoPresent (gopresent.ai) | Website plus an optional deck in. Every claim labelled Supported / Contradicted / Unverifiable / Missing. Deal score 0-100, verdict (Advance/Meet/Watch/Decline), IC memo draft with questions for the founder, 2-5 min. Checks archived websites, US and UK filings, public code and news. Says "1,000+ decks screened". Free screen live; full diligence in 90-day pilots. Its sample deck is fictional (Tallgrass Bio). It even uses the "no direct competitors" example. | Flat ledger, no dependency graph or ranking by how much rests on a claim; US/UK filings only |
| TechTruth.ai | Checks technical/AI and founder claims vs LinkedIn, company sites, "200+ public sources"; real AI asset vs wrapper. Says 1,468 decks scanned. GitHub "ghost code" scanner in development. €799 beta trial for VC funds. | AI/tech claims focus; no market/traction graph |
| DDR (ddr.bio) | PDF in: founder verification, "13 OSINT sources", red flags by sector, comparable companies, INVEST/PASS verdict. Targets angels. | Verdict and report, not a claim graph |
| VentureOS (ventureos.live) | Upload a deck: triage, "claim vs reality" on TAM/SAM/SOM, a rebuilt financial model, a bull/bear/skeptic IC debate. | Market size and financials only |

## Nearby (scoring or screening, not claim checking)

- Unbiased Ventures (unbiasedventures.ch): scores decks against 6,000+ others,
  human analyst in the loop, "aspirational vs proven traction".
- askOdin Crucible (crucible.askodin.app): for founders, free. Rule-based
  checks of deck claims against the financial model, Clarity Score.
- PitchAI, peachdeck, VentureLens, V7 Go: bulk scoring and data extraction.
- NUVC (nuvc.ai): for founders. Scoring plus investor matching, $99.
- China: 璞华易投 BP screening, BP神器 (bpgod.com) and GET BP score business
  plans on fixed criteria (from search snippets only, not opened). 企查查
  (agent.qcc.com) sells company-registry data that an AI agent can query.
  Not checked: its API access or pricing.

## Live fact-checkers (found by ClaimMap on our own deck, 2026-11-14)

- Faktum (getfaktum.com): "Real-Time AI Meeting Fact-Checker"; transcribes meetings and checks each claim
  against the web live (supported / contested / contradicted / counterpoint).
- VeriFact (verifact.live): real-time fact checking for Zoom against the organisation's own documents.
- ClaimLens (github.com/EmanFatima764/ClaimLens, 1 star): "Real-time AI-powered fact-checking for
  startup pitches" (Streamlit, Whisper + web search); a small open-source project.
- So "nobody checks pitches live" is FALSE. Our difference: deck-vs-speech drift, self-drift, the
  load-bearing claim graph and an investor memo, not sentence-by-sentence web checks.

## What we didn't find (limited search, not proof)

- A claim dependency graph, or ranking claims by how much of the deal rests on them.
- Live drift detection against the founder's own deck (the live part alone exists: see above).
- Checks against Chinese-language decks or Chinese company registries.

## Sources

- https://www.gopresent.ai/ and https://www.gopresent.ai/for-scouts
- https://www.techtruth.ai/
- https://ddr.bio/ and https://ddr.bio/pitch-deck-red-flags/ai-ml-startup/growth-stage
- https://ventureos.live/for-vcs
- https://www.unbiasedventures.ch/
- https://crucible.askodin.app/
- https://nuvc.ai/
- https://bpgod.com/ (snippet only)
- https://agent.qcc.com/ (snippet only)
