#!/usr/bin/env node

/**
 * Report Generation Script
 * Generates a cleaner Markdown report from comprehensive benchmark results
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
const OUTPUT_FILE = path.join(__dirname, '../../RESULTS.md');

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return 'N/A';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function safe(v, fallback = 'N/A') {
  if (v === undefined || v === null) return fallback;
  return v;
}

function generateReport() {
  console.log('\n📝 Generating benchmark report...\n');

  const comprehensivePath = path.join(RESULTS_DIR, 'comprehensive-benchmark-results.json');
  if (!fs.existsSync(comprehensivePath)) {
    console.error('No comprehensive results file found: ' + comprehensivePath);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(comprehensivePath, 'utf-8'));
  console.log(`   ✅ Loaded comprehensive benchmark data (${results.length} frameworks)`);

  // Create helper maps
  const byFramework = {};
  results.forEach(r => { byFramework[r.framework] = r; });

  // Prepare bundleResults from results
  const bundleResults = results.map(r => ({
    framework: r.framework,
    totalJS: r.totalJS || 0,
    totalCSS: r.totalCSS || 0,
    totalWASM: r.totalWASM || 0,
    totalHTML: r.totalHTML || 0,
    totalGzipped: r.totalGzipped || 0,
    totalJSFormatted: r.totalJSFormatted || formatBytes(r.totalJS || 0),
    totalCSSFormatted: r.totalCSSFormatted || formatBytes(r.totalCSS || 0),
    totalWASMFormatted: r.totalWASMFormatted || formatBytes(r.totalWASM || 0),
    totalHTMLFormatted: r.totalHTMLFormatted || formatBytes(r.totalHTML || 0),
    totalGzippedFormatted: r.totalGzippedFormatted || formatBytes(r.totalGzipped || 0),
    totalSizeFormatted: r.totalSizeFormatted || formatBytes((r.totalJS || 0) + (r.totalCSS || 0) + (r.totalWASM || 0))
  }));

  // Top-level header
  let report = `# Frontend Framework Benchmark Results\n\n`;
  report += `*Last updated: ${new Date().toISOString().split('T')[0]}*\n\n`;

  // Implementations tested
  report += `## Implementations Tested\n\n`;
  results.forEach(r => {
    const status = r.error ? '⚠️ (failed)' : '✅';
    report += `- ${status} ${r.framework.charAt(0).toUpperCase() + r.framework.slice(1)} (${r.type || 'N/A'})\n`;
  });

  // Summary table
  report += `\n## Summary\n\n`;
  report += `A consolidated view of each implementation — sort by the column you care about to compare.\n\n`;
  report += `| Framework | Type | Perf | FCP | LCP | TTI | Bundle (gzipped) | Total Size | Peak Req/s | Avg CPU | Max CPU | Avg Mem | Max Mem | Build Time (s) |\n`;
  report += `|-----------|------|-----:|----:|----:|----:|-----------------:|-----------:|-----------:|--------:|-------:|--------:|-------:|-------------:|\n`;

  // compute summary for each framework
  results.forEach(r => {
    const name = (r.framework.charAt(0).toUpperCase() + r.framework.slice(1));
    const perf = r.performanceScore !== undefined ? `${r.performanceScore}/100` : 'N/A';
    const metrics = r.metrics || {};
    const fcp = metrics.firstContentfulPaint ? Math.round(metrics.firstContentfulPaint) : 'N/A';
    const lcp = metrics.largestContentfulPaint ? Math.round(metrics.largestContentfulPaint) : 'N/A';
    const tti = metrics.timeToInteractive ? Math.round(metrics.timeToInteractive) : 'N/A';
    const gz = formatBytes(r.totalGzipped || 0);
    const total = formatBytes((r.totalJS || 0) + (r.totalCSS || 0) + (r.totalWASM || 0));

    // stress summary: pick the sample with highest average requests
    const stress = r.stress || { samples: [] };
    let maxSample = stress.samples && stress.samples.length ? stress.samples.reduce((acc, s) => (!s.requests ? acc : (!acc || s.requests.average > acc.requests.average ? s : acc)), null) : null;
    let maxReq = 'N/A', concurrency = 'N/A', p50 = 'N/A', p90='N/A', p99='N/A', avgCpu='N/A', maxCpu='N/A', avgMem='N/A', maxMem='N/A';
    if (maxSample) {
      maxReq = Math.round(maxSample.requests.average);
      concurrency = maxSample.concurrency || 'N/A';
      p50 = Math.round(maxSample.latency.p50 || 0);
      p90 = Math.round(maxSample.latency.p90 || maxSample.latency.p95 || 0);
      p99 = Math.round(maxSample.latency.p99 || 0);
      avgCpu = maxSample.containerStats?.cpu?.average !== undefined ? `${maxSample.containerStats.cpu.average.toFixed(2)}%` : 'N/A';
      maxCpu = maxSample.containerStats?.cpu?.max !== undefined ? `${maxSample.containerStats.cpu.max.toFixed(2)}%` : 'N/A';
      avgMem = maxSample.containerStats?.memory?.averageMB !== undefined ? `${maxSample.containerStats.memory.averageMB.toFixed(2)}MB` : 'N/A';
      maxMem = maxSample.containerStats?.memory?.maxMB !== undefined ? `${maxSample.containerStats.memory.maxMB.toFixed(2)}MB` : 'N/A';
    }

    report += `| **${name}** | ${r.type || 'N/A'} | ${perf} | ${fcp}ms | ${lcp}ms | ${tti}ms | ${gz} | ${total} | ${maxReq} | ${avgCpu} | ${maxCpu} | ${avgMem} | ${maxMem} | ${r.buildTime || 'N/A'} |\n`;
  });

  // Detailed Analysis per-framework
  report += `\n---\n\n## Detailed Analysis\n\n`;
  results.forEach(r => {
    const title = r.framework.charAt(0).toUpperCase() + r.framework.slice(1);
    report += `### ${title}\n\n`;
    report += `- **Type:** ${r.type || 'N/A'}\n`;
    report += `- **Total Size:** ${r.totalSizeFormatted || formatBytes((r.totalJS||0)+(r.totalCSS||0)+(r.totalWASM||0))}\n`;
    report += `- **JavaScript:** ${r.totalJSFormatted || formatBytes(r.totalJS||0)}\n`;
    report += `- **CSS:** ${r.totalCSSFormatted || formatBytes(r.totalCSS||0)}\n`;
    if (r.totalWASM > 0) {
      report += `- **WebAssembly:** ${r.totalWASMFormatted || formatBytes(r.totalWASM)}\n`;
    }
    report += `- **HTML:** ${r.totalHTMLFormatted || formatBytes(r.totalHTML||0)}\n`;
    if (r.error) report += `- **Build/Run Error:** ${r.error}\n`;
    report += `\n`;

    // Lighthouse
    if (r.performanceScore !== undefined) {
      report += `- **Lighthouse:** ${r.performanceScore}/100 | FCP: ${Math.round(r.metrics.firstContentfulPaint)}ms | LCP: ${Math.round(r.metrics.largestContentfulPaint)}ms | TTI: ${Math.round(r.metrics.timeToInteractive)}ms\n`;
    } else {
      report += `- **Lighthouse:** N/A\n`;
    }

    // Container statistics
    if (r.containerStats) {
      report += `- **Runtime (avg cpu / max cpu):** ${r.containerStats.cpu.average.toFixed(2)}% / ${r.containerStats.cpu.max.toFixed(2)}%\n`;
      report += `- **Memory (avg / max):** ${r.containerStats.memory.averageMB.toFixed(2)} MB / ${r.containerStats.memory.maxMB.toFixed(2)} MB\n`;
    }

    // Stress peak
    const stress = r.stress || { samples: [] };
    if (stress.samples && stress.samples.length) {
      const maxSample = stress.samples.reduce((acc, s) => (!s.requests ? acc : (!acc || s.requests.average > acc.requests.average ? s : acc)), null);
      if (maxSample) {
        report += `- **Stress Test (peak):** ${Math.round(maxSample.requests.average)} req/s @ ${maxSample.concurrency}c | p50 ${Math.round(maxSample.latency.p50||0)}ms | p90 ${Math.round(maxSample.latency.p90||maxSample.latency.p95||0)}ms | p99 ${Math.round(maxSample.latency.p99||0)}ms\n`;
        if (maxSample.containerStats) {
          report += `  - Avg CPU: ${maxSample.containerStats.cpu.average.toFixed(2)}% | Max CPU: ${maxSample.containerStats.cpu.max.toFixed(2)}%\n`;
          report += `  - Avg Mem: ${maxSample.containerStats.memory.averageMB.toFixed(2)}MB | Max Mem: ${maxSample.containerStats.memory.maxMB.toFixed(2)}MB\n`;
        }
      }
      const errors = stress.samples.reduce((a,s)=>a + (s.errors||0),0);
      const non2xx = stress.samples.reduce((a,s)=>a + (s.non2xx||0),0);
      report += `- **Stress errors:** ${errors} | **Non-2xx:** ${non2xx}\n`;
    }

    report += `\n`;
  });

  // Stress Test Summary (concise table)
  report += `\n## Stress Test Summary\n\n`;
  report += `| Framework | Max Avg Req/s | Concurrency | p50 | p90 | p99 | Errors | Non-2xx | Avg CPU % | Max CPU % | Avg Mem | Max Mem |\n`;
  report += `|-----------|---------------:|------------:|----:|----:|----:|------:|-------:|---------:|---------:|-------:|-------:|\n`;
  results.forEach(r => {
    const stress = r.stress || { samples: [] };
    const samples = stress.samples || [];
    const maxSample = samples.reduce((acc, s) => (!s.requests ? acc : (!acc || s.requests.average > acc.requests.average ? s : acc)), null);
    const errors = samples.reduce((a,s)=>a + (s.errors||0),0);
    const non2xx = samples.reduce((a,s)=>a + (s.non2xx||0),0);
    const cpuAvg = samples.reduce((a,s)=>a + ((s.containerStats?.cpu?.average) || 0), 0) / Math.max(1, samples.length);
    const cpuMax = Math.max(...samples.map(s => (s.containerStats?.cpu?.max) || 0));
    const memAvg = samples.reduce((a,s)=>a + ((s.containerStats?.memory?.averageMB) || 0), 0) / Math.max(1, samples.length);
    const memMax = Math.max(...samples.map(s => (s.containerStats?.memory?.maxMB) || 0));
    if (!maxSample) {
      report += `| **${r.framework}** | N/A | N/A | N/A | N/A | N/A | ${errors} | ${non2xx} | ${cpuAvg.toFixed(2)}% | ${cpuMax.toFixed(2)}% | ${memAvg.toFixed(2)}MB | ${memMax.toFixed(2)}MB |\n`;
    } else {
      const p50 = Math.round(maxSample.latency.p50 || 0);
      const p90 = Math.round(maxSample.latency.p90 || maxSample.latency.p95 || 0);
      const p99 = Math.round(maxSample.latency.p99 || 0);
      report += `| **${r.framework}** | ${Math.round(maxSample.requests.average)} | ${maxSample.concurrency} | ${p50}ms | ${p90}ms | ${p99}ms | ${errors} | ${non2xx} | ${cpuAvg.toFixed(2)}% | ${cpuMax.toFixed(2)}% | ${memAvg.toFixed(2)}MB | ${memMax.toFixed(2)}MB |\n`;
    }
  });

  // Key Findings
  report += `\n## Key Findings\n\n`;
  // smallest/largest bundle
  if (bundleResults.length >= 1) {
    const sortedBundles = [...bundleResults].sort((a,b)=>a.totalGzipped - b.totalGzipped);
    const smallest = sortedBundles[0];
    const largest = sortedBundles[sortedBundles.length-1];
    report += `- **Smallest bundle:** ${smallest.framework} (${formatBytes(smallest.totalGzipped)})\n`;
    report += `- **Largest bundle:** ${largest.framework} (${formatBytes(largest.totalGzipped)})\n`;
  }

  // Performance winner
  const lighthouseResults = results.filter(r => r.performanceScore !== undefined).sort((a,b)=> (b.performanceScore || 0) - (a.performanceScore || 0));
  if (lighthouseResults.length >= 1) {
    const fastest = lighthouseResults[0];
    report += `- **Top Lighthouse score:** ${fastest.framework} (${fastest.performanceScore}/100)\n`;
  }

  // Testing methodology
  report += `\n## Testing Methodology\n\n`;
  report += `All tests were conducted on:\n`;
  report += `- **Environment:** CI/CD environment\n`;
  report += `- **Bundle Analysis:** Production builds\n`;
  report += `- **Network:** Simulated Fast 3G (Lighthouse)\n`;
  report += `- **CPU:** 4x slowdown (Lighthouse)\n`;
  report += `- **Cache:** Cleared before each test\n`;

  // Write output
  fs.writeFileSync(OUTPUT_FILE, report);
  console.log(`\n✅ Report generated: ${OUTPUT_FILE}`);
}

// To keep generation consistent, also call the clean generator when run as a script
if (require.main === module) {
  generateReport();
  try {
    // Prefer the new clean generator if available
    const cp = require('child_process');
    const cleanPath = path.join(__dirname, 'generate-report-clean.js');
    if (fs.existsSync(cleanPath)) {
      console.log('\n🔁 Running clean generator to ensure consistent RESULTS.md...');
      cp.execFileSync(process.execPath, [cleanPath], { stdio: 'inherit' });
    }
  } catch (err) {
    console.warn('Could not run clean generator: ' + err.message);
  }
}
