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
 * 11. pixel-parity.py fails on a 1-unit RGB change outside the mask, ignores
 *     changes inside a rectangle, and *also* fails on a change in the gap
 *     between the two non-overlapping badge/footer masks
 * 12. start-servers.sh refuses a port that is already serving (stale server)
 * 13. stop-servers.sh reaps the whole verified process group, leaving no live
 *     orphan on the port
 * 14. stop-servers.sh refuses to signal a process when the recorded identity
 *     (starttime/group/command) no longer matches — a stale state file pointing
 *     at a live foreign process kills nothing
 * 15. start-servers.sh rejects an unknown/empty --only and malformed numeric
 *     arguments before starting anything
 * 16. capture generations: all seven entries must share one captureRunId; a
 *     mixed generation fails full verify and pixel parity; an incremental
 *     capture invalidates the full set; a report without freshness metadata fails
 * 17. a stale state file (dead PID, old run token) must not abort a valid
 *     start-servers.sh run: the old record is quarantined, the new one carries
 *     this run's token, the server becomes ready, and stop-servers.sh reaps it;
 *     a process the run launched that dies before ready still fails
 * 18. every documented `npm run update-readme` names its working directory, and
 *     the checker rejects a bare command (see docs/check-doc-commands.js)
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
function writeShots(dir, { omitRects = false, frameworks = null, mutate = null, runId = 'fixture-run-a', meta = true } = {}) {
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
      captureRunId: runId,
      schema: 2,
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 },
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
  if (meta) {
    report.__meta = { schema: 2, fullSet: true, captureRunId: runId, capturedAt: '2024-01-01T00:00:00.000Z' };
  }
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
    await test('a failed incremental capture does not leave the old entry fresh', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(failDir, 'screenshot-report.json'), 'utf8'));
      // The seeded stale entry has been replaced by a failure record, and the
      // report itself is not a full, fresh generation.
      assert(raw.fixture.failed === true, 'stale entry survived as fresh');
      assert(!raw.__meta || raw.__meta.fullSet !== true, 'failed run claimed a full fresh set');
    });
  }
  await stopFixture(server);

  // 5(c) + 5(e): generation provenance for incremental captures.
  server = await startFixture({});
  {
    const dir = tmpDir('incremental');
    // Seed a full, fresh 7-framework generation, then re-capture just the
    // fixture incrementally. The report must stop claiming a full fresh set.
    writeShots(dir, { runId: 'gen-A' });
    const before = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    assert(before.__meta.captureRunId === 'gen-A', 'precondition: seeded run id');

    const res = run('node', [
      path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir,
    ]);
    await test('incremental capture succeeds and stamps a new run id', () => {
      assert(res.status === 0, `exit ${res.status}: ${res.stderr}`);
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
      assert(after.fixture.captureRunId && after.fixture.captureRunId !== 'gen-A',
        `incremental entry reused the old run id: ${after.fixture.captureRunId}`);
      assert(after.__meta.captureRunId === after.fixture.captureRunId, 'meta run id not updated');
      assert(after.__meta.fullSet === false, `incremental run claimed fullSet=${after.__meta.fullSet}`);
    });
    await test('incremental capture invalidates a full-set verification', () => {
      const res2 = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res2.status !== 0, 'full verify accepted a mixed generation');
      assert(/fullSet|different generations|captureRunId|freshness/i.test(res2.stdout),
        `not reported as a generation problem:\n${res2.stdout}`);
    });
    await test('an incremental capture never lets a stale generation claim "35 fresh"', () => {
      const res3 = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(!/ALL SCREENSHOTS OK/.test(res3.stdout), 'incremental run reported a full fresh set');
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

  // --- capture generations (finding 5) -------------------------------------
  console.log('\ncapture generation freshness');
  {
    // (a) Seven frameworks sharing one run id pass a full verification.
    const dir = tmpDir('freshness-same');
    writeShots(dir, { runId: 'run-1' });
    await test('full verify passes when all seven entries share one captureRunId', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status === 0, `exit ${res.status}: ${res.stdout}`);
    });
    await test('pixel-parity passes for one capture generation', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}`);
    });
  }
  {
    // (b) One entry from a different run must fail a full verification.
    const dir = tmpDir('freshness-mixed');
    writeShots(dir, { runId: 'run-1' });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.vue.captureRunId = 'run-2';
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
    await test('full verify fails when one entry has a different captureRunId', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/different generations|captureRunId/.test(res.stdout), `unclear: ${res.stdout}`);
    });
    await test('pixel-parity fails on a mixed capture generation', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/captureRunId|mixed/i.test(res.stdout), `unclear: ${res.stdout}`);
    });
  }
  {
    // (d) A report with no freshness metadata at all must fail clearly.
    const dir = tmpDir('freshness-nometa');
    writeShots(dir, { meta: false });
    await test('full verify fails when the report has no freshness metadata', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/__meta|freshness/i.test(res.stdout), `unclear: ${res.stdout}`);
    });
    await test('pixel-parity fails when the report has no freshness metadata', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/__meta|freshness/i.test(res.stdout), `unclear: ${res.stdout}`);
    });
  }
  {
    // (e) An entry that lost its own captureRunId while __meta still has one
    // must NOT inherit the meta id: that entry's freshness would be unproven.
    const dir = tmpDir('freshness-missing-entry');
    writeShots(dir, { runId: 'run-1' });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    delete report.vue.captureRunId;
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
    await test('full verify fails when one entry has no captureRunId (meta present)', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}`);
      assert(/vue/.test(res.stdout) && /captureRunId|freshness/i.test(res.stdout),
        `entry without an id was not reported: ${res.stdout}`);
    });
    await test('scoped verify also fails for the entry with no captureRunId', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'),
        '--dir', dir, '--framework', 'vue']);
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}`);
      assert(/captureRunId|freshness/i.test(res.stdout), `unclear scoped failure: ${res.stdout}`);
    });
    await test('pixel-parity rejects a report whose entry lost its captureRunId', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'expected non-zero exit');
      assert(/captureRunId|mixed/i.test(res.stdout), `unclear: ${res.stdout}`);
    });
  }
  {
    // (f) An *empty-string* id is not a real id either.
    const dir = tmpDir('freshness-empty-entry');
    writeShots(dir, { runId: 'run-1' });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.react.captureRunId = '';
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
    await test('full verify fails when an entry captureRunId is empty', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}`);
      assert(/react/.test(res.stdout) && /captureRunId|freshness/i.test(res.stdout),
        `empty id not reported: ${res.stdout}`);
    });
    await test('scoped verify fails when the scoped entry captureRunId is empty', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'),
        '--dir', dir, '--framework', 'react']);
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}`);
      assert(/captureRunId|freshness/i.test(res.stdout), `unclear scoped failure: ${res.stdout}`);
    });
  }
  {
    // (g) A non-string id (e.g. a number) must not pass as an id either.
    const dir = tmpDir('freshness-nonstring-entry');
    writeShots(dir, { runId: 'run-1' });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.angular.captureRunId = 12345;
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
    await test('full verify fails when an entry captureRunId is not a string', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}`);
      assert(/angular/.test(res.stdout) && /captureRunId|freshness/i.test(res.stdout),
        `non-string id not reported: ${res.stdout}`);
    });
  }
  {
    // (h) A valid full set whose entries all carry their own id still passes,
    // so the stricter rule does not reject a legitimate capture.
    const dir = tmpDir('freshness-all-own-ids');
    writeShots(dir, { runId: 'run-own-ids' });
    await test('full verify still passes when every entry carries the shared id', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status === 0, `exit ${res.status}: ${res.stdout}`);
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
  {
    // The two masked boxes do not touch: the badge is near the top, the footer
    // near the bottom. Their *bounding hull* covers the whole area in between,
    // so a hull-based mask would silently ignore a real difference there. Prove
    // the checker clears each rectangle individually by poking a pixel in the
    // gap and requiring a failure.
    const gapX = Math.round((BADGE_RECT[0] + FOOTER_RECT[0]) / 2);
    const gapY = Math.round((BADGE_RECT[1] + BADGE_RECT[3] + FOOTER_RECT[1]) / 2);
    const inBadge = [BADGE_RECT[0] + 3, BADGE_RECT[1] + 3];
    const inFooter = [FOOTER_RECT[0] + 3, FOOTER_RECT[1] + 3];
    assert(
      gapY > BADGE_RECT[1] + BADGE_RECT[3] && gapY < FOOTER_RECT[1],
      `gap point ${gapX},${gapY} is not between the two rectangles`
    );
    await test('pixel-parity fails on a 1-unit change in the gap between two non-overlapping masks', () => {
      const dir2 = tmpDir('pixel-gap2');
      writeShots(dir2);
      pokePixel(path.join(dir2, 'vue', 'all.png'), gapX, gapY, 1, 1);
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir2]);
      assert(res.status !== 0, `gap difference was masked:\n${res.stdout}`);
      assert(/vue/.test(res.stdout), 'the diverging framework was not named');
    });
    await test('pixel-parity still ignores changes inside either rectangle', () => {
      const dir3 = tmpDir('pixel-gap3');
      writeShots(dir3);
      pokePixel(path.join(dir3, 'vue', 'all.png'), inBadge[0], inBadge[1], 0, 40);
      pokePixel(path.join(dir3, 'vue', 'all.png'), inFooter[0], inFooter[1], 2, -40);
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir3]);
      assert(res.status === 0, `changes inside the masks should pass:\n${res.stdout}`);
    });
  }
  {
    // A change outside every mask must still fail, confirming the per-rectangle
    // masking did not widen the tolerated region.
    const dir = tmpDir('pixel-outside');
    writeShots(dir);
    pokePixel(path.join(dir, 'vue', 'all.png'), 100, 100, 0, 1);
    await test('pixel-parity fails on a change outside all masks', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
    });
  }

  // --- 20: off-screen / non-finite rectangles must fail, not mask wrongly ----
  console.log('\npixel checker rectangle validation (finding 20)');

  /**
   * Write a fresh shot set whose reference `badge` rectangle is `box`, run the
   * production pixel-parity.py and return the result. A `pokes` callback can
   * change pixels to prove a difference is (or is not) hidden.
   */
  function runWithBadgeRect(box, name, pokes) {
    const dir = tmpDir(name);
    writeShots(dir, {
      mutate: (_d, report) => {
        for (const fw of ['react', ...FRAMEWORKS]) {
          if (report[fw]) report[fw].labelRects.all.badge = box;
        }
      },
    });
    if (pokes) pokes(dir);
    return run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
  }

  const W = VIEWPORT_W;
  const H = VIEWPORT_H;
  const offScreen = [
    ['entirely left of the image', [-200, 200, 90, 28]],
    ['entirely above the image', [560, -200, 90, 28]],
    ['entirely right of the image', [W + 100, 200, 90, 28]],
    ['entirely below the image', [560, H + 100, 90, 28]],
  ];
  for (const [label, box] of offScreen) {
    await test(`pixel-parity fails on a rectangle ${label}`, () => {
      const res = runWithBadgeRect(box, 'rect-off');
      assert(res.status !== 0, `an off-screen rectangle was accepted:\n${res.stdout}`);
      assert(/does not overlap|out-of-bounds|non-finite|degenerate/i.test(res.stdout),
        `unclear failure: ${res.stdout}`);
    });
  }

  {
    // The dangerous case: an off-left rectangle whose naive x1 was negative, so
    // NumPy would read the mask relative to the array end and clear pixels at the
    // opposite (right) edge — hiding a real difference there. With the fix the
    // rectangle is rejected outright, so the difference can never be hidden.
    await test('an off-left rectangle cannot hide a difference on the opposite edge', () => {
      const res = runWithBadgeRect([-200, 200, 90, 28], 'rect-hide', (dir) => {
        // A real difference near the right edge, far from any legend.
        pokePixel(path.join(dir, 'vue', 'all.png'), W - 50, 300, 0, 1);
      });
      assert(res.status !== 0, `the difference was hidden by a negative-index mask:\n${res.stdout}`);
      assert(/does not overlap|out-of-bounds/i.test(res.stdout), `not rejected as out-of-range: ${res.stdout}`);
    });
  }

  for (const [label, token] of [
    ['a NaN coordinate', 'NaN'],
    ['an infinite coordinate', 'Infinity'],
  ]) {
    await test(`pixel-parity fails on ${label}`, () => {
      // JSON has no NaN/Infinity literals, but Python's json module parses the
      // bare tokens. The checker must reject them before int()/slicing — so the
      // report is written as raw text with the bare token in the badge rectangle.
      const dir = tmpDir('rect-nonfinite');
      writeShots(dir);
      const reportPath = path.join(dir, 'screenshot-report.json');
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const bad = `[${token}, 200, 90, 28]`;
      for (const fw of ['react', ...FRAMEWORKS]) {
        if (report[fw]) report[fw].labelRects.all.badge = [560, 145, 90, 28];
      }
      let json = JSON.stringify(report, null, 2);
      // Replace the reference badge rectangle with the raw-token version.
      json = json.replace(
        /"badge": \[\s*560,\s*145,\s*90,\s*28\s*\]/,
        `"badge": ${bad}`);
      fs.writeFileSync(reportPath, json);
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `a non-finite rectangle was accepted:\n${res.stdout}`);
      assert(/non-finite|rectangle/i.test(res.stdout), `unclear failure: ${res.stdout}`);
      // Prove the difference was not silently masked at the opposite edge.
      assert(!/PIXEL PARITY CONFIRMED/.test(res.stdout), 'non-finite rect still yielded a pass');
    });
  }

  for (const [label, box] of [
    ['zero width', [560, 145, 0, 28]],
    ['negative height', [560, 145, 90, -5]],
  ]) {
    await test(`pixel-parity fails on a rectangle with ${label}`, () => {
      const res = runWithBadgeRect(box, 'rect-degenerate');
      assert(res.status !== 0, `a degenerate rectangle was accepted:\n${res.stdout}`);
      assert(/degenerate/i.test(res.stdout), `unclear failure: ${res.stdout}`);
    });
  }

  {
    // A rectangle that only partially leaves the frame must still be padded and
    // clamped to a valid, non-empty, in-bounds slice — the fix must not reject
    // legitimate geometry. This box extends off the left edge yet still spans the
    // marker columns, so a correct clamp masks the framework-name difference.
    const PARTIAL = [-10, 140, 700, 40];   // clamped x0=0, x1=692, y 138..182
    await test('a partially off-screen rectangle still clamps to a valid slice', () => {
      const res = runWithBadgeRect(PARTIAL, 'rect-partial');
      assert(res.status === 0, `a partially off-screen rectangle was rejected:\n${res.stdout}`);
    });
    await test('a partially off-screen rectangle still masks its in-frame area', () => {
      // Poke inside the clamped region but away from the marker: it must be
      // masked (pass), not reported as a difference.
      const dir = tmpDir('rect-partial-mask');
      writeShots(dir, {
        mutate: (_d, report) => {
          for (const fw of ['react', ...FRAMEWORKS]) {
            if (report[fw]) report[fw].labelRects.all.badge = PARTIAL;
          }
        },
      });
      pokePixel(path.join(dir, 'vue', 'all.png'), 30, 160, 0, 40);
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status === 0, `a difference inside the clamped mask failed:\n${res.stdout}`);
    });
    await test('the clamp keeps a difference just outside the partial rectangle', () => {
      // The clamped box ends at x1=692; a poke at x=700 must still be caught, so
      // clamping did not over-widen the mask.
      const dir = tmpDir('rect-partial-edge');
      writeShots(dir, {
        mutate: (_d, report) => {
          for (const fw of ['react', ...FRAMEWORKS]) {
            if (report[fw]) report[fw].labelRects.all.badge = PARTIAL;
          }
        },
      });
      pokePixel(path.join(dir, 'vue', 'all.png'), 700, 160, 0, 40);
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, 'a difference outside the clamped mask was hidden');
      assert(/vue/.test(res.stdout), `diverging framework not named: ${res.stdout}`);
    });
  }

  // --- 21: the shared stylesheet must be a single, enforced source ----------
  console.log('\nshared stylesheet single source (finding 21)');
  {
    const checker = path.join(DOCS, 'check-shared-stylesheet.js');
    await test('the shared stylesheet check passes on the real repository', () => {
      const res = run('node', [checker], { timeout: 30000 });
      assert(res.status === 0, `checker failed:\n${res.stdout}${res.stderr}`);
      assert(/SHARED STYLESHEET OK/.test(res.stdout), `no success line: ${res.stdout}`);
    });
  }
  {
    // A copy that drifts by even one byte must fail the check — this is what
    // turns "single source" from a claim into an enforced property.
    const dir = tmpDir('css-drift');
    const sharedDir = path.join(dir, 'shared', 'styles');
    fs.mkdirSync(sharedDir, { recursive: true });
    const source = fs.readFileSync(path.join(ROOT, 'shared', 'styles', 'todo.css'));
    fs.writeFileSync(path.join(sharedDir, 'todo.css'), source);
    for (const rel of [
      'implementations/react/src/App.css',
      'implementations/vue/src/style.css',
      'implementations/angular/src/styles.css',
      'implementations/blade/style.css',
      'docs/tests/fixtures/fixture.css',
    ]) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, source);
    }
    for (const rel of ['leptos', 'yew', 'dioxus']) {
      const p = path.join(dir, 'implementations', rel, 'index.html');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '<link rel="stylesheet" href="../../shared/styles/todo.css">');
    }
    const checker = path.join(DOCS, 'check-shared-stylesheet.js');
    await test('the shared stylesheet check passes on a matching tree', () => {
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status === 0, `a matching tree was rejected:\n${res.stdout}${res.stderr}`);
    });
    await test('the check fails when one copy diverges byte-for-byte', () => {
      fs.appendFileSync(path.join(dir, 'implementations/vue/src/style.css'), '\n/* drift */\n');
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, 'a drifted copy was accepted');
      const out = `${res.stdout}${res.stderr}`;
      assert(/vue\/src\/style\.css has drifted/.test(out), `copy not named: ${out}`);
    });
    await test('the check fails when a direct linker stops referencing the shared file', () => {
      // Repair the copy drift first so only the broken link can fail the check.
      run('node', [checker, '--root', dir, '--write'], { timeout: 30000 });
      const p = path.join(dir, 'implementations/leptos/index.html');
      fs.writeFileSync(p, '<link rel="stylesheet" href="todo.css">');
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, 'a broken direct link was accepted');
      const out = `${res.stdout}${res.stderr}`;
      assert(/leptos\/index\.html does not link/.test(out), `linker not named: ${out}`);
    });
    await test('npm run sync:css repairs the drift through the production script', () => {
      // Restore the linker, then reintroduce drift and prove `--write` fixes it.
      fs.writeFileSync(path.join(dir, 'implementations/leptos/index.html'),
        '<link rel="stylesheet" href="../../shared/styles/todo.css">');
      fs.appendFileSync(path.join(dir, 'implementations/vue/src/style.css'), '\n/* drift */\n');
      const res = run('node', [path.join(DOCS, 'check-shared-stylesheet.js'), '--root', dir, '--write'], { timeout: 30000 });
      assert(res.status === 0, `sync failed:\n${res.stdout}${res.stderr}`);
      const copy = fs.readFileSync(path.join(dir, 'implementations/vue/src/style.css'));
      assert(copy.equals(fs.readFileSync(path.join(dir, 'shared/styles/todo.css'))),
        'sync did not make the copy byte-identical');
    });
  }
  {
    // The real repository's declared copies must all be present and identical;
    // prove it by checking the actual bytes, not the checker's summary.
    await test('every declared copy in the repository equals the shared stylesheet', () => {
      const source = fs.readFileSync(path.join(ROOT, 'shared', 'styles', 'todo.css'));
      for (const rel of [
        'implementations/react/src/App.css',
        'implementations/vue/src/style.css',
        'implementations/angular/src/styles.css',
        'implementations/blade/style.css',
        'docs/tests/fixtures/fixture.css',
      ]) {
        assert(fs.readFileSync(path.join(ROOT, rel)).equals(source),
          `${rel} is not byte-identical to shared/styles/todo.css`);
      }
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

  // --- 3: start-servers.sh validates --only and numeric arguments ----------
  console.log('\nstart-servers.sh argument validation');
  for (const [label, args] of [
    ['unknown --only target', ['--only', 'bogus']],
    ['empty --only value', ['--only', '']],
    ['--only without an argument', ['--only']],
    ['non-numeric --ready-timeout', ['--ready-timeout', 'soon']],
    ['--ready-timeout without a value', ['--ready-timeout']],
    ['non-numeric --port-offset', ['--port-offset', 'x']],
    ['--port-offset without a value', ['--port-offset']],
  ]) {
    await test(`start-servers.sh rejects ${label} with a non-zero exit`, () => {
      const res = run('bash', [path.join(DOCS, 'scripts', 'start-servers.sh'), ...args], { timeout: 15000 });
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
      assert(/start-servers\.sh:/.test(res.stdout + res.stderr), `no clear message: ${res.stdout}${res.stderr}`);
    });
    await test(`start-servers.sh starts nothing for ${label}`, () => {
      const res = run('bash', [path.join(DOCS, 'scripts', 'start-servers.sh'), ...args], { timeout: 15000 });
      assert(!/starting /.test(res.stdout), `a server was started despite an invalid argument: ${res.stdout}`);
    });
  }
  {
    // A valid target must be accepted (it fails later for other reasons here,
    // but not at argument validation).
    const res = run('bash', [path.join(DOCS, 'scripts', 'start-servers.sh'), '--only', 'react', '--port-offset', 'foo'], { timeout: 15000 });
    await test('start-servers.sh accepts a valid --only but still validates its numeric args', () => {
      assert(!/unknown --only target/.test(res.stdout + res.stderr), 'valid --only was rejected');
      assert(/port-offset/.test(res.stdout + res.stderr), 'bad port-offset was not rejected');
    });
  }

  /** Read a state file written by serve.sh into a plain {key: value}. */
  function parseState(file) {
    return Object.fromEntries(
      fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
        .filter((l) => !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2))
    );
  }

  /** Write a well-formed state file for a dead PID with an old run token. */
  function writeDeadState(logsDir, name, token, pid) {
    const fields = {
      pid: String(pid), pgid: String(pid), starttime: '1',
      boot_id: bootId(), run_token: token, cmd: 'python3 -m http.server (stale)',
    };
    fs.writeFileSync(
      path.join(logsDir, `${name}.state`),
      Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
    );
  }

  // --- 17: a stale state file must not abort a valid startup ----------------
  console.log('\nstale state startup (finding 17)');
  {
    const OFFSET = 2000;                       // leptos -> 6004, away from real ports
    const port = 4004 + OFFSET;
    const dist = path.join(ROOT, 'implementations', 'leptos', 'dist');
    const createdDist = !fs.existsSync(dist);
    // The production `--only leptos` path serves implementations/leptos/dist
    // through `python3 -m http.server`. A minimal index.html is enough to make
    // it a *valid* target that really answers HTTP.
    if (createdDist) {
      fs.mkdirSync(dist, { recursive: true });
      fs.writeFileSync(path.join(dist, 'index.html'),
        '<!doctype html><title>fixture</title><div class="todo-app">fixture</div>');
    }
    const logsDir = tmpDir('stale-start-logs');
    const pidMax = Number(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim());
    const deadPid = pidMax + 17;               // beyond pid_max => can never exist
    writeDeadState(logsDir, 'leptos', 'stale-token-from-a-previous-run', deadPid);
    const startScript = path.join(DOCS, 'scripts', 'start-servers.sh');
    const stopScript = path.join(DOCS, 'scripts', 'stop-servers.sh');
    try {
      const res = run('bash',
        [startScript, '--only', 'leptos', '--port-offset', String(OFFSET), '--ready-timeout', '60'],
        { env: { FB_LOGS_DIR: logsDir }, timeout: 120000 });

      await test('start-servers.sh does not abort because of a stale state file', () => {
        assert(res.status === 0,
          `stale state aborted a valid startup (exit ${res.status}):\n${res.stdout}${res.stderr}`);
        assert(/quarantining stale leptos\.state/.test(res.stdout + res.stderr),
          `the stale record was not quarantined:\n${res.stdout}${res.stderr}`);
        assert(new RegExp(`leptos ready on ${port}`).test(res.stdout),
          `the server never reported ready:\n${res.stdout}${res.stderr}`);
      });
      await test("the state file is replaced with this run's token", () => {
        const fields = parseState(path.join(logsDir, 'leptos.state'));
        assert(fields.pid && fields.pid !== String(deadPid),
          `state still points at the dead PID ${deadPid}: ${JSON.stringify(fields)}`);
        assert(fields.run_token && fields.run_token !== 'stale-token-from-a-previous-run',
          `run_token was not replaced: ${fields.run_token}`);
      });
      await test('the server really serves the fixture on the port', async () => {
        const ok = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok).catch(() => false);
        assert(ok, `port ${port} is not serving after the startup`);
      });
      await test('production stop-servers.sh stops the freshly started server', () => {
        const stopRes = run('bash', [stopScript],
          { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
        assert(stopRes.status === 0, `stop exit ${stopRes.status}:\n${stopRes.stdout}${stopRes.stderr}`);
        assert(/stopping leptos/.test(stopRes.stdout),
          `the verified server was not stopped:\n${stopRes.stdout}${stopRes.stderr}`);
      });
      await test('no orphan survives and the port is free after stop', async () => {
        const deadline = Date.now() + 5000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still served after stop`);
        assert(!fs.existsSync(path.join(logsDir, 'leptos.state')),
          'the state file survived the stop');
      });
    } finally {
      run('bash', [stopScript], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
      if (createdDist) fs.rmSync(dist, { recursive: true, force: true });
    }
  }
  {
    // A process this run launched that dies before becoming ready is a *real*
    // failure: give leptos a `python3` that exits immediately. The launcher is
    // gone, so no later state can ever arrive and the startup must abort.
    const OFFSET = 2001;
    const port = 4004 + OFFSET;
    const logsDir = tmpDir('dead-start-logs');
    const bin = tmpDir('fake-bin');
    const fakePy = path.join(bin, 'python3');
    fs.writeFileSync(fakePy, '#!/usr/bin/env bash\nexit 7\n');
    fs.chmodSync(fakePy, 0o755);
    const res = run('bash',
      [path.join(DOCS, 'scripts', 'start-servers.sh'),
       '--only', 'leptos', '--port-offset', String(OFFSET), '--ready-timeout', '30'],
      { env: { FB_LOGS_DIR: logsDir, PATH: `${bin}:${process.env.PATH}` }, timeout: 60000 });
    await test('startup fails when the process it launched dies before becoming ready', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}${res.stderr}`);
      assert(/exited before/.test(res.stdout + res.stderr),
        `the dead server was not reported as a failure:\n${res.stdout}${res.stderr}`);
      assert(!/ready on/.test(res.stdout), `a dead server was reported ready:\n${res.stdout}`);
    });
    await test('the failed startup leaves nothing serving that port', async () => {
      const up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
      assert(!up, `port ${port} is still served after a failed startup`);
    });
  }

  // --- 19: failure cleanup must reap the whole group, not just the leader ---
  console.log('\nstart-servers.sh failure cleanup (finding 19)');
  {
    // Reproduces the exact gap: the launcher records a verified state, then the
    // leader exits on SIGTERM while a *child* ignores it and keeps the port. A
    // leader-only `kill -0` check is false once the leader is gone, so the child
    // would never receive SIGKILL and the port would stay held.
    //
    // The production path is `start-servers.sh --only blade`, which runs
    // `php -S <port> ...` through serve.sh under setsid. A fake `php` stands in:
    // it spawns a SIGTERM-ignoring child that binds the port but answers nothing
    // (so readiness never succeeds) and then waits. The run fails into
    // stop_started() with a live, TERM-ignoring child still in its group.
    const OFFSET = 3000;                 // blade -> 7007, clear of the real ports
    const port = 4007 + OFFSET;
    const logsDir = tmpDir('cleanup-logs');
    const bin = tmpDir('cleanup-bin');
    const fakePhp = path.join(bin, 'php');
    fs.writeFileSync(fakePhp, `#!/usr/bin/env bash
# Child: ignores SIGTERM, holds the port, but never completes an HTTP response
# (so readiness fails) -- exactly a server that traps SIGTERM and stays up.
python3 -c '
import signal, socket
signal.signal(signal.SIGTERM, signal.SIG_IGN)
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", ${port}))
s.listen(5)
while True:
    c, _ = s.accept()
    c.close()
' &
child=$!
# Leader: exits on SIGTERM (default action). Wait so readiness times out first.
trap 'exit 0' TERM
wait "$child"
`);
    fs.chmodSync(fakePhp, 0o755);
    const startScript = path.join(DOCS, 'scripts', 'start-servers.sh');
    const stopScript = path.join(DOCS, 'scripts', 'stop-servers.sh');
    try {
      const res = run('bash',
        [startScript, '--only', 'blade', '--port-offset', String(OFFSET), '--ready-timeout', '4'],
        { env: { FB_LOGS_DIR: logsDir, PATH: `${bin}:${process.env.PATH}` }, timeout: 60000 });

      await test('a failed startup exits non-zero when the port is never served by the leader', () => {
        assert(res.status !== 0, `expected non-zero exit, got ${res.status}:\n${res.stdout}${res.stderr}`);
      });
      await test('failure cleanup leaves no live process in the group', async () => {
        // The recorded state names the group; after cleanup nothing live may
        // remain in it (a zombie leader is fine -- it is not a live process).
        const stateFile = path.join(logsDir, 'blade.state');
        let pgid = null;
        if (fs.existsSync(stateFile)) {
          const fields = parseState(stateFile);
          pgid = Number(fields.pgid);
        }
        if (pgid) {
          const deadline = Date.now() + 5000;
          let live = liveGroupMembers(pgid);
          while (Date.now() < deadline && live.length) {
            await new Promise((r) => setTimeout(r, 200));
            live = liveGroupMembers(pgid);
          }
          assert(live.length === 0, `live process(es) survived cleanup: ${live.join(', ')}`);
        }
      });
      await test('the child that ignored SIGTERM is gone and its port is free', async () => {
        const deadline = Date.now() + 8000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still being served: a SIGTERM-ignoring child survived`);
      });
    } finally {
      // Never leave the fake listener behind for the rest of the suite.
      try {
        const out = spawnSync('pgrep', ['-f', `TCPServer.*${port}`], { encoding: 'utf8' });
        for (const pid of (out.stdout || '').trim().split('\n').filter(Boolean)) {
          try { process.kill(Number(pid), 'SIGKILL'); } catch { /* gone */ }
        }
      } catch { /* pgrep unavailable */ }
      run('bash', [stopScript], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
    }
  }

  /**
   * PIDs still alive (state != Z) in process group `pgid`. Used to prove a real
   * process group was reaped without being confused by a zombie leader that has
   * not been reaped by its parent yet.
   */
  function liveGroupMembers(pgid) {
    const live = [];
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      let stat;
      try { stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8'); } catch { continue; }
      const rest = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (Number(rest[2]) === pgid && rest[0] !== 'Z') live.push(name);
    }
    return live;
  }

  /** Read /proc/<pid>/stat fields needed to fabricate a matching state file. */
  function procIdentity(pid) {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const rest = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    // after comm: state(0) ppid(1) pgrp(2) ... starttime(19)
    return { pgrp: rest[2], starttime: rest[19] };
  }
  function bootId() {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  }
  /** Write a state file that will verify against a live process. */
  function writeState(logsDir, name, pid, { override = {} } = {}) {
    const id = procIdentity(pid);
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    const fields = {
      pid: String(pid),
      pgid: id.pgrp,
      starttime: id.starttime,
      boot_id: bootId(),
      run_token: 'test-token',
      cmd,
      ...override,
    };
    const body = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(path.join(logsDir, `${name}.state`), body + '\n');
  }

  // --- 1: stale metadata must never kill a foreign, unrelated process -------
  console.log('\nstale metadata safety (finding 1)');
  {
    // A live, unrelated process. A stale state file points at it with the wrong
    // identity (as a PID after unclean exit would). stop-servers.sh must not
    // signal it.
    const foreignPort = 4197;
    const foreign = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('foreign');
    });
    await new Promise((resolve) => foreign.listen(foreignPort, '127.0.0.1', resolve));
    const logsDir = tmpDir('stale-logs');
    const foreignPid = process.pid; // this test process is a live foreign PID
    writeState(logsDir, 'react', foreignPid, { override: { starttime: '1', run_token: 'stale' } });
    try {
      const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
        env: { FB_LOGS_DIR: logsDir },
        timeout: 15000,
      });
      await test('stop-servers.sh refuses a state file whose starttime does not match', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/refusing to signal react/.test(res.stdout + res.stderr),
          `did not refuse: ${res.stdout}${res.stderr}`);
        assert(/starttime|reused/i.test(res.stdout + res.stderr), `reason unclear: ${res.stdout}${res.stderr}`);
      });
      await test('stop-servers.sh does not signal the unrelated process', async () => {
        // Still alive (we are running) and the foreign server still answers.
        let alive = true;
        try { process.kill(foreignPid, 0); } catch { alive = false; }
        assert(alive, 'this test process was signalled');
        const ok = await fetch(`http://127.0.0.1:${foreignPort}/`).then((r) => r.ok).catch(() => false);
        assert(ok, 'the foreign listener was killed');
      });
      await test('the stale metadata is quarantined, not trusted or silently deleted', () => {
        const leftovers = fs.readdirSync(logsDir);
        assert(leftovers.some((f) => f.startsWith('stale-')), `not quarantined: ${leftovers.join(', ')}`);
        assert(!leftovers.includes('react.state'), 'the stale state file was left in place');
      });
    } finally {
      await new Promise((resolve) => foreign.close(resolve));
    }
  }
  {
    // A malformed state file (no identity metadata) must also be refused.
    const logsDir = tmpDir('malformed-logs');
    fs.writeFileSync(path.join(logsDir, 'vue.state'), 'pid=999999\n');
    const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
      env: { FB_LOGS_DIR: logsDir },
      timeout: 15000,
    });
    await test('stop-servers.sh refuses a state file with no identity metadata', () => {
      assert(res.status === 0, `exit ${res.status}`);
      assert(/refusing to signal vue/.test(res.stdout + res.stderr), `did not refuse: ${res.stdout}${res.stderr}`);
    });
  }
  {
    // A legacy pidfile (from an older run) has no identity; it must never be
    // signalled either.
    const logsDir = tmpDir('legacy-logs');
    fs.writeFileSync(path.join(logsDir, 'angular.pid'), String(process.pid));
    const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
      env: { FB_LOGS_DIR: logsDir },
      timeout: 15000,
    });
    await test('stop-servers.sh ignores a legacy pidfile instead of trusting its number', () => {
      assert(res.status === 0, `exit ${res.status}`);
      assert(/legacy pidfile/.test(res.stdout + res.stderr), `legacy pidfile was not flagged: ${res.stdout}${res.stderr}`);
      assert(fs.existsSync(path.join(logsDir, 'angular.pid')) === false, 'legacy pidfile was left in place');
    });
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
      writeState(logsDir, 'fixture', leader.pid);
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
      await test('a verified process group is stopped completely (no live orphan survives)', async () => {
        // A killed leader may linger as a zombie until its parent reaps it, and
        // `kill(-pgid, 0)` still succeeds for a group holding only zombies. What
        // must not survive is a *live* process in the group, so scan /proc.
        const live = liveGroupMembers(leader.pid);
        assert(live.length === 0, `live process(es) still in the group: ${live.join(', ')}`);
      });
    } finally {
      try { process.kill(-leader.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { leader.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }
  {
    // A process may rewrite its own title after launch (npm sets it to the npm
    // script name; a setsid wrapper execs away). The stored command line must
    // therefore never be a gate on signalling: a real server whose title changed
    // would otherwise be left running and holding its port. starttime + boot id
    // + group leadership are the real identity.
    const logsDir = tmpDir('title-logs');
    const port = 4198;
    const leader = spawn('setsid', ['python3', '-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      stdio: 'ignore',
    });
    try {
      await waitForPort(port);
      // Record a command line that no longer matches the live process, exactly
      // as npm's title rewrite does in practice.
      writeState(logsDir, 'fixture', leader.pid, { override: { cmd: 'npm run dev -- --port 1' } });
      const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
        env: { FB_LOGS_DIR: logsDir },
        timeout: 30000,
      });
      await test('stop-servers.sh stops a verified server whose title changed', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/stopping fixture/.test(res.stdout), `a title rewrite made it skip a live server: ${res.stdout}${res.stderr}`);
        assert(!/refusing to signal fixture/.test(res.stdout + res.stderr), 'a title rewrite was treated as a foreign process');
      });
      await test('a title-rewritten server does not orphan its port', async () => {
        const deadline = Date.now() + 5000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still served after stop`);
      });
    } finally {
      try { process.kill(-leader.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { leader.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  // --- serve.sh records an unraced identity from inside the new session -----
  {
    // start-servers.sh launches the server through serve.sh under setsid and
    // does NOT write the state file itself. Reading /proc/<pid> in the parent
    // raced: before the child's setsid() completed, pgrp was still the
    // launcher's, so a server was recorded with a foreign process group and
    // stop-servers.sh later refused to signal it (leaving it holding its port).
    // serve.sh writes its own state after setsid, then execs the server.
    const logsDir = tmpDir('serve-logs');
    const port = 4199;
    const state = path.join(logsDir, 'fixture.state');
    const child = spawn(
      'setsid',
      ['bash', path.join(DOCS, 'scripts', 'lib', 'serve.sh'), state, 'tok',
        'python3', '-m', 'http.server', String(port), '--bind', '127.0.0.1'],
      { stdio: 'ignore' }
    );
    try {
      await waitForPort(port);
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(state) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      await test('serve.sh stamps pid == pgid so the group leader identity is real', () => {
        assert(fs.existsSync(state), 'serve.sh did not write the state file');
        const fields = Object.fromEntries(
          fs.readFileSync(state, 'utf8').split('\n').filter(Boolean)
            .filter((l) => !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2))
        );
        assert(fields.pid && fields.pgid, `state missing pid/pgid: ${JSON.stringify(fields)}`);
        assert(fields.pid === fields.pgid, `pid ${fields.pid} != pgid ${fields.pgid} (recorded the launcher's group)`);
        assert(fields.run_token === 'tok', `run_token not recorded: ${fields.run_token}`);
      });
      await test('stop-servers.sh stops a serve.sh-launched server on the first try', () => {
        const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
          env: { FB_LOGS_DIR: logsDir },
          timeout: 30000,
        });
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/stopping fixture/.test(res.stdout), `identity did not verify: ${res.stdout}${res.stderr}`);
        assert(!/refusing/.test(res.stdout + res.stderr), `server was wrongly refused: ${res.stdout}${res.stderr}`);
      });
    } finally {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  // --- 18: documented npm commands must be runnable as written --------------
  console.log('\ndocumented commands (finding 18)');
  {
    const checker = path.join(DOCS, 'check-doc-commands.js');
    await test('every documented "npm run update-readme" names its working directory', () => {
      const res = run('node', [checker], { timeout: 30000 });
      assert(res.status === 0, `checker failed:\n${res.stdout}${res.stderr}`);
      assert(/DOC COMMANDS OK/.test(res.stdout), `no success line: ${res.stdout}`);
    });
    await test('the update-readme script really exists in its owning package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks', 'scripts', 'package.json'), 'utf8'));
      assert(pkg.scripts && pkg.scripts['update-readme'],
        'benchmarks/scripts/package.json has no update-readme script');
    });
    await test('the checker rejects a bare command with no working directory', () => {
      // A deliberately broken doc, checked through the same production code
      // path: the checker must fail rather than wave the command through.
      const dir = tmpDir('doc-cmd');
      const doc = path.join(dir, 'README.md');
      fs.writeFileSync(doc, '### Results\n\n```bash\nnpm run update-readme\n```\n');
      const res = run('node', [checker, '--doc', doc], { timeout: 30000 });
      assert(res.status !== 0, `a bare command was accepted:\n${res.stdout}${res.stderr}`);
      assert(/without a working directory/.test(res.stdout + res.stderr), `unclear failure: ${res.stdout}${res.stderr}`);
    });
    await test('the checker accepts the command once the context is present', () => {
      const dir = tmpDir('doc-cmd-ok');
      const doc = path.join(dir, 'README.md');
      fs.writeFileSync(doc, '### Results\n\n```bash\ncd benchmarks/scripts\nnpm run update-readme\n```\n');
      const res = run('node', [checker, '--doc', doc], { timeout: 30000 });
      assert(res.status === 0, `a contextualised command was rejected:\n${res.stdout}${res.stderr}`);
    });
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
