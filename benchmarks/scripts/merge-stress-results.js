#!/usr/bin/env node

/**
 * Merge Stress Test Results
 * Merges stress-test-results.json into comprehensive-benchmark-results.json
 * so that all data is available in one file for report generation.
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
const comprehensivePath = path.join(RESULTS_DIR, 'comprehensive-benchmark-results.json');
const stressPath = path.join(RESULTS_DIR, 'stress-test-results.json');

if (!fs.existsSync(comprehensivePath)) {
  console.error('No comprehensive-benchmark-results.json found. Skipping merge.');
  process.exit(0);
}

if (!fs.existsSync(stressPath)) {
  console.warn('No stress-test-results.json found. Skipping merge.');
  process.exit(0);
}

let comprehensive, stress;

try {
  comprehensive = JSON.parse(fs.readFileSync(comprehensivePath, 'utf-8'));
} catch (err) {
  console.error(`Failed to parse ${comprehensivePath}: ${err.message}`);
  process.exit(1);
}

try {
  stress = JSON.parse(fs.readFileSync(stressPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to parse ${stressPath}: ${err.message}`);
  process.exit(1);
}

// Build O(n) lookup map for O(1) retrieval by framework name
const stressMap = new Map(stress.map(s => [s.framework, s]));

let mergeCount = 0;
comprehensive.forEach(r => {
  const stressEntry = stressMap.get(r.framework);
  if (stressEntry) {
    r.stress = stressEntry;
    mergeCount++;
    console.log(`  ✅ Merged stress results for ${r.framework}`);
  } else {
    console.log(`  ⚠️  No stress data for ${r.framework}`);
  }
});

fs.writeFileSync(comprehensivePath, JSON.stringify(comprehensive, null, 2));
console.log(`\n✅ Merged stress results for ${mergeCount} framework(s) into comprehensive-benchmark-results.json`);
