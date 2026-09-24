#!/usr/bin/env node

/**
 * Docker-based Benchmark Script
 * Builds and runs benchmarks for all implementations using Docker
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Lighthouse v13 is ESM-only; the callable export is on `.default`.
const lighthouseModule = require('lighthouse');
const lighthouse = lighthouseModule.default || lighthouseModule;
const chromeLauncher = require('chrome-launcher');

const RESULTS_DIR = path.join(__dirname, '../results');
const ROOT_DIR = path.join(__dirname, '../..');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const frameworks = [
  { name: 'react', port: 3001, service: 'react' },
  { name: 'vue', port: 3002, service: 'vue' },
  { name: 'angular', port: 3003, service: 'angular' },
  { name: 'leptos', port: 3004, service: 'leptos' },
  { name: 'yew', port: 3005, service: 'yew' },
  { name: 'dioxus', port: 3006, service: 'dioxus' },
  { name: 'blade', port: 3007, service: 'blade' }
];

function runCommand(command, description, cwd = ROOT_DIR) {
  console.log(`\n▶️  ${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: cwd
    });
    return true;
  } catch (error) {
    console.error(`\n❌ Error: ${description} failed`);
    return false;
  }
}

async function waitForServer(port, maxAttempts = 30) {
  const http = require('http');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: 'localhost',
            port: port,
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
      return true;
    } catch (error) {
      console.log(`   Waiting for server on port ${port}... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

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

function getGzippedSize(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  
  try {
    const output = execSync(`gzip -c "${filePath}" | wc -c`, { encoding: 'utf-8' });
    return parseInt(output.trim());
  } catch (e) {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeBundleSize(framework) {
  console.log(`\n📦 Analyzing bundle size for ${framework.name}...`);
  
  // Extract files from Docker container
  const tempDir = path.join('/tmp', `${framework.name}-dist`);
  
  try {
    // Create temp directory
    if (fs.existsSync(tempDir)) {
      execSync(`rm -rf ${tempDir}`);
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Copy files from container
    execSync(`docker cp frontend-benchmark-${framework.name}:/usr/share/nginx/html ${tempDir}/`, { stdio: 'inherit' });
    
    const distPath = path.join(tempDir, 'html');
    
    let totalJS = 0;
    let totalCSS = 0;
    let totalWASM = 0;
    let totalGzipped = 0;
    
    function scanDirectory(dir) {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDirectory(fullPath);
        } else if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          const size = stats.size;
          const gzippedSize = getGzippedSize(fullPath);
          
          if (ext === '.js') {
            totalJS += size;
            totalGzipped += gzippedSize;
          } else if (ext === '.css') {
            totalCSS += size;
            totalGzipped += gzippedSize;
          } else if (ext === '.wasm') {
            totalWASM += size;
            totalGzipped += gzippedSize;
          }
        }
      });
    }
    
    if (fs.existsSync(distPath)) {
      scanDirectory(distPath);
    }
    
    // Cleanup
    execSync(`rm -rf ${tempDir}`);
    
    console.log(`   📄 JavaScript: ${formatBytes(totalJS)} (gzipped: ${formatBytes(totalGzipped)})`);
    console.log(`   🎨 CSS: ${formatBytes(totalCSS)}`);
    if (totalWASM > 0) {
      console.log(`   ⚙️  WASM: ${formatBytes(totalWASM)}`);
    }
    
    return {
      framework: framework.name,
      totalJS,
      totalCSS,
      totalWASM,
      totalGzipped,
      totalJSFormatted: formatBytes(totalJS),
      totalCSSFormatted: formatBytes(totalCSS),
      totalWASMFormatted: formatBytes(totalWASM),
      totalGzippedFormatted: formatBytes(totalGzipped)
    };
  } catch (error) {
    console.error(`   ❌ Error analyzing bundle size: ${error.message}`);
    return {
      framework: framework.name,
      error: error.message
    };
  }
}

async function benchmarkFramework(framework) {
  console.log('\n' + '='.repeat(60));
  console.log(`\n🚀 Benchmarking ${framework.name.toUpperCase()}`);
  console.log('='.repeat(60));
  
  // Build and start container
  console.log(`\n▶️  Building and starting ${framework.name} container...`);
  if (!runCommand(`docker compose up -d --build ${framework.service}`, `Build and start ${framework.name}`)) {
    return { framework: framework.name, error: 'Failed to build/start container' };
  }
  
  // Wait for server to be ready
  console.log(`\n⏳ Waiting for ${framework.name} server to be ready...`);
  const serverReady = await waitForServer(framework.port);
  
  if (!serverReady) {
    console.error(`   ❌ Server failed to start on port ${framework.port}`);
    runCommand(`docker compose logs ${framework.service}`, `Show ${framework.name} logs`);
    runCommand(`docker compose down ${framework.service}`, `Stop ${framework.name}`);
    return { framework: framework.name, error: 'Server failed to start' };
  }
  
  console.log(`   ✅ Server ready on port ${framework.port}`);
  
  // Analyze bundle size
  const bundleAnalysis = analyzeBundleSize(framework);
  
  // Run Lighthouse audit
  const lighthouseResult = await runLighthouse(`http://localhost:${framework.port}`, framework.name);
  
  // Stop container
  console.log(`\n▶️  Stopping ${framework.name} container...`);
  runCommand(`docker compose down ${framework.service}`, `Stop ${framework.name}`);
  
  return {
    ...bundleAnalysis,
    ...lighthouseResult
  };
}

async function main() {
  console.log('🐳 Frontend Framework Docker Benchmark Suite\n');
  console.log('=' .repeat(60));
  console.log('\nThis will:');
  console.log('  1. Build Docker containers for each framework');
  console.log('  2. Run bundle size analysis');
  console.log('  3. Run Lighthouse performance audits');
  console.log('  4. Generate comprehensive results');
  console.log('\n' + '='.repeat(60));
  
  const startTime = Date.now();
  const results = [];
  
  for (const framework of frameworks) {
    const result = await benchmarkFramework(framework);
    results.push(result);
    
    // Save incremental results
    const outputPath = path.join(RESULTS_DIR, 'docker-benchmark-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }
  
  // Generate summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 BENCHMARK SUMMARY\n');
  console.log('='.repeat(60));
  
  const validResults = results.filter(r => !r.error && r.performanceScore !== undefined);
  
  if (validResults.length > 0) {
    console.log('\n🏆 Performance Rankings (by Performance Score):\n');
    validResults.sort((a, b) => b.performanceScore - a.performanceScore);
    
    validResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name || r.framework} - Score: ${r.performanceScore}/100`);
      console.log(`   FCP: ${Math.round(r.metrics.firstContentfulPaint)}ms | LCP: ${Math.round(r.metrics.largestContentfulPaint)}ms | TTI: ${Math.round(r.metrics.timeToInteractive)}ms`);
      console.log(`   Bundle: ${r.totalGzippedFormatted} (gzipped)`);
    });
    
    console.log('\n📦 Bundle Size Rankings (smallest first):\n');
    validResults.sort((a, b) => a.totalGzipped - b.totalGzipped);
    
    validResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name || r.framework} - ${r.totalGzippedFormatted} (gzipped)`);
    });
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ All benchmarks completed in ${duration}s`);
  console.log(`\n📁 Results saved to: ${path.join(RESULTS_DIR, 'docker-benchmark-results.json')}`);
  console.log('\n💡 Run "npm run report" to update RESULTS.md\n');
}

main().catch(console.error);
