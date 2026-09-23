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
 * 10. parity-check.js fails on a wrong title/badge/footer/stats/filter/item label
 * 11. pixel-parity.py fails on a 1-unit RGB change outside the mask, and ignores
 *     changes inside it
 * 12. start-servers.sh refuses a port that is already serving (stale server)
 * 13. stop-servers.sh reaps the whole process group, leaving no orphan on the port
 *
 * Every fixture is synthetic and self-contained: no test reads
 * docs/screenshots/, so the suite runs on a clean checkout (and with the
 * production captures moved away) — see the `--require-no-captures` flag.
 *
 * Usage: node docs/tests/regression.test.js [--require-no-captures]
 */
const { spawnSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');

const DOCS = path.resolve(__dirname, '..');
const ROOT = path.resolve(DOCS, '..');
const SHOTS = path.join(DOCS, 'screenshots');
const FIXTURE_PORT = 4188;
const REQUIRE_NO_CAPTURES = process.argv.includes('--require-no-captures');

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

/**
 * Run parity-check.js against the fixture server. The fixture's title, badge and
 * footer are declared explicitly (--expect), because the content contract is
 * data, not something the script should guess from the target's name.
 */
const FIXTURE_EXPECT = JSON.stringify({
  title: 'Todo List - Fixture',
  badge: 'Fixture',
  footer: 'Frontend Benchmark - Fixture Implementation',
});

function runParity(flags = {}, opts = {}) {
  const args = [
    path.join(DOCS, 'parity-check.js'),
    '--target', `fixture:${FIXTURE_PORT}`,
    '--reference', 'fixture',
    '--expect', FIXTURE_EXPECT,
  ];
  return run('node', args, { timeout: 60000, ...opts });
}

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fb-${name}-`));
}

/** Last few lines of a long command output, for readable failure messages. */
function tail(s, n = 25) {
  const lines = String(s || '').trimEnd().split('\n');
  return lines.slice(-n).join('\n');
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
// Synthetic fixtures. These are deliberately self-contained: nothing here reads
// docs/screenshots/, so the suite runs on a clean checkout and while the
// production captures are being regenerated. The images are realistic enough to
// satisfy the verifier's layout/colour/white-ratio checks and the pixel
// checker's mask behaviour.
const FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade'];
const STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state'];
const VIEWPORT_W = 1440;
const VIEWPORT_H = 1024;
const CARD_LEFT = 420;
const CARD_WIDTH = 600;
const CARD_TOP = 114;
const POPULATED_HEIGHT = 796;
const EMPTY_HEIGHT = 500;
// Badge and footer boxes recorded in the report and used as the pixel mask.
const BADGE_RECT = [560, 145, 90, 28];
const FOOTER_RECT = [450, 880, 540, 30];

/**
 * A deterministic screenshot: a non-white gradient backdrop, a white card of the
 * given height holding many distinct colours (so uniqueColors is realistic), and
 * a coloured marker inside `badgeRect` that differs per framework — exactly the
 * kind of framework-name difference the pixel checker is meant to mask.
 */
function writeShot(file, { cardHeight, markerColor }) {
  const png = new PNG({ width: VIEWPORT_W, height: VIEWPORT_H });
  for (let y = 0; y < VIEWPORT_H; y++) {
    for (let x = 0; x < VIEWPORT_W; x++) {
      const i = (y * VIEWPORT_W + x) * 4;
      const inCard =
        x >= CARD_LEFT && x < CARD_LEFT + CARD_WIDTH && y >= CARD_TOP && y < CARD_TOP + cardHeight;
      let r, g, b;
      if (inCard) {
        if ((x * 13 + y * 29) % 97 === 0) {
          r = 100 + (x % 157);
          g = 50 + (y % 203);
          b = 150 + ((x * 7 + y) % 105);
        } else {
          r = 255; g = 255; b = 255;
        }
      } else {
        r = 190 + (x % 50);
        g = 200 + (y % 40);
        b = 220 + ((x + y) % 20);
      }
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  if (markerColor) {
    const [bx, by, bw, bh] = BADGE_RECT;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const i = (y * VIEWPORT_W + x) * 4;
        png.data[i] = markerColor[0];
        png.data[i + 1] = markerColor[1];
        png.data[i + 2] = markerColor[2];
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/**
 * Build a complete, self-contained capture set (7 frameworks x 5 states) plus
 * screenshot-report.json, without touching the committed screenshots.
 */
function writeShots(dir, { omitRects = false, frameworks = null, mutate = null } = {}) {
  const FW = frameworks || FRAMEWORKS;
  const report = {};
  FW.forEach((fw, idx) => {
    const markerColor = [60 + idx * 20, 130, 200 - idx * 15];
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
      const file = path.join(dir, fw, `${s}.png`);
      writeShot(file, {
        cardHeight: s === 'empty-state' ? EMPTY_HEIGHT : POPULATED_HEIGHT,
        markerColor,
      });
      report[fw].screenshots.push(`${fw}/${s}.png`);
      report[fw].labelRects[s] = omitRects
        ? {}
        : { badge: BADGE_RECT.slice(), footer: FOOTER_RECT.slice() };
    }
  });
  if (mutate) mutate(dir, report);
  fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
  return report;
}

/** Change one channel of one pixel in a PNG, for the pixel checker tests.
 *
 * The delta is applied in whichever direction actually changes the byte, so a
 * poke at an already-saturated (255) pixel is not silently clamped away — the
 * test must exercise a real 1-unit difference.
 */
function pokePixel(file, x, y, channel, delta) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const i = (y * png.width + x) * 4 + channel;
  const before = png.data[i];
  const after = before + delta;
  png.data[i] = after < 0 || after > 255 ? before - Math.sign(delta) : after;
  if (png.data[i] === before) throw new Error(`pokePixel: pixel ${x},${y} did not change`);
  fs.writeFileSync(file, PNG.sync.write(png));
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
  {
    // One framework's card is 40px shorter than the rest. The verifier no longer
    // pins an absolute height (font metrics differ per platform), but it must
    // still catch a layout that diverges from every other framework.
    const dir = tmpDir('verify-height');
    writeShots(dir);
    for (const s of ['all', 'active', 'completed', 'input-filled']) {
      writeShot(path.join(dir, 'react', `${s}.png`), { cardHeight: 700, markerColor: [60, 130, 200] });
    }
    await test('verify fails when one framework card height diverges', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/height disagrees/.test(res.stdout), `not reported: ${res.stdout}`);
    });
  }
  // --- 8 + 11: pixel checker robustness and exact equality -----------------
  console.log('\npixel checker robustness');
  {
    const dir = tmpDir('pixel-ok');
    writeShots(dir);
    await test('pixel-parity passes for a byte-identical set (framework names masked)', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}`);
    });
  }
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
  {
    // The contract is byte-identity outside the mask, so a single unit of change
    // in one channel of one pixel must fail — no colour tolerance.
    const dir = tmpDir('pixel-1delta');
    writeShots(dir);
    pokePixel(path.join(dir, 'vue', 'all.png'), 700, 400, 1, 1);
    await test('pixel-parity fails on a 1-unit RGB change outside the mask', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/vue/.test(res.stdout), 'the diverging framework was not named');
    });
  }
  {
    // A framework-name difference inside the masked badge/footer regions is the
    // one tolerated difference; it must keep passing.
    const dir = tmpDir('pixel-masked');
    writeShots(dir);
    const file = path.join(dir, 'vue', 'all.png');
    pokePixel(file, BADGE_RECT[0] + 3, BADGE_RECT[1] + 3, 0, 40);
    pokePixel(file, FOOTER_RECT[0] + 3, FOOTER_RECT[1] + 3, 2, -40);
    await test('pixel-parity ignores changes inside the mask', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status === 0, `expected a pass:\n${res.stdout}`);
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
  {
    // An application resource that merely has "favicon" in its path is still a
    // real failure: the policy matches the failing request URL, not the text.
    server = await startFixture({ brokenPathWithFavicon: true });
    const dir = tmpDir('console-faviconish');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a 404 whose URL merely contains "favicon" still fails', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
      assert(/favicon-ish-asset/.test(res.stdout + res.stderr), 'the failing URL was not reported');
    });
    await stopFixture(server);
  }
  {
    // A console error whose *text* mentions favicon but comes from a script with
    // no favicon URL must not be silently ignored.
    server = await startFixture({ consoleErrorTextContainsFavicon: true });
    const dir = tmpDir('console-textonly');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a console error whose text mentions favicon still fails', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
    });
    await stopFixture(server);
  }
  {
    server = await startFixture({ pageError: 'boom from the app' });
    const dir = tmpDir('console-pageerror');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a pageerror always fails the capture', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
      assert(/boom from the app/.test(res.stdout + res.stderr), 'the pageerror text was not reported');
    });
    await stopFixture(server);
  }

  // --- 6 + 7 + 10: parity script correctness -------------------------------
  console.log('\nparity script (fixture targets)');
  {
    server = await startFixture({});
    const res = runParity();
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
    const res = runParity();
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
    const res = runParity();
    await test('parity fails when toggle-all does not change the list', () => {
      assert(res.status !== 0, 'expected non-zero exit for a no-op toggle-all');
      assert(/toggleAll|toggle-all/.test(res.stdout), 'toggle-all not named in the failure');
    });
    await stopFixture(server);
  }
  {
    server = await startFixture({ hideToggleAll: true });
    const res = runParity();
    await test('parity fails when the toggle-all control is absent', () => {
      assert(res.status !== 0, 'expected non-zero exit when toggle-all is missing');
      assert(/toggle-all control is missing/.test(res.stdout), `unexpected output: ${res.stdout}`);
    });
    await stopFixture(server);
  }

  // --- 10: content mismatches must fail parity, not just geometry ----------
  console.log('\nparity content contract');
  const contentCases = [
    ['a wrong page title', { title: 'Todo List - Wrong' }, 'title'],
    ['a wrong framework badge', { badge: 'NotTheBadge' }, 'badge'],
    ['a wrong footer text', { footerText: 'Wrong footer' }, 'footer'],
    ['a wrong stats wording', { statsSuffix: 'things left' }, 'stats'],
    ['a wrong first item label', { itemLabelPrefix: 'Task ' }, 'firstItem'],
    ['a missing filter button', { filterLabels: ['All', 'Active', 'Gone'] }, 'filterLabels'],
  ];
  for (const [label, flags, field] of contentCases) {
    server = await startFixture(flags);
    const res = runParity();
    await test(`parity fails on ${label}`, () => {
      assert(res.status !== 0, `expected non-zero exit for ${label}:\n${res.stdout}`);
      assert(new RegExp(field, 'i').test(res.stdout), `${field} not named in the failure:\n${res.stdout}`);
    });
    await stopFixture(server);
  }
  {
    server = await startFixture({ extraFilter: 1 });
    const res = runParity();
    await test('parity fails on an extra filter button', () => {
      assert(res.status !== 0, `expected non-zero exit for an extra filter:\n${res.stdout}`);
      assert(/filterLabels/.test(res.stdout), `filterLabels not named:\n${res.stdout}`);
    });
    await stopFixture(server);
  }

  // --- 12: start-servers.sh must refuse a port that is already serving ------
  console.log('\nstale-server guard');
  {
    // A "stale" server: it answers HTTP on the target port before the script
    // runs. start-servers.sh must refuse rather than report it as freshly ready,
    // and must leave the foreign process alone.
    const STALE_PORT_OFFSET = 1000; // react -> 5001, far from the real ports
    const stalePort = 4001 + STALE_PORT_OFFSET;
    const stale = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>stale</title>stale server');
    });
    await new Promise((resolve) => stale.listen(stalePort, '127.0.0.1', resolve));
    try {
      const res = run(
        'bash',
        [path.join(DOCS, 'scripts', 'start-servers.sh'), '--only', 'react',
         '--port-offset', String(STALE_PORT_OFFSET), '--ready-timeout', '5'],
        { timeout: 30000 }
      );
      await test('start-servers.sh fails when the target port is already in use', () => {
        assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
        assert(/already in use/.test(res.stdout + res.stderr), `no clear message:\n${res.stdout}${res.stderr}`);
      });
      await test('start-servers.sh does not treat the stale server as ready', () => {
        assert(!/ready on/.test(res.stdout + res.stderr), `claimed readiness:\n${res.stdout}`);
      });
      await test('the pre-existing server is still alive (never killed)', async () => {
        const ok = await fetch(`http://127.0.0.1:${stalePort}/`).then((r) => r.ok).catch(() => false);
        assert(ok, 'the stale server was killed');
        assert(stale.listening, 'the stale server socket was closed');
      });
    } finally {
      await new Promise((resolve) => stale.close(resolve));
    }
  }

  // --- 13: stop-servers.sh must reap the whole process group ----------------
  console.log('\nstop-servers.sh process-group cleanup');
  {
    // Simulate what start-servers.sh does: launch a server under setsid so the
    // recorded PID leads a process group, with a child process (like npm -> vite).
    const logsDir = tmpDir('stop-logs');
    const port = 4189;
    const leader = spawn(
      'setsid',
      ['bash', '-lc', `python3 -m http.server ${port} --bind 127.0.0.1 & wait`],
      { stdio: 'ignore' }
    );
    try {
      await waitForPort(port);
      fs.writeFileSync(path.join(logsDir, 'fixture.pid'), String(leader.pid));
      const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
        env: { FB_LOGS_DIR: logsDir },
        timeout: 30000,
      });
      await test('stop-servers.sh stops a server started under setsid', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/stopping fixture/.test(res.stdout), `did not report stopping it: ${res.stdout}`);
      });
      await test('stop-servers.sh leaves no orphaned child holding the port', async () => {
        const deadline = Date.now() + 5000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still being served after stop`);
      });
    } finally {
      try { process.kill(-leader.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { leader.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  // --- self-containment: the suite must pass with no production captures ----
  if (!process.env.FB_REGRESSION_RECURSION) {
    const HIDDEN = path.join(DOCS, '.screenshots-hidden');
    let moved = false;
    const restore = () => {
      if (moved && fs.existsSync(HIDDEN)) fs.renameSync(HIDDEN, SHOTS);
      moved = false;
    };
    // A signal during the nested run must still restore the production
    // captures, so a Ctrl-C does not leave the checkout missing them.
    const onSignal = (sig) => { restore(); process.exit(130); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
      if (fs.existsSync(SHOTS)) {
        fs.rmSync(HIDDEN, { recursive: true, force: true });
        fs.renameSync(SHOTS, HIDDEN);
        moved = true;
      }
      const res = run('node', [__filename, '--require-no-captures'], {
        timeout: 900000,
        env: { FB_REGRESSION_RECURSION: '1' },
      });
      await test('the whole suite passes with production captures unavailable', () => {
        assert(res.status === 0, `nested run failed (${res.status}):\n${tail(res.stdout)}\n${tail(res.stderr)}`);
        assert(/ALL \d+ REGRESSION TESTS PASSED/.test(res.stdout), 'nested run did not report success');
      });
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      restore();
    }
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
