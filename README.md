# Frontend Framework Benchmark

A comprehensive benchmark comparing various frontend frameworks including React, Vue.js, Angular, Leptos, Yew, Dioxus, and Blade.php.

## Overview

This project implements the same Todo List application across multiple frontend frameworks to provide objective performance comparisons and developer experience insights.

## Frameworks Included

### JavaScript/TypeScript
- **React** - Popular declarative UI library
- **Vue.js** - Progressive JavaScript framework
- **Angular** - Full-featured TypeScript framework

### Rust WebAssembly (CSR)
- **Leptos** - Fine-grained reactivity Rust framework
- **Yew** - Component-based Rust framework
- **Dioxus** - React-like Rust framework

### Server-Side
- **Blade.php** - Laravel's templating engine

## Project Structure

```
frontend-benchmark/
├── implementations/
│   ├── react/           # React implementation
│   ├── vue/             # Vue.js implementation
│   ├── angular/         # Angular implementation
│   ├── leptos/          # Leptos (Rust) implementation
│   ├── yew/             # Yew (Rust) implementation
│   ├── dioxus/          # Dioxus (Rust) implementation
│   └── blade/           # Laravel Blade implementation
├── benchmarks/
│   ├── scripts/         # Benchmark automation scripts
│   ├── results/         # Benchmark results and data
│   └── tools/           # Custom measurement tools
├── shared/
│   └── styles/          # Common CSS styles
└── BENCHMARK_SPEC.md    # Detailed specification
```

## Getting Started

### Prerequisites

- Node.js 18+ (for JS frameworks)
- Rust 1.70+ (for Rust frameworks)
- PHP 8.1+ and Composer (for Blade)
- Modern web browser (Chrome recommended for testing)

### Running Implementations

Each implementation has its own directory with specific instructions. See the README in each implementation folder.

#### React
```bash
cd implementations/react
npm install
npm run dev
```

#### Vue.js
```bash
cd implementations/vue
npm install
npm run dev
```

#### Angular
```bash
cd implementations/angular
npm install
npm start
```

#### Leptos
```bash
cd implementations/leptos
trunk serve
```

#### Yew
```bash
cd implementations/yew
trunk serve
```

#### Dioxus
```bash
cd implementations/dioxus
dx serve
```

#### Blade
```bash
cd implementations/blade
composer install
php artisan serve
```

## Running Benchmarks

### Local Benchmarks

```bash
cd benchmarks/scripts
npm install
npm run benchmark:all
```

### Docker-based Benchmarks

For consistent, isolated benchmarking using Docker containers:

```bash
cd benchmarks/scripts
npm install

# Quick benchmark (JS frameworks only, ~30 min)
npm run benchmark:docker

# Comprehensive benchmark (ALL frameworks including Rust, ~2 hours)
# Includes: CPU usage, RAM usage, performance metrics
npm run benchmark:docker:full
```

See [DOCKER.md](DOCKER.md) for Docker setup and [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md) for comprehensive benchmarking guide.

## Benchmark Results

*Last updated: 2026-06-08*

### Quick Highlights

- **Smallest gzipped bundle:** blade (1.32 KB)
- **Highest measured throughput:** leptos (35,959 req/s peak)

**Notes:**
- Dioxus Lighthouse audit produced NaN values; rebuild and re-run Lighthouse in idle conditions (no concurrent stress test).

- Top throughput (top 3): leptos (35,959 req/s), angular (29,926 req/s), vue (29,390 req/s)
- Smallest bundles (top 3): blade (1.32 KB), vue (25.46 KB), react (59.75 KB)

---

### Summary (at-a-glance)

#### Bundle Sizes (gzipped)

| Framework | Bundle (gzipped) | Total Size |
|-----------|------------------:|-----------:|
| blade | 1.32 KB | 4.01 KB |
| vue | 25.46 KB | 65.73 KB |
| react | 59.75 KB | 191.49 KB |
| angular | 62.76 KB | 192.91 KB |
| leptos | 79.15 KB | 250.84 KB |
| yew | 80.95 KB | 230.24 KB |
| dioxus | 0 Bytes | 0 Bytes |

#### Lighthouse Performance

| Framework | Perf | FCP | LCP | TTI |
|-----------|-----:|----:|----:|----:|

#### Throughput

| Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |
|-----------|---------------:|----:|----:|----:|------:|
| **Leptos** | 35,959 | N/A | N/A | N/A | 0 |
| **Angular** | 29,926 | N/A | N/A | N/A | 0 |
| **Vue** | 29,390 | N/A | N/A | N/A | 0 |
| **Yew** | 25,690 | N/A | N/A | N/A | 0 |
| **React** | 22,895 | N/A | N/A | N/A | 0 |
| **Blade** | 426 | N/A | N/A | N/A | 0 |
| **Dioxus** | 0 | N/A | N/A | N/A | 0 |

---

### Stress Test Summary

| Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |
|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|
| leptos | 35,959 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| angular | 29,926 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| vue | 29,390 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| yew | 25,690 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| react | 22,895 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| blade | 426 | 2,000 | N/A | N/A | N/A | 0 | 0 |
| dioxus | 0 | 2,000 | N/A | N/A | N/A | 0 | 0 |

---

### Testing Methodology

All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.

For detailed per-framework analysis and complete methodology, see [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md).


## Contributing

Contributions are welcome! Please read the [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) for implementation guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
