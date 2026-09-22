# Screenshot & parity tooling

Tools that capture the seven implementations, prove they render identically, and generate the images shown in the [project README](../README.md).

## Setup

Python 3 **and** Node.js 18+ are required. `pixel-parity.py` and
`optimize-images.py` import **NumPy** and **Pillow**, so both Python packages
must be installed from the pinned range in `docs/requirements.txt`.

```bash
cd docs

# Node tooling — Playwright (browser automation) + pngjs (screenshot checks).
# docs/package-lock.json is committed, so npm ci reproduces the exact tree.
npm ci
npx playwright install chromium

# Python tooling — NumPy (pixel diffing) + Pillow (image decoding/cropping).
python3 -m pip install -r requirements.txt
```

`optimize-images.py` and `pixel-parity.py` derive every path from their own
location, so they can be run from any working directory.

Dev servers can be started and stopped as a set:

```bash
bash docs/scripts/start-servers.sh   # all seven on their fixed ports
bash docs/scripts/stop-servers.sh    # stops exactly the PIDs it started
```

## Pipeline

| Step | Command | Output |
|------|---------|--------|
| 1. Capture | `npm run capture` | `screenshots/<framework>/*.png` (1440×1024) + `screenshots/screenshot-report.json` |
| 2. Verify | `npm run verify` | pass/fail per screenshot (blankness, geometry, completeness, report) |
| 3. Parity | `npm run parity` | pass/fail per framework (DOM, geometry, state) — **live servers** |
| 4. Pixel parity | `npm run pixel` | pass/fail per framework per state (pixel diff vs React) |
| 5. Optimize | `npm run optimize` | card-cropped `images/<framework>/*.jpg` |
| 6. Montage | `npm run montage` | `images/comparison-*.png` |
| — Tests | `npm test` | regression tests for the tooling's failure modes |

Note the ordering: `parity` is the **live DOM/geometry/state** check and does not
compare pixels; the pixel comparison is the separate `pixel` step. In CI they run
in that order (see `.github/workflows/visual-parity.yml`).

Individual frameworks can be captured with `npm run capture:react`, `npm run capture:vue`, and so on.

The dev servers must be running before steps 1–4. Each implementation is expected on its fixed benchmark port:

| Framework | Port |
|-----------|-----:|
| React | 4001 |
| Vue.js | 4002 |
| Angular | 4003 |
| Leptos | 4004 |
| Yew | 4005 |
| Dioxus | 4006 |
| Blade.php | 4007 |

## UI states captured

Each framework is driven through the same five states:

| State | Description |
|-------|-------------|
| `all` | Default view — 100 todos, 67 remaining |
| `active` | `Active` filter applied — 67 items |
| `completed` | `Completed` filter applied — 33 items |
| `input-filled` | Text typed into the input |
| `empty-state` | Every todo deleted |

Five states × seven frameworks = **35 screenshots**, every one embedded in the project README.

## What `parity-check.js` asserts

- **Geometry** — `.todo-app` is 600px wide at `x = 420`, and the header, input, filters, list, footer and toggle-all rectangles match the reference framework
- **Content** — 100 items, the correct first and last labels, 33 checked boxes
- **State** — `Active` → 67, `Completed` → 33, add → 101, delete → 100, and the remaining counter matches
- **New item** — the row added during the exercise is found by its unique text (`Parity check item`), asserted to appear exactly once, then toggled and deleted; `.last()` is never used, so an item prepended or inserted elsewhere cannot be mistaken for it
- **Toggle-all** — the `.todo-toggle-all` / `#toggle-all` control is *required*; the script fails if it is missing or if clicking it does not flip all 100 items completed (0 remaining) and back (100 remaining)
- **Health** — no console errors or uncaught exceptions
- **Titles** — `Todo List - <Framework>`

The script exits non-zero if any framework deviates, so it is safe to use as a CI gate.

## What `pixel-parity.py` asserts

It diffs every framework's screenshot against the React reference for all five
states. The header badge and the footer both embed the framework name, so those
two boxes are masked — but the masks are **not** hardcoded row bands. During
capture, `screenshot.js` records the live `getBoundingClientRect()` of
`.framework-badge` and `.todo-footer` for each state into
`screenshot-report.json`, and the checker masks the **union** of the reference
and candidate boxes. That matters because:

- a short label like "Yew" occupies fewer columns than "React", so masking only
  the candidate's box would leave the reference's extra glyphs exposed; and
- the empty state is shorter, which moves the footer up, so a single fixed row
  range cannot describe it.

Everything else must be byte-identical.

## What `verify-screenshots.js` rejects

- Blank or near-uniform images
- Predominantly white captures with no rendered card
- Captures whose card geometry is wrong
- Captures with more colour variety than a real app screen would produce
- **An incomplete set** — anything other than exactly seven framework directories with exactly five state files each, or an extra file standing in for a required state
- **A stale or partial report** — entries missing a framework, marked failed, with `renderedItems != 100`, no visible empty state, non-empty `errors`, or `labelRects` lacking the badge/footer boxes for any state

## What `build-montage.js` rejects

Before writing each montage it fails if any `<img>` in the grid did not load, or
if any card rendered shorter than 200px — so a broken or blank tile cannot reach
the README unnoticed.

## Layout facts the tooling relies on

In a 1440×1024 viewport the card occupies `x = 420 … 1020`, `y = 114 … 909` for populated states. `optimize-images.py` crops at `(404, 98, 1036, 926)` so the card's rounded corners and shadow survive, and every state uses the same crop box so montage rows line up.
