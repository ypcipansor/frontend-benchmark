# Screenshot & parity tooling

Tools that capture the seven implementations, prove they render identically, and generate the images shown in the [project README](../README.md).

## Setup

Python 3 **and** **Node.js 20+** are required for this tooling. Playwright 1.63
declares `engines.node >= 20` (see `docs/package-lock.json`), so Node 18 is not
supported here - `docs/package.json` also declares the constraint in `engines`
and `npm run check:node` enforces it. (This is a stricter minimum than the
implementations themselves, which build on Node 18+.)

`pixel-parity.py` and `optimize-images.py` import **NumPy** and **Pillow**,
which are pinned to exact versions in `docs/requirements.txt` (a pinned install,
not a hash-verified lock).

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
bash docs/scripts/stop-servers.sh    # stops exactly the processes it started
```

`start-servers.sh` refuses to start if any target port is already in use — a
pre-existing (possibly stale) server can never be mistaken for the one it just
launched, and it never kills a foreign process. Before launching, it quarantines
any state file left by an earlier run (a dead PID or an old `run_token`) so a
stale record can never be read as this run's identity and abort a valid startup;
a state whose process is still alive and verified is left alone. Readiness is only
accepted once a state file carries *this* run's `run_token` and its recorded
process still verifies against live `/proc`; a process this run launched that
exits before recording a valid state is a real failure. If any server fails it
stops everything this run already started. Each server is launched with `setsid`,
and `stop-servers.sh` signals the whole process group, so no orphaned child keeps
holding a port after a stop.

## Pipeline

| Step | Command | Output |
|------|---------|--------|
| 1. Capture | `npm run capture` | `screenshots/<framework>/*.png` (1440×1024) + `screenshots/screenshot-report.json` |
| 2. Verify | `npm run verify` | pass/fail per screenshot (blankness, geometry, completeness, report) |
| 3. Parity | `npm run parity` | pass/fail per framework (DOM, geometry, state) — **live servers** |
| 4. Pixel parity | `npm run pixel` | pass/fail per framework per state (pixel diff vs React) |
| 5. Optimize | `npm run optimize` | card-cropped `images/<framework>/*.jpg` |
| 6. Montage | `npm run montage` | `images/comparison-*.png` |
| — Docs | `npm run check:docs` | documented npm commands name their working directory |
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

The expected title, badge and footer are declared per target in `DEFAULT_TARGETS`
(the content contract is data, not inferred from the target name), so a wrong
label cannot pass by being compared against itself.

- **Geometry** — `.todo-app` is 600px wide at `x = 420`, and the header, input, filters, list, footer and toggle-all rectangles match the reference framework
- **Content, exact** — `document.title` is `Todo List - <Framework>`, the badge and footer match their configured strings, the stats read exactly `67 items remaining`, the first and last rows read exactly `Todo item 1` and `Todo item 100`, and the filter labels are exactly `All`, `Active`, `Completed` (a missing or extra label fails). Counts (100 items, 33 checked) are asserted too
- **Content, vs the reference** — `statsRaw`, `firstItem`, `lastItem` and `filterLabels` must also equal the reference framework's values, so shared drift is caught, not just per-target drift
- **State** — `Active` → 67, `Completed` → 33, add → 101, delete → 100, and the remaining counter matches
- **New item** — the row added during the exercise is found by its unique text (`Parity check item`), asserted to appear exactly once, then toggled and deleted; `.last()` is never used, so an item prepended or inserted elsewhere cannot be mistaken for it
- **Toggle-all** — the `.todo-toggle-all` / `#toggle-all` control is *required*; the script fails if it is missing or if clicking it does not flip all 100 items completed (0 remaining) and back (100 remaining)
- **Health** — no console errors or uncaught exceptions (a genuine favicon failure is the only tolerated one; see below)

The script exits non-zero if any framework deviates, so it is safe to use as a CI gate.

## What `pixel-parity.py` asserts

It diffs every framework's screenshot against the React reference for all five
states. The header badge and the footer both embed the framework name, so those
two boxes are masked — but the masks are **not** hardcoded row bands. During
capture, `screenshot.js` records the live `getBoundingClientRect()` of
`.framework-badge` and `.todo-footer` for each state into
`screenshot-report.json`, and the checker clears each rectangle **individually**
(reference and candidate, plus a 2px pad each). It never clears the *bounding
hull* of the two boxes: a hull spanning two non-overlapping rectangles would also
hide the pixels between them, so a real difference in that gap would slip through
unnoticed. Masking each box on its own keeps that gap under test. Two things make
this necessary:

- a short label like "Yew" occupies fewer columns than "React", so masking only
  the candidate's box would leave the reference's extra glyphs exposed; and
- the empty state is shorter, which moves the footer up, so a single fixed row
  range cannot describe it.

The report must also be a single capture generation: `screenshot.js` stamps each
invocation with a `captureRunId` (plus schema, viewport and DPR) and all seven
entries must share the same id, otherwise the checker refuses to run.

Everything else must be **exactly equal per RGB channel**: a single unit of change
in any channel outside the two masked regions counts as a difference. There is no
colour tolerance, because the contract is byte-identity. Captures are therefore
made deterministic: `screenshot.js` disables CSS animations/transitions for the
screenshot (`animations: 'disabled'`, which fast-forwards a running transition to
its end state) and waits for them to settle first, so a 300ms `border-color`
transition on the focused input can no longer be captured mid-interpolation.

## Console-error policy

`collectPageErrors()` (`lib/console-errors.js`) tolerates exactly one kind of
failure: a request/response/console error whose source **URL** is a favicon
(`/(?:^|\/)favicon(?:\.[a-z0-9]+)?(?:[?#]|$)/`). Console *text* that merely
mentions the word "favicon" is not enough, a bare `404 (Not Found)` with no
favicon URL fails, any non-favicon 404 fails, and `pageerror` is never ignored.

## What `verify-screenshots.js` rejects

- Blank or near-uniform images
- Predominantly white captures with no rendered card
- Captures whose card geometry is wrong
- Captures with more colour variety than a real app screen would produce
- **An incomplete set** — anything other than exactly seven framework directories with exactly five state files each, or an extra file standing in for a required state
- **A stale or partial report** — entries missing a framework, marked failed, with `renderedItems != 100`, no visible empty state, non-empty `errors`, or `labelRects` lacking the badge/footer boxes for any state
- **A mixed capture generation** — full verification requires all seven entries to each carry their *own* non-empty `captureRunId` equal to `__meta.captureRunId` (the meta id is never used as a fallback for an entry that lost its own). A report stamped by an incremental `npm run capture:<fw>` fails, so "35 fresh" can never be claimed from a partial run. A report with no `__meta` freshness block fails too. `npm run verify --framework <name>` checks one framework alone, without claiming the full set, but still rejects that entry if its own id is missing, empty or not a string

## What `build-montage.js` rejects

Before writing each montage it fails if any `<img>` in the grid did not load, or
if any card rendered shorter than 200px — so a broken or blank tile cannot reach
the README unnoticed.

## Layout facts the tooling relies on

In a 1440×1024 viewport the card occupies `x = 420 … 1020`, `y = 114 … 909` for populated states. `optimize-images.py` crops at `(404, 98, 1036, 926)` so the card's rounded corners and shadow survive, and every state uses the same crop box so montage rows line up.
