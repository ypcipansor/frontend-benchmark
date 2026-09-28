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
- ⚡ **Highest throughput:** Dioxus — **31,358 req/s** @ 2,000 connections

- Top throughput (top 3): Dioxus (31,358 req/s), Leptos (29,493 req/s), Yew (26,407 req/s)
- Top Lighthouse (top 3): React (100/100), Vue (100/100), Leptos (100/100)
- Smallest bundles (top 3): blade (1.32 KB), vue (26.02 KB), react (68.18 KB)

---

### Lighthouse Performance

| Rank | Framework | Perf | FCP | LCP | TTI |
|-----:|-----------|-----:|----:|----:|----:|
| 1 | react | **100/100** | 1352ms | 1352ms | 1352ms |
| 2 | vue | **100/100** | 1051ms | 1266ms | 1331ms |
| 3 | leptos | **100/100** | 947ms | 1502ms | 1542ms |
| 4 | yew | **100/100** | 902ms | 1502ms | 1543ms |
| 5 | blade | **100/100** | 752ms | 902ms | 902ms |
| 6 | angular | **99/100** | 1352ms | 1743ms | 1766ms |
| 7 | dioxus | **98/100** | 1203ms | 2404ms | 2491ms |

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
| 1 | **Dioxus** | 31,358 | 152ms | 196ms | 351ms | 0 |
| 2 | **Leptos** | 29,493 | 142ms | 181ms | 343ms | 0 |
| 3 | **Yew** | 26,407 | 152ms | 236ms | 337ms | 0 |
| 4 | **Vue** | 25,108 | 157ms | 216ms | 346ms | 0 |
| 5 | **Angular** | 19,957 | 152ms | 233ms | 341ms | 0 |
| 6 | **React** | 18,852 | 155ms | 245ms | 342ms | 0 |
| 7 | **Blade** | 2,257 | 149ms | 345ms | 493ms | 0 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | dioxus | 31,358 | 2,000 | 152ms | 196ms | 351ms | 0 | 0 |
| 2 | leptos | 29,493 | 2,000 | 142ms | 181ms | 343ms | 0 | 0 |
| 3 | yew | 26,407 | 2,000 | 152ms | 236ms | 337ms | 0 | 0 |
| 4 | vue | 25,108 | 2,000 | 157ms | 216ms | 346ms | 0 | 0 |
| 5 | angular | 19,957 | 2,000 | 152ms | 233ms | 341ms | 0 | 0 |
| 6 | react | 18,852 | 2,000 | 155ms | 245ms | 342ms | 0 | 0 |
| 7 | blade | 2,257 | 100 | 149ms | 345ms | 493ms | 0 | 0 |

### Runtime Resource Usage

The first table is a **pre-audit idle sample**: the container is up with no traffic, captured for 30s *before* the Lighthouse audit runs. It measures baseline/startup footprint only — it is *not* representative of CPU or memory under load. (A separate under-load table is drawn from the stress-test run below.)

**Idle container sampling (30s, no load, pre-Lighthouse)**

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| react | 0.00% / 0.00% | 4.92 MB / 5.09 MB |
| vue | 0.00% / 0.00% | 4.70 MB / 4.82 MB |
| angular | 0.00% / 0.00% | 4.73 MB / 4.89 MB |
| leptos | 0.00% / 0.00% | 5.13 MB / 5.41 MB |
| yew | 0.00% / 0.00% | 5.05 MB / 5.27 MB |
| dioxus | 0.00% / 0.00% | 4.89 MB / 5.32 MB |
| blade | 0.01% / 0.01% | 18.72 MB / 18.90 MB |

**Under load (highest-throughput stress sample per framework)**

Each row is the framework's own peak sample; concurrency differs where a framework peaked below the maximum, so compare across rows with care.

| Framework | Concurrency | CPU (avg / max) | Memory (avg / max) |
|-----------|------------:|----------------:|-------------------:|
| react | 2,000 | 125.98% / 140.93% | 17.34 MB / 19.21 MB |
| vue | 2,000 | 124.48% / 140.35% | 17.19 MB / 19.96 MB |
| angular | 2,000 | 126.40% / 138.46% | 16.35 MB / 19.49 MB |
| leptos | 2,000 | 129.82% / 142.48% | 14.92 MB / 15.38 MB |
| yew | 2,000 | 123.63% / 138.35% | 16.73 MB / 19.44 MB |
| dioxus | 2,000 | 129.59% / 139.04% | 15.32 MB / 16.89 MB |
| blade | 100 | 262.50% / 270.28% | 126.61 MB / 164.50 MB |

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
| Workflow run | https://github.com/ypcipansor/frontend-benchmark/actions/runs/36365635089 |

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