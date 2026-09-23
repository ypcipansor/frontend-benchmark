# Agent notes

Seven implementations of one Todo app, compared for **fairness**: identical UI,
identical state, measured by the same code path. All live in `implementations/`.

## Running the dev servers

Each implementation must listen on its fixed port, otherwise the screenshot and
parity tooling cannot reach it.

| Framework | Port | Command |
|-----------|-----:|---------|
| React | 4001 | `cd implementations/react && npm run dev -- --port 4001 --host 127.0.0.1 --strictPort` |
| Vue.js | 4002 | `cd implementations/vue && npm run dev -- --port 4002 --host 127.0.0.1 --strictPort` |
| Angular | 4003 | `cd implementations/angular && npm start -- --port 4003 --host 127.0.0.1` |
| Leptos | 4004 | `trunk build` then serve `implementations/leptos/dist` |
| Yew | 4005 | `trunk build` then serve `implementations/yew/dist` |
| Dioxus | 4006 | `trunk build` then serve `implementations/dioxus/dist` |
| Blade.php | 4007 | `cd implementations/blade && php -S 127.0.0.1:4007 -t .` |

Blade needs `composer install` first. The Rust dists reference the stylesheet as
`../../shared/styles/todo.css`, so when serving `dist/` directly, place the repo's
`shared/` next to each dist (or serve a tree that keeps the relative path valid).

## Verifying changes

The `docs/` tooling needs **Node.js 20+** (Playwright 1.63 declares
`engines.node >= 20`); `docs/package.json` has the same `engines` field and
`npm run check:node` enforces it. The implementations themselves build on Node
18+.

```bash
cd docs
npm run check:node && npm ci && npx playwright install chromium   # exact Node tree from the lockfile
python3 -m pip install -r requirements.txt    # NumPy + Pillow

bash scripts/start-servers.sh   # start all seven servers on their fixed ports
npm run capture   # 35 screenshots -> docs/screenshots/   (fails non-zero on any console/network error)
npm run verify    # rejects blank / white / mis-sized / incomplete captures
npm run parity    # DOM, geometry, content and state equality  (needs live servers)
npm run pixel     # pixel diff vs the React reference          (works offline)
npm run optimize  # card-cropped docs/images/*/*.jpg  (works from any cwd)
npm run montage   # docs/images/comparison-*.png
npm run check:docs # documented npm commands name their working directory
npm test          # regression tests for the tooling's failure modes
bash scripts/stop-servers.sh
```

A capture that fails deletes the affected framework's screenshots and exits
non-zero, so a stale image can never be mistaken for a fresh one. `npm run pixel`
reads the saved screenshots and `screenshot-report.json`, so it works without any
server running. `npm run parity` and `npm run capture` need all seven servers up.

`npm run capture` is a full generation: it stamps every entry with one
`captureRunId` and writes `__meta`. `npm run verify` (full mode) requires every
framework entry to carry its **own** non-empty `captureRunId` equal to
`__meta.captureRunId` — the meta id is never used as a fallback for an entry that
lost its own, so a stripped id cannot pass by inheriting the meta's. An
incremental `npm run capture:react` — which stamps a new id for one framework —
leaves the set unfit for a full verification rather than silently mixing
generations. `npm run verify --framework <name>` gives a scoped check for that one
framework, but still rejects it if its own id is missing, empty or not a string.

`npm run check:docs` (`docs/check-doc-commands.js`) proves every documented
`update-readme` invocation names the working directory it needs
(`benchmarks/scripts`), so a published command can never drift away from the
package.json that defines it.

## Gotchas

- **The Dioxus dist must be a release build.** A debug `trunk build` leaves a
  `/_dioxus` devtools WebSocket that 404s when the `dist/` is served statically,
  which the capture step now reports as a failure. Build with
  `trunk build --release`.

- **Pixel parity is strict.** The only tolerated differences are the header badge
  and the footer, and even those masks come from live element geometry recorded
  during capture — not hardcoded rows. Each rectangle is cleared on its own (never
  the bounding hull of the two), so a difference in the gap between them still
  fails. Anything else must be byte-identical.
- **Server start/stop is identity-checked.** `start-servers.sh` launches each
  server through `scripts/lib/serve.sh` under `setsid`; the wrapper writes the
  atomic `docs/logs/<framework>.state` (PID, process-group id, `/proc/<pid>/stat`
  starttime, boot id, run token, command line) from *inside* the new session and
  then `exec`s the server. Writing it in the child matters: reading `/proc` in the
  parent raced and sometimes recorded the launcher's group instead of the
  server's, so `stop-servers.sh` refused to signal a live server. `stop-servers.sh`
  signals a PID only after proving it still matches that identity and still leads
  the group; otherwise it quarantines the record and warns. The stored command
  line is diagnostic only — npm and `setsid` rewrite their own titles. A recycled
  PID or a stale legacy `.pid` file is never trusted, so a stale record cannot
  kill a foreign process. Before launching, a state file whose process is gone (or
  whose identity no longer verifies) is quarantined, and readiness is only accepted
  once the state carries the current run's `run_token` and verifies against live
  `/proc` — a stale record can never abort a valid startup, and a process this run
  launched that dies before recording a valid state still fails. Unknown `--only`
  and malformed numeric flags exit 2 before anything starts.
- **Never hardcode the card height.** Text metrics differ per platform: the same
  capture is 792px tall on the Ubuntu CI runner and 796px on this sandbox. The
  verifier therefore checks left/width exactly and, for height, requires the seven
  frameworks to agree with each other within a few pixels plus a generous absolute
  band — a per-framework divergence still fails without pinning one OS metric.
- **Keep `.todo-stats` segmented the same way everywhere.** Wrap the remaining
  count in its own `<span>`, and keep the `" items remaining"` suffix as a single
  text node after it. Merging the digits and the suffix into one text node, or
  splitting the suffix into several (`" "`, `"items"`, `" remaining"`), changes
  subpixel glyph shaping and shows up as a pixel diff even though the text reads
  the same. The difference is invisible while the count is two digits (`67`) but
  appears as soon as it is one (`0`, the empty state), so it only bites after a
  true empty-state capture.
- **Every mount point must stay `display: contents`.** `#root`, `#app`, `#main`
  and `app-root` are neutralised in `shared/styles/todo.css` so the card is the
  only flex child of `<body>`. Overriding this collapses the card to 389px.
- **Completion is 1-based.** Use `(i + 1) % 3 === 0` so items 3, 6, …, 99 are
  completed (33 completed, 67 remaining).
- **Documented commands must be reproducible.** Every documented `update-readme`
  invocation in any Markdown file must name `benchmarks/scripts` as its working
  directory (an inline `cd benchmarks/scripts && npm run update-readme`, or a
  fenced block that has already `cd`'d there). `npm run check:docs` enforces this
  and also proves the script exists in `benchmarks/scripts/package.json`.
- **The Rust dists are build output.** `dist/` is gitignored; rebuild with
  `trunk build` after changing a Rust implementation. Blade must render
  `<li class="todo-item">`, never a `<div>` inside `<ul>`.
- `docs/` has its own `package.json`; run its scripts from inside `docs/`.

## Screenshots in docs

`README.md` shows all 5 states × 7 frameworks (35 crops) plus 5 montages. Keep it
that way — a state is considered "captured" only if it appears there. Regenerate
with `npm run optimize && npm run montage` after recapturing.
