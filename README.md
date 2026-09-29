# Frontend Framework Benchmark

> A data-driven, head-to-head comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — each running the **exact same Todo app** on the **same benchmark harness**.
>
> The point of the project is **fairness**: every implementation renders the identical UI, produces identical state, and is measured by the same code path. Visual parity is not assumed — it is asserted pixel by pixel and fails the build when it regresses.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

---

## At a glance

Seven runtimes, one screen. Each tile below is a live capture from that framework's own server — React (JavaScript), Vue (JavaScript), Angular (TypeScript), Leptos / Yew / Dioxus (Rust compiled to WebAssembly), and Blade.php (server-rendered PHP).

![All seven frameworks rendering the same Todo app](docs/images/comparison-all.png)

*Default view: 100 todos, 67 remaining. The only intentional difference is the framework name in the header badge and the footer.*


## The shared application

All seven implementations build the same Todo app from the same specification:

| Behaviour | Detail |
|-----------|--------|
| Initial data | **100 todos**: `Todo item 1` … `Todo item 100` |
| Completion rule | Every 3rd item is completed — items **3, 6, 9, …, 99** (**33 completed**, **67 remaining**) |
| Filters | **All**, **Active**, **Completed** |
| Interactions | Add, toggle, toggle-all, delete |
| Styling | One shared stylesheet, `shared/styles/todo.css` |
| Page title | Uniform across frameworks |

### Every view captured

The app is a single page with five distinct rendered views. **All five are captured for all seven frameworks — 35 screenshots in total — and every one is shown on this page.**

| View | What it shows | Items rendered |
|------|---------------|---------------:|
| `all` | Default view, no filter | 100 |
| `active` | `Active` filter applied | 67 |
| `completed` | `Completed` filter applied | 33 |
| `input-filled` | Text typed into the input | 100 |
| `empty-state` | Every todo deleted, empty-state panel visible | 0 |

## Visual parity — every framework, every state

This is the heart of the benchmark: the same screen, rendered by seven different runtimes. Every montage below was assembled from live captures and then checked automatically (see [Verifying visual parity](#verifying-visual-parity)): live DOM/geometry/state parity, pixel equality of the saved captures, and a clean console.

### All — 100 todos, 67 remaining

![All state comparison](docs/images/comparison-all.png)

### Active filter — 67 items

![Active filter comparison](docs/images/comparison-active.png)

### Completed filter — 33 items

![Completed filter comparison](docs/images/comparison-completed.png)

### Input with text entered

![Input-filled comparison](docs/images/comparison-input-filled.png)

### Empty state — after deleting every todo

![Empty state comparison](docs/images/comparison-empty-state.png)

---

## Per-framework screenshots

The complete set of 35 captures, framework by framework. Full-resolution PNGs (1440×1024) live in [`docs/screenshots/`](docs/screenshots/); the images below are the optimized crops from [`docs/images/`](docs/images/).

### ⚛️ React 19 (JavaScript)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![React all](docs/images/react/all.jpg) | ![React active](docs/images/react/active.jpg) | ![React completed](docs/images/react/completed.jpg) | ![React input](docs/images/react/input-filled.jpg) | ![React empty](docs/images/react/empty-state.jpg) |

### 🟩 Vue.js 3 (JavaScript)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Vue all](docs/images/vue/all.jpg) | ![Vue active](docs/images/vue/active.jpg) | ![Vue completed](docs/images/vue/completed.jpg) | ![Vue input](docs/images/vue/input-filled.jpg) | ![Vue empty](docs/images/vue/empty-state.jpg) |

### 🅰️ Angular 22 (TypeScript)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Angular all](docs/images/angular/all.jpg) | ![Angular active](docs/images/angular/active.jpg) | ![Angular completed](docs/images/angular/completed.jpg) | ![Angular input](docs/images/angular/input-filled.jpg) | ![Angular empty](docs/images/angular/empty-state.jpg) |

### 🦀 Leptos 0.8 (Rust/WASM)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Leptos all](docs/images/leptos/all.jpg) | ![Leptos active](docs/images/leptos/active.jpg) | ![Leptos completed](docs/images/leptos/completed.jpg) | ![Leptos input](docs/images/leptos/input-filled.jpg) | ![Leptos empty](docs/images/leptos/empty-state.jpg) |

### 🦀 Yew 0.23 (Rust/WASM)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Yew all](docs/images/yew/all.jpg) | ![Yew active](docs/images/yew/active.jpg) | ![Yew completed](docs/images/yew/completed.jpg) | ![Yew input](docs/images/yew/input-filled.jpg) | ![Yew empty](docs/images/yew/empty-state.jpg) |

### 🦀 Dioxus 0.7 (Rust/WASM)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Dioxus all](docs/images/dioxus/all.jpg) | ![Dioxus active](docs/images/dioxus/active.jpg) | ![Dioxus completed](docs/images/dioxus/completed.jpg) | ![Dioxus input](docs/images/dioxus/input-filled.jpg) | ![Dioxus empty](docs/images/dioxus/empty-state.jpg) |

### 🐘 Blade.php (PHP)

| All | Active | Completed | Input | Empty |
|:---:|:---:|:---:|:---:|:---:|
| ![Blade all](docs/images/blade/all.jpg) | ![Blade active](docs/images/blade/active.jpg) | ![Blade completed](docs/images/blade/completed.jpg) | ![Blade input](docs/images/blade/input-filled.jpg) | ![Blade empty](docs/images/blade/empty-state.jpg) |

---

## Benchmark Results

*Last updated: 2026-09-28*

> ⚠️ **Provenance:** Values below were collected across separate runs and environments and may not be directly comparable. A single, fresh, full 7-framework run in one environment is needed before rankings can be treated as authoritative.

> 📐 **Comparability:** Throughput and memory figures are **not directly comparable across runs** when the runner/host or container resource limits change — a different CPU allocation, cgroup memory limit, or kernel changes the measured req/s and RSS substantially. Large swings versus a previous run (e.g. throughput or RSS dropping by more than half) usually indicate an environment change, not a framework regression. Compare only runs that share the Test Environment below.

### Quick Highlights

- 🚀 **Top Lighthouse score:** React — **100/100**
- 📦 **Smallest gzipped bundle:** blade — **1.32 KB**
- ⚡ **Highest throughput:** Vue — **33,042 req/s** @ 2,000 connections

- Top throughput (top 3): Vue (33,042 req/s), Leptos (27,581 req/s), Dioxus (27,291 req/s)
- Top Lighthouse (top 3): React (100/100), Vue (100/100), Angular (100/100)
- Smallest bundles (top 3): blade (1.32 KB), vue (26.02 KB), react (68.18 KB)

---

### Lighthouse Performance

| Rank | Framework | Perf | FCP | LCP | TTI |
|-----:|-----------|-----:|----:|----:|----:|
| 1 | react | **100/100** | 1352ms | 1352ms | 1352ms |
| 2 | vue | **100/100** | 1051ms | 1261ms | 1321ms |
| 3 | angular | **100/100** | 1352ms | 1741ms | 1763ms |
| 4 | leptos | **100/100** | 902ms | 1502ms | 1535ms |
| 5 | yew | **100/100** | 902ms | 1502ms | 1540ms |
| 6 | blade | **100/100** | 752ms | 902ms | 902ms |
| 7 | dioxus | **98/100** | 1201ms | 2401ms | 2501ms |

### Bundle Sizes (gzipped)

| Rank | Framework | Bundle (gzipped) | Total Size |
|-----:|-----------|------------------:|-----------:|
| 1 | blade | 1.32 KB | 4.01 KB |
| 2 | vue | 26.02 KB | 68.33 KB |
| 3 | react | 68.18 KB | 220.9 KB |
| 4 | angular | 68.26 KB | 213.06 KB |
| 5 | yew | 77.88 KB | 279.65 KB |
| 6 | leptos | 77.94 KB | 391.93 KB |
| 7 | dioxus | 193.45 KB | 526.12 KB |

### Throughput

| Rank | Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |
|-----:|-----------|---------------:|----:|----:|----:|------:|
| 1 | **Vue** | 33,042 | 154ms | 212ms | 339ms | 0 |
| 2 | **Leptos** | 27,581 | 145ms | 196ms | 340ms | 0 |
| 3 | **Dioxus** | 27,291 | 153ms | 199ms | 331ms | 0 |
| 4 | **Yew** | 27,153 | 149ms | 204ms | 326ms | 0 |
| 5 | **Angular** | 21,813 | 154ms | 231ms | 326ms | 0 |
| 6 | **React** | 17,005 | 152ms | 230ms | 331ms | 0 |
| 7 | **Blade** | 2,256 | 142ms | 340ms | 522ms | 0 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | vue | 33,042 | 2,000 | 154ms | 212ms | 339ms | 0 | 0 |
| 2 | leptos | 27,581 | 2,000 | 145ms | 196ms | 340ms | 0 | 0 |
| 3 | dioxus | 27,291 | 2,000 | 153ms | 199ms | 331ms | 0 | 0 |
| 4 | yew | 27,153 | 2,000 | 149ms | 204ms | 326ms | 0 | 0 |
| 5 | angular | 21,813 | 2,000 | 154ms | 231ms | 326ms | 0 | 0 |
| 6 | react | 17,005 | 2,000 | 152ms | 230ms | 331ms | 0 | 0 |
| 7 | blade | 2,256 | 100 | 142ms | 340ms | 522ms | 0 | 0 |

### Runtime Resource Usage

The first table is a **pre-audit idle sample**: the container is up with no traffic, captured for 30s *before* the Lighthouse audit runs. It measures baseline/startup footprint only — it is *not* representative of CPU or memory under load. (A separate under-load table is drawn from the stress-test run below.)

**Idle container sampling (30s, no load, pre-Lighthouse)**

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| react | 0.00% / 0.00% | 4.93 MB / 5.00 MB |
| vue | 0.00% / 0.00% | 4.75 MB / 4.91 MB |
| angular | 0.00% / 0.00% | 4.69 MB / 4.90 MB |
| leptos | 0.00% / 0.00% | 4.72 MB / 4.87 MB |
| yew | 0.00% / 0.00% | 4.65 MB / 4.65 MB |
| dioxus | 0.00% / 0.00% | 4.68 MB / 4.89 MB |
| blade | 0.00% / 0.01% | 19.25 MB / 19.25 MB |

**Under load (highest-throughput stress sample per framework)**

Each row is the framework's own peak sample; concurrency differs where a framework peaked below the maximum, so compare across rows with care.

| Framework | Concurrency | CPU (avg / max) | Memory (avg / max) |
|-----------|------------:|----------------:|-------------------:|
| react | 2,000 | 127.16% / 139.57% | 17.41 MB / 21.22 MB |
| vue | 2,000 | 125.22% / 141.60% | 14.74 MB / 15.19 MB |
| angular | 2,000 | 126.07% / 143.41% | 17.71 MB / 20.52 MB |
| leptos | 2,000 | 132.68% / 150.21% | 15.53 MB / 17.99 MB |
| yew | 2,000 | 127.43% / 143.89% | 16.81 MB / 20.26 MB |
| dioxus | 2,000 | 126.45% / 137.90% | 16.12 MB / 21.07 MB |
| blade | 100 | 264.55% / 270.68% | 125.20 MB / 164.30 MB |

### Test Environment

| Item | Value |
|------|-------|
| Runner | ubuntu-latest (GitHub-hosted) |
| CPU | 4 vCPU |
| Memory | 15.61 GiB |
| Node.js | v24.21.0 |
| Browser (Lighthouse) | Chromium 153.0.8010.47 snap |
| Docker Engine | 28.0.4 |
| Load test tool | autocannon 8.0.0 (pipelining 1) |
| Workflow run | https://github.com/ypcipansor/frontend-benchmark/actions/runs/36360569691 |

> Raw results (`benchmarks/results/*.json`) are gitignored; they are uploaded as a 90-day workflow artifact. See the workflow run linked above.

---

### Testing Methodology

All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.

Throughput and latency are measured by `autocannon` (pipelining 1) at 100/500/1,000/2,000 concurrent connections for 30s per level. CPU/memory are sampled with `docker stats` both while idle and during the peak stress level, as labelled above.

For detailed per-framework analysis and complete methodology, see [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md).



## Verifying visual parity

The screenshots above are not hand-picked — they are produced and validated by tooling in [`docs/`](docs/). Nothing on this page is committed until the checks pass.

```bash
cd docs
npm run check:node          # this tooling needs Node.js 22.22.3+ (Angular CLI 22; Playwright's floor is lower)
npm run check:node-engines  # every Node.js pin in .github/workflows/ satisfies that floor
npm ci                      # Playwright + pngjs, from the committed lockfile
npx playwright install chromium
python3 -m pip install -r requirements.txt   # NumPy + Pillow

# On a fresh checkout the implementations must be set up too: start-servers.sh
# launches each dev server, so the JS dependencies, the built Rust dists and
# Blade's Composer packages have to exist first (see Prerequisites for the
# Node.js / Rust / PHP toolchains).
(cd ../implementations/react   && npm install)
(cd ../implementations/vue     && npm install)
(cd ../implementations/angular && npm install)
for fw in leptos yew dioxus; do (cd "../implementations/$fw" && trunk build --release); done
(cd ../implementations/blade   && composer install)

bash scripts/start-servers.sh   # all seven dev servers on their fixed ports
npm run capture             # 1. capture all 35 screenshots (fails non-zero on any error)
npm run verify              # 2. reject blank / white / mis-sized / incomplete captures
npm run parity              # 3. assert identical DOM, geometry and interaction state (live)
npm run pixel               # 4. diff every state against the React reference
npm run optimize            # 5. card-cropped JPEGs for this README
npm run montage             # 6. side-by-side comparison montages
npm run check:docs          # 7. documented npm commands name their working directory
npm run check:css           # 8. shared/styles/todo.css has not drifted in any copy
npm test                    # 10. regression suite for the tooling's failure modes
bash scripts/stop-servers.sh
```

`parity` and `pixel` are separate gates: `parity` drives the live servers and
compares DOM, geometry and state; `pixel` compares the saved captures. The
pipeline runs `capture → verify → parity → pixel → optimize → montage`.

`shared/styles/todo.css` is the single stylesheet: Leptos, Yew and Dioxus link it
directly, and React, Vue, Angular and Blade keep a copy that `check:css` proves is
byte-identical (run `npm run sync:css` after editing the source). The `pixel`
checker validates each mask rectangle from the report before it becomes a NumPy
slice — a non-finite coordinate, a non-positive width/height, or a rectangle that
does not overlap the image fails instead of silently masking the wrong pixels.

A full `capture` stamps a single `captureRunId` on all seven entries, and `verify`
refuses to accept a set whose entries come from different runs — so "35 screenshots
fresh" can only be claimed from one full run, never after re-capturing one
framework. `npm run verify --framework <name>` checks a single framework in
isolation. `start-servers.sh` records each server's PID, process-group id,
`/proc` starttime, boot id and command line in an atomic state file; `stop-servers.sh`
signals a PID only after proving that identity still matches, so a stale record or
a recycled PID can never kill an unrelated process — and the whole process group is
still torn down, leaving no orphaned `vite`/`ng` child behind. A state file left by
an earlier run (dead PID or old run token) is quarantined before launch, so it can
never abort a valid startup; readiness is only accepted once the state carries the
current run's token and verifies against live `/proc`.

The code guarantees fairness in five independent ways:

| Check | What it enforces |
|-------|------------------|
| **Geometry** | The card is **600px wide at x=420** in all seven frameworks; header, input, filters, list and footer rectangles match to the pixel |
| **Content** | The same 100 items, the same first/last labels, the same 33 checked boxes |
| **State** | `Active` → 67 items, `Completed` → 33 items, add → 101, delete → 100, and the "items remaining" counter matches |
| **Pixels** | Every state of every framework is diffed against the reference capture; differences are only tolerated inside the two framework-name regions, and the masks come from live element geometry — not hardcoded coordinates |
| **Health** | No console errors or uncaught exceptions, and no blank or near-uniform screenshots |

Each script exits non-zero on any deviation, so the whole pipeline is safe to use as a CI gate.

### Parity fixes applied

Making seven runtimes agree required real corrections — every one of them verified by the checks above:

1. **Completion index.** The JS frameworks started at a 0-based index (`i % 3 === 0`), completing item 1, while the Rust and PHP implementations used a 1-based index, completing item 3. The JS implementations were changed to `(i + 1) % 3 === 0`, so every framework now completes items 3, 6, …, 99 and reports **67 remaining**.
2. **Mount-point layout.** React (`#root`), Vue (`#app`), Angular (`app-root`) and Dioxus (`#main`) render into a wrapper element, while Blade writes `.todo-app` straight into `<body>`. The wrappers made the card collapse to **389px** and be centred differently. Neutralizing them with `display: contents` in `shared/styles/todo.css` makes the card the single flex child everywhere.
3. **Blade markup.** Blade emitted a `<div>` inside `<ul>`; it now renders `<li class="todo-item">` like every other framework, and the client-side `render()` targets the same container.
4. **Titles.** Page titles were normalized to `Todo List - <Framework>`.
5. **Subpixel stats shaping.** Vue, Angular and Dioxus merged the remaining-count digits and suffix into a single text node, while React, Leptos, Yew and Blade emitted the digits as their own node. The different text-node segmentation changed subpixel glyph shaping by a fraction of a pixel — invisible to the eye, but a real pixel diff. All seven now wrap the count in its own `<span>`, so `.todo-stats` is byte-identical everywhere.

## Getting started

### Prerequisites

| Tool | Needed for |
|------|-----------|
| Node.js 18+ | React, Vue (Angular needs the newer floor below) |
| Node.js 22.22.3+ (or 24.15+, or 26+) | `docs/` screenshot & parity tooling and the Angular 22 dev server (`@angular/cli` 22; enforced by `npm run check:node`) |
| Rust 1.70+ and `trunk` | Leptos, Yew, Dioxus |
| `wasm32-unknown-unknown` target | Leptos, Yew, Dioxus |
| PHP 8.2+ and Composer | Blade.php |
| Docker (optional) | Reproducible containerised benchmarks |
| Chrome / Chromium | Lighthouse audits and the screenshot tooling |

### Run an implementation

Each framework lives in `implementations/<framework>/` with its own README.

Run each command from the **repository root in its own terminal** — the
subshell `(cd …)` leaves your shell where it was, so the commands can be run one
after another (and several dev servers at once) without the working directory
drifting:

```bash
# JavaScript / TypeScript
(cd implementations/react   && npm install && npm run dev)     # http://localhost:5173
(cd implementations/vue     && npm install && npm run dev)
(cd implementations/angular && npm install && npm start)

# Rust / WebAssembly (needs: cargo install trunk && rustup target add wasm32-unknown-unknown)
(cd implementations/leptos && trunk serve)
(cd implementations/yew    && trunk serve)
(cd implementations/dioxus && trunk serve)

# PHP
(cd implementations/blade  && composer install && php -S 127.0.0.1:8000 -t .)
```

### Run the benchmarks

```bash
cd benchmarks/scripts
npm install

npm run benchmark:docker        # quick pass: JS frameworks only (~30 min)
npm run benchmark:docker:full   # all 7 frameworks + CPU/RAM + Lighthouse (~2 hours)
npm run benchmark:stress        # sustained load, latency percentiles
npm run update-readme           # write fresh results into the Benchmark Results section
```

Docker is recommended for consistent, isolated numbers — see [DOCKER.md](DOCKER.md) and [QUICKSTART_DOCKER.md](QUICKSTART_DOCKER.md).

## What this benchmark measures

Each framework is driven through the same automated suite, ideally inside isolated Docker containers:

- 🚀 **Lighthouse performance** — FCP, LCP, TTI under simulated throttling
- ⚡ **Throughput** — peak requests/sec with p50 / p90 / p99 latency
- 🧨 **Stress test** — sustained load up to 2,000 concurrent connections
- 📦 **Bundle size** — raw and gzipped JS / CSS / WASM / HTML
- 💻 **CPU usage** — average and peak during runtime
- 💾 **Memory usage** — average and peak during runtime
- ⏱️ **Build time**

Full methodology is in [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) and [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md).

## Project structure

```
frontend-benchmark/
├── implementations/          # React, Vue, Angular, Leptos, Yew, Dioxus, Blade
├── benchmarks/
│   ├── scripts/              # Lighthouse, stress, bundle-size and README automation
│   ├── results/              # Raw result JSON (gitignored; kept as a CI artifact)
│   └── tools/                # Custom measurement tools
├── shared/styles/todo.css    # The single shared stylesheet
├── docs/
│   ├── screenshot.js         # Playwright capture (all five UI states)
│   ├── parity-check.js       # Cross-framework DOM/geometry/state assertions
│   ├── verify-screenshots.js # Rejects blank, white or mis-sized captures
│   ├── pixel-parity.py       # Pixel diff vs the reference, masking name regions
│   ├── optimize-images.py    # Card-cropped JPEGs for this README
│   ├── build-montage.js      # Side-by-side comparison montages
│   ├── screenshots/          # Full-resolution PNGs (35 files)
│   └── images/               # Optimized images used on this page
├── .github/workflows/        # CI plus the weekly comprehensive benchmark
└── BENCHMARK_SPEC.md         # Implementation and measurement specification
```

## Automated refreshing

The **Comprehensive Benchmark** workflow runs **every Monday at 00:00 UTC** and can be triggered manually. It:

1. Builds and serves all 7 frameworks in Docker
2. Runs Lighthouse, CPU/RAM sampling and bundle-size analysis
3. Runs stress tests up to 2,000 concurrent connections
4. Merges the measurements and regenerates the **Benchmark Results** section of this README
5. Opens a PR that updates only `README.md`

Raw JSON under `benchmarks/results/` is **not committed**. Each run regenerates `comprehensive-benchmark-results.json`, uploads it as a workflow artifact retained for **90 days**, and the tables above remain the durable record. Re-run the full benchmark to refresh them.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/README.md](docs/README.md) | The screenshot & parity tooling, end to end |
| [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) | The Todo app specification and every metric definition |
| [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md) | End-to-end guide to running the full suite |
| [COMPREHENSIVE_BENCHMARK_README.md](COMPREHENSIVE_BENCHMARK_README.md) | Quick reference for the comprehensive runner |
| [DOCKER.md](DOCKER.md) | Containerised benchmarking |
| [QUICKSTART_DOCKER.md](QUICKSTART_DOCKER.md) | Docker quick start |
| [CI_CD_GUIDE.md](CI_CD_GUIDE.md) | GitHub Actions workflows |
| [GITHUB_ACTIONS_SUMMARY.md](GITHUB_ACTIONS_SUMMARY.md) | What the CI work covered |
| [RESULTS_TEMPLATE.md](RESULTS_TEMPLATE.md) | Shape of the benchmark result JSON |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add or improve an implementation |

## Contributing

Contributions are welcome. Read [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) for implementation guidelines and [CONTRIBUTING.md](CONTRIBUTING.md) for the process. Any new implementation must pass `docs/parity-check.js`, `docs/pixel-parity.py` and `docs/verify-screenshots.js` before it is merged.

## License

MIT — see [LICENSE](LICENSE).
