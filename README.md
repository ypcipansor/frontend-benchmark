# Frontend Framework Benchmark

> A data-driven, head-to-head performance comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — running the **same Todo app** on the **same benchmark harness**.
> Results below are **measured automatically every week** by GitHub Actions and pushed straight into this README.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

---

## Benchmark Results

*Last updated: 2026-09-24*

> ⚠️ **Provenance:** Values below were collected across separate runs and environments and may not be directly comparable. A single, fresh, full 7-framework run in one environment is needed before rankings can be treated as authoritative.

> 📐 **Comparability:** Throughput and memory figures are **not directly comparable across runs** when the runner/host or container resource limits change — a different CPU allocation, cgroup memory limit, or kernel changes the measured req/s and RSS substantially. Large swings versus a previous run (e.g. throughput or RSS dropping by more than half) usually indicate an environment change, not a framework regression. Compare only runs that share the Test Environment below.

> 🔎 **This run vs. the 2026-09-16 run:** Dioxus throughput fell from ~38,050 req/s to ~15,099 req/s and reported RSS fell from ~50 MB to ~5 MB. Every framework now clusters near a ~12k–15.5k req/s ceiling and ~5 MB baseline, which points to a changed runner/container environment (and a load-generator sampling artefact) rather than per-framework regressions. Treat cross-run deltas here as environment noise until a run is repeated on an identical runner.

### Quick Highlights

- 📦 **Smallest gzipped bundle:** blade — **1.32 KB**
- ⚡ **Highest throughput:** Vue — **15,496 req/s** @ 2,000 connections

**Notes:**
- React: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Vue: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Angular: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Leptos: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Yew: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Dioxus: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.
- Blade: Lighthouse audit unavailable (lighthouse is not a function) — see Test Environment and re-run.

- Top throughput (top 3): Vue (15,496 req/s), React (15,104 req/s), Dioxus (15,099 req/s)
- Top Lighthouse (top 3): N/A this run (stale table shown below)
- Smallest bundles (top 3): blade (1.32 KB), vue (26.02 KB), react (68.18 KB)

---

### Lighthouse Performance

_This run (2026-09-24) failed to produce Lighthouse results — the audit could not run. Showing the last valid results from **2026-09-16** instead. These stale values are not from the current run._

| Rank | Framework | Perf | FCP | LCP | TTI |
|-----:|-----------|-----:|----:|----:|----:|
| 1 | vue | **100/100** | 1053ms | 1204ms | 1179ms |
| 2 | leptos | **100/100** | 906ms | 1582ms | 1244ms |
| 3 | angular | **100/100** | 1212ms | 1589ms | 1394ms |
| 4 | yew | **100/100** | 903ms | 1579ms | 1612ms |
| 5 | react | **100/100** | 1203ms | 1354ms | 1203ms |
| 6 | dioxus | **98/100** | 1205ms | 2408ms | 2450ms |
| 7 | blade | **87/100** | 751ms | 751ms | 751ms |

### Bundle Sizes (gzipped)

| Rank | Framework | Bundle (gzipped) | Total Size |
|-----:|-----------|------------------:|-----------:|
| 1 | blade | 1.32 KB | 4.01 KB |
| 2 | vue | 26.02 KB | 68.33 KB |
| 3 | react | 68.18 KB | 220.9 KB |
| 4 | angular | 68.26 KB | 213.06 KB |
| 5 | yew | 77.99 KB | 280.11 KB |
| 6 | leptos | 78.24 KB | 392.55 KB |
| 7 | dioxus | 193.69 KB | 526.42 KB |

### Throughput

| Rank | Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |
|-----:|-----------|---------------:|----:|----:|----:|------:|
| 1 | **Vue** | 15,496 | 93ms | 1779ms | 3696ms | 0 |
| 2 | **React** | 15,104 | 103ms | 1762ms | 3685ms | 0 |
| 3 | **Dioxus** | 15,099 | 95ms | 1788ms | 3696ms | 0 |
| 4 | **Yew** | 14,566 | 93ms | 1854ms | 3696ms | 0 |
| 5 | **Leptos** | 12,871 | 97ms | 1872ms | 3681ms | 0 |
| 6 | **Angular** | 12,153 | 99ms | 1872ms | 3699ms | 0 |
| 7 | **Blade** | 316 | 2000ms | 2016ms | 7776ms | 3,700 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | vue | 15,496 | 2,000 | 93ms | 1779ms | 3696ms | 0 | 0 |
| 2 | react | 15,104 | 2,000 | 103ms | 1762ms | 3685ms | 0 | 0 |
| 3 | dioxus | 15,099 | 2,000 | 95ms | 1788ms | 3696ms | 0 | 0 |
| 4 | yew | 14,566 | 2,000 | 93ms | 1854ms | 3696ms | 0 | 0 |
| 5 | leptos | 12,871 | 2,000 | 97ms | 1872ms | 3681ms | 0 | 0 |
| 6 | angular | 12,153 | 2,000 | 99ms | 1872ms | 3699ms | 0 | 0 |
| 7 | blade | 316 | 2,000 | 2000ms | 2016ms | 7776ms | 3,700 | 0 |

### Runtime Resource Usage

The first table samples an **idle container** (no traffic) for 30s. It is useful only for baseline/startup footprint — it is *not* representative of CPU or memory under load.

**Idle container sampling (30s, no load)**

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| react | 0.00% / 0.00% | 4.97 MB / 4.98 MB |
| vue | 0.00% / 0.00% | 4.69 MB / 4.82 MB |
| angular | 0.00% / 0.00% | 4.80 MB / 5.35 MB |
| leptos | 0.00% / 0.00% | 5.05 MB / 5.41 MB |
| yew | 0.00% / 0.00% | 4.70 MB / 5.03 MB |
| dioxus | 0.00% / 0.00% | 4.84 MB / 5.19 MB |
| blade | 0.01% / 0.01% | 18.78 MB / 19.02 MB |

**Under load (peak stress sample, 2,000 connections)**

| Framework | Concurrency | CPU (avg / max) | Memory (avg / max) |
|-----------|------------:|----------------:|-------------------:|
| react | 2,000 | 0.17% / 6.58% | 6.06 MB / 14.39 MB |
| vue | 2,000 | 0.31% / 8.33% | 6.31 MB / 14.23 MB |
| angular | 2,000 | 0.09% / 5.60% | 6.25 MB / 14.23 MB |
| leptos | 2,000 | 0.17% / 7.12% | 6.32 MB / 14.43 MB |
| yew | 2,000 | 0.16% / 7.94% | 6.32 MB / 14.25 MB |
| dioxus | 2,000 | 0.21% / 6.70% | 6.20 MB / 14.25 MB |
| blade | 2,000 | 1.18% / 80.78% | 92.36 MB / 185.40 MB |

### Test Environment

| Item | Value |
|------|-------|
| Runner | ubuntu-latest (ubuntu-24.04.5 LTS), GitHub-hosted |
| CPU | 4 vCPU |
| Memory | 15.61 GiB |
| Node.js | 24 (v24.21.0) |
| Browser (Lighthouse) | Chromium 153.0.8010.36 |
| Docker Engine | 28.0.4 (containerd 2.3.5, runc 1.5.1) |
| Load test tool | autocannon 8.x (pipelining 1) |
| Workflow run | https://github.com/ypcipansor/frontend-benchmark/actions/runs/35998087756 |

> Raw results (`benchmarks/results/*.json`) are gitignored; they are uploaded as a 90-day workflow artifact. See the workflow run linked above.

---

### Testing Methodology

All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.

Throughput and latency are measured by `autocannon` (pipelining 1) at 100/500/1,000/2,000 concurrent connections for 30s per level. CPU/memory are sampled with `docker stats` both while idle and during the peak stress level, as labelled above.

For detailed per-framework analysis and complete methodology, see [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md).


## Frameworks Included

| Category | Framework | Type | Runs on |
|----------|-----------|------|---------|
| ⚛️ JavaScript / TypeScript | **React** | CSR | Node.js |
| 🐇 JavaScript / TypeScript | **Vue.js** | CSR | Node.js |
| 🅰️ JavaScript / TypeScript | **Angular** | CSR | Node.js |
| 🦀 Rust / WASM | **Leptos** | CSR (WASM) | Trunk |
| 🦀 Rust / WASM | **Yew** | CSR (WASM) | Trunk |
| 🦀 Rust / WASM | **Dioxus** | CSR (WASM) | Trunk |
| 🐘 Server-side | **Blade.php** | SSR | PHP + Laravel |

## What This Benchmark Measures

Every framework is put through the **same automated suite** inside isolated Docker containers:

- 🚀 **Lighthouse performance** — FCP, LCP, TTI (simulated throttled network)
- ⚡ **Throughput** — peak requests/sec plus **p50 / p90 / p99 latency** under load
- 🧨 **Stress test** — sustained load up to 2,000 concurrent connections
- 📦 **Bundle size** — raw & gzipped JS / CSS / WASM / HTML
- 💻 **CPU usage** — average & peak during runtime
- 💾 **Memory usage** — average & peak during runtime
- ⏱️ **Build time**

> Each value is produced by the same code path for every framework (one Todo app, one Docker-based harness), so numbers are directly comparable. See [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) and [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md) for full methodology.

## Getting Started

### Prerequisites

- Node.js 18+ (JS frameworks)
- Rust 1.70+ (Rust/WASM frameworks)
- PHP 8.1+ & Composer (Blade)
- Docker (recommended for reproducible benchmarks)
- Chrome / Chromium (for Lighthouse audits)

### Running an Implementation

Each implementation lives in `implementations/<framework>` with its own README.

```bash
# React / Vue / Angular
cd implementations/react && npm install && npm run dev

# Leptos / Yew (Rust)
cd implementations/leptos && trunk serve

# Dioxus (Rust)
cd implementations/dioxus && dx serve

# Blade (PHP)
cd implementations/blade && composer install && php artisan serve
```

### Running the Benchmarks

```bash
cd benchmarks/scripts
npm install

# Quick benchmark (JS frameworks only, ~30 min)
npm run benchmark:docker

# Full benchmark (all 7 frameworks + CPU/RAM + Lighthouse, ~2 hours)
npm run benchmark:docker:full

# Stress / latency percentiles
npm run benchmark:stress

# Update this README with the fresh results
npm run update-readme
```

Docker-based benchmarking is recommended for consistent, isolated results. See [DOCKER.md](DOCKER.md) and [QUICKSTART_DOCKER.md](QUICKSTART_DOCKER.md).

## Project Structure

```
frontend-benchmark/
├── implementations/      # React, Vue, Angular, Leptos, Yew, Dioxus, Blade
├── benchmarks/
│   ├── scripts/          # Benchmark automation (Lighthouse, stress, bundle, README updater)
│   ├── results/          # Raw results JSON (gitignored; kept as a 90-day CI artifact)
│   └── tools/            # Custom measurement tools
├── shared/styles/        # Common CSS
├── .github/workflows/    # CI + weekly Comprehensive Benchmark
└── BENCHMARK_SPEC.md     # Implementation + measurement specification
```

## Automated Refreshing

The **Comprehensive Benchmark** workflow runs **every Monday (00:00 UTC)** (and can be triggered manually). It:

1. Builds & serves all 7 frameworks in Docker
2. Runs Lighthouse, CPU/RAM sampling, and bundle-size analysis
3. Runs stress tests (up to 2,000 concurrent connections)
4. Merges the measurements and regenerates this README's benchmark section
5. Opens a PR that updates **only `README.md`** (raw JSON stays gitignored)

The raw JSON under `benchmarks/results/` is **not persisted in the repository**. Each run regenerates `comprehensive-benchmark-results.json` and uploads it as a workflow artifact that is retained for **90 days**, after which it is removed. The tables above are the durable record — re-run the full benchmark to refresh them.

## Contributing

Contributions are welcome! Please read the [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) for implementation guidelines and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.