# Comprehensive Benchmark - Quick Reference

## What Is This?

A complete benchmarking system that measures **ALL 7 frameworks** including Rust/WASM with detailed CPU, RAM, and performance metrics.

## What Does It Measure?

For **each framework** (React, Vue, Angular, Leptos, Yew, Dioxus, Blade):

- 📦 **Bundle sizes** (JS, CSS, WASM, HTML - raw & gzipped)
- ⚡ **Performance scores** (Lighthouse: FCP, LCP, TTI, etc.)
- 💻 **CPU usage** (average & peak % during runtime)
- 💾 **RAM usage** (average & peak MB during runtime)
- 🌐 **Network I/O** (data transferred)
- ⏱️ **Build time** (how long to build)

## How to Run

### Prerequisites

```bash
# Ensure Docker is running
docker --version

# You need:
# - Docker with 8GB RAM
# - 20GB free disk space
# - 2-3 hours available time
```

### Run the Benchmark

```bash
# 1. Go to scripts directory
cd benchmarks/scripts

# 2. Install dependencies (first time only)
npm install

# 3. Run comprehensive benchmark
npm run benchmark:docker:full
```

### What Happens

The script will:
1. **Build** each framework in Docker (one at a time)
2. **Start** the container
3. **Monitor** CPU and RAM for 30 seconds
4. **Extract** bundle sizes
5. **Test** performance with Lighthouse
6. **Stop** container and move to next

### Timeline

| Framework | Time |
|-----------|------|
| Blade (PHP) | 5 min |
| Vue.js | 10 min |
| React | 10 min |
| Angular | 15 min |
| Leptos (Rust) | 25 min |
| Yew (Rust) | 25 min |
| Dioxus (Rust) | 30 min |
| **TOTAL** | **~2 hours** |

## Where Are Results?

After completion, results are in:

```bash
benchmarks/results/comprehensive-benchmark-results.json
```

View them:
```bash
cat benchmarks/results/comprehensive-benchmark-results.json | jq '.'
```

## What Do Results Look Like?

### Example Output

```json
{
  "framework": "vue",
  "type": "javascript",
  "buildTime": 240,
  "totalTime": 420,
  "containerStats": {
    "cpu": {
      "average": 1.8,
      "max": 5.2,
      "samples": 15
    },
    "memory": {
      "averageMB": 58.6,
      "maxMB": 75.2,
      "samples": 15
    }
  },
  "totalJS": 63582,
  "totalCSS": 3160,
  "totalWASM": 0,
  "totalGzipped": 25350,
  "performanceScore": 98,
  "metrics": {
    "firstContentfulPaint": 320,
    "largestContentfulPaint": 520,
    "timeToInteractive": 450,
    "speedIndex": 380,
    "totalBlockingTime": 0,
    "cumulativeLayoutShift": 0
  }
}
```

### Rankings Generated

The script automatically prints:

```
🏆 Performance Rankings (by Lighthouse Score):
1. vue (javascript) - Score: 98/100
   FCP: 320ms | LCP: 520ms | TTI: 450ms

📦 Bundle Size Rankings (smallest first):
1. vue (javascript) - 24.76 KB gzipped
   JS: 62.09 KB | CSS: 3.09 KB

💻 CPU Usage (average during runtime):
1. vue - Avg: 1.8% | Max: 5.2%

💾 Memory Usage (average during runtime):
1. leptos - Avg: 35.2 MB | Max: 48.5 MB

⏱️ Build Time Rankings (fastest first):
1. blade - 120s (2 min)
```

## What If Something Goes Wrong?

### Build Fails

```bash
# Check Docker logs
docker compose logs <framework-name>

# Clean rebuild
docker compose build --no-cache <framework-name>
```

### Out of Disk Space

```bash
# Clean Docker
docker system prune -a
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3001

# Or change port in docker-compose.yml
```

### Build Takes Too Long

This is normal for Rust frameworks! Each Rust framework takes 20-30 minutes to compile WASM.

## Quick vs Full Benchmark

| Feature | `benchmark:docker` | `benchmark:docker:full` |
|---------|-------------------|------------------------|
| Frameworks | JS only (3) | ALL (7) including Rust |
| Time | ~30 min | ~2 hours |
| CPU metrics | ❌ | ✅ |
| RAM metrics | ❌ | ✅ |
| Network I/O | ❌ | ✅ |
| Build time | ❌ | ✅ |
| Rankings | Basic | 5 detailed tables |

## Manual Testing

Want to test just one framework?

```bash
# Build and start
docker compose up -d react

# Check it's running (opens in browser)
open http://localhost:3001

# Stop
docker compose down react
```

## What's Next?

After benchmarking:

1. **Review results:** `cat benchmarks/results/comprehensive-benchmark-results.json`
2. **Update the README:** Run `npm run update-readme` to regenerate the **Benchmark Results** section of [README.md](README.md)
3. **Analyze patterns:** Which framework performs best for your needs?
4. **Optimize:** Identify and fix bottlenecks

## Need More Help?

- **Complete guide:** See `BENCHMARK_GUIDE.md`
- **Docker setup:** See `DOCKER.md`
- **Quick commands:** See `QUICKSTART_DOCKER.md`
- **Expected output:** See `RESULTS_TEMPLATE.md`

## Example: Testing Just JavaScript Frameworks

Want faster results? Edit `benchmark-docker-full.js` line 23-30:

```javascript
// Comment out Rust frameworks
const frameworks = [
  { name: 'react', port: 3001, service: 'react', type: 'javascript' },
  { name: 'vue', port: 3002, service: 'vue', type: 'javascript' },
  { name: 'angular', port: 3003, service: 'angular', type: 'javascript' },
  // { name: 'leptos', port: 3004, service: 'leptos', type: 'rust' },
  // { name: 'yew', port: 3005, service: 'yew', type: 'rust' },
  // { name: 'dioxus', port: 3006, service: 'dioxus', type: 'rust' },
  { name: 'blade', port: 3007, service: 'blade', type: 'php' }
];
```

Now runs in ~30 minutes!

## Key Takeaways

✅ **Comprehensive:** Measures everything (CPU, RAM, performance, bundle size)  
✅ **Automated:** One command does it all  
✅ **Consistent:** Docker ensures reproducible results  
✅ **Complete:** Tests ALL 7 frameworks including Rust  
✅ **Detailed:** 5 ranking tables + full JSON output  

---

**Ready to benchmark? Run:**
```bash
cd benchmarks/scripts && npm install && npm run benchmark:docker:full
```

**Questions?** Check the guides in the repository root.
