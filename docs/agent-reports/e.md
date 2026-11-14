# Agent E (frontend v2) report

## What I built (all under `static/`)
Plain HTML/CSS/ES modules, no build step, no CDN, no web fonts, no new deps. Cytoscape = vendored global.

| File | Purpose |
| --- | --- |
| `index.html` | Shell: top bar (`#topbar-main` filled per view, theme toggle, "DC" Demo Capital avatar), `#app`, `#toasts`. Inline pre-paint theme script (no flash). |
| `style.css` | Design system: every colour is a token (`--bg --surface --border --text --muted --accent --on-accent --accent-soft --red --amber --grey --edge`) for `[data-theme=light|dark]`; verdict classes `.v-<verdict>` set `--v`. 8 px grid, 1 px hairlines, 8-10 px radius, tabular nums, mono only for timestamps, reduced-motion fallback, 1280 / 1000 px breakpoints, print stylesheet (memo only). |
| `js/main.js` | Theme init, `?mock=1` loader, hash router (`#/`, `#/d/<id>/<tab>`, legacy `#<id>` -> `#/d/<id>/map`). |
| `js/theme.js` | `prefers-color-scheme` default, localStorage `claimmap.theme`, `data-theme` on `<html>`, fires `themechange`. |
| `js/library.js` | Library: upload tile (click or drag-drop), live-session tile (title modal -> POST /api/session), search, card grid, 1 s polling of analysing decks, "..." -> Delete (confirm). |
| `js/workspace.js` | Top bar (back, title, "N slides · M claims", mode chip, status chip, tabs Read/Map/Live/Brief, Finalize, Export); tabs created lazily and kept (state preserved); shared state (analysis, pins, hover bus, open claim). |
| `js/read.js` | BlazeLearn view: outline + Pinned (left), slide PNGs with `claim.boxes` highlights + margin markers + "Not located on the slide" strip (centre), claim card or "Ask these first" (right). |
| `js/map.js` | Obsidian graph, filter chips, legend, Pull (P) / Reset (R) / Fit (F), claim card drawer. |
| `js/graphview.js` | Shared Cytoscape component (Map + Live mini-map): `cose` layout, circles sized by load, verdict fill, dashed ring = spoken, hover/lock neighbour highlight, Jenga cascade, drift pulse, `addClaim` grow animation, styles re-read from CSS tokens on `themechange`. |
| `js/live.js` | Live: mic + level meter, audible replay (`<audio src=/demo-audio/...>`) with speed, typed line, status pills, drift alerts (deck vs said, or earlier vs now for spoken-vs-spoken), transcript, mini-map (`claim_added` -> new node), "Now discussing: slide N", live questions, post-Stop Finalize CTA -> Open Brief. |
| `js/brief.js` | Memo with skeleton loader, recommendation badge, sections, red flags link to claim cards; Regenerate, Copy as Markdown, Download .md, Print. |
| `js/card.js` | Claim card, claim chips (hover highlights graph), "Ask these first", pins in localStorage `claimmap.pins.<deck_id>`. |
| `js/graphcore.js` | Pure helpers (cascade/pull summary, neighbours, filters, node size, library card model). |
| `js/util.js`, `js/api.js` | `h()` (textContent only), stroke SVG icons, toasts, modal, verdict map (tokens, no hex); fetch wrappers flag `notAvailable` on 404 "Not Found"/405 so UIs say "not available yet". |
| `js/mic.js`, `js/pcm-worklet.js` | v1 audio capture (unchanged). |
| `js/mock.js` | DEV ONLY, imported only with `?mock=1`. Wraps fetch: real routes used when they work, fixture-shaped fallbacks for v2 routes (decks list, session, delete, finalize, brief/.md, synthetic SVG slides + boxes when there are no real slide images). Fakes the WS for `mock-*` sessions or with `&mockws=1` (scripted pitch: 40 customers drift vs deck c3, then 55 vs 40 self-drift, claim_added, question, stopped). |

v1 files (`static/{app,graph,live,api,util,mic,pcm-worklet}.js`) were MOVED to `static/v1/` (not loaded, kept for reference, safe to delete). No contract additions, no backend files touched.

## What to click (browser QA, server e.g. `uv run uvicorn claimmap.app:app --port 8022`)
1. **Theme**: sun/moon button top-right (or **T**). Reload keeps the choice. Graph colours change too.
2. **Library `/#/`**: cards for each deck (thumbnail = slide 1, mode chip, date, claim count, coloured verdict dots, red top flag line). Type in Search to filter. "..." on a card -> Delete -> confirm (deletes for real!). Empty-state text appears with no decks.
3. **Upload**: drop `tests/fixtures/labloop_deck.pdf` on "Upload a deck" (or click it). A card appears with a spinner + live progress line, updating every 1 s, then dots/flag.
4. **Live session**: "Start a live session" -> type a title -> Enter -> lands on `#/d/<id>/live`. Read tab disabled with tooltip.
5. **Read** (open LabLoop card): left outline (click item scrolls to slide), slides with coloured highlights; hover a highlight -> tooltip with verdict + text; click -> claim card on the right (verdict chip, reason, quote, load bar %, evidence sources, Rests on / Holds up chips, Ask the founder, Pin, Show in map). Pin -> appears under Pinned (persisted on reload). Esc -> back to "Ask these first".
6. **Map** (tab or **2**): round force-directed cluster animating in. Hover any node -> it + neighbours + edges highlighted, rest faded to 12%. Click node -> locks highlight + drawer with card; click background unlocks. Drag nodes, wheel zoom, Fit. Select "26 paying customers" and press **P**: cascade turns red/dashed, banner "6 of 16 fall · Pull “26 paying customers” → 6 of 16 claims fall, including the ask". **R** resets. Filter chips All / Contradicted / Unverified / Spoken. Legend bottom-left.
7. **Live** (tab or **3**): pills show Connected. "Replay demo" (choose speed) -> audio plays audibly; transcript, drift alerts (large, newest first), mini-map nodes growing in (if D emits `claim_added`), drifted nodes pulse red, questions with LIVE badge, "Now discussing: slide N" for deck+live. Stop (or **S**) -> green box "Finalize: check what was said" -> then "Open Brief". Mic: "Start mic" (**M**), level meter.
8. **Finalize** (top bar): shows "Checking…" chip + disabled button, then refreshes when status is done.
9. **Brief** (tab or **4**, or Export): skeleton for 5-15 s, then memo. Click a red-flag claim chip -> Map drawer with that card. Copy as Markdown / Download .md / Print (preview should show only the memo).
10. **Mock**: `/?mock=1#/` (+ `&mockws=1` to fake the socket for real decks too). A console info line confirms mock mode.
11. Edge: `/#/d/nope/map` -> "Deck not found"; `/#abc` -> redirects to `#/d/abc/map`.

## Verified
- `node --check` on all 16 `static/js/*.js`: OK.
- Headless node run (throwaway `/tmp/e_check/check.mjs`, fake DOM, vendored Cytoscape headless): 29/29 checks OK, 0 FAIL.
  - sample_analysis.json: pull "26 paying customers" -> 5 of 9 fall incl. the ask (c6,c1,c5,c9,c2).
  - labloop_deck.json: pull c3 -> **6 of 16** fall incl. the ask (c3,c4,c5,c15,c16,c13); neighbours of c3 = c3,c4,c5,c15,c16 = Cytoscape `closedNeighborhood`; filters all=16 contradicted=1 unverified=14; 20 edges; node sizes 22..60; headless `cose` runs.
  - Library grid rendered through the real `renderLibrary` with stubbed fetch: titles, mode chips, counts and top red flag present; v1-shaped list items render as busy cards; claim card + "Ask these first" render; all modules link (imports resolve). No `innerHTML` use (fake DOM throws on it).
- Server on :8022: `/`, `style.css`, all 16 JS files, vendored cytoscape, `/api/decks`, `/api/deck/labloop_deck`, `/api/deck/labloop_deck/slides/1.png`, `/api/deck/labloop_deck/brief.md`, `/demo-audio/labloop_pitch.mp3`, `/api/demo-audio`: all **200** (D's v2 routes were already live). Real v2 data: labloop_deck has slide_count 7 and 16/16 claims with boxes; `/api/decks` items carry counts/top_flag/thumb. Server stopped.
- `uv run pytest -q`: **67 passed, 2 skipped**.

## NOT verified (no browser here)
- Any real rendering: CSS layout at 1920x1080 / 1280x720, highlight alignment on real slide PNGs, tooltip placement, Cytoscape on-screen label size (14 px model font; labels of load < 0.3 nodes hide below zoom ~1.1 via `min-zoomed-font-size`), cose cluster roundness/tuning, theme switch repaint, print preview.
- The live WebSocket path end-to-end (`claim_added` from D, replay audio autoplay policy, mic/AudioWorklet), and Finalize/Brief against D's real routes (only curl 200 on brief.md). I did NOT POST /api/session (it would persist a junk session).
- Mock mode was only checked by code reading + `node --check`, not in a browser.
- "Share/Listen" buttons from the BlazeLearn reference were not built (out of scope of the route list); Export jumps to the Brief tab's export buttons.

## Known limits
- Top bar buttons collapse to icons below 1400 px wide (tooltips keep labels).
- Clicking a node in the Live mini-map shows a one-line summary with "Open card" (opens the Map drawer) instead of navigating away mid-pitch.
- The Read tab rebuilds slide DOM only when deck claims/verdicts change (spoken claims don't trigger it).

## Incidents
- Throwaway check scripts lived in `/tmp/e_check/` (outside the repo). Moved the v1 JS files to `static/v1/` (within my ownership) instead of deleting them.
