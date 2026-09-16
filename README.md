# Frontend Framework Benchmark

> A data-driven, head-to-head performance comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — running the **same Todo app** on the **same benchmark harness**.
> Results below are **measured automatically every week** by GitHub Actions and pushed straight into this README.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

---

## Benchmark Results

*Last updated: 2026-09-16*

> ⚠️ **Provenance:** Values below were collected across separate runs and environments and may not be directly comparable. A single, fresh, full 7-framework run in one environment is needed before rankings can be treated as authoritative.

### Quick Highlights

- 📦 **Smallest gzipped bundle:** blade — **1.32 KB**
- ⚡ **Highest throughput:** Yew — **33,279 req/s** @ 2,000 connections

**Notes:**
- React: Lighthouse audit unavailable — re-run in idle conditions.
- Vue: Lighthouse audit unavailable — re-run in idle conditions.
- Angular: Lighthouse audit unavailable — re-run in idle conditions.
- Leptos: Lighthouse audit unavailable — re-run in idle conditions.
- Yew: Lighthouse audit unavailable — re-run in idle conditions.
- Dioxus: Lighthouse audit unavailable — re-run in idle conditions.
- Blade: Lighthouse audit unavailable — re-run in idle conditions.

- Top throughput (top 3): Yew (33,279 req/s), Dioxus (29,502 req/s), Vue (29,218 req/s)
- Top Lighthouse (top 3): N/A
- Smallest bundles (top 3): blade (1.32 KB), vue (25.8 KB), angular (62.83 KB)

---

### Lighthouse Performance

_No valid Lighthouse results available. Re-run the comprehensive benchmark in idle conditions._

### Bundle Sizes (gzipped)

| Rank | Framework | Bundle (gzipped) | Total Size |
|-----:|-----------|------------------:|-----------:|
| 1 | blade | 1.32 KB | 4.01 KB |
| 2 | vue | 25.8 KB | 67.69 KB |
| 3 | angular | 62.83 KB | 194.59 KB |
| 4 | react | 68.18 KB | 220.9 KB |
| 5 | yew | 78.12 KB | 280.03 KB |
| 6 | leptos | 78.28 KB | 394.05 KB |
| 7 | dioxus | 193.62 KB | 526.37 KB |

### Throughput

| Rank | Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |
|-----:|-----------|---------------:|----:|----:|----:|------:|
| 1 | **Yew** | 33,279 | 154ms | 218ms | 1756ms | 0 |
| 2 | **Dioxus** | 29,502 | 153ms | 195ms | 1800ms | 0 |
| 3 | **Vue** | 29,218 | 160ms | 263ms | 1825ms | 0 |
| 4 | **Angular** | 26,392 | 155ms | 251ms | 1842ms | 0 |
| 5 | **Leptos** | 24,474 | 154ms | 245ms | 5614ms | 0 |
| 6 | **React** | 17,261 | 150ms | 1611ms | 5625ms | 0 |
| 7 | **Blade** | 345 | 1990ms | 2015ms | 9786ms | 3,700 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | yew | 33,279 | 2,000 | 154ms | 218ms | 1756ms | 0 | 0 |
| 2 | dioxus | 29,502 | 2,000 | 153ms | 195ms | 1800ms | 0 | 0 |
| 3 | vue | 29,218 | 2,000 | 160ms | 263ms | 1825ms | 0 | 0 |
| 4 | angular | 26,392 | 2,000 | 155ms | 251ms | 1842ms | 0 | 0 |
| 5 | leptos | 24,474 | 2,000 | 154ms | 245ms | 5614ms | 0 | 0 |
| 6 | react | 17,261 | 2,000 | 150ms | 1611ms | 5625ms | 0 | 0 |
| 7 | blade | 345 | 2,000 | 1990ms | 2015ms | 9786ms | 3,700 | 0 |

### Runtime Resource Usage

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| react | 0.00% / 0.00% | 6.58 MB / 6.63 MB |
| vue | 0.00% / 0.00% | 4.73 MB / 5.32 MB |
| angular | 0.00% / 0.00% | 4.70 MB / 4.92 MB |
| leptos | 0.00% / 0.00% | 5.17 MB / 5.60 MB |
| yew | 0.00% / 0.00% | 4.80 MB / 5.20 MB |
| dioxus | 0.00% / 0.00% | 4.73 MB / 4.99 MB |
| blade | 0.00% / 0.01% | 18.72 MB / 18.80 MB |

---

### Testing Methodology

All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.

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