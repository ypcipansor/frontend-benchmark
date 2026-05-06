#!/usr/bin/env node

/**
 * Comprehensive Docker-based Benchmark Script
 * Builds and runs complete benchmarks for ALL implementations including Rust
 * Measures: bundle size, performance, CPU usage, RAM usage, and more
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

const RESULTS_DIR = path.join(__dirname, '../results');
const ROOT_DIR = path.join(__dirname, '../..');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const frameworks = [
  { name: 'react', port: 3001, service: 'react', type: 'javascript' },
  { name: 'vue', port: 3002, service: 'vue', type: 'javascript' },
  { name: 'angular', port: 3003, service: 'angular', type: 'javascript' },
  { name: 'leptos', port: 3004, service: 'leptos', type: 'rust' },
  { name: 'yew', port: 3005, service: 'yew', type: 'rust' },
  { name: 'dioxus', port: 3006, service: 'dioxus', type: 'rust' },
  { name: 'blade', port: 3007, service: 'blade', type: 'php' }
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

function runCommandSilent(command, cwd = ROOT_DIR) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      cwd: cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return null;
  }
}

async function waitForServer(port, maxAttempts = 60) {
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
      if (i % 5 === 0) {
        console.log(`   Waiting for server on port ${port}... (${i + 1}/${maxAttempts})`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

async function getContainerStats(containerName, duration = 30) {
  console.log(`\n📊 Monitoring container stats for ${duration} seconds...`);
  
  const stats = {
    cpuPercent: [],
    memoryUsageMB: [],
    memoryPercent: [],
    networkRxMB: [],
    networkTxMB: []
  };
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const statsProcess = spawn('docker', ['stats', containerName, '--no-stream', '--format', '{{json .}}']);
    
    let buffer = '';
    let count = 0;
    const maxSamples = duration / 2; // Sample every 2 seconds
    
    const interval = setInterval(() => {
      const result = runCommandSilent(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}"`);
      
      if (result) {
        try {
          const parts = result.split('|');
          
          // CPU
          const cpu = parseFloat(parts[0].replace('%', ''));
          if (!isNaN(cpu)) stats.cpuPercent.push(cpu);
          
          // Memory usage (e.g., "45.5MiB / 7.775GiB")
          const memMatch = parts[1].match(/([\d.]+)([A-Za-z]+)/);
          if (memMatch) {
            let memMB = parseFloat(memMatch[1]);
            if (memMatch[2].toLowerCase().includes('g')) {
              memMB *= 1024;
            } else if (memMatch[2].toLowerCase().includes('k')) {
              memMB /= 1024;
            }
            stats.memoryUsageMB.push(memMB);
          }
          
          // Memory percent
          const memPercent = parseFloat(parts[2].replace('%', ''));
          if (!isNaN(memPercent)) stats.memoryPercent.push(memPercent);
          
          // Network I/O (e.g., "1.23MB / 456kB")
          const netMatch = parts[3].match(/([\d.]+)([A-Za-z]+)\s*\/\s*([\d.]+)([A-Za-z]+)/);
          if (netMatch) {
            let rxMB = parseFloat(netMatch[1]);
            let txMB = parseFloat(netMatch[3]);
            
            if (netMatch[2].toLowerCase().includes('g')) rxMB *= 1024;
            else if (netMatch[2].toLowerCase().includes('k')) rxMB /= 1024;
            
            if (netMatch[4].toLowerCase().includes('g')) txMB *= 1024;
            else if (netMatch[4].toLowerCase().includes('k')) txMB /= 1024;
            
            stats.networkRxMB.push(rxMB);
            stats.networkTxMB.push(txMB);
          }
          
          count++;
          if (count % 5 === 0) {
            console.log(`   Sample ${count}/${maxSamples}: CPU ${cpu.toFixed(2)}%, Memory ${stats.memoryUsageMB[stats.memoryUsageMB.length - 1].toFixed(2)} MB`);
          }
        } catch (e) {
          console.error('   Error parsing stats:', e.message);
        }
      }
      
      if (count >= maxSamples || Date.now() - startTime >= duration * 1000) {
        clearInterval(interval);
        
        // Calculate averages
        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const max = (arr) => arr.length > 0 ? Math.max(...arr) : 0;
        
        resolve({
          samples: count,
          duration: Math.round((Date.now() - startTime) / 1000),
          cpu: {
            average: avg(stats.cpuPercent),
            max: max(stats.cpuPercent),
            samples: stats.cpuPercent.length
          },
          memory: {
            averageMB: avg(stats.memoryUsageMB),
            maxMB: max(stats.memoryUsageMB),
            averagePercent: avg(stats.memoryPercent),
            maxPercent: max(stats.memoryPercent),
            samples: stats.memoryUsageMB.length
          },
          network: {
            totalRxMB: max(stats.networkRxMB),
            totalTxMB: max(stats.networkTxMB)
          }
        });
      }
    }, 2000);
  });
}

async function runLighthouse(url, name) {
  console.log(`\n🔍 Running Lighthouse audit for ${name}...`);
  console.log(`   URL: ${url}`);
  
  const launchOptions = {
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  };
  if (process.env.CHROME_PATH) {
    launchOptions.chromePath = process.env.CHROME_PATH;
  }
  const chrome = await chromeLauncher.launch(launchOptions);
  
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
  
  const tempDir = path.join('/tmp', `${framework.name}-dist`);
  
  try {
    // Create temp directory
    if (fs.existsSync(tempDir)) {
      execSync(`rm -rf ${tempDir}`);
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Copy files from container
    const containerName = `frontend-benchmark-${framework.name}`;
    const sourcePath = framework.name === 'blade' ? '/var/www/html' : '/usr/share/nginx/html';
    execSync(`docker cp ${containerName}:${sourcePath} ${tempDir}/`, { stdio: 'inherit' });
    
    const distPath = path.join(tempDir, 'html');
    
    let totalJS = 0;
    let totalCSS = 0;
    let totalWASM = 0;
    let totalGzipped = 0;
    let totalHTML = 0;
    
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
          } else if (ext === '.html') {
            totalHTML += size;
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
    console.log(`   📝 HTML: ${formatBytes(totalHTML)}`);
    console.log(`   📊 Total: ${formatBytes(totalJS + totalCSS + totalWASM + totalHTML)}`);
    
    return {
      framework: framework.name,
      totalJS,
      totalCSS,
      totalWASM,
      totalHTML,
      totalGzipped,
      totalJSFormatted: formatBytes(totalJS),
      totalCSSFormatted: formatBytes(totalCSS),
      totalWASMFormatted: formatBytes(totalWASM),
      totalHTMLFormatted: formatBytes(totalHTML),
      totalGzippedFormatted: formatBytes(totalGzipped),
      totalSizeFormatted: formatBytes(totalJS + totalCSS + totalWASM + totalHTML)
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
  console.log('\n' + '='.repeat(80));
  console.log(`\n🚀 BENCHMARKING ${framework.name.toUpperCase()} (${framework.type})`);
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  // Build and start container
  console.log(`\n▶️  Building ${framework.name} container...`);
  console.log(`   This may take ${framework.type === 'rust' ? '20-30' : '5-10'} minutes for ${framework.type} frameworks...`);
  
  if (!runCommand(`docker compose up -d --build ${framework.service}`, `Build and start ${framework.name}`)) {
    return { 
      framework: framework.name, 
      type: framework.type,
      error: 'Failed to build/start container',
      buildTime: Math.round((Date.now() - startTime) / 1000)
    };
  }
  
  const buildTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`   ✅ Build completed in ${buildTime}s`);
  
  // Wait for server to be ready
  console.log(`\n⏳ Waiting for ${framework.name} server to be ready...`);
  const serverReady = await waitForServer(framework.port);
  
  if (!serverReady) {
    console.error(`   ❌ Server failed to start on port ${framework.port}`);
    runCommand(`docker compose logs ${framework.service}`, `Show ${framework.name} logs`);
    runCommand(`docker compose down ${framework.service}`, `Stop ${framework.name}`);
    return { 
      framework: framework.name, 
      type: framework.type,
      error: 'Server failed to start',
      buildTime
    };
  }
  
  console.log(`   ✅ Server ready on port ${framework.port}`);
  
  // Get container stats
  const containerStats = await getContainerStats(`frontend-benchmark-${framework.name}`, 30);
  
  // Analyze bundle size
  const bundleAnalysis = analyzeBundleSize(framework);
  
  // Run Lighthouse audit
  const lighthouseResult = await runLighthouse(`http://localhost:${framework.port}`, framework.name);
  
  // Stop container
  console.log(`\n▶️  Stopping ${framework.name} container...`);
  runCommand(`docker compose down ${framework.service}`, `Stop ${framework.name}`);
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  
  return {
    framework: framework.name,
    type: framework.type,
    buildTime,
    totalTime,
    containerStats,
    ...bundleAnalysis,
    ...lighthouseResult
  };
}

async function main() {
  console.log('🐳 COMPREHENSIVE DOCKER BENCHMARK SUITE');
  console.log('   Including ALL frameworks: JavaScript, Rust/WASM, and PHP\n');
  console.log('=' .repeat(80));
  console.log('\nMetrics collected:');
  console.log('  ✅ Bundle sizes (JS, CSS, WASM, HTML)');
  console.log('  ✅ Performance scores (Lighthouse)');
  console.log('  ✅ CPU usage (average and peak)');
  console.log('  ✅ Memory usage (average and peak)');
  console.log('  ✅ Network I/O');
  console.log('  ✅ Build time');
  console.log('\n' + '='.repeat(80));
  
  const startTime = Date.now();
  const results = [];
  
  for (const framework of frameworks) {
    const result = await benchmarkFramework(framework);
    // Attach any existing stress test results for this framework
    const stressPath = path.join(RESULTS_DIR, 'stress-test-results.json');
    if (fs.existsSync(stressPath)) {
      try {
        const stressData = JSON.parse(fs.readFileSync(stressPath, 'utf-8'));
        const match = stressData.find(s => s.framework === framework.name);
        if (match) result.stress = match;
      } catch (e) {
        console.warn('Unable to parse stress-test-results.json');
      }
    }
    results.push(result);
    
    // Save incremental results
    const outputPath = path.join(RESULTS_DIR, 'comprehensive-benchmark-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`\n✅ ${framework.name} benchmark complete`);
    console.log(`   Progress: ${results.length}/${frameworks.length} frameworks`);
  }
  
  // Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 COMPREHENSIVE BENCHMARK SUMMARY\n');
  console.log('='.repeat(80));
  
  const validResults = results.filter(r => !r.error && r.performanceScore !== undefined);
  
  if (validResults.length > 0) {
    // Performance Rankings
    console.log('\n🏆 Performance Rankings (by Lighthouse Score):\n');
    const perfSorted = [...validResults].sort((a, b) => b.performanceScore - a.performanceScore);
    
    perfSorted.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name || r.framework} (${r.type}) - Score: ${r.performanceScore}/100`);
      console.log(`   FCP: ${Math.round(r.metrics.firstContentfulPaint)}ms | LCP: ${Math.round(r.metrics.largestContentfulPaint)}ms | TTI: ${Math.round(r.metrics.timeToInteractive)}ms`);
    });
    
    // Bundle Size Rankings
    console.log('\n📦 Bundle Size Rankings (smallest first):\n');
    const sizeSorted = [...validResults].sort((a, b) => a.totalGzipped - b.totalGzipped);
    
    sizeSorted.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name || r.framework} (${r.type}) - ${r.totalGzippedFormatted} gzipped`);
      if (r.totalWASM > 0) {
        console.log(`   JS: ${r.totalJSFormatted} | WASM: ${r.totalWASMFormatted} | CSS: ${r.totalCSSFormatted}`);
      } else {
        console.log(`   JS: ${r.totalJSFormatted} | CSS: ${r.totalCSSFormatted}`);
      }
    });
    
    // CPU Usage Rankings
    console.log('\n💻 CPU Usage (average during runtime):\n');
    const cpuSorted = [...validResults].sort((a, b) => (a.containerStats?.cpu?.average || 0) - (b.containerStats?.cpu?.average || 0));
    
    cpuSorted.forEach((r, i) => {
      if (r.containerStats?.cpu) {
        console.log(`${i + 1}. ${r.name || r.framework} - Avg: ${r.containerStats.cpu.average.toFixed(2)}% | Max: ${r.containerStats.cpu.max.toFixed(2)}%`);
      }
    });
    
    // Memory Usage Rankings
    console.log('\n💾 Memory Usage (average during runtime):\n');
    const memSorted = [...validResults].sort((a, b) => (a.containerStats?.memory?.averageMB || 0) - (b.containerStats?.memory?.averageMB || 0));
    
    memSorted.forEach((r, i) => {
      if (r.containerStats?.memory) {
        console.log(`${i + 1}. ${r.name || r.framework} - Avg: ${r.containerStats.memory.averageMB.toFixed(2)} MB | Max: ${r.containerStats.memory.maxMB.toFixed(2)} MB`);
      }
    });
    
    // Build Time Rankings
    console.log('\n⏱️  Build Time Rankings (fastest first):\n');
    const buildSorted = [...validResults].sort((a, b) => a.buildTime - b.buildTime);
    
    buildSorted.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name || r.framework} - ${r.buildTime}s (${Math.round(r.buildTime / 60)} min)`);
    });
  }
  
  // Show any failures
  const failedResults = results.filter(r => r.error);
  if (failedResults.length > 0) {
    console.log('\n⚠️  Failed Benchmarks:\n');
    failedResults.forEach(r => {
      console.log(`   ❌ ${r.framework}: ${r.error}`);
    });
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n✅ All benchmarks completed in ${duration}s (${Math.round(duration / 60)} minutes)`);
  console.log(`\n📁 Results saved to: ${path.join(RESULTS_DIR, 'comprehensive-benchmark-results.json')}`);
  console.log('\n💡 Next: Update RESULTS.md with the benchmark data\n');
}

main().catch(console.error);
