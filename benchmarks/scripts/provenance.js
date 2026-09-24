#!/usr/bin/env node
/**
 * Run provenance helpers.
 *
 * Two facts make time-based attribution of environment metadata unreliable:
 *   1. `environment.json` (runner specs) and the measurement JSON files are
 *      independent, so nothing structurally ties them together.
 *   2. A results directory is reused across runs, so a sidecar provenance file
 *      alone is overwritten by whichever script ran last.
 *
 * The fix is to stamp a run id onto every measurement we emit (comprehensive
 * results, standalone stress results) and record that same id in the captured
 * environment. A consumer can then accept environment metadata only when every
 * measurement it is about to display carries the matching id.
 *
 * In CI all benchmark steps share `GITHUB_RUN_ID`, so they agree on one id.
 * Locally each invocation is its own run unless BENCH_RUN_ID is set.
 */

const fs = require('fs');
const path = require('path');

const PROVENANCE_FILE = 'run-provenance.json';

function provenancePath(resultsDir) {
  return path.join(resultsDir, PROVENANCE_FILE);
}

function resolveRunId() {
  if (process.env.BENCH_RUN_ID) return process.env.BENCH_RUN_ID;
  if (process.env.GITHUB_RUN_ID) return `gh-${process.env.GITHUB_RUN_ID}`;
  return `local-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

// Record the id for the run that is starting. Returns the id to stamp on
// measurements. Safe to call from multiple steps of one CI run: they resolve
// the same GITHUB_RUN_ID, so the file stays consistent.
function stampRun(resultsDir, kind) {
  const runId = resolveRunId();
  const record = { runId, kind, startedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(provenancePath(resultsDir), JSON.stringify(record, null, 2));
  } catch (e) {
    console.warn(`Could not write ${PROVENANCE_FILE}: ${e.message}`);
  }
  return runId;
}

function readRunId(resultsDir) {
  try {
    return JSON.parse(fs.readFileSync(provenancePath(resultsDir), 'utf-8')).runId || null;
  } catch (e) {
    return null;
  }
}

module.exports = { provenancePath, resolveRunId, stampRun, readRunId, PROVENANCE_FILE };
