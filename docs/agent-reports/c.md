# Agent C (frontend) report

## What I built (all under `static/`)
Plain HTML/CSS/ES modules, no build step, no CDN, system fonts only. Cytoscape is the vendored `static/vendor/cytoscape.min.js`.

| File | Purpose |
| --- | --- |
| `index.html` | Skeleton for all screens (start, progress/error, deck). |
| `style.css` | Dark "analyst terminal" theme, one accent (cyan), verdict colours red/green/amber/grey-outline. Root font scales 16px (1280) to 21px (1920). |
| `app.js` | Routing via `location.hash`, upload, 1 s polling, summary strip, detail panel, pull banner, questions, tabs, keyboard. |
| `graph.js` | Cytoscape graph (breadthfirst, directed, roots = claims nobody depends on) and the Jenga cascade. |
| `live.js` | WS client, transcript, spoken-claim feed (drift cards), replay, typed fallback, reconnect. |
| `mic.js`, `pcm-worklet.js` | getUserMedia + AudioWorklet: downsamples to 16 kHz mono, posts Int16 frames of 1600 samples (100 ms) as binary WS frames, plus an RMS level for the meter. |
| `util.js`, `api.js` | DOM helper `h()` (textContent only, never innerHTML), verdict maps, `safeUrl` (http/https only), toasts, fetch wrappers. |

No contract additions: schemas, routes, WS protocol unchanged; no routes added; no backend files touched.

## How to run
`uv run uvicorn claimmap.app:app --port 8013`, open http://localhost:8013/ (a deck can also be opened directly via `/#<deck_id>`).

## What to click (for browser QA)
1. **Start**: drop or pick `tests/fixtures/labloop_deck.pdf` (or press Enter on the drop zone). Progress screen shows stage indicator (queued → done) plus the `progress` text, then the deck view. Reload keeps the view (hash). Brand / "New deck" returns to start; "Open an analysed deck" lists existing decks.
2. **Graph**: ask node at the top, assumptions below; node size = load, colour = verdict, label = glyph + CATEGORY + wrapped text. Hover a node: detail panel previews it; click pins it (quote, slide, verdict + reason, sources with kind/title/date/quote/link, "Rests on" / "Holds up" chips, live statements).
3. **Jenga pull**: click "26 paying customers" (c6), press **P** or the Pull button. c6 turns solid red/dashed, dependents turn red/dashed and fade in a cascade (≈0.4 s per level). Banner reads "Pull “26 paying customers” → 5 of 9 claims fall, including the ask (…)". Select another claim and pull again to accumulate. **R** / Reset restores. ←/→ steps through claims by load. Esc clears selection and highlights.
4. **Ask these first**: click a question; its claims are highlighted (others dim) and the first is selected. Click again to clear.
5. **Summary strip**: verdict counts and the top 3 load-bearing claims (clickable).
6. **Go live** tab (or **G**): connects WS `/ws/live/{deck_id}`. Connection pill and server status pill. Test without a mic: type a line and Send (stub echoes a transcript and one fake spoken_claim), or Replay `labloop_pitch.mp3`. Drift = large red card ("Deck (slide N): … / Said: …", click it to select the claim) and the matching graph node pulses and keeps a red ring; consistent = green check line; new = neutral line. Live questions appear in "Ask these first" with a red LIVE badge (a count badge shows on the other tab). Error events show a dismissible toast.
7. **Mic**: Start mic, speak, watch the level meter; Stop sends `{"type":"stop"}`. If permission is denied, an explanatory notice suggests Replay or typed text.
8. **Edge states**: unknown hash, such as `/#nope`, goes to start with a "not found" message. A deck with status `error` shows the error text and "Try another deck". WS refused: pill "Live server unreachable", toast and a Reconnect button. Empty deck: "No claims were extracted…" panel.

## Verified
- `node --check` on all 7 JS files: OK (node 22).
- Server on :8013: `/`, `/static/{style.css,app.js,util.js,api.js,graph.js,live.js,mic.js,pcm-worklet.js,vendor/cytoscape.min.js}`, `/api/decks`, `/api/demo-audio` all HTTP 200.
- Uploaded `labloop_deck.pdf` with curl and fetched its analysis: status `done`, 9 claims, 3 questions. Demo audio list: `["labloop_pitch.mp3"]`.
- Headless node run of `graph.js` (Cytoscape headless, throwaway script, deleted afterwards) against the fixture: pulling c6 gives cascade c6,c1,c5,c9,c2 = **5 of 9**. Adding c7 gives 7. Reset clears the state. Also OK with an empty deck, duplicate ids / self-dependency / dangling dependency / cycle (a↔b), 25 claims, and a single claim.
- `uv run pytest -q`: 22 passed, 1 skipped. Server killed.

## NOT verified / known limits
- **No real browser run.** No headless browser available and no installs allowed. All DOM, CSS layout (1280×720 / 1920×1080), AudioWorklet and mic paths are untested in practice. Expect small CSS tuning. Please screenshot at both sizes.
- Layout at 1280×720 is tight: the detail panel and live feed scroll internally rather than overflow. Below 1000 px wide the layout stacks and the page scrolls vertically.
- Replay does not play audio audibly in the browser (no audio route; per brief).
- While analysis runs, only the stage and progress text are shown; partial claims are not rendered until `done`.
- Cytoscape's breadthfirst layout can place labels close together with many claims. For more than 16 claims, nodes and labels shrink.
- Pull animation delays are skipped with `prefers-reduced-motion`.
- Resizing the window re-fits the graph, which resets any manual pan/zoom.

## Incidents
- I briefly created `spikes/c_graph_check.mjs` (outside my ownership) for the headless check, then deleted it. No other files outside `static/**` and this report were touched.

---

# FIX PASS (after orchestrator browser QA at 1920x1080)

Files touched: `static/{index.html,style.css,app.js,graph.js,live.js,util.js}` only.

1. **Graph is the hero** (`graph.js`, `style.css`, `index.html`). Left column is now 7fr graph / 3fr detail strip. The legend/hint rows are gone (the summary counts already colour-code verdicts), so the graph bar is just Pull / Reset / banner. Nodes are now verdict-coloured **cards with the label inside** (round-rectangle, 206-236 x 64-84 model px, font 14-15 px, bold, dark ink on red/green/amber, light ink on the dark "missing" card), so on-screen text = font x zoom with no label-extent guessing. The layout fills the canvas (`breadthfirst` with `boundingBox` = canvas size, `fit:false`), then a manual `fitView()` (padding 26, zoom capped 1.5) centres it. Compact cards (smaller, shorter text) are used when the canvas is < 400 px tall or > 12 claims. Size still encodes load (0.93-1.1x). Edges: 3.5 px, light blue-grey, 1.7x triangle arrowheads, claim -> what it rests on, so the ask sits on top; a small caption "Arrow = rests on . card size = load" sits in the canvas corner. Re-fit: after build (rAF), after pull and reset (`refit`), and on resize (`fit()` = resize + recompute dims + relayout + fit, debounced by the ResizeObserver). The pull banner now has a **fixed height**, so a pull can no longer resize the canvas (probable cause of the half-hidden bottom node).
2. **"null" text** (`app.js` `renderDetail`). Cause: `box.append(a, b ? x : null, ...)` - `Node.append(null)` inserts the literal text "null". Now the panel builds two column arrays and appends only two real `<div>`s (`h()` skips null children). Detail is a 2-column compact strip (left: badge/text/quote/rests on/holds up; right: reason/sources/said live). I grepped every other `.append(`/`replaceChildren(` call: none can receive null.
3. **Pull banner** (`app.js` `renderPull`, `style.css`). Deliberate 2-part layout: big red "5 of 9 fall" + a one-line sentence (2-line clamp), fixed height. Cases: ask falls ("Pulling X brings down the ask (...)"), the pulled claim IS the ask ("You pulled the ask itself (...): nothing else rests on it."), the ask survives, no ask. Node look: fallen = dark faded fill, red dashed border, 62% opacity, scaled to 86% (CSS-transition on width/height), label switches to "X FALLS . CATEGORY"; the pulled claim has a stronger dark-red fill, thicker dashed border, full opacity. Edges into a fallen claim turn red, dashed and thicker.
4. **Drift pinned on top** (`index.html`, `live.js`, `style.css`). New `#drift-box` section above the feed (red frame, count badge, newest first, 1.3rem "Deck (slide 3): ..." / "Said: ..." lines + note, click = select node). Consistent/new/question rows stay in the compact scrolling `#spoken-feed` below. Empty state is a slim dashed placeholder. The drifted node gets a red outline ring that **pulses continuously until Reset** (`graph.markDrift` runs one interval; `graph.reset()`/R clears pulls AND drift rings).
5. **Audible replay** (`live.js`, `index.html`). Hidden `<audio id="replay-audio">`; after the replay message is sent, `src=/demo-audio/<file>`, `playbackRate = defaultPlaybackRate = chosen speed`, `play()`. The Stop button is now enabled during a replay and stops audio and sends `{type:"stop"}`; audio is also stopped on disconnect, socket close, deck change and when it ends. A blocked autoplay shows an info toast.
6. **Favicon**: inline SVG `<link rel="icon" href="data:...">` in `index.html`.
7. **1280x720**: root font 16 px, compact summary counts (horizontal), transcript shrunk at heights <= 800 px, banner/fixed heights, `.detail` becomes one column under 1000 px. Not measured in a browser (see below).

Removed/changed behaviour: legend row and "<-/-> choose claim" hint removed from the graph bar (shortcuts still work; hint text is in the idle banner). Hover preview of the detail strip is kept.

## Verified (this pass)
- `node --check` on all 7 JS files: OK.
- Throwaway headless Cytoscape run of the new `graph.js` against `data/decks/fixture.json`: build true, pull c6 -> fallen c6,c1,c5,c9,c2 (5 of 9), reset clears, markDrift/fit/destroy run without error (script was in /tmp, deleted by the OS later, not in repo).
- `uv run pytest -q`: 47 passed, 2 skipped.
- Server on :8013: `/`, all 9 `/static/*` files incl. vendored cytoscape, `/demo-audio/labloop_pitch.mp3`, `/api/deck/fixture`: all HTTP 200. Server stopped.

## NOT verified (no browser)
- Actual on-screen label px size (design target: 15 px model font, zoom ~1; falls to ~0.8-0.9 at 1280x720 for a 4-level graph, i.e. ~12-13 px, and below that for decks with many wide layers).
- Card text overflow with unusual wrapping (card height is sized for 1 category line + up to 3 text lines).
- CSS animation/outline look (`outline-*` Cytoscape styles, scale-down transition), audible playback and the autoplay policy, 1280x720 overlap/scroll behaviour, absence of the console "null"/favicon errors.
