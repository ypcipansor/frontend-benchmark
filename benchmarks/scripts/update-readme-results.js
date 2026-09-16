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
 *     framework, type,
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

function generateBenchmarkSection(results) {
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
      const reason = (r.performanceScore === 0 || (r.metrics && isNaN(r.metrics.firstContentfulPaint)))
        ? 'Lighthouse audit produced NaN/invalid values'
        : 'Lighthouse audit unavailable';
      md += `- ${displayName(r.framework)}: ${reason} — re-run in idle conditions.\n`;
    });
  }

  const topThroughput = summaryList.filter(s => s.peak > 0).slice(0, 3)
    .map(s => `${displayName(s.r.framework)} (${formatNumber(s.peak)} req/s)`).join(', ');
  const topPerf = perfList.slice(0, 3).map(r => `${displayName(r.framework)} (${r.performanceScore}/100)`).join(', ');
  const topBundles = bundleList.slice(0, 3).map(r => `${r.framework} (${formatBytes(r.totalGzipped)})`).join(', ');

  md += `\n- Top throughput (top 3): ${topThroughput || 'N/A'}\n`;
  md += `- Top Lighthouse (top 3): ${topPerf || 'N/A'}\n`;
  md += `- Smallest bundles (top 3): ${topBundles || 'N/A'}\n`;

  md += '\n---\n\n';

  // ----- Lighthouse Performance -----
  md += '### Lighthouse Performance\n\n';
  if (!perfList.length) {
    md += '_No valid Lighthouse results available. Re-run the comprehensive benchmark in idle conditions._\n';
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

  md += '---\n\n';
  md += '### Testing Methodology\n\n';
  md += 'All tests were performed using the included `benchmarks/scripts` runner and are reproducible with the Docker-based setup. Results will vary by environment.\n\n';
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

  const benchmarkSection = generateBenchmarkSection(results);
  updateReadme(benchmarkSection);
})();