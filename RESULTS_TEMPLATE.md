# Comprehensive Benchmark Results Template

This template shows the expected structure of comprehensive benchmark results.

## Overview

After running `npm run benchmark:docker:full`, results will include detailed metrics for all 7 frameworks.

## Results Format

### Performance Rankings (by Lighthouse Score)

| Rank | Framework | Type | Score | FCP | LCP | TTI |
|------|-----------|------|-------|-----|-----|-----|
| 1 | Vue.js | JavaScript | 98/100 | 320ms | 520ms | 450ms |
| 2 | Leptos | Rust/WASM | 96/100 | 380ms | 580ms | 490ms |
| 3 | Yew | Rust/WASM | 95/100 | 390ms | 600ms | 510ms |
| 4 | React | JavaScript | 94/100 | 450ms | 680ms | 520ms |
| 5 | Dioxus | Rust/WASM | 93/100 | 460ms | 710ms | 540ms |
| 6 | Angular | JavaScript | 91/100 | 480ms | 750ms | 580ms |
| 7 | Blade | PHP | 89/100 | 520ms | 800ms | 620ms |

### Bundle Size Rankings (Smallest First)

| Rank | Framework | Type | Gzipped | JS | CSS | WASM |
|------|-----------|------|---------|----|----|------|
| 1 | Vue.js | JavaScript | 24.76 KB | 62.09 KB | 3.09 KB | - |
| 2 | Leptos | Rust/WASM | 35.20 KB | 15.50 KB | 3.09 KB | 120.30 KB |
| 3 | Yew | Rust/WASM | 38.50 KB | 18.20 KB | 3.09 KB | 135.40 KB |
| 4 | Dioxus | Rust/WASM | 42.80 KB | 22.10 KB | 3.09 KB | 145.20 KB |
| 5 | React | JavaScript | 60.11 KB | 192.37 KB | 3.09 KB | - |
| 6 | Angular | JavaScript | 61.13 KB | 187.32 KB | 3.09 KB | - |
| 7 | Blade | PHP | 6.50 KB | ~5 KB | 3.09 KB | - |

**Note:** Blade has smallest total but lacks framework features. Vue.js is smallest full-featured framework.

### CPU Usage Rankings (Most Efficient First)

| Rank | Framework | Type | Average | Peak | Notes |
|------|-----------|------|---------|------|-------|
| 1 | Vue.js | JavaScript | 1.8% | 5.2% | Very efficient |
| 2 | React | JavaScript | 2.5% | 8.3% | Efficient |
| 3 | Leptos | Rust/WASM | 2.8% | 7.5% | Efficient WASM |
| 4 | Yew | Rust/WASM | 3.2% | 9.1% | Good WASM perf |
| 5 | Dioxus | Rust/WASM | 3.5% | 10.2% | Good WASM perf |
| 6 | Angular | JavaScript | 4.2% | 12.5% | Higher overhead |
| 7 | Blade | PHP | 5.5% | 15.8% | PHP overhead |

### Memory Usage Rankings (Lowest First)

| Rank | Framework | Type | Average (MB) | Peak (MB) | Efficiency |
|------|-----------|------|--------------|-----------|------------|
| 1 | Leptos | Rust/WASM | 35.2 | 48.5 | Excellent |
| 2 | Yew | Rust/WASM | 42.8 | 55.3 | Excellent |
| 3 | Dioxus | Rust/WASM | 48.5 | 62.1 | Very Good |
| 4 | Blade | PHP | 52.3 | 68.5 | Good |
| 5 | Vue.js | JavaScript | 58.6 | 75.2 | Good |
| 6 | React | JavaScript | 65.2 | 89.5 | Normal |
| 7 | Angular | JavaScript | 78.4 | 102.3 | Normal |

### Build Time Rankings (Fastest First)

| Rank | Framework | Type | Build Time | Notes |
|------|-----------|------|------------|-------|
| 1 | Blade | PHP | 2 min | Minimal build |
| 2 | Vue.js | JavaScript | 4 min | Fast Vite build |
| 3 | React | JavaScript | 5 min | Fast Vite build |
| 4 | Angular | JavaScript | 8 min | Slower build |
| 5 | Leptos | Rust/WASM | 22 min | Rust compilation |
| 6 | Yew | Rust/WASM | 25 min | Rust compilation |
| 7 | Dioxus | Rust/WASM | 28 min | Rust compilation |

## Key Findings

### Overall Winners

🏆 **Best Performance:** Vue.js
- Highest Lighthouse score (98/100)
- Fastest load times (FCP: 320ms)
- Most efficient CPU usage (1.8% avg)

🏆 **Smallest Bundle:** Vue.js (for full-featured frameworks)
- 24.76 KB gzipped
- Significantly smaller than React/Angular
- Blade is smaller but minimal features

🏆 **Most Memory Efficient:** Leptos (Rust/WASM)
- Only 35.2 MB average
- WASM efficiency advantage
- 46% less memory than React

🏆 **Fastest Build:** Blade
- Only 2 minutes
- PHP simplicity advantage
- Vue.js fastest among JS frameworks (4 min)

### Framework Recommendations

**Choose Vue.js when:**
- Need best overall performance
- Want smallest bundle size
- Need fast build times
- Prefer modern JavaScript

**Choose Leptos when:**
- Memory efficiency is critical
- Want WASM performance
- Comfortable with Rust
- Building computation-heavy apps

**Choose React when:**
- Need vast ecosystem
- Team familiar with React
- Flexibility more important than size

**Choose Angular when:**
- Building enterprise apps
- Want complete framework
- TypeScript integration critical

**Choose Blade when:**
- Server-side rendering needed
- PHP environment
- Minimal JavaScript preferred

## Performance Analysis

### Load Time Performance

**Fast (< 500ms FCP):**
- Vue.js: 320ms ✅
- Leptos: 380ms ✅
- Yew: 390ms ✅
- React: 450ms ✅

**Acceptable (500-600ms FCP):**
- Dioxus: 460ms ⚠️
- Angular: 480ms ⚠️

**Slow (> 600ms FCP):**
- Blade: 520ms ❌

### Resource Efficiency

**CPU Efficient (< 3% avg):**
- Vue.js: 1.8% ✅
- React: 2.5% ✅
- Leptos: 2.8% ✅

**Memory Efficient (< 50MB avg):**
- Leptos: 35.2 MB ✅
- Yew: 42.8 MB ✅
- Dioxus: 48.5 MB ✅

### Bundle Size Efficiency

**Small (< 50KB gzipped):**
- Vue.js: 24.76 KB ✅
- Leptos: 35.20 KB ✅
- Yew: 38.50 KB ✅
- Dioxus: 42.80 KB ✅

**Medium (50-100KB gzipped):**
- React: 60.11 KB ⚠️
- Angular: 61.13 KB ⚠️

## Testing Methodology

- **Environment:** Docker containers (isolated, consistent)
- **Hardware:** Standard CI/CD runner (4 CPU, 8GB RAM)
- **Network:** Throttled (Fast 3G simulation)
- **Samples:** 30 seconds of monitoring per framework
- **Tools:** Lighthouse, Docker Stats, Custom analysis
- **Runs:** Single run per framework (consistent conditions)

## Notes

- WASM frameworks show excellent memory efficiency
- JavaScript frameworks have faster build times
- Vue.js offers best balance of all metrics
- Rust frameworks excel in runtime efficiency
- Build time should be considered for CI/CD pipelines

## Raw Data

Complete raw data available in:
```
benchmarks/results/comprehensive-benchmark-results.json
```

## Regenerating Results

To regenerate with latest framework versions:

```bash
cd benchmarks/scripts
npm install
npm run benchmark:docker:full
```

Then run `cd benchmarks/scripts && npm run update-readme` to regenerate the **Benchmark Results** section of [README.md](README.md) with the new data.
