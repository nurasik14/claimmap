# Agent F (frontend v3: motion, attentiveness, living graph) report

v2 (agent E) was evolved, not rewritten. Only `static/**` changed (plus this report). No new deps, no CDN,
no commits. Vendored `d3.min.js` is now loaded by `index.html` next to Cytoscape.

## Files
| File | Change |
| --- | --- |
| `js/forcesim.js` (new) | DOM-free d3-force wrapper: forceLink (distance 90 / 70 compact, softer springs on hubs), forceManyBody (-220 / -160), forceCenter, forceCollide (r + label margin 22 / 14), weak forceX/forceY (0.045) so orphans orbit. `setData` (spiral start at the centre = spring-out), `addNode` (placed at the mean of its anchors, reheats to 0.5), `pin`/`unpin` (fx/fy + alphaTarget 0.3 → 0), `settledBBox` (deterministic dry run to frame the camera before the spring-out), `driftNudge` (tiny zero-mean sine wobble). |
| `js/graphview.js` | `cose` replaced by the sim. One rAF loop ticks the sim and writes `cy.nodes()` positions in `cy.batch`. Cytoscape still owns rendering, styles, hover/lock, pull, selection, filters. |
| `style.css` | New "v3 attentive layer" at the end (tokens `--line --lift --glass --ease --t-*`), all motion off under `prefers-reduced-motion`. |
| `js/util.js` | `countUp`, `counter`, `scoreDial`, `scoreClass`, `busy(button, fn)`, `initTooltips()` (delayed tooltips), toast exit animation, icons `video pdf trophy`. |
| `js/library.js` | Score dial on cards, outcome chip, source icon, Sort (Newest / Score: high to low, remembered), "Real pitches" chip, stagger-in, upload/delete/start busy states. |
| `js/workspace.js` | Score dial in the top bar + breakdown popover; Finalize shows a spinner. |
| `js/graphcore.js` | `scoreValue`, `sortItems`; card model gains `score outcome outcomeWon sourceUrl sourceKind` (all optional). |
| `js/map.js` | Live updates go into the running sim for new AND changed claims (no re-layout). |
| `js/live.js` | Listening waveform (level-driven with the mic), Replay/Start mic busy states. |
| `js/read.js` | Slides show a shimmer placeholder until the PNG loads, then fade in. |
| `js/theme.js` | Theme toggle cross-fades colours (`html.theme-fade` for 320 ms). |
| `js/main.js` | Calls `initTooltips()`. |

## 1. Living graph: what to click
- **Spring-out**: open any deck → Map (2). Nodes spring out from the centre and settle into a round cluster in about 3 s. The camera is framed on the predicted settled layout first, then does one soft fit when it settles.
- **Drag**: drag a node. Its neighbours follow on springs (sim reheats, alphaTarget 0.3). Let go and the node unpins and the cluster settles.
- **Hover**: hover a node. Over ~160 ms the node grows ×1.18, its neighbours and edges stay bright (edges turn green) and everything else fades to 12% with labels hidden.
- **Idle**: after settling, the graph keeps a very slow drift (30 fps, tiny sine nudges). This is off under reduced motion. The loop pauses when the tab is hidden (`visibilitychange`) or the canvas is off-screen (IntersectionObserver; hidden tabs are `display:none`).
- **Live**: Live tab → Replay demo. Each `claim_added` node pops in (size 0 → full with overshoot) next to the claims it rests on, and the cluster makes room. The **Map tab gets the same claims while the session runs** (workspace `upsertClaim` → `map.update({live:true})` → `addClaim`); switch to Map mid-replay to see it. Drift nodes pulse with an animated border.
- **Pull**: select "26 paying customers", press **P**. The cascade turns red and dashed, and fallen nodes shrink to 80% (animated). **R** animates back.
- **Fit / F**: animated fit (320 ms). Wheel zoom and pan stay native Cytoscape. Once you zoom, pan or select, auto-framing stops.
- **Cross-highlight**: hover a highlight on a slide (Read), a claim chip, a drift card or a live question. The matching node pulses once (accent ring) and its neighbourhood lights up.
- **Reduced motion**: no spring-out (the layout jumps to its settled state), no drift, no pop-in, and 0 ms graph transitions. Dragging still moves neighbours because that is direct manipulation.

## 2. Attentive UI: what to click
- **Chrome is quieter**: hairline `--line` borders, a glass top bar with blur, lighter headings (500), uppercase section labels at 11 px, a borderless glass legend, more air in the library.
- **Tabs**: the green underline slides in (scaleX), and panes fade in with a 6 px rise.
- **Library**: cards stagger in at 45 ms steps. Hovering lifts a card (−2 px plus a soft shadow) and zooms its thumbnail slightly. Tiles lift too, and their icon turns green. Verdict counts count up. Skeleton cards shimmer.
- **Buttons**: hover lifts 1 px, press scales to 0.97, focus shows an accent ring plus halo. Async buttons show a spinner (Upload tile, Start listening, Delete, Finalize, Replay demo, Start mic).
- **Tooltips**: any `title` shows a styled tip after 350 ms (immediately on keyboard focus). Esc or a click hides it.
- **Read**: slides shimmer until loaded, then fade in. Highlights fade in and glow on hover. The claim card slides in from the right. The load bar grows.
- **Map drawer**: slides in from the right. The pull banner rises in.
- **Live**: drift cards drop in from the top with a red flash that settles. Transcript lines rise in. Questions slide in from the right. The count badge pops. The waveform next to the meter animates during mic or replay and scales with the mic level.
- **Toasts**: slide up, auto-dismiss with an exit animation. Modals and menus pop.
- **Theme (T)**: all colours cross-fade over 300 ms.

## 3. Score (G's data): what to click
- **Library**: scored cards get a dial bottom-right on the thumbnail. The arc fills over 900 ms and the number counts up. Green ≥ 70, amber ≥ 40, red below. Cards with `outcome` get a "Won" chip (green, trophy) or "No deal" (grey), with the outcome text as the tooltip. Cards with `source_url` get a video or PDF icon linking out (`noopener noreferrer`, http(s) only).
- **Toolbar**: Sort (Newest / Score: high to low, stored in `claimmap.sort`) and a "Real pitches" chip (cards with `source_url`). The toolbar only appears when some deck has a score or source.
- **Workspace**: the dial sits in the top bar ("Score of 100"). Click it for a popover with each part (name, points/max, an animated bar, detail), the summary, "Real outcome: … source↗" when present, and the note *"The score measures how well claims hold up; it does not predict success."* Esc or an outside click closes it.
- **Without score data nothing renders**: no dial, no toolbar, no popover.

## 4. Kept
Routes, Read highlights, Pull/Reset/Fit/filters, live controls, Brief export and print, themes, keyboard shortcuts (1-4, P/R/F, M/S, T, Esc), mock mode. Agent E's fake-DOM harness still passes except two library checks, which fail only because its fake `style` object has no `setProperty`. The extended harness below covers those paths.

## Verified
- `node --check` on all 17 `static/js/*.js`: OK.
- Headless sim (`/tmp/f_check/sim.mjs`, real vendored d3, labloop_deck.json): **22/22 OK**.
  - Start bbox 116×132 and spreads out. Per-tick movement decays from 20.5 px to 0.0001 px, and alpha reaches 0. The settled cluster is 540×465 (aspect 1.16), centred, with 0 overlaps and the 4 orphans within orbit range.
  - `settledBBox` is deterministic.
  - Drag: pin holds the exact position, alphaTarget goes to 0.3, and the neighbours of c3 move 31-229 px. Unpin sets alphaTarget 0, the graph re-settles and the node springs back.
  - `addNode` lands next to its anchor and reheats; an unlinked node starts at the centre. The drift nudge is tiny and zero-mean.
  - **Pull c3 → 6 of 16 fall, including the ask.**
- Fake-DOM (`/tmp/f_check/dom.mjs`): **25/25 OK**.
  - `scoreValue` and both sort orders.
  - Dial shows 73 for 72.6 with the right colour bands. Dials appear only on scored cards, and outcome chips show Won / No deal.
  - Source links are safe. The Real pitches filter works, Score sort puts the highest first, and cards get a stagger index.
  - No score data → nothing extra renders. All modules link.
- Server on :8023: `/`, `style.css`, `index.html`, both vendor libs, all 17 JS files, `/api/decks`, `/api/deck/labloop_deck` and slide 1 PNG all returned **200**. `index.html` loads d3. G's data is live: 3 `real_*` decks have score, outcome, won and source, and labloop_deck has a full score object (72.6). Server stopped.
- `uv run pytest -q`: **76 passed, 2 skipped**.

## NOT verified (no browser here)
- Nothing was seen in a real browser:
  - feel and frame rate of the sim and the idle drift
  - Cytoscape style transitions on `width`/`height`/`text-opacity`
  - the `cubic-bezier(...)` pop-in easing (the string format is supported by the vendored Cytoscape parser)
  - glass/blur rendering
  - tooltip placement
  - popover position at 1280 px
  - the theme cross-fade cost
- `createGraph` itself was not run (Cytoscape with a container needs a real DOM). Only the sim maths and the Cytoscape-free code paths were exercised.
- The live WebSocket path end-to-end and mock mode in a browser.

## Known limits
- Idle drift keeps one rAF loop at ~30 fps while the graph is visible (paused off-screen, when the tab is hidden, or under reduced motion).
- A non-live update that changes verdicts (e.g. after Finalize) still re-runs the spring-out layout, as in v2.
- The dial colour bands (70/40) are a display choice, not part of G's score definition.

## Incidents
- Throwaway check scripts live in `/tmp/f_check/` (outside the repo).
- Several compound shell commands were refused by the permission layer, so I used Edit and single commands instead. I did not make the planned `/tmp` backup of `static/`; the snapshot the lead mentioned is the fallback.
