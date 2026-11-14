# ClaimMap: how to describe the prototype

## One line
ClaimMap shows an investor which claims a startup deal rests on, checks them against public evidence,
and catches the founder saying something different from their own deck during the live pitch.

## Spoken (about 30 seconds)
"ClaimMap is a working prototype for investors. You upload a pitch deck, and it pulls out every
claim, checks the numbers and searches the web for proof or refutation. Then it draws a map of
which claims the deal rests on. During the pitch it listens, and if the founder says 40 customers
when the deck says 26, it flags it within a few seconds and writes the question to ask. At the end
you get a scored one-page memo for your partners."

## Written (submission form, about 150 words)
ClaimMap is a working prototype of a due-diligence assistant for VCs and angels. An investor
uploads a pitch deck; ClaimMap extracts every claim (market size, traction, growth, competition,
team), checks the deck's own arithmetic, searches the web for evidence that supports or refutes
each checkable claim, and labels it supported, contradicted or unverified, with the source and
quote. It draws the claims as a dependency map: pull one claim and see what falls with it. During
the live pitch it transcribes the founder locally on the laptop and flags, within about 4 seconds,
anything said that contradicts the deck or the founder's own earlier words. Each deck or pitch gets
a one-page investment memo, ranked questions for the founder, and a 0-100 score whose criteria are
grounded in published research and which shows the claims that moved it. It works with a deck
only, a pitch only, or both.

## What is real in the prototype (say this if asked "is it real?")
- Everything in the demo runs live: deck analysis, web checks, the map, the live transcription,
  the score and the memo. Nothing is mocked.
- Tested on 3 founder-published decks and 8 TechCrunch Startup Battlefield final pitches.
- Built in one day at this hackathon: Python (FastAPI) backend, Claude for analysis, Whisper
  speech-to-text running locally on the laptop's GPU.
- LabLoop, the main demo deck, is a sample deck we wrote with planted problems, so you can see what
  it catches.

## What it is not (yet)
- Accuracy against human analysts has not been measured; that is what a pilot would measure.
- The score measures how well a pitch's claims hold up. It does not judge the team and does not
  predict who wins.

## Avoid
- "AI that tells you whether to invest." It ranks questions and evidence; the investor decides.
- "Nobody else checks claims live." Faktum and VeriFact do (one sentence at a time); our difference
  is the deck-vs-pitch comparison and the map of what the deal rests on.
