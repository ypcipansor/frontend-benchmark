#!/usr/bin/env node

/**
 * Stress test script using autocannon to measure req/s, latency, and errors
 * Runs concurrency levels against each framework service and saves results.
 */

const autocannon = require('autocannon');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const RESULTS_DIR = path.join(__dirname, '../results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

const frameworks = [
  { name: 'react', port: 3001, service: 'react', url: 'http://localhost:3001' },
  { name: 'vue', port: 3002, service: 'vue', url: 'http://localhost:3002' },
  { name: 'angular', port: 3003, service: 'angular', url: 'http://localhost:3003' },
  { name: 'leptos', port: 3004, service: 'leptos', url: 'http://localhost:3004' },
  { name: 'yew', port: 3005, service: 'yew', url: 'http://localhost:3005' },
  { name: 'dioxus', port: 3006, service: 'dioxus', url: 'http://localhost:3006' },
  { name: 'blade', port: 3007, service: 'blade', url: 'http://localhost:3007' }
];

const concurrencies = [100, 500, 1000, 2000];
const durationSeconds = 30; // per run
// Sampling interval in ms for `docker stats`. Make configurable with env var STATS_INTERVAL_MS.
const DEFAULT_STATS_INTERVAL_MS = 250;
const STATS_INTERVAL_MS = process.env.STATS_INTERVAL_MS ? parseInt(process.env.STATS_INTERVAL_MS, 10) : DEFAULT_STATS_INTERVAL_MS;

function runCmd(cmd) {
  console.log(`> ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    console.error(e.stdout || e.message);
  }
}

async function waitForServer(port, maxAttempts = 60) {
  const http = require('http');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get({ hostname: 'localhost', port, path: '/', timeout: 2000 }, (res) => {
          resolve();
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy());
      });
      return true;
    } catch (err) {
      await new Promise(res => setTimeout(res, 1000));
    }
  }
  return false;
}

function startContainer(service) {
  runCmd(`docker compose up -d --build ${service}`);
}

function stopContainer(service) {
  runCmd(`docker compose down ${service}`);
}

function runAutocannon(url, connections, durationSeconds) {
  return new Promise((resolve, reject) => {
    const inst = autocannon(
      {
        url,
        connections,
        duration: durationSeconds,
        pipelining: 1
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    autocannon.track(inst, { renderProgressBar: false });
  });
}

function sampleContainerStats(containerName, durationSeconds, intervalMs = DEFAULT_STATS_INTERVAL_MS) {
  const stats = { cpuPercent: [], memoryMB: [], memoryPercent: [] };
  const iterCount = Math.max(1, Math.ceil(durationSeconds * 1000 / intervalMs));

  return new Promise((resolve) => {
    let count = 0;

    // Use async exec, NOT execSync: this sampler runs concurrently with
    // autocannon in the same Node process. A synchronous `docker stats`
    // subprocess blocks the event loop and freezes the load generator,
    // which crushes measured throughput and pins latency near the sampling
    // interval. A recursive async loop keeps the sampling interval but never
    // blocks request generation.
    const tick = async () => {
      try {
        const { stdout } = await execAsync(
          `docker stats ${containerName} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"`
        );
        const out = stdout.trim();

        const parts = out.split('|');
        // CPU
        const cpu = parseFloat(parts[0].replace('%', '')) || 0;
        stats.cpuPercent.push(cpu);

        // Memory usage (e.g., "45.5MiB / 7.775GiB")
        const memMatch = parts[1] ? parts[1].match(/([\d.]+)([A-Za-z]+)/) : null;
        if (memMatch) {
          let val = parseFloat(memMatch[1]) || 0;
          const unit = memMatch[2].toLowerCase();
          if (unit.includes('g')) val *= 1024;
          else if (unit.includes('k')) val /= 1024;
          stats.memoryMB.push(val);
        }

        const memPercent = parseFloat(parts[2].replace('%', '')) || 0;
        stats.memoryPercent.push(memPercent);
      } catch (e) {
        // ignore errors, container may not be up yet
      }

      count++;
      if (count >= iterCount) {
        const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
        const mx = arr => (arr.length ? Math.max(...arr) : 0);

        resolve({
          durationSeconds: Math.round((iterCount * intervalMs) / 1000),
          samples: count,
          cpu: { average: avg(stats.cpuPercent), max: mx(stats.cpuPercent) },
          memory: {
            averageMB: avg(stats.memoryMB),
            maxMB: mx(stats.memoryMB),
            averagePercent: avg(stats.memoryPercent),
            maxPercent: mx(stats.memoryPercent)
          }
        });
      } else {
        setTimeout(tick, intervalMs);
      }
    };

    tick();
  });
}

async function runStressTest() {
  console.log('🚦 Starting stress tests');
  const allResults = [];

  for (const f of frameworks) {
    console.log(`\n🔁 Testing framework: ${f.name} (${f.url})`);

    startContainer(f.service);

    // wait for server
    const started = await waitForServer(f.port, 40);
    if (!started) {
      console.error(`Server ${f.name} did not start on port ${f.port}`);
      stopContainer(f.service);
      continue;
    }

    // Run tests for multiple concurrencies
    const fwResult = { framework: f.name, url: f.url, samples: [] };

    for (const c of concurrencies) {
      console.log(`\n   🔫 Running autocannon: ${c} connections for ${durationSeconds}s`);
      let statsPromise; 
      try {
        const containerName = `frontend-benchmark-${f.service}`;
        // start sampling container stats in parallel with the autocannon run
  statsPromise = sampleContainerStats(containerName, durationSeconds, STATS_INTERVAL_MS);
        const res = await runAutocannon(f.url, c, durationSeconds);
        const containerStats = await statsPromise;

        const sample = {
          concurrency: c,
          duration: durationSeconds,
          requests: res.requests, // { average, mean, total }
          latency: res.latency, // { average, p50, p99 }
          throughput: res.throughput, // bytes/sec averages
          non2xx: res['non2xx'],
          errors: res['errors'],
          statusCodes: res['statusCodes']
          ,
          containerStats
        };

        console.log(`   ✅ ${f.name} @ ${c} connections => ${Math.round(res.requests.average)} req/s, p50 ${Math.round(res.latency.p50)}ms, p95 ${Math.round(res.latency.p95 || res.latency.p99 || 0)}ms`);

        fwResult.samples.push(sample);
      } catch (err) {
        console.error(`   ❌ Error running autocannon: ${err.message || err}`);
        let containerStats = null;
        if (statsPromise) {
          try { containerStats = await statsPromise; } catch (e) { /* ignore */ }
        }
        fwResult.samples.push({ concurrency: c, error: err.message || 'autocannon error', containerStats });
      }

      await new Promise((res) => setTimeout(res, 2000)); // short cooldown
    }

    // stop container
    stopContainer(f.service);

    // collect resource stats by using docker stats snapshot before stop if needed - currently skipped for simplicity

    allResults.push(fwResult);

    // store incremental results
    fs.writeFileSync(path.join(RESULTS_DIR, 'stress-test-results.json'), JSON.stringify(allResults, null, 2));
  }

  console.log('\n🟢 Stress testing complete. Results written to /benchmarks/results/stress-test-results.json');
}

runStressTest().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
