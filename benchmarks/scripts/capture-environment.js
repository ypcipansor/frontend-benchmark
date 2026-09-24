#!/usr/bin/env node
/**
 * Capture the environment this benchmark run executes in and write it to
 * benchmarks/results/environment.json.
 *
 * The comprehensive workflow runs this automatically before the README updater.
 * Manual runs should run it too (`node capture-environment.js`), otherwise the
 * generated Test Environment table reports "_not captured_" instead of
 * inventing specs the run never verified.
 *
 * Values can be overridden via env vars for non-CI machines:
 *   BENCH_OS, BENCH_CPU, BENCH_MEMORY, BENCH_RUN_URL
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const RESULTS_DIR = path.join(__dirname, '../results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
const { readRunId, resolveRunId } = require('./provenance');

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (e) { return null; }
};

function dockerVersion() {
  const server = sh("docker version --format '{{.Server.Version}}'");
  if (!server) return null;
  const containerd = sh("docker version --format '{{.Server.Containerd.Version}}'");
  const runc = sh("docker version --format '{{.Server.Runc.Version}}'");
  const extras = [containerd && `containerd ${containerd}`, runc && `runc ${runc}`].filter(Boolean);
  return extras.length ? `${server} (${extras.join(', ')})` : server;
}

function loadToolVersion() {
  try {
    const pkg = require('autocannon/package.json');
    return `autocannon ${pkg.version} (pipelining 1)`;
  } catch (e) {
    return 'autocannon (pipelining 1)';
  }
}

function chromeVersion() {
  const bin = process.env.CHROME_PATH || sh('which chromium-browser') || sh('which chromium') || 'chromium';
  const out = sh(`${bin} --version`);
  return out || null;
}

const memKb = (() => {
  const raw = sh("awk '/MemTotal/ {print $2}' /proc/meminfo");
  return raw ? parseInt(raw, 10) : Math.round(os.totalmem() / 1024);
})();

const cpus = sh('nproc') || String(os.cpus().length);

const serverUrl = process.env.GITHUB_SERVER_URL;
const repo = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const inferredRunUrl = (serverUrl && repo && runId) ? `${serverUrl}/${repo}/actions/runs/${runId}` : null;

// Link this capture to the benchmark run it describes. In CI the benchmark
// steps share GITHUB_RUN_ID, so the provenance file (written by the stress or
// comprehensive script) resolves to the same id. A manual run that captured an
// environment only gets the id it would itself stamp, which will not match a
// differently-stamped measurement set — that mismatch is reported as uncaptured
// rather than attributing one machine's specs to another's numbers.
const benchmarkRunId = readRunId(RESULTS_DIR) || resolveRunId();

const env = {
  runner: {
    os: process.env.BENCH_OS || (process.env.GITHUB_ACTIONS ? 'ubuntu-latest (GitHub-hosted)' : `${os.type()} ${os.release()} (${os.arch()})`),
    cpu: process.env.BENCH_CPU || `${cpus} vCPU`,
    memory: process.env.BENCH_MEMORY || `${(memKb / 1024 / 1024).toFixed(2)} GiB`,
    node: process.version
  },
  chrome: chromeVersion(),
  docker: dockerVersion(),
  loadTool: loadToolVersion(),
  runUrl: process.env.BENCH_RUN_URL || inferredRunUrl,
  benchmarkRunId,
  artifactRetentionDays: 90,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(path.join(RESULTS_DIR, 'environment.json'), JSON.stringify(env, null, 2));
console.log('Wrote environment.json:', JSON.stringify(env, null, 2));
