# Frontend Framework Benchmark

> A data-driven, head-to-head performance comparison of **7 frontend frameworks** — React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php — running the **same Todo app** on the **same benchmark harness**.
> Results below are **measured automatically every week** by GitHub Actions and pushed straight into this README.

[![Basic Checks](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/basic-checks.yml)
[![Frontend Build](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark.yml)
[![Comprehensive Benchmark](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml/badge.svg)](https://github.com/ypcipansor/frontend-benchmark/actions/workflows/benchmark-comprehensive.yml)

---

## Benchmark Results

*Last updated: 2026-09-16*

### Quick Highlights

- 🚀 **Top Lighthouse score:** Vue — **100/100**
- 📦 **Smallest gzipped bundle:** blade — **1.29 KB**
- ⚡ **Highest throughput:** Vue — **32,903 req/s** @ 2,000 connections

**Notes:**
- Dioxus: Lighthouse audit produced NaN/invalid values — re-run in idle conditions.

- Top throughput (top 3): Vue (32,903 req/s), Leptos (32,434 req/s), Angular (30,423 req/s)
- Top Lighthouse (top 3): Vue (100/100), Leptos (100/100), Angular (100/100)
- Smallest bundles (top 3): blade (1.29 KB), vue (24.94 KB), react (58.32 KB)

---

### Lighthouse Performance

| Rank | Framework | Perf | FCP | LCP | TTI |
|-----:|-----------|-----:|----:|----:|----:|
| 1 | vue | **100/100** | 1053ms | 1204ms | 1179ms |
| 2 | leptos | **100/100** | 906ms | 1582ms | 1244ms |
| 3 | angular | **100/100** | 1212ms | 1589ms | 1394ms |
| 4 | yew | **100/100** | 903ms | 1579ms | 1612ms |
| 5 | react | **100/100** | 1203ms | 1354ms | 1203ms |
| 6 | blade | **87/100** | 751ms | 751ms | 751ms |

### Bundle Sizes (gzipped)

| Rank | Framework | Bundle (gzipped) | Total Size |
|-----:|-----------|------------------:|-----------:|
| 1 | blade | 1.29 KB | 8.95 KB |
| 2 | vue | 24.94 KB | 68.3 KB |
| 3 | react | 58.32 KB | 191.81 KB |
| 4 | angular | 61.31 KB | 187.37 KB |
| 5 | yew | 75.57 KB | 268.4 KB |
| 6 | leptos | 76.1 KB | 375.35 KB |
| 7 | dioxus | 0 Bytes | 0 Bytes |

### Throughput

| Rank | Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |
|-----:|-----------|---------------:|----:|----:|----:|------:|
| 1 | **Vue** | 32,903 | 201ms | 380ms | 3887ms | 664 |
| 2 | **Leptos** | 32,434 | 214ms | 403ms | 3893ms | 486 |
| 3 | **Angular** | 30,423 | 202ms | 284ms | 3914ms | 487 |
| 4 | **Yew** | 30,126 | 211ms | 412ms | 3902ms | 443 |
| 5 | **React** | 17,895 | 196ms | 295ms | 3892ms | 476 |
| 6 | **Blade** | 303 | 2002ms | 2016ms | 7923ms | 13,600 |
| 7 | **Dioxus** | N/A | N/A | N/A | N/A | 0 |

### Stress Test Summary

| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| 1 | vue | 32,903 | 2,000 | 201ms | 380ms | 3887ms | 664 | 0 |
| 2 | leptos | 32,434 | 2,000 | 214ms | 403ms | 3893ms | 486 | 0 |
| 3 | angular | 30,423 | 2,000 | 202ms | 284ms | 3914ms | 487 | 0 |
| 4 | yew | 30,126 | 2,000 | 211ms | 412ms | 3902ms | 443 | 0 |
| 5 | react | 17,895 | 2,000 | 196ms | 295ms | 3892ms | 476 | 0 |
| 6 | blade | 303 | 2,000 | 2002ms | 2016ms | 7923ms | 13,600 | 0 |
| 7 | dioxus | N/A | N/A | N/A | N/A | N/A | 0 | 0 |

### Runtime Resource Usage

| Framework | CPU (avg / max) | Memory (avg / max) |
|-----------|----------------:|-------------------:|
| dioxus | N/A | N/A |
| vue | 1.80% / 5.20% | 58.60 MB / 75.20 MB |
| react | 2.50% / 8.30% | 65.20 MB / 89.50 MB |
| leptos | 2.80% / 7.50% | 35.20 MB / 48.50 MB |
| yew | 3.20% / 9.10% | 42.80 MB / 55.30 MB |
| angular | 4.20% / 12.50% | 78.40 MB / 102.30 MB |
| blade | 5.50% / 15.80% | 52.30 MB / 68.50 MB |

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
| 🦀 Rust / WASM | **Dioxus** | CSR (WASM) | Dioxus CLI |
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
│   ├── results/          # Raw results JSON (gitignored)
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

Raw numbers live in `benchmarks/results/comprehensive-benchmark-results.json` and are regenerated on each run.

## Contributing

Contributions are welcome! Please read the [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) for implementation guidelines and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.