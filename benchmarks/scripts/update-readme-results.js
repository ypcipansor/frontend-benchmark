#!/usr/bin/env node

/*
 * README Results Updater
 * Updates the Benchmark Results section in README.md with the latest benchmark data.
 *
 * Reads `benchmarks/results/comprehensive-benchmark-results.json` (produced by
 * `benchmark-docker-full.js` and enriched with latency by `merge-stress-results.js`).
 *
 * Data schema:
 *   results[] = {
 *     framework, type, runId,
 *     performanceScore, metrics: { firstContentfulPaint, largestContentfulPaint, timeToInteractive, ... },
 *     totalGzipped, totalJS, totalCSS, totalWASM, totalHTML,
 *     containerStats: { cpu: {average,max}, memory: {averageMB,maxMB} },
 *     stress: {
 *       samples: [ { concurrency, requests: {average}, latency: {p50,p90,p99}, errors, non2xx, containerStats }, ... ]
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
const README_FILE = path.join(__dirname, '../../README.md');
const { readRunId } = require('./provenance');

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(n) {
  if (n === undefined || n === null || n === 'N/A' || isNaN(n)) return 'N/A';
  if (typeof n !== 'number') return n;
  return n.toLocaleString('en-US');
}

// A valid Lighthouse result requires a numeric score and a numeric FCP.
function hasValidLighthouse(r) {
  return typeof r.performanceScore === 'number' &&
         Number.isFinite(r.performanceScore) &&
         r.metrics && Number.isFinite(r.metrics.firstContentfulPaint);
}

// Total raw (uncompressed) size of all assets. Returns null when no bundle
// data is present at all, so the caller can render "N/A" instead of "0 Bytes".
function totalSize(r) {
  const js = r.totalJS === undefined ? 0 : r.totalJS;
  const css = r.totalCSS === undefined ? 0 : r.totalCSS;
  const wasm = r.totalWASM === undefined ? 0 : r.totalWASM;
  const html = r.totalHTML === undefined ? 0 : r.totalHTML;
  if (r.totalGzipped === undefined && r.totalJS === undefined &&
      r.totalCSS === undefined && r.totalWASM === undefined && r.totalHTML === undefined) {
    return null;
  }
  return js + css + wasm + html;
}

// The stress sample that achieved the highest throughput (avg req/s).
function peakStressSample(r) {
  const samples = (r.stress && r.stress.samples) || [];
  if (!samples.length) return null;
  return samples.reduce((best, s) => {
    const avg = (s.requests && s.requests.average) || 0;
    const bestAvg = (best.requests && best.requests.average) || 0;
    return avg > bestAvg ? s : best;
  });
}

// Render a latency value as "Nms" or "N/A".
function ms(n) {
  return (n === undefined || n === null || isNaN(n)) ? 'N/A' : `${Math.round(n)}ms`;
}

// Convenience: markdown-style name for the framework.
function displayName(framework) {
  return framework.charAt(0).toUpperCase() + framework.slice(1);
}

// Collect the run ids stamped on the measurements we are about to publish.
// A framework result may carry its own id plus, for a merged standalone stress
// run, a separate id on `result.stress`.
function measurementRunIds(results) {
  const ids = new Set();
  for (const r of results || []) {
    if (r && r.runId) ids.add(r.runId);
    if (r && r.stress && r.stress.runId) ids.add(r.stress.runId);
  }
  return ids;
}

// Optional environment metadata captured by CI (runner specs, browser, Docker,
// load tool, workflow run). Written to benchmarks/results/environment.json.
//
// environment.json is a sidecar: nothing structurally ties it to the numbers in
// the other result files, and the results directory is reused across runs. So
// metadata is accepted only when it provably belongs to every measurement about
// to be rendered:
//   - every displayed measurement carries a run id and they all match the
//     environment's `benchmarkRunId`, or
//   - legacy measurements carry no run id at all, no provenance/environment id
//     exists, and valid timestamps show the capture is not older than them.
// A report mixing measurements from different runs cannot be described by one
// sidecar environment, so it is reported as uncaptured.
function readEnvironment(results) {
  const envPath = path.join(RESULTS_DIR, 'environment.json');
  if (!fs.existsSync(envPath)) return null;
  let env;
  try {
    env = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
  } catch (e) {
    return null;
  }

  const currentRunId = readRunId(RESULTS_DIR);
  const ids = measurementRunIds(results);

  if (ids.size > 0) {
    // Measurements are stamped: require an exact association with the env.
    if (env.benchmarkRunId && [...ids].every(id => id === env.benchmarkRunId)) {
      return env;
    }
    if (ids.size > 1) {
      console.warn('Results mix measurements from multiple runs; environment metadata is not attributable.');
    } else {
      console.warn('environment.json does not match the run id stamped on the results; treating it as stale.');
    }
    return null;
  }

  // Measurements carry no run id. If any provenance or environment id exists,
  // the association cannot be proven, so refuse rather than guess.
  if (currentRunId || env.benchmarkRunId) {
    console.warn('environment.json cannot be associated: results carry no run provenance.');
    return null;
  }

  // Legacy path: timestamps must positively establish that the capture belongs
  // to these results. With no valid timestamps there is no evidence, so refuse.
  const newest = (results || [])
    .map(r => Date.parse(r.timestamp))
    .filter(t => !isNaN(t))
    .reduce((a, b) => Math.max(a, b), 0);
  const captured = Date.parse(env.generatedAt);
  if (!newest) {
    console.warn('environment.json cannot be associated: results have no valid timestamps.');
    return null;
  }
  if (!isNaN(captured) && captured < newest) {
    console.warn('environment.json predates the benchmark results; treating it as stale.');
    return null;
  }
  return env;
}

// Pull the Lighthouse table from an already-rendered README so a run whose
// audits failed can fall back to the last valid table instead of erasing it.
function extractPreviousLighthouse(readme) {
  if (!readme) return null;
  const sectionMatch = readme.match(/### Lighthouse Performance\n([\s\S]*?)(?=\n### )/);
  if (!sectionMatch) return null;
  const sectionText = sectionMatch[1];
  const tableLines = sectionText
    .split('\n')
    .filter(line => line.trim().startsWith('|'));
  // header + separator + at least one data row
  if (tableLines.length < 3) return null;
  // Prefer a date embedded in the section (a previously-preserved stale table
  // carries its own "from YYYY-MM-DD" marker); otherwise the README-wide date.
  const topDateMatch = readme.match(/\*Last updated: (\d{4}-\d{2}-\d{2})\*/);
  const innerDateMatch = sectionText.match(/from\s+\*{0,2}(\d{4}-\d{2}-\d{2})\*{0,2}/);
  const date = (innerDateMatch && innerDateMatch[1]) || (topDateMatch && topDateMatch[1]) || 'a previous run';
  return { date, table: tableLines.join('\n') };
}

// Render the "### Test Environment" subsection from environment.json, which the
// comprehensive workflow writes on every run. When that file is absent (e.g. a
// manual `npm run update-readme`), fields are reported as "not captured" rather
// than substituting specs from an unrelated run — publishing invented hardware
// would corrupt cross-run comparisons.
function renderTestEnvironment(env, results) {
  const runner = (env && env.runner) || {};
  const unknown = '_not captured_';
  const rows = [
    ['Runner', runner.os],
    ['CPU', runner.cpu],
    ['Memory', runner.memory],
    ['Node.js', runner.node],
    ['Browser (Lighthouse)', env && env.chrome],
    ['Docker Engine', env && env.docker],
    ['Load test tool', env && env.loadTool],
    ['Workflow run', env && env.runUrl]
  ];

  let md = '### Test Environment\n\n';
  md += '| Item | Value |\n|------|-------|\n';
  rows.forEach(([k, v]) => { md += `| ${k} | ${v || unknown} |\n`; });

  if (!env && measurementRunIds(results).size > 1) {
    md += '\n> Metrics above were merged from **more than one run**, so a single environment cannot describe them all. ';
    md += 'See each run\'s workflow artifact for its own runner details.\n';
  }

  const retention = (env && env.artifactRetentionDays) || 90;
  md += `\n> Raw results (` + '`benchmarks/results/*.json`' + `) are gitignored; they are uploaded as a ${retention}-day workflow artifact.`;
  if (env && env.runUrl) {
    md += ' See the workflow run linked above.';
  } else {
    md += ' Run the Comprehensive Benchmark workflow (or provide a `benchmarks/results/environment.json`) to capture this run\'s environment.';
  }
  md += '\n';
  return md;
}

function generateBenchmarkSection(results, previousReadme) {
  const date = new Date().toISOString().split('T')[0];

  // Ranked lists used across tables.
  const summaryList = results
    .map(r => {
      const sample = peakStressSample(r);
      return { r, sample, peak: Math.round((sample && sample.requests && sample.requests.average) || 0) };
    })
    .sort((a, b) => b.peak - a.peak);

  const bundleList = results
    .slice()
    .sort((a, b) => (a.totalGzipped || Infinity) - (b.totalGzipped || Infinity));

  const perfList = results
    .filter(hasValidLighthouse)
    .slice()
    .sort((a, b) => b.performanceScore - a.performanceScore);

  let md = '## Benchmark Results\n\n';
  md += `*Last updated: ${date}*\n\n`;

  // Provenance warning. Numbers below may come from separate benchmark runs /
  // environments (e.g. a local manual run for one framework vs. historical CI
  // data for others), so rankings should be treated with care until a single
  // fresh full 7-framework run is executed in one environment.
  md += '> ⚠️ **Provenance:** Values below were collected across separate runs and environments and may not be directly comparable. A single, fresh, full 7-framework run in one environment is needed before rankings can be treated as authoritative.\n\n';
  md += '> 📐 **Comparability:** Throughput and memory figures are **not directly comparable across runs** when the runner/host or container resource limits change — a different CPU allocation, cgroup memory limit, or kernel changes the measured req/s and RSS substantially. Large swings versus a previous run (e.g. throughput or RSS dropping by more than half) usually indicate an environment change, not a framework regression. Compare only runs that share the Test Environment below.\n\n';

  // The corrected stress sampler records per-signal parse counts
  // (cpuSamples/memorySamples). Samples without them came from the older
  // harness, whose fixed-iteration loop folded idle readings into the
  // under-load window, so their throughput is not a valid baseline.
  //
  // Check every sample that actually contributes a displayed throughput figure
  // (peak > 0), not the whole set: a report may merge a fresh run with an older
  // one, and errored samples with no measurement are not shown.
  const displayedSamples = summaryList
    .filter(item => item.peak > 0 && item.sample)
    .map(item => item.sample);
  const preFixHarness = displayedSamples.some(s =>
    !s.containerStats || typeof s.containerStats.cpuSamples !== 'number');
  if (preFixHarness) {
    const allPreFix = displayedSamples.every(s =>
      !s.containerStats || typeof s.containerStats.cpuSamples !== 'number');
    const subject = allPreFix ? 'The stress-test figures below were' : 'Some stress-test figures below were';
    md += `> 🧪 **Harness version:** ${subject} collected **before the sampler fix** (the old fixed-iteration loop mixed idle readings into the load window). They are kept for continuity only and are **not a valid baseline** — a fresh run is required before comparing throughput against them.\n\n`;
  }

  // ----- Quick Highlights -----
  md += '### Quick Highlights\n\n';
  const perfWinner = perfList[0];
  const bundleWinner = bundleList[0];
  const throughputWinner = summaryList[0];

  if (perfWinner) md += `- 🚀 **Top Lighthouse score:** ${displayName(perfWinner.framework)} — **${perfWinner.performanceScore}/100**\n`;
  if (bundleWinner && bundleWinner.totalGzipped !== undefined && bundleWinner.totalGzipped !== null) {
    md += `- 📦 **Smallest gzipped bundle:** ${bundleWinner.framework} — **${formatBytes(bundleWinner.totalGzipped)}**\n`;
  }
  if (throughputWinner && throughputWinner.peak > 0) {
    md += `- ⚡ **Highest throughput:** ${displayName(throughputWinner.r.framework)} — **${formatNumber(throughputWinner.peak)} req/s** @ ${formatNumber(throughputWinner.sample && throughputWinner.sample.concurrency)} connections\n`;
  }

  // Notes about failed audits.
  const noLighthouse = results.filter(r => !hasValidLighthouse(r));
  if (noLighthouse.length) {
    md += '\n**Notes:**\n';
    noLighthouse.forEach(r => {
      const err = r.error ? ` (${r.error})` : '';
      md += `- ${displayName(r.framework)}: Lighthouse audit unavailable${err} — see Test Environment and re-run.\n`;
    });
  }

  const topThroughput = summaryList.filter(s => s.peak > 0).slice(0, 3)
    .map(s => `${displayName(s.r.framework)} (${formatNumber(s.peak)} req/s)`).join(', ');
  const topPerf = perfList.slice(0, 3).map(r => `${displayName(r.framework)} (${r.performanceScore}/100)`).join(', ');
  const topBundles = bundleList.slice(0, 3).map(r => `${r.framework} (${formatBytes(r.totalGzipped)})`).join(', ');

  md += `\n- Top throughput (top 3): ${topThroughput || 'N/A'}\n`;
  md += `- Top Lighthouse (top 3): ${topPerf || (extractPreviousLighthouse(previousReadme) ? 'N/A this run (stale table shown below)' : 'N/A')}\n`;
  md += `- Smallest bundles (top 3): ${topBundles || 'N/A'}\n`;

  md += '\n---\n\n';

  // ----- Lighthouse Performance -----
  md += '### Lighthouse Performance\n\n';
  if (!perfList.length) {
    const stale = extractPreviousLighthouse(previousReadme);
    if (stale) {
      md += `_This run (${date}) failed to produce Lighthouse results — the audit could not run. Showing the last valid results from **${stale.date}** instead. `;
      md += 'These stale values are not from the current run._\n\n';
      md += stale.table + '\n';
    } else {
      md += '_No valid Lighthouse results available. Re-run the comprehensive benchmark in idle conditions._\n';
    }
  } else {
    md += '| Rank | Framework | Perf | FCP | LCP | TTI |\n';
    md += '|-----:|-----------|-----:|----:|----:|----:|\n';
    perfList.forEach((r, i) => {
      const fcp = ms(r.metrics.firstContentfulPaint);
      const lcp = ms(r.metrics.largestContentfulPaint);
      const tti = ms(r.metrics.timeToInteractive);
      md += `| ${i + 1} | ${r.framework} | **${r.performanceScore}/100** | ${fcp} | ${lcp} | ${tti} |\n`;
    });
  }
  md += '\n';

  // ----- Bundle Sizes -----
  md += '### Bundle Sizes (gzipped)\n\n';
  md += '| Rank | Framework | Bundle (gzipped) | Total Size |\n';
  md += '|-----:|-----------|------------------:|-----------:|\n';
  bundleList.forEach((r, i) => {
    md += `| ${i + 1} | ${r.framework} | ${formatBytes(r.totalGzipped)} | ${formatBytes(totalSize(r))} |\n`;
  });
  md += '\n';

  // ----- Throughput (latency percentiles at peak) -----
  md += '### Throughput\n\n';
  md += '| Rank | Framework | Peak Avg Req/s | p50 | p90 | p99 | Errors |\n';
  md += '|-----:|-----------|---------------:|----:|----:|----:|------:|\n';
  summaryList.forEach((item, i) => {
    const r = item.r;
    const sample = item.sample;
    const peak = item.peak > 0 ? formatNumber(item.peak) : 'N/A';
    const p50 = sample ? ms(sample.latency && sample.latency.p50) : 'N/A';
    const p90 = sample && sample.latency ? ms(sample.latency.p90) : 'N/A';
    const p99 = sample ? ms(sample.latency && sample.latency.p99) : 'N/A';
    const errors = formatNumber(sample && sample.errors);
    md += `| ${i + 1} | **${displayName(r.framework)}** | ${peak} | ${p50} | ${p90} | ${p99} | ${errors} |\n`;
  });
  md += '\n';

  // ----- Stress Test Summary -----
  md += '### Stress Test Summary\n\n';
  md += '| Rank | Framework | Peak Avg Req/s | Peak Concurrency | p50 | p90 | p99 | Errors | Non-2xx |\n';
  md += '|-----:|-----------|---------------:|----------------:|----:|----:|----:|------:|-------:|\n';
  summaryList.forEach((item, i) => {
    const r = item.r;
    const sample = item.sample;
    const peak = item.peak > 0 ? formatNumber(item.peak) : 'N/A';
    const concurrency = sample ? formatNumber(sample.concurrency) : 'N/A';
    const p50 = sample ? ms(sample.latency && sample.latency.p50) : 'N/A';
    const p90 = sample && sample.latency ? ms(sample.latency.p90) : 'N/A';
    const p99 = sample ? ms(sample.latency && sample.latency.p99) : 'N/A';
    const errors = formatNumber(sample && sample.errors);
    const non2xx = formatNumber(sample && sample.non2xx);
    md += `| ${i + 1} | ${r.framework} | ${peak} | ${concurrency} | ${p50} | ${p90} | ${p99} | ${errors} | ${non2xx} |\n`;
  });
  md += '\n';

  // ----- Runtime resource usage (CPU / Memory) -----
  md += '### Runtime Resource Usage\n\n';
  md += 'The first table is a **pre-audit idle sample**: the container is up with no traffic, captured for 30s *before* the Lighthouse audit runs. It measures baseline/startup footprint only — it is *not* representative of CPU or memory under load. (A separate under-load table is drawn from the stress-test run below.)\n\n';
  md += '**Idle container sampling (30s, no load, pre-Lighthouse)**\n\n';
  md += '| Framework | CPU (avg / max) | Memory (avg / max) |\n';
  md += '|-----------|----------------:|-------------------:|\n';
  const hasRuntimeData = (c) =>
    c && c.cpu && c.memory &&
    (c.cpu.average !== 0 || c.cpu.max !== 0 || c.memory.averageMB !== 0 || c.memory.maxMB !== 0);

  const rtSorted = results.slice().sort((a, b) =>
    ((a.containerStats && a.containerStats.cpu && a.containerStats.cpu.average) || 0) -
    ((b.containerStats && b.containerStats.cpu && b.containerStats.cpu.average) || 0));
  rtSorted.forEach(r => {
    const c = r.containerStats;
    const cpu = hasRuntimeData(c) ? `${c.cpu.average.toFixed(2)}% / ${c.cpu.max.toFixed(2)}%` : 'N/A';
    const mem = hasRuntimeData(c) ? `${c.memory.averageMB.toFixed(2)} MB / ${c.memory.maxMB.toFixed(2)} MB` : 'N/A';
    md += `| ${r.framework} | ${cpu} | ${mem} |\n`;
  });
  md += '\n';

  // Under-load resource usage, sampled by the stress test while autocannon
  // drove the container. Rendered only when such samples exist.
  //
  // A sample is only usable if the corresponding signal was actually parsed:
  // `memorySamples` / `cpuSamples` (written by the corrected sampler) count
  // successful parses, so a failed memory parse yields N/A instead of a
  // misleading 0 MB. Older result files lack these counters; fall back to
  // `samples` for them so existing artifacts still render.
  const cpuCount = (c) => (c && typeof c.cpuSamples === 'number') ? c.cpuSamples : (c ? c.samples : 0);
  const memCount = (c) => (c && typeof c.memorySamples === 'number') ? c.memorySamples : (c ? c.samples : 0);

  const peakUnderLoad = (r) => {
    const s = peakStressSample(r);
    if (!(s && s.containerStats && s.containerStats.cpu && s.containerStats.memory)) return null;
    if (s.containerStats.samples <= 0) return null;
    return s;
  };
  if (results.some(r => peakUnderLoad(r))) {
    md += '**Under load (highest-throughput stress sample per framework)**\n\n';
    md += 'Each row is the framework\'s own peak sample; concurrency differs where a framework peaked below the maximum, so compare across rows with care.\n\n';
    md += '| Framework | Concurrency | CPU (avg / max) | Memory (avg / max) |\n';
    md += '|-----------|------------:|----------------:|-------------------:|\n';
    rtSorted.forEach(r => {
      const s = peakUnderLoad(r);
      if (!s) {
        md += `| ${r.framework} | N/A | N/A | N/A |\n`;
        return;
      }
      const c = s.containerStats;
      const cpu = cpuCount(c) > 0
        ? `${c.cpu.average.toFixed(2)}% / ${c.cpu.max.toFixed(2)}%`
        : 'N/A';
      const mem = memCount(c) > 0
        ? `${c.memory.averageMB.toFixed(2)} MB / ${c.memory.maxMB.toFixed(2)} MB`
        : 'N/A';
      md += `| ${r.framework} | ${formatNumber(s.concurrency)} | ${cpu} | ${mem} |\n`;
    });
    md += '\n';
  }

  // ----- Test Environment -----
  md += renderTestEnvironment(readEnvironment(results), results) + '\n';

  md += '---\n\n';
  md += '### Testing Methodology\n\n';
  md += 'All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.\n\n';
  md += 'Throughput and latency are measured by `autocannon` (pipelining 1) at 100/500/1,000/2,000 concurrent connections for 30s per level. CPU/memory are sampled with `docker stats` both while idle and during the peak stress level, as labelled above.\n\n';
  md += 'For detailed per-framework analysis and complete methodology, see [BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md).\n';

  return md;
}

function updateReadme(benchmarkSection) {
  const readmeContent = fs.readFileSync(README_FILE, 'utf-8');

  // Find the benchmark results section: match a top-level heading whose text
  // contains "benchmark results" (so emoji decorations like "🏆" are safe).
  const headingRe = /^##[^#\n]*Benchmark Results[^\n]*$/m;
  const match = headingRe.exec(readmeContent);

  if (!match) {
    console.error('Could not find "## Benchmark Results" section in README.md');
    process.exit(1);
  }
  const benchmarkStart = match.index;

  // Find the next ## heading or end of file
  let benchmarkEnd = readmeContent.indexOf('\n## ', benchmarkStart + 1);
  if (benchmarkEnd === -1) {
    benchmarkEnd = readmeContent.length;
  }

  // Replace the benchmark section
  const newReadme = readmeContent.substring(0, benchmarkStart) +
                    benchmarkSection +
                    '\n' +
                    readmeContent.substring(benchmarkEnd);

  fs.writeFileSync(README_FILE, newReadme);
  console.log('✅ README.md updated with latest benchmark results');
}

(function run() {
  const comprehensivePath = path.join(RESULTS_DIR, 'comprehensive-benchmark-results.json');
  if (!fs.existsSync(comprehensivePath)) {
    console.error('No comprehensive results file found. Run the benchmarks first.');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(comprehensivePath, 'utf-8'));
  if (!Array.isArray(results)) {
    console.error('comprehensive-benchmark-results.json must contain an array of results.');
    process.exit(1);
  }

  // Read the current README first so a failed Lighthouse run can fall back to
  // the last valid table instead of deleting it.
  const previousReadme = fs.existsSync(README_FILE) ? fs.readFileSync(README_FILE, 'utf-8') : '';
  const benchmarkSection = generateBenchmarkSection(results, previousReadme);
  updateReadme(benchmarkSection);
})();