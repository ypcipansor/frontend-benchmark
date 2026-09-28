# Frontend Framework Benchmark

> A data-driven, head-to-head performance comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — running the **same Todo app** on the **same benchmark harness**.
> Results below are **measured automatically every week** by GitHub Actions and pushed straight into this README.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

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