# Agent G: real decks, real pitches, ClaimMap Score

## Summary
- **Score v1:** built and tested exactly as specified (`claimmap/score.py`, `docs/SCORE.md`). It is stored on
  deck completion and after Finalize, can be backfilled for existing analyses, and is computed on read when
  missing. `GET /api/decks` items now carry `score`, `outcome`, `outcome_won` and `source_url`.
- **Real decks:** 3 founder-published PDFs are analysed, scored and briefed.
- **Real YouTube pitches: NOT DONE.** This machine is blocked by YouTube. Every request, including audio,
  auto-captions, alternate player clients and TechCrunch's own video pages (they embed YouTube), returns
  "Sign in to confirm you're not a bot". The only way around it is `--cookies-from-browser`, which would use
  the user's personal Google session. I did not do that without permission. Because of this, **there is no
  won-vs-not-won comparison**. The 8 pitches are identified and verified, and the pipeline is built and
  smoke-tested, so it is one command away (see "To finish the pitches").

## Real items in the library
| Title | Type | source_url | Outcome | outcome_source | Score | A evid. /40 | B spec. /20 | C cons. /20 | D core /20 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Equals seed deck (2021) (`real_equals_seed`) | deck, 11 pages, 9 claims | https://equals-marketing-resources.s3.us-west-2.amazonaws.com/equals-seed.pdf | Raised a $6.6M seed round with this deck (founders' post) | https://wraptext.equals.com/equals-seed-deck/ | **50.4** | 19.3 | 11.1 | 20 | 0 |
| CrowdSec pre-seed deck (2020) (`real_crowdsec_preseed`) | deck, 44 pages, 18 claims | https://docs.google.com/presentation/d/1H-Gwa8K4UIHeqcLsPaAGNbKHD04k8GHI1ffB5NImNZU | Raised a 680 K EUR smart-money round from 18 business angels (2020) | https://github.com/crowdsecurity/fundraising-decks | **48.1** | 14.1 | 10 | 20 | 4 |
| CrowdSec Series A deck (2022) (`real_crowdsec_series_a`) | deck, 25 pages, 15 claims | https://docs.google.com/presentation/d/1akI0F7CYqff7xJuPklrQiYE4xymv6bU1FHHjvP9lBLY | Raised a 14.1 M EUR Series A led by Supernova (2022) | https://github.com/crowdsecurity/fundraising-decks | **54.0** | 16.7 | 17.3 | 20 | 0 |

The LabLoop demos, for reference (fictional, no outcome): `labloop_deck` 72.6, `labloop` (deck+live) 60.9,
`labloop_live` 47.6.

**Group means:** won n = 3 (all three are decks that raised money), mean **50.8**. Not won n = 0, so there is
no mean. No pitch videos were processed.

**Honest reading:** there is nothing to compare yet. All three real items are decks that went on to raise
money. Their scores (48-54) sit in the middle because few of their load-bearing claims could be checked
independently, so part D is 0-4. They contain no arithmetic contradictions, so part C is a full 20. One or
two claims per deck were contradicted by web evidence, which pulls part A below its neutral 20. That shows
what the score measures: whether the claims in front of you are backed. It does not measure whether the
company succeeded. Three funded decks scoring 48-54 is a good example of why the UI must say "measures how
well claims hold up; it does not predict success". With n = 3 and no non-winners, no claim of any kind
about predictive power is possible.

## Pitches identified (verified, not yet processed)
TechCrunch Disrupt Startup Battlefield finals, one video per finalist on TechCrunch's YouTube channel. A
research subagent checked each video id through YouTube oEmbed (title and channel). The outcomes come from
TechCrunch's winner posts, which name the winner and every finalist: SF 2017
(https://techcrunch.com/2017/09/20/pi-wins-startup-battlefield-at-disrupt-sf-2017/) and London 2016
(https://techcrunch.com/2016/12/06/seenit-wins-startup-battlefield-disrupt-london-2016/).

| Slug | Company | Video | Outcome |
| --- | --- | --- | --- |
| pi | Pi | https://www.youtube.com/watch?v=UFvbygXm1Hc | Won, Disrupt SF 2017 |
| oneva | Oneva | https://www.youtube.com/watch?v=ZC3xl_UHhWY | Runner-up, did not win, SF 2017 |
| augmedics | Augmedics | https://www.youtube.com/watch?v=hFi61rb1Lz8 | Did not win, SF 2017 |
| futurefamily | Future Family | https://www.youtube.com/watch?v=FVHxe7vKlR8 | Did not win, SF 2017 |
| matic | Matic | https://www.youtube.com/watch?v=A-3u0hGZjmA | Did not win, SF 2017 |
| seenit | Seenit | https://www.youtube.com/watch?v=HhIbSFmIY8A | Won, Disrupt London 2016 |
| liftigniter | LiftIgniter | https://www.youtube.com/watch?v=VPKgRJMOKFA | Did not win, London 2016 |
| oxehealth | Oxehealth | https://www.youtube.com/watch?v=fH91MqFlbl0 | Did not win, London 2016 |

That makes 2 won and 6 not won. Each final has one winner, so a 3rd or 4th winner needs another final. Two
leads that were not verified: Render won SF 2019 (`Qz0mVLk9GR8`, which may be the announcement rather than
the pitch), and Legacy won Berlin 2018.

### To finish the pitches (needs the user's OK to use browser cookies, or another network)
```
# 1. audio: first 6 minutes of each video (the pitch; the judges' Q&A follows). Edit fetch_pitches.py to add
#    "--cookies-from-browser", "firefox" to the yt-dlp command, or run it from an unblocked network
uv run python -I scripts/fetch_pitches.py
# 2. Whisper (serial, GPU) -> transcript fed through LiveSession in ~70-word sentence chunks (one analysis call
#    each, so spoken claims become nodes and self-drift is detected) -> finalize -> score -> brief; 3 in parallel
uv run python -I scripts/real_run.py pitches
# 3. a 3-minute stage clip, e.g. the Pi winner:
ffmpeg -i data/real_audio/pi.mp3 -t 180 data/demo_audio/pi_pitch.mp3
```
The `.txt` transcript is cached next to the audio. If captions can be had but audio can't, putting the
caption text in `data/real_audio/<slug>.txt` skips Whisper. Expected cost is about 15-20 LLM calls per pitch.
The pipeline was smoke-tested end to end with `--fake` (no real calls): it creates `yt_<slug>`, runs
finalize, scores, and handles a failed brief. The test analysis was deleted afterwards. **No demo clip was
copied to data/demo_audio**, because there is no audio.

## Files
- New:
  - `claimmap/score.py`
  - `tests/test_score.py` (9 tests: all-unverified = 20 + B + C + D, a load-bearing contradiction lowers A,
    math and drift lower C, specificity and core, zero loads, determinism, library keys, finalize sets the score)
  - `docs/SCORE.md`
  - `scripts/score_all.py` (backfill, no LLM)
  - `scripts/real_items.py` (item list with verified outcomes)
  - `scripts/real_run.py` (`decks` / `pitches`; counts LLM and web calls; `--fake`)
  - `scripts/fetch_pitches.py`
  - `scripts/check_pdfs.py`
- Changed:
  - `claimmap/deck/__init__.py`: score on completion.
  - `claimmap/finalize.py`: score before "done".
  - `claimmap/app.py`: library keys, plus score-on-read for analyses that lack one.
  - `tests/test_v2_backend.py`: library key set extended by the 4 v3 keys.
- `schemas.py` untouched (the v3 fields were already there).
- `data/demo_snapshot` untouched. `scripts/score_all.py` writes only to `data/decks`. Snapshots restored by
  `reset_demo.sh` have no stored score, but the API computes it on read.

## Verified
- `uv run pytest -q`: **76 passed, 2 skipped**.
- Server on port 8024: `GET /api/decks` lists the 3 real decks with score, outcome, outcome_won and
  source_url, plus the 3 LabLoop demos with scores. The server was stopped afterwards.

## Budget (user's API key)
- 9 LLM calls: 3 claim extractions, 3 question sets, 3 briefs.
- 7 web-search calls.
- **16 real calls in total, out of about 250.**
- Research searches were made with my own tools, not the user's key.

## Failed / tried
- **YouTube:** blocked as described above. Tried yt-dlp with the default clients, with
  `player_client=tv_embedded,web_embedded,mweb,ios`, with auto-captions, and through a techcrunch.com/video
  page.
- **Decks:**
  - Equals Series A (`https://equals-marketing-resources.s3.us-west-2.amazonaws.com/Series.A.Pitch.Deck.pdf`)
    is a genuine PDF but image-only (0 words), so I skipped it.
  - CrowdSec seed (Google Slides export of `1kYInfq5zgz2S8P2PAAcDRHPfOgfwdJ-ShP02Ug8Tmsw`) returned HTML (not
    public), so I skipped it.
  - Carta and Airbyte deck posts had no direct PDF.
- **Wayback:** archive.org rate-limited the CrowdSec pre-seed check (HTTP 429).

## Must not be committed (third-party content, local demo only)
- `data/real_audio/` (currently empty).
- Any `data/demo_audio/<slug>_pitch.mp3` copied from YouTube.
- `data/real_decks/*.pdf`, plus their copies `data/decks/real_*.pdf` and `data/decks/real_*/slides/`. The
  CrowdSec decks are CC-BY 4.0. The Equals deck has no stated licence.
