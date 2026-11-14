# Agent H: v4 visual redesign (library, share/delete, workspace polish)

Status: done. Frontend only, no backend/test changes. `uv run pytest -q`: 76 passed, 2 skipped.
`node --check` passes on every edited JS file. Pages, JS, CSS, all 7 fonts and `/api/deck/<id>/brief.md` return 200 from
a test server on :8031 (since stopped). Backup of the pre-change `static/` was NOT made (cp/tar were blocked);
nothing is committed, so `git diff` is not available either (repo has no commits).

**Not done: in-browser visual check.** Headless Chrome was not permitted in this session, so nothing was rendered.
Before the demo, someone needs to open the library and a workspace in light and dark themes and look at them.

## Files changed
- `static/js/share.js` (new): `copyLink` (navigator.clipboard, falling back to a selected input + execCommand, and
  then to a modal with the link pre-selected), `downloadBrief` (GET `/api/deck/<id>/brief.md`, the same endpoint
  brief.js uses), `downloadJson` (GET `/api/deck/<id>`), `nativeShare` (only offered if `navigator.share` exists),
  `confirmDelete` (the same confirm modal + `deleteDeck` that library.js had), and a floating "..." menu
  (`showMenu`/`moreButton`) that closes on outside click, Esc, scroll or resize and supports arrow keys.
  The link format is `location.origin + '/#/d/<id>'`; main.js routes that to the Map tab.
- `static/js/library.js` (rewritten around the same logic: upload, polling, live-session modal, sort, the "Real pitches"
  chip, search and staggered draw):
  - **Hero**: dark 28px panel with a sea-blue eyebrow and the headline "Know what the deal *rests on.*" (the last
    two words in Instrument Serif green), a lede, an "Upload a deck" pill (opens the existing file picker and upload
    path) and a "Start live pitch" pill (the existing live-session modal). The hint "or drop a PDF anywhere on this
    page" is true: drag-and-drop now works on the whole library page, with a dashed sea-blue overlay while dragging.
  - **Illustration**: plain DOM/CSS plus a small inline SVG. Three tilted slide sheets carry red/green/amber
    highlight bars, a floating "Load-bearing claim" callout holds a 3-node graph, and there is a radial glow behind.
    It floats gently and is static under reduced motion.
  - **Stats**: 4 cards (Decks analysed, Claims checked = sum of `claim_count`, Contradicted = sum of
    `counts.contradicted`, Live pitches = mode `live` or `deck+live`), computed from `/api/decks` and recomputed as
    uploads are polled.
  - **Section header**: dot + "YOUR LIBRARY" eyebrow, "Every claim, *checked.*", subtitle and a pill search box.
    Below it are filter chips All / Deck only / Pitch only / Deck + pitch with counts underneath (the active chip is
    solid). Sort and "Real pitches" sit on the right.
  - **Cards**: a dotted-grid stage holds the first slide as a sheet tilted 1.5deg, with a second sheet peeking out
    behind it. On hover or keyboard focus the sheet rotates to -3deg, lifts 6px, scales to 1.02 and gets a deeper
    shadow (260ms ease-out) while the back sheet rotates the other way. Under reduced motion only the shadow
    changes. Each card also has:
    - a round "..." menu at top-left;
    - a dark "N slides" (or "Transcript") pill at top-right;
    - the score dial at bottom-right;
    - an accent eyebrow, a 2-line Bricolage title, and the date and claim count in mono;
    - status chips with coloured dots: mode, capture label, Won / Finalist, and the source link;
    - the verdict dots, the contradicted top flag, and a full-width "Open deck/pitch/map" pill.
    Pitch-only decks get a CSS "transcript paper": a sea-blue waveform strip (deterministic per id) and text lines,
    one highlighted red and one green.
- `static/js/workspace.js`: adds a **Share** button (copies the link; uses native share on touch devices) and a "..."
  menu (Copy link, Share…, Download Brief (.md), Download data (.json), Delete). Deleting returns you to the
  library. The tabs get a **sliding pill indicator**, which is sea blue when Live is active. No other logic changed.
- `static/js/util.js`: 4 new icon paths (`link`, `share`, `layers`, `alert`). Nothing else.
- `static/index.html`: preloads Inter 400 and Bricolage 800.
- `static/style.css`: one appended block, `/* v4 redesign */`:
  - `@font-face` for all 7 vendored fonts;
  - the given light and dark tokens, plus new `--sea`, `--on-sea`, `--sea-soft`, `--ink`, `--hero-*` and
    `--display`/`--serif` variables. Existing names are kept, so the map picks up the new `--bg`, `--surface`,
    `--accent` and `--edge` through `token()`, with no change to map JS;
  - pill buttons, sea-blue focus rings and links;
  - display font for h1/h2, the workspace title, card titles, big numbers and the dial number;
  - a serif italic Brief headline, used as the pull quote;
  - sea-blue section eyebrows in the Brief;
  - Live elements in sea blue (badge, meter, wave, listening pill, CTA box, live-mic chip, info toasts);
  - 22px radius on memo, modal, popover, mini-map and drift cards;
  - responsive rules at 1100, 900 and 600px;
  - reduced-motion rules, and a print reset of the v4 tokens.

## Not done / notes
- No render check (see above). Things to look at first: how the hero headline wraps at 1280-1440px, card
  heights in the grid, and the tab pill position after fonts load (it re-measures on `document.fonts.ready` and on
  resize).
- The old `.tiles` upload/live tiles are gone from the library; the hero CTAs replace them.
- The map JS (graphview.js, forcesim.js) is untouched.
