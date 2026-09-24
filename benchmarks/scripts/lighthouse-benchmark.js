#!/usr/bin/env node

/**
 * Lighthouse Performance Benchmark Script
 * Runs Lighthouse audits on all framework implementations
 */

const fs = require('fs');
const path = require('path');
// Lighthouse v13 is ESM-only; the callable export is on `.default`.
const lighthouseModule = require('lighthouse');
const lighthouse = lighthouseModule.default || lighthouseModule;
const chromeLauncher = require('chrome-launcher');

const RESULTS_DIR = path.join(__dirname, '../results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Run Lighthouse audit on a URL
 */
async function runLighthouse(url, name) {
  console.log(`\n🔍 Running Lighthouse audit for ${name}...`);
  console.log(`   URL: ${url}`);
  
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
  });
  
  const options = {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4
    }
  };
  
  try {
    const runnerResult = await lighthouse(url, options);
    await chrome.kill();
    
    const { lhr } = runnerResult;
    const performance = lhr.categories.performance;
    const audits = lhr.audits;
    
    const result = {
      name,
      url,
      timestamp: new Date().toISOString(),
      performanceScore: Math.round(performance.score * 100),
      metrics: {
        firstContentfulPaint: audits['first-contentful-paint'].numericValue,
        largestContentfulPaint: audits['largest-contentful-paint'].numericValue,
        timeToInteractive: audits['interactive'].numericValue,
        speedIndex: audits['speed-index'].numericValue,
        totalBlockingTime: audits['total-blocking-time'].numericValue,
        cumulativeLayoutShift: audits['cumulative-layout-shift'].numericValue
      }
    };
    
    console.log(`   ✅ Performance Score: ${result.performanceScore}/100`);
    console.log(`   ⚡ FCP: ${Math.round(result.metrics.firstContentfulPaint)}ms`);
    console.log(`   ⚡ LCP: ${Math.round(result.metrics.largestContentfulPaint)}ms`);
    console.log(`   ⚡ TTI: ${Math.round(result.metrics.timeToInteractive)}ms`);
    
    return result;
  } catch (error) {
    await chrome.kill();
    console.error(`   ❌ Error running Lighthouse: ${error.message}`);
    return {
      name,
      url,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Frontend Framework Lighthouse Benchmarks\n');
  console.log('=' .repeat(60));
  console.log('\n⚠️  Note: This requires running dev servers on specific ports:');
  console.log('   - React: http://localhost:5173');
  console.log('   - Vue: http://localhost:5174');
  console.log('   - Angular: http://localhost:4200');
  console.log('   - Blade: http://localhost:8000');
  console.log('\n   Or use production builds served via static server.\n');
  
  const frameworks = [
    { name: 'React', url: 'http://localhost:5173' },
    { name: 'Vue', url: 'http://localhost:5174' },
    { name: 'Angular', url: 'http://localhost:4200' },
    { name: 'Blade', url: 'http://localhost:8000' }
  ];
  
  const results = [];
  
  for (const framework of frameworks) {
    try {
      // Test if server is running
      const http = require('http');
      const url = new URL(framework.url);
      
      await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: url.hostname,
            port: url.port,
            path: '/',
            timeout: 2000
          },
          (res) => {
            resolve();
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      
      const result = await runLighthouse(framework.url, framework.name);
      results.push(result);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log(`\n⚠️  ${framework.name} server not running at ${framework.url}`);
      console.log(`   Skipping...`);
      results.push({
        name: framework.name,
        url: framework.url,
        timestamp: new Date().toISOString(),
        skipped: true,
        reason: 'Server not running'
      });
    }
  }
  
  // Generate comparison table
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Performance Comparison:\n');
  
  const validResults = results.filter(r => r.performanceScore !== undefined);
  validResults.sort((a, b) => b.performanceScore - a.performanceScore);
  
  if (validResults.length > 0) {
    console.log('Framework'.padEnd(15) + 'Score'.padEnd(10) + 'FCP'.padEnd(10) + 'LCP'.padEnd(10) + 'TTI');
    console.log('-'.repeat(60));
    
    validResults.forEach(r => {
      console.log(
        r.name.padEnd(15) +
        `${r.performanceScore}`.padEnd(10) +
        `${Math.round(r.metrics.firstContentfulPaint)}ms`.padEnd(10) +
        `${Math.round(r.metrics.largestContentfulPaint)}ms`.padEnd(10) +
        `${Math.round(r.metrics.timeToInteractive)}ms`
      );
    });
    
    const winner = validResults[0];
    console.log(`\n🏆 Best performance: ${winner.name} (${winner.performanceScore}/100)`);
  } else {
    console.log('⚠️  No valid results. Make sure dev servers are running.');
  }
  
  // Save results
  const outputPath = path.join(RESULTS_DIR, 'lighthouse-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to ${outputPath}`);
}

main().catch(console.error);
