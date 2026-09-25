# Frontend Framework Benchmark

> A data-driven, head-to-head performance comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — running the **same Todo app** on the **same benchmark harness**.
> Results below are **measured automatically every week** by GitHub Actions and pushed straight into this README.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

---

## Benchmark Results

*Last updated: 2026-09-25*

> ⚠️ **Provenance:** Values below were collected across separate runs and environments and may not be directly comparable. A single, fresh, full 7-framework run in one environment is needed before rankings can be treated as authoritative.

### Quick Highlights

- 📦 **Smallest gzipped bundle:** blade — **1.32 KB**
- ⚡ **Highest throughput:** Leptos — **14,991 req/s** @ 2,000 connections

**Notes:**
- React: Lighthouse audit unavailable — re-run in idle conditions.
- Vue: Lighthouse audit unavailable — re-run in idle conditions.
- Angular: Lighthouse audit unavailable — re-run in idle conditions.
- Leptos: Lighthouse audit unavailable — re-run in idle conditions.
- Yew: Lighthouse audit unavailable — re-run in idle conditions.
- Dioxus: Lighthouse audit unavailable — re-run in idle conditions.
- Blade: Lighthouse audit unavailable — re-run in idle conditions.

- Top throughput (top 3): Leptos (14,991 req/s), Dioxus (13,769 req/s), Yew (12,758 req/s)
- Top Lighthouse (top 3): N/A
- Smallest bundles (top 3): blade (1.32 KB), vue (26.02 KB), react (68.18 KB)

---

### Lighthouse Performance

_No valid Lighthouse results available. Re-run the comprehensive benchmark in idle conditions._

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
| 1 | **Leptos** | 14,991 | 125ms | 1754ms | 3734ms | 0 |
| 2 | **Dioxus** | 13,769 | 127ms | 1763ms | 3726ms | 0 |
| 3 | **Yew** | 12,758 | 127ms | 1842ms | 3738ms | 0 |
| 4 | **Angular** | 12,566 | 129ms | 1787ms | 3740ms | 0 |
| 5 | **Vue** | 11,335 | 125ms | 1861ms | 3918ms | 0 |
| 6 | **React** | 10,943 | 129ms | 1890ms | 3910ms | 0 |
| 7 | **Blade** | 288 | 2002ms | 2017ms | 7818ms | 3,700 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | leptos | 14,991 | 2,000 | 125ms | 1754ms | 3734ms | 0 | 0 |
| 2 | dioxus | 13,769 | 2,000 | 127ms | 1763ms | 3726ms | 0 | 0 |
| 3 | yew | 12,758 | 2,000 | 127ms | 1842ms | 3738ms | 0 | 0 |
| 4 | angular | 12,566 | 2,000 | 129ms | 1787ms | 3740ms | 0 | 0 |
| 5 | vue | 11,335 | 2,000 | 125ms | 1861ms | 3918ms | 0 | 0 |
| 6 | react | 10,943 | 2,000 | 129ms | 1890ms | 3910ms | 0 | 0 |
| 7 | blade | 288 | 2,000 | 2002ms | 2017ms | 7818ms | 3,700 | 0 |

### Runtime Resource Usage

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| react | 0.00% / 0.00% | 4.93 MB / 5.21 MB |
| vue | 0.00% / 0.00% | 4.82 MB / 4.92 MB |
| angular | 0.00% / 0.00% | 4.68 MB / 5.01 MB |
| leptos | 0.00% / 0.00% | 4.68 MB / 4.86 MB |
| yew | 0.00% / 0.00% | 4.77 MB / 5.01 MB |
| dioxus | 0.00% / 0.00% | 4.78 MB / 5.10 MB |
| blade | 0.00% / 0.00% | 18.82 MB / 19.03 MB |

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