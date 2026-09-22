# Benchmark Scripts

This directory contains automated scripts for benchmarking frontend framework implementations.

## Setup

```bash
npm install
```

## Scripts

### Run All Benchmarks

```bash
npm run benchmark:all
```

Runs all benchmark tests and generates a comprehensive report.

### Lighthouse Benchmark

```bash
npm run benchmark:lighthouse
```

Runs Lighthouse performance audits on all implementations.

### Bundle Size Analysis

```bash
npm run benchmark:bundle
```

Analyzes and compares bundle sizes across implementations.

### Generate Report

```bash
npm run report
```

Generates a markdown report from benchmark results.

## Manual Testing

### Performance Metrics

1. **Initial Load Time**
   - Open Chrome DevTools (F12)
   - Go to Network tab
   - Clear cache (Ctrl+Shift+Delete)
   - Reload page
   - Note: DOMContentLoaded, Load time

2. **Runtime Performance**
   - Open Performance tab in DevTools
   - Start recording
   - Add 1000 todos by running in console:
     ```javascript
     for(let i = 0; i < 1000; i++) {
       // Trigger add todo functionality
     }
     ```
   - Stop recording
   - Analyze main thread time, scripting time

3. **Memory Usage**
   - Open Memory tab
   - Take heap snapshot
   - Interact with app
   - Take another snapshot
   - Compare memory growth

### Lighthouse Audit

1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Select "Desktop" or "Mobile"
4. Click "Generate report"
5. Note Performance, Accessibility, Best Practices scores

## Metrics Collected

- **Performance**
  - First Contentful Paint (FCP)
  - Largest Contentful Paint (LCP)
  - Time to Interactive (TTI)
  - Total Blocking Time (TBT)
  - Cumulative Layout Shift (CLS)
  - Speed Index

- **Load**
  - Peak requests/second
  - p50 / p90 / p99 latency
  - Error and non-2xx counts up to 2,000 concurrent connections

- **Bundle Size**
  - JavaScript size (gzipped)
  - CSS size (gzipped)
  - Total assets size
  - WASM size (for Rust implementations)

- **Runtime**
  - CPU usage (average / peak)
  - Memory usage (average / peak)

- **Build**
  - Container build time

## Results

Raw results are written to `../results/` as JSON. That directory is **gitignored**: CI uploads `comprehensive-benchmark-results.json` as a workflow artifact retained for 90 days.

### Publishing results

```bash
npm run update-readme
```

This finds the `## Benchmark Results` heading in the root `README.md` and replaces everything up to the next `##` heading with freshly formatted tables. Nothing outside that section is touched, so the screenshots and documentation above it survive the weekly refresh.

The shape of the result JSON is documented in [RESULTS_TEMPLATE.md](../../RESULTS_TEMPLATE.md).

## Verifying visual parity

Performance numbers mean nothing if the frameworks are not rendering the same app. The parity tooling lives in [`docs/`](../../docs/) and is separate from the timing scripts:

```bash
cd ../docs
npm install && npx playwright install chromium
npm run parity      # assert identical DOM, geometry, content and stats
npm run capture     # capture all five UI states
npm run verify      # reject blank, white, mis-sized or error-free screenshots
npm run pixel       # pixel-diff every state against the reference
```

`npm run pixel` is the strictest gate: it fails on any pixel difference outside
the header badge and the footer, where the framework name legitimately differs.
