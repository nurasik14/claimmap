# Why the ClaimMap Score is built the way it is

The ClaimMap Score (0-100) measures how well a pitch's claims hold up. It doesn't predict whether a
startup will succeed. Its four parts and their weights were fixed before we looked at any pitch
outcome. This file gives the grounds for each part and states what the score leaves out.

## Why check claims at all

Investors already spend a lot of effort verifying pitches: in a survey of 885 VCs, the average deal
took 83 days and "the average firm spends 118 hours on due diligence over that period and the average
firm calls 10 references".[1] Unbacked claims are common: two experienced investors write that "every
pitch contains at least three or four of these lies".[2] The score summarises how much of that
checking a pitch survives.

## A. Evidence balance (40 points)

What it measures: the load-weighted balance of supported vs contradicted claims. A contradicted claim
counts double, because a single exposed falsehood damages trust in everything else.
Grounds: overly high claims "might backfire for entrepreneurs—dismissed as cheap talk and even
penalized due to investors’ credibility concerns".[3] Two of the classic pitch lies are exactly the
claims ClaimMap checks most often: "No one is doing what we're doing" and inflated forecasts ("An
entrepreneur's projections are never conservative").[2]
Why the weight is highest: it is the only part based on outside evidence.

## B. Specificity (20 points)

What it measures: the share of claims that are concrete enough to check (a number, a named customer,
a dated milestone).
Grounds: a vague claim can't be verified, so it stays cheap talk; costly, checkable signals "can serve
as credibility buffers and transform high ambitions from cheap talk into credible signals".[3]
Honest caveat: this is about checkability, not writing style. One study of 656 Kickstarter
campaigns found that linguistic style boosted social campaigns "but hardly matter for commercial
campaigns".[4] So specificity is not claimed to persuade investors by itself.

## C. Internal consistency (20 points)

What it measures: penalties when the deck's own numbers can't all be true (arithmetic contradictions),
and when the founder's live words drift from the deck or from their own earlier statements.
Grounds: inconsistency is the cheapest red flag to detect and needs no outside data. The "projections
are conservative" lie is usually exposed by the deck's own arithmetic.[2]

## D. Verifiable core (20 points)

What it measures: of the 5 claims the deal rests on most (highest load), how many are supported or
were actually checked without being contradicted.
Grounds: investors rely on references and diligence to verify the core of a deal (10 reference calls
per deal on average).[1] A pitch whose load-bearing claims can't be checked asks for more trust.

## What the score does NOT measure

- The team. VCs in the same survey rank the management team above product or technology ("VCs see
the management team as more important than business related" characteristics).[1] ClaimMap doesn't
judge founders, so the score leaves out the factor investors weigh most.
- Market timing, product quality, valuation fairness.
- Truth beyond the sources it reached: "unverified" never means false.

So a low score means "these claims need checking before you rely on them", not "this startup will
fail". With only a handful of real pitches tested, we make no claim that the score predicts outcomes.

## Blind test on real pitches (2026-11-14)

The v1 formula was run unchanged on 8 TechCrunch Startup Battlefield final pitches (video
transcripts, live-only mode), with outcomes taken from TechCrunch's winner articles:

| Pitch | Outcome | Score |
| --- | --- | --- |
| Seenit (London 2016) | Won | 62.4 |
| Pi (SF 2017) | Won | 19.4 |
| Future Family (SF 2017) | Finalist | 64.0 |
| Oneva (SF 2017) | Finalist | 50.8 |
| LiftIgniter (London 2016) | Finalist | 43.6 |
| Augmedics (SF 2017) | Finalist | 42.7 |
| Oxehealth (London 2016) | Finalist | 38.5 |
| Matic (SF 2017) | Finalist | 34.3 |

Winners averaged 40.9 (n = 2) and the others 45.7 (n = 6). The score did not separate
winners from the rest, which fits what it's designed to do: it measures how well claims hold up
and doesn't predict outcomes. Pi's low score is driven by 4 live "drift" flags. At least one is a
speech-to-text name error and another a reworded claim rather than a contradiction, so the live
drift detector over-flags on monologue pitches.

## Sources

[1] https://www.nber.org/system/files/working_papers/w22587/w22587.pdf  (Gompers, Gornall, Kaplan, Strebulaev (2016/2020), How Do Venture Capitalists Make Decisions? NBER w22587; J. Financial Economics)
[2] https://guykawasaki.com/the_top_ten_lie_1-3  (Kawasaki & Reichert (2006), The Top Ten Lies of Entrepreneurs)
[3] https://journals.sagepub.com/doi/10.1177/10422587231164750  (Kleinert (2023), The Promise of New Ventures' Growth Ambitions in Early-Stage Funding: Cheap Talk vs Credible Signals, Entrepreneurship Theory and Practice)
[4] https://econpapers.repec.org/article/eeejbvent/v_3a32_3ay_3a2017_3ai_3a2_3ap_3a215-236.htm  (Parhankangas & Renko (2017), Linguistic style and crowdfunding success, J. Business Venturing)
