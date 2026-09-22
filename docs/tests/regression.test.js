#!/usr/bin/env node
/**
 * Regression tests for the finding-areas that the PR review called out.
 *
 * Each test drives the real production scripts (never a re-implementation) and
 * asserts the failure behaviour that was missing:
 *
 *  1. a failed capture exits non-zero and deletes the stale framework screenshots
 *  2. an invalid --framework target fails
 *  3. the empty-state capture really removes all 100 todos (0 items, state visible)
 *  4. optimize-images.py works from an unrelated working directory
 *  5. verify-screenshots.js fails when a framework or state is missing
 *  6. parity-check.js acts on the *new* todo, not `.last()`
 *  7. toggle-all is required and its behaviour is asserted
 *  8. a report without badge/footer rectangles fails the pixel checker
 *  9. the console-error policy tolerates a missing favicon but not a real 404
 *
 * Usage: node docs/tests/regression.test.js
 */
const { spawnSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOCS = path.resolve(__dirname, '..');
const ROOT = path.resolve(DOCS, '..');
const SHOTS = path.join(DOCS, 'screenshots');
const FIXTURE_PORT = 4188;

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd || DOCS,
    encoding: 'utf8',
    timeout: opts.timeout || 180000,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return res;
}

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fb-${name}-`));
}

async function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`fixture server on ${port} never became ready`);
}

/**
 * Start the fixture server as a separate process. It must not run in this
 * process: the tests drive the production scripts with spawnSync, which blocks
 * the Node event loop, so an in-process server could never answer the child.
 */
async function startFixture(flags) {
  const args = [path.join(__dirname, 'lib', 'fixture-server.js'), '--port', String(FIXTURE_PORT)];
  if (flags && Object.keys(flags).length) args.push('--flags', JSON.stringify(flags));
  const proc = spawn('node', args, { cwd: DOCS, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  const server = {
    proc,
    stop: () => new Promise((resolve) => {
      proc.once('exit', resolve);
      proc.kill('SIGTERM');
    }),
    stderr: () => stderr,
  };
  try {
    await waitForPort(FIXTURE_PORT);
  } catch (e) {
    await server.stop();
    throw new Error(`${e.message}\n${stderr}`);
  }
  return server;
}

async function stopFixture(server) {
  if (server) await server.stop();
}

async function collectEvents() {
  const res = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__events`);
  return res.json();
}

function readReport(outDir, name) {
  const p = path.join(outDir, 'screenshot-report.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'))[name];
}

// ---------------------------------------------------------------------------
// A report fixture builder for the pixel-checker test.
function writeShots(dir, { omitRects = false, frameworks = null } = {}) {
  const FW = frameworks || ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade'];
  const STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state'];
  const report = {};
  for (const fw of FW) {
    fs.mkdirSync(path.join(dir, fw), { recursive: true });
    report[fw] = {
      renderedItems: 100,
      remaining: 67,
      emptyStateVisible: true,
      emptyStateItems: 0,
      stats: '67 items remaining',
      errors: [],
      labelRects: {},
      screenshots: [],
    };
    for (const s of STATES) {
      // Real capture geometry, so the verifier's card checks are meaningful.
      const src = path.join(SHOTS, fw, `${s}.png`);
      if (!fs.existsSync(src)) {
        throw new Error(`writeShots: missing source screenshot ${src} (run \`npm run capture\` first)`);
      }
      fs.copyFileSync(src, path.join(dir, fw, `${s}.png`));
      report[fw].screenshots.push(`${fw}/${s}.png`);
      report[fw].labelRects[s] = omitRects
        ? {}
        : { badge: [100, 20, 50, 24], footer: [100, 900, 400, 20] };
    }
  }
  fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
  return report;
}

(async () => {
  console.log('Regression tests\n');
  fs.mkdirSync(path.join(DOCS, 'logs'), { recursive: true });

  // --- 1 + 3: capture of a working fixture, then a failing one --------------
  console.log('capture behaviour');
  let server = await startFixture({});
  const okDir = tmpDir('capture-ok');
  {
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', okDir]);
    await test('capture succeeds for a working fixture and exits 0', () => {
      assert(res.status === 0, `exit ${res.status}: ${res.stderr}`);
    });
    await test('empty-state capture removes every todo (0 items, empty state visible)', () => {
      const entry = readReport(okDir, 'fixture');
      assert(entry, 'no report entry for fixture');
      assert(entry.emptyStateItems === 0, `emptyStateItems=${entry.emptyStateItems}`);
      assert(entry.renderedItems === 100, `renderedItems=${entry.renderedItems}`);
      assert(entry.emptyStateVisible === true, 'emptyStateVisible not true');
      assert(fs.existsSync(path.join(okDir, 'fixture', 'empty-state.png')), 'empty-state.png missing');
      for (const s of ['all', 'active', 'completed', 'input-filled', 'empty-state'])
        assert(fs.existsSync(path.join(okDir, 'fixture', `${s}.png`)), `${s}.png missing`);
    });
    await test('capture recorded the toggle-all click preconditions', () => {
      const entry = readReport(okDir, 'fixture');
      assert(entry.errors.length === 0, `errors: ${entry.errors.join(' | ')}`);
      assert(entry.labelRects['all'].badge && entry.labelRects['all'].footer, 'labelRects incomplete');
    });
  }
  await stopFixture(server);

  // 1: a capture that fails must exit non-zero and leave no stale screenshots.
  server = await startFixture({ count: 0 }); // 0 items -> expectation mismatch
  const failDir = tmpDir('capture-fail');
  {
    // Seed a stale screenshot + report entry to prove it is invalidated.
    fs.mkdirSync(path.join(failDir, 'fixture'), { recursive: true });
    fs.writeFileSync(path.join(failDir, 'fixture', 'all.png'), 'STALE');
    fs.writeFileSync(
      path.join(failDir, 'screenshot-report.json'),
      JSON.stringify({ fixture: { bad: true } })
    );
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', failDir]);
    await test('failed capture exits non-zero', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
    });
    await test('failed capture removes the stale screenshots', () => {
      const leftover = fs.existsSync(path.join(failDir, 'fixture'))
        ? fs.readdirSync(path.join(failDir, 'fixture'))
        : [];
      assert(leftover.length === 0, `stale files remain: ${leftover.join(', ')}`);
    });
    await test('failed capture records the failure in the report', () => {
      const entry = readReport(failDir, 'fixture');
      assert(entry && entry.failed === true, `report entry not marked failed: ${JSON.stringify(entry)}`);
      assert(typeof entry.error === 'string' && entry.error.length, 'no error message recorded');
    });
  }
  await stopFixture(server);

  // 2: an invalid --framework target must fail.
  console.log('\ninvalid target handling');
  await test('unknown --framework name fails', () => {
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', 'not-a-framework', '--out', tmpDir('bad')]);
    assert(res.status !== 0, 'expected non-zero exit');
    assert(/unknown --framework/.test(res.stderr + res.stdout), 'no clear error message');
  });
  await test('malformed --framework name:port fails', () => {
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', 'react:notaport', '--out', tmpDir('bad')]);
    assert(res.status !== 0, 'expected non-zero exit');
  });

  // --- 4: optimize runs from an unrelated working directory -----------------
  console.log('\noptimizer portability');
  await test('optimize-images.py works from a different working directory', () => {
    const outDir = tmpDir('optimize-src');
    const dstDir = tmpDir('optimize-dst');
    writeShots(outDir);
    const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', outDir, '--dst', dstDir], { cwd: os.tmpdir() });
    assert(res.status === 0, `exit ${res.status}: ${res.stderr}`);
    const count = fs.readdirSync(path.join(dstDir, 'react')).filter((f) => f.endsWith('.jpg')).length;
    assert(count === 5, `expected 5 jpgs, found ${count}`);
  });
  await test('optimize-images.py fails clearly when screenshots are missing', () => {
    const empty = tmpDir('optimize-empty');
    const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', empty, '--dst', tmpDir('d')], { cwd: os.tmpdir() });
    assert(res.status !== 0, 'expected non-zero exit');
    assert(/missing/i.test(res.stderr), `unclear error: ${res.stderr}`);
  });

  // --- 5: verifier completeness -------------------------------------------
  console.log('\nverifier completeness');
  {
    const dir = tmpDir('verify-missing');
    writeShots(dir, { frameworks: ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus'] });
    await test('verify fails when a framework directory is missing', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/blade/.test(res.stdout), 'blade not named in output');
    });
  }
  {
    const dir = tmpDir('verify-state');
    writeShots(dir);
    fs.rmSync(path.join(dir, 'react', 'empty-state.png'));
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.react.screenshots = report.react.screenshots.filter((s) => !s.endsWith('empty-state.png'));
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report));
    await test('verify fails when a required state file is missing', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/empty-state/.test(res.stdout), 'empty-state not named in output');
    });
  }
  {
    const dir = tmpDir('verify-errors');
    writeShots(dir);
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.vue.errors = ['console: boom'];
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report));
    await test('verify fails when the report records console errors', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/console: boom/.test(res.stdout), 'error not surfaced');
    });
  }
  {
    const dir = tmpDir('verify-ok');
    writeShots(dir);
    await test('verify passes for a complete, error-free set', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status === 0, `exit ${res.status}: ${res.stdout}`);
    });
  }

  // --- 8: pixel checker robustness ----------------------------------------
  console.log('\npixel checker robustness');
  {
    const dir = tmpDir('pixel-norects');
    writeShots(dir, { omitRects: true });
    await test('pixel-parity fails when the report has no badge/footer rectangles', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/labelRects|rectangle/i.test(res.stdout), `unclear error: ${res.stdout}`);
    });
  }
  {
    const dir = tmpDir('pixel-noreport');
    fs.mkdirSync(path.join(dir, 'react'), { recursive: true });
    await test('pixel-parity fails when the report is missing', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/report not found/i.test(res.stdout), `unclear error: ${res.stdout}`);
    });
  }
  {
    const dir = tmpDir('pixel-badjson');
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), '{ not json');
    await test('pixel-parity fails clearly on a corrupt report', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/not valid JSON/i.test(res.stdout), `unclear error: ${res.stdout}`);
    });
  }

  // --- 9: console-error policy --------------------------------------------
  console.log('\nconsole-error policy');
  {
    server = await startFixture({});
    const dir = tmpDir('console-ok');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a missing favicon does not fail the capture', () => {
      assert(res.status === 0, `exit ${res.status}: ${res.stderr}`);
    });
    await stopFixture(server);
  }
  {
    server = await startFixture({ brokenAsset: true });
    const dir = tmpDir('console-bad');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a non-favicon 404 fails the capture', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
      assert(/definitely-missing-asset/.test(res.stdout + res.stderr), 'the failing URL was not reported');
    });
    await stopFixture(server);
  }

  // --- 6 + 7: parity script correctness ------------------------------------
  console.log('\nparity script (fixture targets)');
  {
    server = await startFixture({});
    const res = run('node', [
      path.join(DOCS, 'parity-check.js'),
      '--target', `fixture:${FIXTURE_PORT}`,
      '--reference', 'fixture',
    ]);
    await test('parity passes against a contract-compliant fixture', () => {
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}\n${res.stderr}`);
      assert(/toggle-all is missing|toggleAll/i.test(res.stdout) === false, 'toggle-all reported missing');
    });
    const events = await collectEvents().catch(() => []);
    await test('the new todo was added, toggled and deleted (not a pre-existing row)', async () => {
      const kinds = events.map((e) => e.kind);
      assert(kinds.includes('add'), `no add event: ${JSON.stringify(events)}`);
      assert(kinds.includes('toggle'), `no toggle event: ${JSON.stringify(events)}`);
      assert(kinds.includes('delete'), `no delete event: ${JSON.stringify(events)}`);
      const toggle = events.find((e) => e.kind === 'toggle');
      const del = events.find((e) => e.kind === 'delete');
      assert(toggle.payload.text === 'Parity check item', `toggled the wrong row: ${JSON.stringify(toggle.payload)}`);
      assert(del.payload.text === 'Parity check item', `deleted the wrong row: ${JSON.stringify(del.payload)}`);
      assert(del.payload.id > 100, `deleted a pre-existing row (id ${del.payload.id})`);
    });
    await test('toggle-all turned every item completed and then all active again', () => {
      const toggles = events.filter((e) => e.kind === 'toggleAll');
      assert(toggles.length === 2, `expected 2 toggle-all events, got ${toggles.length}`);
      assert(toggles[0].payload.nowAllCompleted === true, 'first toggle-all did not complete all');
      assert(toggles[1].payload.nowAllCompleted === false, 'second toggle-all did not clear all');
    });
    await stopFixture(server);
  }

  // 6: hostile placement proves position-based selection would fail.
  {
    server = await startFixture({ insertMiddle: true });
    const res = run('node', [
      path.join(DOCS, 'parity-check.js'),
      '--target', `fixture:${FIXTURE_PORT}`,
      '--reference', 'fixture',
    ], { timeout: 60000 });
    await test('parity picks the new item by text even when it is inserted mid-list', async () => {
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}`);
      const events = await collectEvents().catch(() => []);
      const toggle = events.find((e) => e.kind === 'toggle');
      assert(toggle && toggle.payload.text === 'Parity check item', `wrong row: ${JSON.stringify(toggle)}`);
    });
    await stopFixture(server);
  }

  // 7: a broken toggle-all must be fatal, and a missing control must be fatal.
  {
    server = await startFixture({ toggleAllBroken: true });
    const res = run('node', [
      path.join(DOCS, 'parity-check.js'),
      '--target', `fixture:${FIXTURE_PORT}`,
      '--reference', 'fixture',
    ], { timeout: 60000 });
    await test('parity fails when toggle-all does not change the list', () => {
      assert(res.status !== 0, 'expected non-zero exit for a no-op toggle-all');
      assert(/toggleAll|toggle-all/.test(res.stdout), 'toggle-all not named in the failure');
    });
    await stopFixture(server);
  }
  {
    server = await startFixture({ hideToggleAll: true });
    const res = run('node', [
      path.join(DOCS, 'parity-check.js'),
      '--target', `fixture:${FIXTURE_PORT}`,
      '--reference', 'fixture',
    ], { timeout: 60000 });
    await test('parity fails when the toggle-all control is absent', () => {
      assert(res.status !== 0, 'expected non-zero exit when toggle-all is missing');
      assert(/toggle-all control is missing/.test(res.stdout), `unexpected output: ${res.stdout}`);
    });
    await stopFixture(server);
  }

  console.log(`\n${failed === 0 ? `ALL ${passed} REGRESSION TESTS PASSED` : `${failed} FAILED, ${passed} passed`}`);
  if (failed) {
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('regression.test.js: ' + e.stack);
  process.exit(1);
});
