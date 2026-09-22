# Complete Benchmarking Guide - All Frameworks

This guide provides instructions for running comprehensive benchmarks on ALL frameworks including Rust/WASM implementations, measuring performance, CPU usage, RAM usage, and more.

## Overview

The comprehensive benchmark suite (`npm run benchmark:docker:full`) measures:

- ✅ **Bundle Sizes**: JS, CSS, WASM, HTML (raw and gzipped)
- ✅ **Performance Metrics**: Lighthouse scores, FCP, LCP, TTI, Speed Index, TBT, CLS
- ✅ **CPU Usage**: Average and peak CPU percentage during runtime
- ✅ **Memory Usage**: Average and peak RAM usage in MB
- ✅ **Network I/O**: Data transferred (RX/TX)
- ✅ **Build Time**: Time taken to build Docker container

## Prerequisites

- Docker with at least 8GB RAM allocated
- 20GB free disk space (Rust builds are large)
- Time: ~2-3 hours for all 7 frameworks

## Quick Start - Full Benchmark

### Run All Frameworks (Comprehensive)

```bash
cd benchmarks/scripts
npm install
npm run benchmark:docker:full
```

This will sequentially:
1. Build each framework's Docker container
2. Start the container and wait for readiness
3. Monitor CPU and RAM usage for 30 seconds
4. Extract bundle sizes from the container
5. Run Lighthouse performance audit
6. Save results and stop the container
7. Move to next framework

**Expected Duration:**
- JavaScript frameworks (React, Vue, Angular): ~30 minutes total
- Rust/WASM frameworks (Leptos, Yew, Dioxus): ~90 minutes total
- PHP framework (Blade.php): ~5 minutes
- **Total: ~2 hours**

> Visual parity is verified separately and quickly — see [`docs/README.md`](docs/README.md). `docs/parity-check.js` drives all seven dev servers and asserts identical geometry, content and stats, while `docs/screenshot.js` captures every UI state for the [project README](README.md#visual-parity--every-framework-every-state).

### Run Individual Frameworks

To benchmark specific frameworks only, edit `benchmark-docker-full.js` and modify the `frameworks` array.

## Manual Benchmarking Steps

For more control, you can run benchmarks manually:

### 1. Build and Start Container

```bash
# Build specific framework
docker compose build react

# Start container
docker compose up -d react

# Wait for it to be ready (check logs)
docker compose logs -f react
```

### 2. Monitor Container Stats

In a separate terminal, monitor real-time stats:

```bash
# Real-time stats
docker stats frontend-benchmark-react

# Save stats to file for 60 seconds
docker stats frontend-benchmark-react --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" > react-stats.txt &
STATS_PID=$!
sleep 60
kill $STATS_PID
```

### 3. Extract Bundle Sizes

```bash
# Copy files from container
docker cp frontend-benchmark-react:/usr/share/nginx/html ./react-dist

# Analyze sizes
cd react-dist
find . -name "*.js" -exec du -h {} \;
find . -name "*.css" -exec du -h {} \;
find . -name "*.wasm" -exec du -h {} \;

# Get gzipped sizes
find . -name "*.js" -exec sh -c 'gzip -c {} | wc -c' \;
```

### 4. Run Lighthouse Audit

```bash
# Make sure container is running on port 3001
lighthouse http://localhost:3001 --only-categories=performance --output=json --output-path=./react-lighthouse.json
```

### 5. Stop Container

```bash
docker compose down react
```

## Framework-Specific Notes

### JavaScript Frameworks (React, Vue, Angular)

**Build Time:** 5-10 minutes each  
**Container Size:** ~500MB  
**Runtime Memory:** 50-100MB  

These build quickly and are good for testing the benchmark process.

### Rust/WASM Frameworks (Leptos, Yew, Dioxus)

**Build Time:** 20-30 minutes each  
**Container Size:** 1-2GB during build, ~100MB final  
**Runtime Memory:** 30-80MB  

These take significant time to build:
- Rust compilation is CPU-intensive
- WASM target needs to be downloaded and compiled
- Trunk/DX CLI tools need to be installed in container

**Optimization tip:** Build Rust frameworks overnight or on a powerful machine.

### PHP Framework (Blade)

**Build Time:** 2-3 minutes  
**Container Size:** ~400MB  
**Runtime Memory:** 40-60MB  

Quick to build, good for testing.

## Interpreting Results

### Performance Scores (Lighthouse)

- **90-100**: Excellent - Optimized and fast
- **50-89**: Good - Some optimization opportunities
- **0-49**: Poor - Needs optimization

### Bundle Sizes

Smaller is better for faster loading:
- **< 50KB**: Excellent (Vue, Leptos, Yew typically)
- **50-100KB**: Good (React, Dioxus typically)
- **100-200KB**: Acceptable (Angular typically)
- **> 200KB**: Consider optimization

### CPU Usage

- **< 5%**: Excellent - Efficient static serving
- **5-20%**: Normal - Typical web server overhead
- **> 20%**: High - May indicate issues

### Memory Usage

- **< 50MB**: Excellent - Efficient
- **50-100MB**: Normal - Typical for containerized apps
- **100-200MB**: Acceptable
- **> 200MB**: High - May need investigation

## Results Output

All results are saved to `benchmarks/results/comprehensive-benchmark-results.json`:

```json
{
  "framework": "react",
  "type": "javascript",
  "buildTime": 320,
  "totalTime": 450,
  "containerStats": {
    "cpu": {
      "average": 2.5,
      "max": 8.3
    },
    "memory": {
      "averageMB": 65.2,
      "maxMB": 89.5
    }
  },
  "totalGzipped": 61440,
  "performanceScore": 94,
  "metrics": {
    "firstContentfulPaint": 450,
    "largestContentfulPaint": 680,
    "timeToInteractive": 520
  }
}
```

## Comparison Tables

The script automatically generates comparison tables:

### Performance Ranking
```
🏆 Performance Rankings (by Lighthouse Score):

1. vue (javascript) - Score: 98/100
   FCP: 320ms | LCP: 520ms | TTI: 450ms
2. react (javascript) - Score: 94/100
   FCP: 450ms | LCP: 680ms | TTI: 520ms
...
```

### Bundle Size Ranking
```
📦 Bundle Size Rankings (smallest first):

1. vue (javascript) - 24.76 KB gzipped
   JS: 62.09 KB | CSS: 3.09 KB
2. leptos (rust) - 35.20 KB gzipped
   JS: 15.50 KB | WASM: 120.30 KB | CSS: 3.09 KB
...
```

### CPU Usage Ranking
```
💻 CPU Usage (average during runtime):

1. vue - Avg: 1.8% | Max: 5.2%
2. react - Avg: 2.5% | Max: 8.3%
...
```

### Memory Usage Ranking
```
💾 Memory Usage (average during runtime):

1. leptos - Avg: 35.2 MB | Max: 48.5 MB
2. yew - Avg: 42.8 MB | Max: 55.3 MB
...
```

## Troubleshooting

### Build Timeout

If Rust builds timeout, increase Docker's memory allocation:
- Docker Desktop: Settings → Resources → Memory (set to 8GB)
- Increase timeout in script: `timeout: 3600` (1 hour)

### Out of Disk Space

Clean up Docker:
```bash
docker system prune -a
docker volume prune
```

### Port Already in Use

Kill the process or change ports in `docker-compose.yml`.

### Container Won't Start

Check logs:
```bash
docker compose logs <service-name>
```

## CI/CD Integration

For automated benchmarking:

```yaml
name: Comprehensive Benchmarks

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sunday at 2 AM
  workflow_dispatch:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    timeout-minutes: 180
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker
        run: |
          docker compose version
          
      - name: Install dependencies
        run: |
          cd benchmarks/scripts
          npm install
          
      - name: Run comprehensive benchmarks
        run: |
          cd benchmarks/scripts
          npm run benchmark:docker:full
          
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmarks/results/*.json
```

## Next Steps

After running benchmarks:

1. Review `benchmarks/results/comprehensive-benchmark-results.json`
2. Regenerate the **Benchmark Results** section of [README.md](README.md) with `npm run update-readme`
3. Create visualizations/charts if needed
4. Analyze performance bottlenecks
5. Optimize frameworks that underperform

## Tips for Best Results

1. **Run on consistent hardware**: Use same machine for all benchmarks
2. **Close other applications**: Minimize background processes
3. **Disable throttling**: Ensure Docker has full CPU access
4. **Run multiple times**: Average results from 2-3 runs for accuracy
5. **Monitor system**: Watch `htop` to ensure system isn't overloaded

## Sample Complete Run

```bash
# Full benchmark run
cd benchmarks/scripts
npm install

# Start benchmark (takes ~2 hours)
npm run benchmark:docker:full

# Results will be in:
cat ../results/comprehensive-benchmark-results.json

# Regenerate the Benchmark Results section of README.md
npm run update-readme
```

## Questions?

- Check `DOCKER.md` for Docker setup
- Check `QUICKSTART_DOCKER.md` for quick commands
- Review [RESULTS_TEMPLATE.md](RESULTS_TEMPLATE.md) for the result JSON shape
