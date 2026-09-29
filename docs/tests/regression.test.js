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
 * 19. the verifier rejects a stray non-PNG file or a sixth PNG in a framework
 *     directory (completeness is not limited to the *.png it expects)
 * 20. a bare `node-version: "24"` pin is rejected when its lowest release is
 *     below the engine floor, and every workflow pin is an explicit x.y.z
 * 21. a todo text interpolated into a double-quoted attribute is neutralised
 *     (the Blade aria-label XSS), proven in a real browser against a fixture
 *     that reproduces the vulnerable renderer on demand
 * 22. a transient unrelated process exit during the orphan-group scan does not
 *     abort the stop and strand a live server on its port
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

// The nested self-containment run passes --require-no-captures, so this both
// documents the flag and turns the guarantee into an assertion: if the suite
// were ever reachable from a checkout that still had docs/screenshots/, the
// "no captures" proof would be meaningless.
if (REQUIRE_NO_CAPTURES && fs.existsSync(SHOTS)) {
  console.error('regression.test.js: --require-no-captures was set but docs/screenshots/ still exists; ' +
    'the self-containment proof would not be testing a clean checkout.');
  process.exit(1);
}

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

/** True when something accepts a TCP connection on the port (no HTTP needed). */
function tcpOpen(port) {
  return new Promise((resolve) => {
    const sock = require('net').connect({ host: '127.0.0.1', port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
  });
}

/** Wait until a TCP connection to the port is accepted. */
async function waitForTcp(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpOpen(port)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`nothing is listening on ${port}`);
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
function writeShot(file, {
  cardHeight, markerColor, height = VIEWPORT_H, width = VIEWPORT_W, bottomBar = false, dpr = 1,
}) {
  const png = new PNG({ width, height });
  // Layout is expressed in CSS pixels and scaled by dpr, mirroring a real
  // deviceScaleFactor>1 capture: the same CSS geometry occupies dpr times as
  // many device pixels.
  const s = (v) => Math.round(v * dpr);
  const cardLeft = s(CARD_LEFT), cardWidth = s(CARD_WIDTH), cardTop = s(CARD_TOP);
  const cardH = s(cardHeight);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inCard =
        x >= cardLeft && x < cardLeft + cardWidth && y >= cardTop && y < cardTop + cardH;
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
    // The marker is written in device pixels, so its on-image position stays
    // aligned with the framework's dpr-scaled badge rectangle.
    const bx = s(BADGE_RECT[0]), by = s(BADGE_RECT[1]);
    const bw = s(BADGE_RECT[2]), bh = s(BADGE_RECT[3]);
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const i = (y * width + x) * 4;
        png.data[i] = markerColor[0];
        png.data[i + 1] = markerColor[1];
        png.data[i + 2] = markerColor[2];
      }
    }
  }
  if (bottomBar) {
    // A dark bar across the last rows of the card, so a crop that clips the
    // card's bottom edge can be detected by looking for it in the JPEG.
    const y0 = Math.max(0, cardTop + cardH - s(4));
    for (let y = y0; y < Math.min(height, cardTop + cardH); y++) {
      for (let x = cardLeft; x < cardLeft + cardWidth; x++) {
        const i = (y * width + x) * 4;
        png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 20;
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
function writeShots(dir, {
  omitRects = false, frameworks = null, mutate = null, runId = 'fixture-run-a', meta = true,
  viewport = null, imageHeight = null, populatedCardHeight = POPULATED_HEIGHT,
  bottomBar = false, reportMutate = null, dpr = 1,
} = {}) {
  const FW = frameworks || FRAMEWORKS;
  // `dpr` scales both the images and the default declared viewport, so a
  // positive DPR test produces a self-consistent set. When a caller overrides
  // `viewport` with a mismatched DPR (the negative tests), the images stay at
  // the `dpr` argument (default 1) so the size check still fails as intended.
  const vp = viewport || { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: dpr };
  const imageDpr = dpr;
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
      viewport: vp,
    };
    for (const s of STATES) {
      const file = path.join(dir, fw, `${s}.png`);
      writeShot(file, {
        cardHeight: s === 'empty-state' ? EMPTY_HEIGHT : populatedCardHeight,
        markerColor,
        height: imageHeight === null ? Math.round(VIEWPORT_H * imageDpr) : imageHeight,
        width: Math.round(VIEWPORT_W * imageDpr),
        bottomBar,
        dpr: imageDpr,
      });
      report[fw].screenshots.push(`${fw}/${s}.png`);
      report[fw].labelRects[s] = omitRects
        ? {}
        : { badge: BADGE_RECT.slice(), footer: FOOTER_RECT.slice() };
    }
    if (reportMutate) reportMutate(fw, report[fw]);
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

  // Self-heal after a crash (SIGKILL, sandbox restart) during the nested
  // no-captures run below: that run renames docs/screenshots aside and normally
  // restores it in a finally block, but an uncatchable kill can leave the
  // checkout missing its production captures. Restore them on the next start.
  {
    const HIDDEN = path.join(DOCS, '.screenshots-hidden');
    if (fs.existsSync(HIDDEN) && !fs.existsSync(SHOTS)) {
      fs.renameSync(HIDDEN, SHOTS);
      console.log('  (recovered docs/screenshots from an interrupted run)\n');
    }
  }

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
  await test('an empty --framework value is rejected (never a full capture)', () => {
    const out = tmpDir('empty-framework');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', '', '--out', out]);
    assert(res.status !== 0, `expected non-zero exit for empty --framework, got ${res.status}`);
    assert(/non-empty/.test(res.stderr + res.stdout), 'no clear error message');
    // Must fail *before* capturing: the option directory holds no framework.
    const captured = fs.existsSync(out) ? fs.readdirSync(out).filter((d) => d !== 'screenshot-report.json') : [];
    assert(captured.length === 0, `empty --framework captured ${captured.join(', ')}`);
  });
  await test('a --framework flag with no value is rejected', () => {
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--out', tmpDir('bad'), '--framework']);
    assert(res.status !== 0, 'a bare --framework must fail');
  });

  // 21: a browser-launch failure must invalidate the requested frameworks.
  {
    // Fresh, complete, otherwise-valid captures that a scoped verify would
    // accept. Force the real launch to fail by pointing Playwright at a
    // directory with no browsers, so the failure happens before the framework
    // loop -- exactly the window the finding describes.
    const dir = tmpDir('launch-fail');
    writeShots(dir, { runId: 'gen-A', frameworks: ['fixture'] });
    const emptyBrowsers = tmpDir('no-browsers');
    const res = run(
      'node',
      [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir],
      { env: { PLAYWRIGHT_BROWSERS_PATH: emptyBrowsers } }
    );
    await test('a failed browser launch exits non-zero', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}\n${res.stdout}`);
    });
    await test('a failed browser launch deletes the stale framework images', () => {
      const leftover = fs.existsSync(path.join(dir, 'fixture'))
        ? fs.readdirSync(path.join(dir, 'fixture'))
        : [];
      assert(leftover.length === 0, `stale images survived: ${leftover.join(', ')}`);
    });
    await test('a failed browser launch records the failure in the report', () => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
      assert(raw.fixture && raw.fixture.failed === true,
        `requested framework not marked failed: ${JSON.stringify(raw.fixture)}`);
      assert(!raw.__meta || raw.__meta.fullSet !== true, 'failed launch claimed a full fresh set');
    });
    await test('a scoped verify rejects a capture whose launch failed', () => {
      const res2 = run('node', [
        path.join(DOCS, 'verify-screenshots.js'), '--dir', dir, '--framework', 'fixture',
      ]);
      assert(res2.status !== 0, `scoped verify accepted a failed capture:\n${res2.stdout}`);
    });
  }

  // 22: captures must hide the text caret. A blinking caret renders as a 1px
  // column that changes between runs, which showed up as a real pixel-parity
  // failure in the `input-filled` state (the input is focused there).
  await test('every screenshot hides the text caret', () => {
    const src = fs.readFileSync(path.join(DOCS, 'screenshot.js'), 'utf8');
    const shots = src.match(/page\.screenshot\(/g) || [];
    assert(shots.length >= 3, `expected the capture screenshots, found ${shots.length}`);
    const hidden = src.match(/caret:\s*'hide'/g) || [];
    assert(hidden.length === shots.length,
      `${shots.length - hidden.length} page.screenshot call(s) do not set caret: 'hide'`);
  });
  await test('settleAnimations waits for running transitions to reach steady state', () => {
    // A single `getAnimations().finished` snapshot resolves immediately when no
    // animation is registered yet, so an edge mid-transition could be captured
    // (the focused `.todo-input` border over its 300ms transition). The wait must
    // poll `playState === 'running'` until two consecutive samples are empty.
    const src = fs.readFileSync(path.join(DOCS, 'screenshot.js'), 'utf8');
    const fn = src.match(/async function settleAnimations\(page\)\s*\{[\s\S]*?\n\}/);
    assert(fn, 'settleAnimations not found');
    assert(/playState\s*===\s*'running'/.test(fn[0]),
      'settleAnimations does not sample running animations');
    assert(/stable\s*<\s*2/.test(fn[0]),
      'settleAnimations does not require two consecutive steady samples');
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
  {
    // A capture set with a broken asset records a failed entry (and no PNGs).
    // optimize-images.py must refuse to publish JPEGs from such a report, even
    // when the PNGs happen to exist.
    const outDir = tmpDir('optimize-errors-src');
    writeShots(outDir, {
      reportMutate: (fw, entry) => {
        if (fw === 'vue') { entry.errors = ['console: boom']; }
      },
    });
    await test('optimize-images.py refuses a report that records console errors', () => {
      const dstDir = tmpDir('optimize-errors-dst');
      const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', outDir, '--dst', dstDir], { cwd: os.tmpdir() });
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}${res.stderr}`);
      assert(/console\/network error|errors/i.test(res.stdout + res.stderr), `unclear error: ${res.stderr}`);
      assert(!fs.existsSync(path.join(dstDir, 'vue')), 'JPEGs were written despite the errors');
    });
    await test('optimize-images.py refuses a report whose entry is marked failed', () => {
      const dir = tmpDir('optimize-failed-src');
      writeShots(dir, {
        reportMutate: (fw, entry) => {
          if (fw === 'vue') { entry.failed = true; entry.error = '3 console/network error(s)'; }
        },
      });
      const dstDir = tmpDir('optimize-failed-dst');
      const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', dir, '--dst', dstDir], { cwd: os.tmpdir() });
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}${res.stderr}`);
      assert(/failed/i.test(res.stdout + res.stderr), `unclear error: ${res.stderr}`);
    });
    await test('optimize-images.py refuses a report that is not a full set', () => {
      const dir = tmpDir('optimize-partial-src');
      const report = writeShots(dir);
      report.__meta.fullSet = false;
      fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
      const dstDir = tmpDir('optimize-partial-dst');
      const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', dir, '--dst', dstDir], { cwd: os.tmpdir() });
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}${res.stderr}`);
      assert(/full capture|fullSet/i.test(res.stdout + res.stderr), `unclear error: ${res.stderr}`);
    });
    await test('optimize-images.py refuses a mixed capture generation', () => {
      const dir = tmpDir('optimize-mixed-src');
      const report = writeShots(dir, { runId: 'gen-1' });
      report.vue.captureRunId = 'gen-2';
      fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
      const dstDir = tmpDir('optimize-mixed-dst');
      const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', dir, '--dst', dstDir], { cwd: os.tmpdir() });
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}${res.stderr}`);
      assert(/captureRunId|mixed/i.test(res.stdout + res.stderr), `unclear error: ${res.stderr}`);
    });
    await test('optimize-images.py refuses a missing report', () => {
      const dir = tmpDir('optimize-noreport-src');
      writeShots(dir);
      fs.rmSync(path.join(dir, 'screenshot-report.json'));
      const dstDir = tmpDir('optimize-noreport-dst');
      const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', dir, '--dst', dstDir], { cwd: os.tmpdir() });
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}${res.stderr}`);
      assert(/report not found/i.test(res.stdout + res.stderr), `unclear error: ${res.stderr}`);
    });
  }
  {
    // Finding 4: a card taller than the nominal height must not be clipped. The
    // crop bottom is computed from the tallest card across all PNGs, so the dark
    // bar drawn at the card's bottom edge must still be present in the JPEG.
    const CARD_880 = 880;
    const outDir = tmpDir('optimize-tall-src');
    const dstDir = tmpDir('optimize-tall-dst');
    writeShots(outDir, { populatedCardHeight: CARD_880, bottomBar: true });
    const res = run('python3', [path.join(DOCS, 'optimize-images.py'), '--src', outDir, '--dst', dstDir], { cwd: os.tmpdir() });
    await test('optimize-images.py succeeds for a set with an 880px card', () => {
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}${res.stderr}`);
    });
    const jpeg = path.join(dstDir, 'react', 'all.jpg');
    await test('the optimized JPEG still contains the bottom row of a tall card', () => {
      assert(fs.existsSync(jpeg), `no optimized JPEG written: ${jpeg}`);
      // The JPEG is decoded by Pillow (already a dependency of the optimizer) and
      // scanned for the dark bar drawn across the card's bottom edge. The bar is
      // far from the crop's left/right padding, so it can only be missing if the
      // crop clipped the card.
      const script = [
        'import sys',
        'from PIL import Image',
        'im = Image.open(sys.argv[1]).convert("RGB")',
        'w, h = im.size',
        'px = im.load()',
        'best = 0',
        'for y in range(h):',
        '    dark = sum(1 for x in range(w) if px[x, y][0] < 80 and px[x, y][1] < 80 and px[x, y][2] < 80)',
        '    best = max(best, dark)',
        'print(best)',
      ].join('\n');
      const res = run('python3', ['-c', script, jpeg], { timeout: 30000 });
      assert(res.status === 0, `could not inspect the JPEG: ${res.stderr}`);
      const dark = Number((res.stdout || '').trim());
      assert(Number.isFinite(dark) && dark > 20,
        `the card's bottom row was clipped from the JPEG (widest dark row = ${res.stdout.trim()})`);
    });
  }

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
    // A directory holding more than the five expected states, or any stray
    // non-PNG file, must fail: the completeness check cannot silently ignore
    // files it did not expect. Only *.png used to be enumerated.
    const dir = tmpDir('verify-extra-file');
    writeShots(dir);
    fs.writeFileSync(path.join(dir, 'react', 'notes.txt'), 'stray');
    await test('verify rejects a stray non-PNG file in a framework directory', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/notes\.txt/.test(res.stdout), `the stray file was not named: ${res.stdout}`);
    });
  }
  {
    const dir = tmpDir('verify-extra-png');
    writeShots(dir);
    // A sixth PNG that is not one of the five contract states.
    fs.copyFileSync(path.join(dir, 'react', 'all.png'), path.join(dir, 'react', 'extra-state.png'));
    await test('verify rejects a sixth PNG beyond the five states', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/extra-state\.png/.test(res.stdout), `the extra PNG was not named: ${res.stdout}`);
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
  {
    // Finding 3: the declared viewport pins the required pixel size. A PNG whose
    // height does not match `viewport.height * dpr` must be rejected, even if it
    // is otherwise a plausible screenshot.
    const dir = tmpDir('verify-size');
    writeShots(dir, {
      imageHeight: 1200,
      viewport: { width: VIEWPORT_W, height: 1200, deviceScaleFactor: 1 },
    });
    // Make the report declare the wrong (1200) viewport height, while the images
    // are written 1200px tall to match. This is an entirely self-consistent set
    // that is nonetheless not the 1440x1024 capture contract.
    await test('verify rejects a viewport that is not 1440x1024', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/1440x1024|viewport/i.test(res.stdout), `unclear failure: ${res.stdout}`);
    });
    await test('pixel-parity rejects a non-1440x1024 reference', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/1440x1024|viewport/i.test(res.stdout), `unclear failure: ${res.stdout}`);
    });
  }
  {
    // The complementary case: the report declares 1440x1024 but a PNG is the
    // wrong size (a stale image from another viewport). The size check must fail
    // with the explicit "size WxH != expected" message.
    const dir = tmpDir('verify-size-mismatch');
    writeShots(dir);
    writeShot(path.join(dir, 'vue', 'all.png'), { cardHeight: POPULATED_HEIGHT, markerColor: [80, 130, 185], height: 1200 });
    await test('verify rejects a PNG whose size does not match the declared viewport', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/size 1440x1200 != expected 1440x1024/.test(res.stdout), `not reported: ${res.stdout}`);
    });
  }
  {
    // DPR is part of the size contract: a report declaring deviceScaleFactor 2
    // requires 2880x2048 images, so a 1440x1024 set must be rejected rather than
    // silently accepted because it matches the CSS viewport.
    const dir = tmpDir('verify-dpr-mismatch');
    writeShots(dir, {
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 2 },
    });
    await test('verify rejects images that do not match the declared DPR', () => {
      const res = run('node', [path.join(DOCS, 'verify-screenshots.js'), '--dir', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/size 1440x1024 != expected 2880x2048/.test(res.stdout), `not reported: ${res.stdout}`);
    });
  }
  {
    // A genuinely higher-DPR capture is self-consistent: the report declares
    // deviceScaleFactor 2 and the images are 2880x2048. The pixel masks, however,
    // come from getBoundingClientRect() in CSS pixels, so they must be scaled to
    // device pixels before masking — otherwise the framework-name marker shows
    // through and identical layouts fail pixel parity.
    const dir = tmpDir('pixel-dpr2');
    writeShots(dir, { dpr: 2 });
    await test('pixel-parity passes for a self-consistent DPR 2 capture', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status === 0, `exit ${res.status}:\n${res.stdout}`);
    });
  }
  {
    // The masks are still exact after scaling: a 1-unit change *outside* the
    // scaled badge/footer rectangles must fail, so the scale did not quietly
    // widen the tolerated region.
    const dir = tmpDir('pixel-dpr2-outside');
    writeShots(dir, { dpr: 2 });
    pokePixel(path.join(dir, 'vue', 'all.png'), 200, 200, 0, 1);
    await test('pixel-parity still fails on a difference outside the scaled masks at DPR 2', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/vue/.test(res.stdout), `diverging framework not named: ${res.stdout}`);
    });
  }
  {
    // A report could declare one DPR while the image is rendered at another;
    // the candidate must match its *own* declared DPR, not just the reference's
    // size.
    const dir = tmpDir('pixel-dpr-mismatch');
    writeShots(dir);
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'screenshot-report.json'), 'utf8'));
    report.vue.viewport.deviceScaleFactor = 2;
    fs.writeFileSync(path.join(dir, 'screenshot-report.json'), JSON.stringify(report, null, 2));
    await test('pixel-parity rejects a candidate whose image does not match its declared DPR', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `expected non-zero exit:\n${res.stdout}`);
      assert(/vue/.test(res.stdout) && /DPR|expected/i.test(res.stdout), `unclear: ${res.stdout}`);
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
    // `npm run pixel` is documented as a standalone gate. A capture that recorded
    // console/network failures must be rejected even when the images match — the
    // CI sequence runs verify first, but the pixel checker cannot rely on that.
    const dir = tmpDir('pixel-errors');
    writeShots(dir, {
      reportMutate: (fw, entry) => { if (fw === 'vue') entry.errors = ['http 404: /app.js']; },
    });
    await test('pixel-parity rejects a capture that recorded console/network errors', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `an erroring capture was confirmed:\n${res.stdout}`);
      assert(/vue/.test(res.stdout) && /error/i.test(res.stdout), `unclear failure: ${res.stdout}`);
      assert(!/PIXEL PARITY CONFIRMED/.test(res.stdout), 'erroring capture still reported parity');
    });
  }
  {
    // A missing `errors` array is itself a failure: the checker cannot verify a
    // capture's health without it.
    const dir = tmpDir('pixel-no-errors');
    writeShots(dir, {
      reportMutate: (fw, entry) => { if (fw === 'react') delete entry.errors; },
    });
    await test('pixel-parity rejects a report entry with no errors array', () => {
      const res = run('python3', [path.join(DOCS, 'pixel-parity.py'), '--shots', dir]);
      assert(res.status !== 0, `a missing errors array was accepted:\n${res.stdout}`);
      assert(/errors list/i.test(res.stdout), `unclear failure: ${res.stdout}`);
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
    // Seed a stale shot set so the "capture removes it" behaviour is proven, not
    // just assumed: a framework captured with a console error must leave no PNG
    // behind, and must be recorded as failed in the report.
    fs.mkdirSync(path.join(dir, 'fixture'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fixture', 'all.png'), 'STALE');
    fs.writeFileSync(path.join(dir, 'fixture', 'stale-extra.png'), 'STALE');
    const res = run('node', [path.join(DOCS, 'screenshot.js'), '--framework', `fixture:${FIXTURE_PORT}`, '--out', dir]);
    await test('a non-favicon 404 fails the capture', () => {
      assert(res.status !== 0, `expected non-zero exit, got ${res.status}`);
      assert(/definitely-missing-asset/.test(res.stdout + res.stderr), 'the failing URL was not reported');
    });
    await test('a console-error capture deletes the framework screenshots folder', () => {
      const leftover = fs.existsSync(path.join(dir, 'fixture'))
        ? fs.readdirSync(path.join(dir, 'fixture'))
        : [];
      assert(leftover.length === 0, `PNGs survived a console-error capture: ${leftover.join(', ')}`);
    });
    await test('a console-error capture records a failed entry with its errors', () => {
      const entry = readReport(dir, 'fixture');
      assert(entry, 'no report entry for fixture');
      assert(entry.failed === true, `entry not marked failed: ${JSON.stringify(entry)}`);
      assert(/console\/network error/.test(entry.error || ''), `unclear error: ${entry.error}`);
      assert(Array.isArray(entry.errors) && entry.errors.length > 0,
        `the errors were not carried into the report: ${JSON.stringify(entry.errors)}`);
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

  // --- 22: a second launch must not strand the first server -----------------
  console.log('\nsecond-launch guard (finding 22)');
  {
    // A prior server runs on one port; a second launch of the same framework on
    // a *different* port used to overwrite its state file, stranding the first
    // server (stop-servers.sh could only ever see the newer record). The second
    // launch must now refuse while the same framework has a verified live state.
    const FIRST_OFFSET = 2100;                  // leptos -> 6104
    const SECOND_OFFSET = 2200;                 // leptos -> 6204
    const firstPort = 4004 + FIRST_OFFSET;
    const secondPort = 4004 + SECOND_OFFSET;
    const dist = path.join(ROOT, 'implementations', 'leptos', 'dist');
    const createdDist = !fs.existsSync(dist);
    if (createdDist) {
      fs.mkdirSync(dist, { recursive: true });
      fs.writeFileSync(path.join(dist, 'index.html'),
        '<!doctype html><title>fixture</title><div class="todo-app">fixture</div>');
    }
    const logsDir = tmpDir('second-launch-logs');
    const startScript = path.join(DOCS, 'scripts', 'start-servers.sh');
    const stopScript = path.join(DOCS, 'scripts', 'stop-servers.sh');
    try {
      const first = run('bash',
        [startScript, '--only', 'leptos', '--port-offset', String(FIRST_OFFSET), '--ready-timeout', '60'],
        { env: { FB_LOGS_DIR: logsDir }, timeout: 120000 });
      await test('the first launch of a framework starts and becomes ready', () => {
        assert(first.status === 0, `first startup failed (exit ${first.status}):\n${first.stdout}${first.stderr}`);
        assert(new RegExp(`leptos ready on ${firstPort}`).test(first.stdout),
          `the first server never reported ready:\n${first.stdout}${first.stderr}`);
      });

      const statePath = path.join(logsDir, 'leptos.state');
      const firstState = parseState(statePath);

      const second = run('bash',
        [startScript, '--only', 'leptos', '--port-offset', String(SECOND_OFFSET), '--ready-timeout', '15'],
        { env: { FB_LOGS_DIR: logsDir }, timeout: 60000 });
      await test('a second launch of the same framework refuses to start', () => {
        assert(second.status !== 0, `a second launch was allowed (exit ${second.status}):\n${second.stdout}${second.stderr}`);
        assert(/already running|already has|refusing to start a second instance/i.test(second.stdout + second.stderr),
          `no clear refusal:\n${second.stdout}${second.stderr}`);
        assert(!/starting leptos/.test(second.stdout),
          `the second launch started a server anyway:\n${second.stdout}`);
      });
      await test('the second launch never serves its own port', async () => {
        const up = await fetch(`http://127.0.0.1:${secondPort}/`).then(() => true).catch(() => false);
        assert(!up, `the second port ${secondPort} is serving despite the refusal`);
      });
      await test("the first server's state record is untouched by the refusal", () => {
        const after = parseState(statePath);
        assert(after.pid === firstState.pid && after.run_token === firstState.run_token,
          `the state record changed: ${JSON.stringify(firstState)} -> ${JSON.stringify(after)}`);
      });
      await test('the original server is still alive after the refused second launch', async () => {
        const ok = await fetch(`http://127.0.0.1:${firstPort}/`).then((r) => r.ok).catch(() => false);
        assert(ok, `the original port ${firstPort} stopped serving`);
      });
      await test('stop-servers.sh still stops the original server', () => {
        const stopRes = run('bash', [stopScript], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
        assert(stopRes.status === 0, `stop exit ${stopRes.status}:\n${stopRes.stdout}${stopRes.stderr}`);
        assert(/stopping leptos/.test(stopRes.stdout),
          `the original server was not stopped:\n${stopRes.stdout}${stopRes.stderr}`);
      });
      await test('the original port is freed after stop (no stranded server)', async () => {
        const deadline = Date.now() + 5000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await fetch(`http://127.0.0.1:${firstPort}/`).then(() => true).catch(() => false);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${firstPort} is still served after stop: a server was stranded`);
      });
    } finally {
      run('bash', [stopScript], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
      if (createdDist) fs.rmSync(dist, { recursive: true, force: true });
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

  /** Write a state file with exactly the given fields (no defaults). */
  function writeStateFields(logsDir, name, fields) {
    fs.writeFileSync(
      path.join(logsDir, `${name}.state`),
      Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
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

  // --- an interrupted startup must reap what it already launched -----------
  console.log('\nstart-servers.sh interruption cleanup (finding 28)');
  {
    // Reproduces the gap: a server started for real (so it holds its port and
    // records a verified state), then a second framework whose startup never
    // becomes ready -- we interrupt the script while it is waiting. Before the
    // INT/TERM trap, the already-launched server kept running and held its port.
    const OFFSET = 4000;                 // react -> 8001, vue -> 8002
    const reactPort = 4001 + OFFSET;
    const vuePort = 4002 + OFFSET;
    const logsDir = tmpDir('interrupt-logs');
    const bin = tmpDir('interrupt-bin');

    // A fake `npm` serves each framework: react answers HTTP so start-servers
    // proceeds, vue accepts the connection but never returns a response so its
    // readiness loop keeps polling while we send the signal.
    const fakeNpm = path.join(bin, 'npm');
    fs.writeFileSync(fakeNpm, `#!/usr/bin/env bash
# args: --prefix <dir> run dev -- --port <port> --host 127.0.0.1 --strictPort
port=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    *) shift ;;
  esac
done
# Serve a real HTTP response for every framework except the one whose readiness
# must hang (so the script is still waiting when we interrupt it).
ready="yes"
if [ -n "\${HANG_PORT:-}" ] && [ "$port" = "$HANG_PORT" ]; then ready="no"; fi
exec python3 -c '
import socket, sys
port = int(sys.argv[1])
ready = sys.argv[2] == "yes"
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", port))
s.listen(5)
while True:
    c, _ = s.accept()
    if ready:
        c.sendall(b"HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\nConnection: close\\r\\n\\r\\nok")
    c.close()
' "$port" "$ready"
`);
    fs.chmodSync(fakeNpm, 0o755);

    const startScript = path.join(DOCS, 'scripts', 'start-servers.sh');
    const stopScript = path.join(DOCS, 'scripts', 'stop-servers.sh');
    let child = null;
    try {
      child = spawn('bash',
        [startScript, '--port-offset', String(OFFSET), '--ready-timeout', '60'],
        {
          cwd: DOCS,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            FB_LOGS_DIR: logsDir,
            PATH: `${bin}:${process.env.PATH}`,
            HANG_PORT: String(vuePort),
          },
        });
      // Wait until react is genuinely served (its state is verified), then let
      // vue's readiness hang and interrupt the script.
      await waitForTcp(reactPort, 20000);
      await new Promise((r) => setTimeout(r, 1500));
      child.kill('SIGINT');
      await new Promise((resolve) => {
        const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 20000);
        child.on('exit', () => { clearTimeout(t); resolve(); });
      });

      await test('an interrupted startup stops the servers it already launched', async () => {
        const deadline = Date.now() + 8000;
        let up = true;
        while (Date.now() < deadline && up) {
          up = await tcpOpen(reactPort);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `react is still serving on ${reactPort} after the interruption`);
      });

      await test('no live process survives the interrupted startup', () => {
        const stateFile = path.join(logsDir, 'react.state');
        if (!fs.existsSync(stateFile)) return; // already reaped and removed
        const pgid = Number(parseState(stateFile).pgid);
        assert(!pgid || liveGroupMembers(pgid).length === 0,
          `a live process survived in group ${pgid}: ${pgid ? liveGroupMembers(pgid).join(', ') : ''}`);
      });
    } finally {
      if (child && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
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

  // --- orphan child: leader dead, group still alive -------------------------
  console.log('\nstop-servers.sh orphan-child recovery');
  {
    // The severe case: a wrapper exits while a child (vite/ng) ignores SIGTERM
    // and keeps the port. `verify_state` used to fail ("process no longer
    // exists"), quarantine the record and leave the child running. The
    // "leader dead, group alive" path must signal the group after proving every
    // live member belongs to the session the run created.
    const logsDir = tmpDir('orphan-logs');
    const port = 4191;
    const state = path.join(logsDir, 'fixture.state');
    const child = spawn(
      'setsid',
      ['bash', path.join(DOCS, 'scripts', 'lib', 'serve.sh'), state, 'tok', 'bash', '-c', `
        # Child: ignores SIGTERM, holds the port.
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
        # Leader: exits on SIGTERM (default), but waits so it stays alive until
        # the test kills it explicitly.
        trap 'exit 0' TERM
        wait "$child"
      `],
      { stdio: 'ignore' }
    );
    try {
      await waitForTcp(port);
      // Wait for serve.sh to write the state that records the leader's identity.
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(state) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      const fields = parseState(state);
      assert(fields.pid === String(child.pid), `state recorded pid ${fields.pid}, expected ${child.pid}`);

      // Kill only the leader. The child stays in the (now leaderless) group and
      // keeps the port: exactly the orphan case. SIGKILL leaves no zombie, so
      // /proc/<pid> is gone immediately (a plain exit would linger as a zombie
      // while this test process reaps it, masking the orphan path).
      process.kill(child.pid, 'SIGKILL');
      await new Promise((r) => setTimeout(r, 500));

      await test('the orphan case is genuine: the port is held after the leader dies', async () => {
        const up = await tcpOpen(port);
        assert(up, 'precondition failed: the port was not held by the orphan child');
        assert(!fs.existsSync(`/proc/${child.pid}`), 'precondition failed: the leader is still present');
      });

      const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
        env: { FB_LOGS_DIR: logsDir },
        timeout: 30000,
      });
      await test('stop-servers.sh stops a group whose leader is gone', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/stopping fixture/.test(res.stdout), `the orphan group was not stopped: ${res.stdout}${res.stderr}`);
        assert(!/refusing to signal fixture/.test(res.stdout + res.stderr),
          `the orphan group was wrongly refused: ${res.stdout}${res.stderr}`);
      });
      await test('the orphan child is gone and the port is free', async () => {
        const dl = Date.now() + 8000;
        let up = true;
        while (Date.now() < dl && up) {
          up = await tcpOpen(port);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still held: the orphan child survived`);
      });
      await test('no live member of the orphaned group survives', () => {
        const live = liveGroupMembers(child.pid);
        assert(live.length === 0, `live process(es) still in the group: ${live.join(', ')}`);
      });
      await test('the spent state file is removed after the orphan group is reaped', () => {
        assert(!fs.existsSync(state), 'the state file survived the stop');
      });
    } finally {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
    }
  }
  {
    // A record whose leader is gone *and* whose group has no live member is a
    // spent record, not a failure: it must be removed without quarantining (a
    // warm-up run that already exited is normal).
    const logsDir = tmpDir('spent-logs');
    const pidMax = Number(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim());
    const deadPid = pidMax + 23; // can never exist
    writeStateFields(logsDir, 'fixture', {
      pid: String(deadPid), pgid: String(deadPid), starttime: '1',
      boot_id: bootId(), run_token: 'spent', cmd: 'gone',
    });
    const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
      env: { FB_LOGS_DIR: logsDir },
      timeout: 15000,
    });
    await test('a spent record (dead leader, empty group) is removed, not quarantined', () => {
      assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
      assert(!/refusing to signal fixture/.test(res.stdout + res.stderr),
        `a spent record was treated as unverifiable: ${res.stdout}${res.stderr}`);
      const leftovers = fs.readdirSync(logsDir);
      assert(!leftovers.includes('fixture.state'), `the spent state file was left behind: ${leftovers.join(', ')}`);
      assert(!leftovers.some((f) => f.startsWith('stale-')), `a spent record was quarantined: ${leftovers.join(', ')}`);
    });
  }
  {
    // The dangerous inverse: the leader is gone and a live process sits in the
    // *recorded group*, but that process is not part of the session the run
    // created (its session id differs from the recorded pgid). This models a
    // recycled/reused group id. The group must NOT be signalled.
    const logsDir = tmpDir('foreign-group-logs');
    const pidMax = Number(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim());
    const deadPid = pidMax + 31;
    // A process in its own group (setpgid(0,0)) but still in the parent's
    // session, so session id != its pid/pgid. It is its own group, so even a
    // mistaken signal cannot reach this test process.
    const foreign = spawn('python3', ['-c', `
import os, time
os.setpgid(0, 0)   # own process group, session unchanged (session != pgid)
time.sleep(30)
`], { stdio: 'ignore' });
    try {
      await new Promise((r) => setTimeout(r, 500));
      const id = procIdentity(foreign.pid);
      assert(Number(id.pgrp) === foreign.pid, `precondition: expected pgid ${foreign.pid}, got ${id.pgrp}`);
      writeStateFields(logsDir, 'fixture', {
        pid: String(deadPid), pgid: String(foreign.pid), starttime: '1',
        boot_id: bootId(), run_token: 'foreign', cmd: 'gone',
      });
      const res = run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], {
        env: { FB_LOGS_DIR: logsDir },
        timeout: 15000,
      });
      await test('a dead leader whose group is not provably ours is quarantined, never signalled', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/refusing to signal fixture/.test(res.stdout + res.stderr),
          `a group outside the recorded session was not refused: ${res.stdout}${res.stderr}`);
        const leftovers = fs.readdirSync(logsDir);
        assert(leftovers.some((f) => f.startsWith('stale-')), `not quarantined: ${leftovers.join(', ')}`);
      });
      await test('the foreign group member is still alive (never signalled)', () => {
        let alive = true;
        try { process.kill(foreign.pid, 0); } catch { alive = false; }
        assert(alive, 'a group outside the recorded session was signalled');
      });
    } finally {
      try { foreign.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  // --- attribute-context escaping (Blade aria-label XSS) --------------------
  {
    // The Blade app interpolated a todo's text straight into a double-quoted
    // aria-label inside innerHTML. Its escapeHtml() escapes for *text* content
    // and leaves quotes alone, so a crafted text broke out of the attribute and
    // executed. This drives a real browser over the fixture, which reproduces
    // the vulnerable renderer on demand, to prove the difference: the text
    // escaper is exploitable, the attribute escaper is not.
    const { chromium } = require('playwright');
    const ATTACK = 'x" onmouseover="window.__xss=1';
    // Playwright's bundled Chromium is the default; a sandbox without it (or
    // with a system browser) can point FB_CHROMIUM_EXECUTABLE at one.
    const launchOpts = { args: ['--no-sandbox'] };
    if (process.env.FB_CHROMIUM_EXECUTABLE) launchOpts.executablePath = process.env.FB_CHROMIUM_EXECUTABLE;
    const browser = await chromium.launch(launchOpts);

    const runAttack = async (flags) => {
      const server = await startFixture(flags);
      const page = await browser.newPage();
      try {
        await page.goto(`http://127.0.0.1:${FIXTURE_PORT}/`, { waitUntil: 'load' });
        await page.fill('.todo-input', ATTACK);
        await page.click('.btn-primary');
        // The payload only fires if it became a real event-handler attribute; a
        // synthetic dispatchEvent does not run an inline handler, so hover.
        await page.hover('.todo-checkbox');
        return await page.evaluate(() => window.__xss === 1);
      } finally {
        await page.close();
        await stopFixture(server);
      }
    };

    try {
      await test('the attribute escaper neutralises a quote-breaking todo text', async () => {
        const fired = await runAttack({});
        assert(fired === false, 'a crafted todo text executed script despite attribute escaping');
      });
      await test('the text-only escaper is exploitable (the reported Blade bug)', async () => {
        const fired = await runAttack({ vulnerableAriaLabel: true });
        assert(fired === true,
          'the reproduction did not execute: the fixture no longer models the vulnerability');
      });
    } finally {
      await browser.close();
    }
  }

  // --- transient unrelated exits must not abort the orphan scan -------------
  {
    // The "leader dead, group alive" scan walks all of /proc. A PID that exits
    // between the directory enumeration and its stat read used to fail the whole
    // scan (return 1), so stop-servers.sh quarantined the record and left the
    // orphan child holding its port. An *unrelated* short-lived process must
    // never have that effect; only an unreadable identity for a proven member of
    // the target group may fail closed.
    const logsDir = tmpDir('transient-logs');
    const port = 4193;
    const state = path.join(logsDir, 'fixture.state');
    const child = spawn(
      'setsid',
      ['bash', path.join(DOCS, 'scripts', 'lib', 'serve.sh'), state, 'tok', 'bash', '-c', `
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
        trap 'exit 0' TERM
        wait "$child"
      `],
      { stdio: 'ignore' }
    );
    let churn = null;
    try {
      await waitForTcp(port);
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(state) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      process.kill(child.pid, 'SIGKILL');
      await new Promise((r) => setTimeout(r, 500));

      await test('precondition: the port is held by the orphan after the leader dies', async () => {
        assert(await tcpOpen(port), 'the orphan child did not hold the port');
      });

      // Churn: spawn very short-lived, unrelated processes throughout the scan.
      // A PID that vanishes mid-scan used to abort it.
      const stopScript = path.join(DOCS, 'scripts', 'stop-servers.sh');
      churn = spawn('bash', ['-c', 'while :; do /bin/true; /bin/true; done'], { stdio: 'ignore' });
      const res = run('bash', [stopScript], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
      await test('a transient unrelated exit does not abort the orphan-group stop', () => {
        assert(res.status === 0, `exit ${res.status}: ${res.stdout}${res.stderr}`);
        assert(/stopping fixture/.test(res.stdout),
          `the orphan group was not stopped: ${res.stdout}${res.stderr}`);
        assert(!/refusing to signal fixture/.test(res.stdout + res.stderr),
          `the orphan group was wrongly quarantined: ${res.stdout}${res.stderr}`);
      });
      await test('the orphan child is gone and the port is free despite the churn', async () => {
        const dl = Date.now() + 8000;
        let up = true;
        while (Date.now() < dl && up) {
          up = await tcpOpen(port);
          if (up) await new Promise((r) => setTimeout(r, 200));
        }
        assert(!up, `port ${port} is still held: the orphan child survived`);
      });
    } finally {
      if (churn) { try { churn.kill('SIGKILL'); } catch { /* gone */ } }
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      run('bash', [path.join(DOCS, 'scripts', 'stop-servers.sh')], { env: { FB_LOGS_DIR: logsDir }, timeout: 30000 });
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

  // --- workflow Node.js pins satisfy the declared engine floors -------------
  console.log('\nworkflow Node.js pins (Angular CLI 22)');
  {
    const checker = path.join(DOCS, 'check-node-engines.js');
    await test('every workflow Node.js pin satisfies the declared engine floors', () => {
      const res = run('node', [checker], { timeout: 30000 });
      assert(res.status === 0, `checker failed:\n${res.stdout}${res.stderr}`);
      assert(/NODE ENGINES OK/.test(res.stdout), `no success line: ${res.stdout}`);
    });
    await test('the visual-parity workflow pins a Node.js the Angular CLI accepts', () => {
      const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'visual-parity.yml'), 'utf8');
      const m = /node-version:\s*['"]?([^'"\s#]+)/.exec(wf);
      assert(m, 'the visual-parity workflow has no node-version pin');
      const major = Number(m[1].split('.')[0]);
      // Angular CLI 22 requires ^22.22.3 || ^24.15.0 || >=26.0.0, so Node 20 (the
      // reported bug) and Node 22.x below 22.22.3 must never be pinned.
      assert(major >= 24 || (major === 22 && m[1] !== '22'),
        `the visual-parity workflow pins Node ${m[1]}, which the Angular CLI rejects`);
    });
    await test('the Angular implementation declares a Node.js engine matching its CLI', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'implementations', 'angular', 'package.json'), 'utf8'));
      assert(pkg.engines && typeof pkg.engines.node === 'string' && pkg.engines.node.trim(),
        'implementations/angular/package.json declares no engines.node');
      const cliMajor = /(\d+)/.exec(String(pkg.devDependencies['@angular/cli']))[1];
      // The declared floor must name the same major the CLI dependency does (a
      // floor of ">=20" would silently let a Node 20 runner install Angular 22
      // and fail only when the dev server is started).
      assert(/22\.22\.3/.test(pkg.engines.node),
        `engines.node ${JSON.stringify(pkg.engines.node)} does not name the Angular 22 CLI floor`);
      assert(pkg.engines.node.includes(String(cliMajor)),
        `engines.node ${JSON.stringify(pkg.engines.node)} does not mention Angular ${cliMajor}`);
    });
    await test('the checker rejects a workflow pin below the Angular floor (Node 20)', () => {
      const dir = tmpDir('node-engines-bad');
      fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'implementations', 'angular'), { recursive: true });
      fs.copyFileSync(path.join(DOCS, 'package.json'), path.join(dir, 'docs', 'package.json'));
      fs.copyFileSync(
        path.join(ROOT, 'implementations', 'angular', 'package.json'),
        path.join(dir, 'implementations', 'angular', 'package.json')
      );
      fs.writeFileSync(
        path.join(dir, '.github', 'workflows', 'x.yml'),
        'name: x\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "20"\n'
      );
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, `a Node 20 pin was accepted:\n${res.stdout}${res.stderr}`);
      assert(/Node 20/.test(res.stdout + res.stderr), `unclear failure: ${res.stdout}${res.stderr}`);
    });
    const makePinRepo = (dir, version) => {
      fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'implementations', 'angular'), { recursive: true });
      fs.copyFileSync(path.join(DOCS, 'package.json'), path.join(dir, 'docs', 'package.json'));
      fs.copyFileSync(
        path.join(ROOT, 'implementations', 'angular', 'package.json'),
        path.join(dir, 'implementations', 'angular', 'package.json')
      );
      fs.writeFileSync(
        path.join(dir, '.github', 'workflows', 'x.yml'),
        `name: x\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "${version}"\n`
      );
    };
    await test('the checker accepts a workflow that pins the exact Node floor (24.15.0)', () => {
      const dir = tmpDir('node-engines-ok');
      makePinRepo(dir, '24.15.0');
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status === 0, `a Node 24.15.0 pin was rejected:\n${res.stdout}${res.stderr}`);
    });
    await test('the checker rejects a bare major pin whose lowest release is below the floor', () => {
      // `node-version: "24"` can install any 24.x, including 24.0.0, which does
      // not satisfy `^24.15.0`. Checking only the top of the major would accept
      // it, so the pin must be rejected (or written as an explicit version).
      const dir = tmpDir('node-engines-baremajor');
      makePinRepo(dir, '24');
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, `a bare "24" pin was accepted:\n${res.stdout}${res.stderr}`);
      assert(/24\.0\.0|does not satisfy/.test(res.stdout + res.stderr), `unclear failure: ${res.stdout}${res.stderr}`);
    });
    await test('a bare major pin denotes both ends of its range', () => {
      const { pinVersions } = require(path.join(DOCS, 'lib', 'node-semver.js'));
      assert(JSON.stringify(pinVersions('24')) === JSON.stringify([[24, 0, 0], [24, 999, 999]]),
        `pinVersions('24') = ${JSON.stringify(pinVersions('24'))}`);
      assert(JSON.stringify(pinVersions('24.15.0')) === JSON.stringify([[24, 15, 0]]),
        `pinVersions('24.15.0') = ${JSON.stringify(pinVersions('24.15.0'))}`);
    });
    await test('every workflow pin is a fully-qualified version the checker can prove', () => {
      // With a bare major the check can only prove the whole major satisfies the
      // floor; pinning an explicit version makes the guarantee exact. Keep the
      // workflows on explicit versions.
      for (const name of fs.readdirSync(path.join(ROOT, '.github', 'workflows'))) {
        if (!/\.ya?ml$/.test(name)) continue;
        const text = fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
        for (const line of text.split('\n')) {
          const m = /^\s*node-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/.exec(line);
          if (!m) continue;
          assert(/^\d+\.\d+\.\d+$/.test(m[1]),
            `${name} pins Node ${m[1]}; pin an explicit x.y.z version so the floor is provable`);
        }
      }
    });
    await test('check-node-version.js fails when the engine floor is above this runtime', () => {
      // Prove the floor is enforced from docs/package.json, not hardcoded: a
      // synthetic package demanding a future Node must be rejected here.
      const dir = tmpDir('node-version-future');
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      const pkg = JSON.parse(fs.readFileSync(path.join(DOCS, 'package.json'), 'utf8'));
      pkg.engines = { node: '>=99.0.0' };
      fs.writeFileSync(path.join(dir, 'docs', 'package.json'), JSON.stringify(pkg, null, 2));
      const res = run('node', [path.join(DOCS, 'check-node-version.js'), '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, `a floor above this runtime was accepted:\n${res.stdout}${res.stderr}`);
      assert(/>=\s*99\.0\.0/.test(res.stdout + res.stderr), `unclear failure: ${res.stdout}${res.stderr}`);
    });
    await test('docs/package.json declares the same disjoint range as Angular', () => {
      // Finding 2: the docs engine range must exclude Node 23/25 exactly like
      // Angular CLI 22, or check:node passes on a runtime Angular then rejects.
      const docsPkg = JSON.parse(fs.readFileSync(path.join(DOCS, 'package.json'), 'utf8'));
      const angularPkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'implementations', 'angular', 'package.json'), 'utf8'));
      const norm = (r) => String(r).replace(/\s+/g, '');
      assert(norm(docsPkg.engines.node) === norm(angularPkg.engines.node),
        `docs engines.node ${JSON.stringify(docsPkg.engines.node)} != angular ` +
        `${JSON.stringify(angularPkg.engines.node)}`);
      assert(/23/.test(docsPkg.engines.node) === false && /25/.test(docsPkg.engines.node) === false,
        `the declared range still admits Node 23/25: ${docsPkg.engines.node}`);
    });
    await test('the shared range evaluator excludes Node 23 and 25 but accepts 22.22.3/24.15/26', () => {
      // The gap is the whole point of the finding: a >=-minimum parser accepts
      // Node 23, while the disjoint Angular range must reject it. Exercise the
      // exact evaluator check-node-version.js uses.
      const { satisfiesRange } = require(path.join(DOCS, 'lib', 'node-semver.js'));
      const range = '^22.22.3 || ^24.15.0 || >=26.0.0';
      assert(satisfiesRange('22.22.2', range) === false, 'Node 22.22.2 was accepted');
      assert(satisfiesRange('22.22.3', range) === true, 'Node 22.22.3 was rejected');
      assert(satisfiesRange('23.0.0', range) === false, 'Node 23.0.0 was accepted (the reported bug)');
      assert(satisfiesRange('24.15.0', range) === true, 'Node 24.15.0 was rejected');
      assert(satisfiesRange('25.0.0', range) === false, 'Node 25.0.0 was accepted');
      assert(satisfiesRange('26.0.0', range) === true, 'Node 26.0.0 was rejected');
    });
  }

  // --- the engine gate must track a CLI floor that moves ---------------------
  console.log('\nengine gate tracks a moved Angular CLI floor (finding 24)');
  {
    const { boundaryVersions, satisfiesRange } = require(path.join(DOCS, 'lib', 'node-semver.js'));
    const checker = path.join(DOCS, 'check-node-engines.js');

    await test('boundaryVersions probes the neighbours of every range boundary', () => {
      const vs = boundaryVersions('^24.15.0').map((t) => t.join('.'));
      // The point of the fix: a floor that moved from 24.15.0 to 24.16.0 must be
      // a probed version, not something between two hand-picked samples.
      for (const v of ['24.15.0', '24.15.1', '24.16.0', '22.0.0', '23.0.0', '26.0.0']) {
        assert(vs.includes(v), `boundaryVersions did not probe ${v}: ${vs.join(', ')}`);
      }
    });

    // Build a repo whose *installed* CLI is stricter than the checked-in
    // declaration: the declaration is the wide `^22.22.3 || ^24.15.0 || >=26`,
    // but the CLI on disk only accepts `^24.16.0 || >=26.0.0`. The old gate
    // compared a fixed sample list and never noticed declaration ⊇ CLI.
    const makeShiftedCli = (dir) => {
      fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'implementations', 'angular', 'node_modules', '@angular', 'cli'), { recursive: true });
      fs.copyFileSync(path.join(DOCS, 'package.json'), path.join(dir, 'docs', 'package.json'));
      fs.copyFileSync(
        path.join(ROOT, 'implementations', 'angular', 'package.json'),
        path.join(dir, 'implementations', 'angular', 'package.json')
      );
      fs.writeFileSync(
        path.join(dir, 'implementations', 'angular', 'node_modules', '@angular', 'cli', 'package.json'),
        JSON.stringify({ name: '@angular/cli', version: '22.9.0', engines: { node: '^24.16.0 || >=26.0.0' } }, null, 2)
      );
      fs.writeFileSync(
        path.join(dir, '.github', 'workflows', 'x.yml'),
        'name: x\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "24.15.0"\n'
      );
    };

    await test('the checker flags a declaration that accepts a version the CLI rejects', () => {
      const dir = tmpDir('node-engines-shifted-decl');
      makeShiftedCli(dir);
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, `a declaration wider than the CLI was accepted:\n${res.stdout}${res.stderr}`);
      assert(/accepts Node/.test(res.stdout + res.stderr),
        `the declaration-wider-than-CLI case was not reported: ${res.stdout}${res.stderr}`);
    });

    await test('the checker fails a workflow pin the installed CLI rejects', () => {
      // 24.15.0 satisfies the declaration but not the installed CLI's floor, so
      // the pin must fail even though the checked-in declaration admits it.
      const dir = tmpDir('node-engines-shifted-pin');
      makeShiftedCli(dir);
      const res = run('node', [checker, '--root', dir], { timeout: 30000 });
      assert(res.status !== 0, `a pin the installed CLI rejects was accepted:\n${res.stdout}${res.stderr}`);
      assert(/installed @angular\/cli/.test(res.stdout + res.stderr),
        `the installed-CLI requirement was not named: ${res.stdout}${res.stderr}`);
    });

    await test('the real repository still passes the tracked-cli gate', () => {
      const res = run('node', [checker], { timeout: 30000 });
      assert(res.status === 0, `the real checkout failed the gate:\n${res.stdout}${res.stderr}`);
    });
  }

  // --- montage generation must reject a blank tile (finding 25) -------------
  console.log('\nmontage blank-tile guard (finding 25)');
  {
    const montage = path.join(DOCS, 'build-montage.js');
    const FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade'];
    const STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state'];

    // A real card is far from uniform; a solid JPEG of the same size is blank.
    const makeImage = (dst, kind) => {
      const script =
        kind === 'blank'
          ? `from PIL import Image; Image.new('RGB', (600, 800), (255, 255, 255)).save(${JSON.stringify(dst)}, 'JPEG')`
          : `from PIL import Image\nimport random\nrandom.seed(1)\nim = Image.new('RGB', (600, 800), (255, 255, 255))\npx = im.load()\nfor y in range(800):\n    for x in range(600):\n        if (x + y) % 17 == 0 or y % 40 == 0:\n            px[x, y] = (random.randint(0, 90), random.randint(0, 90), random.randint(0, 90))\nim.save(${JSON.stringify(dst)}, 'JPEG')`;
      const res = run('python3', ['-c', script], { timeout: 30000 });
      assert(res.status === 0, `could not build a ${kind} fixture image: ${res.stdout}${res.stderr}`);
    };

    // build-montage.js resolves its tree relative to its own location, so a copy
    // under a temp `docs/` with a synthetic `images/` tree exercises the real
    // script (and its real checks) without touching the committed JPEGs.
    const makeTree = (dir, blankFor) => {
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.copyFileSync(montage, path.join(dir, 'docs', 'build-montage.js'));
      for (const fw of FRAMEWORKS) {
        fs.mkdirSync(path.join(dir, 'docs', 'images', fw), { recursive: true });
        for (const state of STATES) {
          const kind = fw === blankFor ? 'blank' : 'content';
          makeImage(path.join(dir, 'docs', 'images', fw, `${state}.jpg`), kind);
        }
      }
    };

    await test('montage refuses a blank (near-uniform) tile', () => {
      const dir = tmpDir('montage-blank');
      makeTree(dir, 'vue');
      const res = run('node', [path.join(dir, 'docs', 'build-montage.js')], {
        cwd: dir,
        timeout: 120000,
        env: { NODE_PATH: path.join(DOCS, 'node_modules') },
      });
      assert(res.status !== 0, `a blank tile was accepted:\n${res.stdout}${res.stderr}`);
      assert(/blank|uniform/i.test(res.stdout + res.stderr),
        `the blank tile was not reported as blank: ${res.stdout}${res.stderr}`);
      assert(/Vue\.js|vue/.test(res.stdout + res.stderr),
        `the blank framework was not named: ${res.stdout}${res.stderr}`);
    });

    await test('montage still accepts tiles with real content', () => {
      const dir = tmpDir('montage-ok');
      makeTree(dir, null);
      const res = run('node', [path.join(dir, 'docs', 'build-montage.js')], {
        cwd: dir,
        timeout: 120000,
        env: { NODE_PATH: path.join(DOCS, 'node_modules') },
      });
      assert(res.status === 0, `a content-rich montage was rejected:\n${res.stdout}${res.stderr}`);
      assert(/comparison-all\.png/.test(res.stdout), `no montage was written: ${res.stdout}`);
    });
  }

  // --- README must stay consistent with the implementation ------------------
  console.log('\nREADME accuracy (findings 26-27)');
  {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    await test('the Angular gallery label matches the Angular 22 dependency', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'implementations', 'angular', 'package.json'), 'utf8'));
      const cliMajor = /(\d+)/.exec(String(pkg.devDependencies['@angular/cli']))[1];
      const m = /###\s*🅰️\s*Angular\s+(\d+)/.exec(readme);
      assert(m, 'the README has no Angular gallery heading');
      assert(m[1] === cliMajor,
        `README says Angular ${m[1]} but the dependency is Angular ${cliMajor}`);
    });

    await test('the capture instructions set up the implementations first', () => {
      // start-servers.sh launches every dev server, so a fresh checkout needs the
      // JS deps, the Rust dists and Blade's Composer packages before it runs.
      const block = /```bash\ncd docs\n([\s\S]*?)```/.exec(readme);
      assert(block, 'the README has no capture command block');
      const body = block[1];
      for (const needed of [
        'implementations/react',
        'implementations/vue',
        'implementations/angular',
        'trunk build',
        'composer install',
      ]) {
        assert(body.includes(needed), `the capture block never mentions ${needed}`);
      }
      const iSetup = body.indexOf('implementations/react');
      const iStart = body.indexOf('bash scripts/start-servers.sh');
      assert(iSetup !== -1 && iStart !== -1 && iSetup < iStart,
        'the framework setup must come before the start-servers.sh command');
    });
  }

  // --- results PRs must clear the visual-parity gate ------------------------
  console.log('\nresults PR gating (finding 23)');
  {
    const autoMerge = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'auto-merge-benchmark.yml'), 'utf8');
    const benchmark = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'benchmark-comprehensive.yml'), 'utf8');

    await test('the merger requires Visual Parity alongside the dispatched CI', () => {
      // REQUIRED_WORKFLOWS is a JSON array env value; parse it rather than
      // substring-match so a reordering or a missing entry is caught.
      const m = /REQUIRED_WORKFLOWS:\s*'(\[[^']*\])'/.exec(autoMerge);
      assert(m, 'REQUIRED_WORKFLOWS env is missing or not a single-quoted JSON array');
      const required = JSON.parse(m[1]);
      assert(Array.isArray(required), 'REQUIRED_WORKFLOWS is not a JSON array');
      for (const wf of ['Basic Checks', 'Frontend Benchmark CI', 'Visual Parity']) {
        assert(required.includes(wf), `REQUIRED_WORKFLOWS does not require "${wf}": ${m[1]}`);
      }
    });

    await test('the merger listens on workflow_run for Visual Parity too', () => {
      // Without this, Visual Parity completing would not wake the merger (and a
      // results PR could be evaluated before the gate finished).
      const m = /workflows:\s*\[([^\]]*)\]/.exec(autoMerge);
      assert(m, 'the workflow_run.workflows list is missing');
      assert(/"Visual Parity"/.test(m[1]), `Visual Parity is not watched: ${m[1]}`);
    });

    await test('the benchmark dispatches Visual Parity for the results branch', () => {
      assert(/gh workflow run visual-parity\.yml --ref "\$BRANCH_NAME"/.test(benchmark),
        'benchmark-comprehensive.yml does not dispatch visual-parity.yml for the results branch');
      assert(/gh workflow run basic-checks\.yml --ref "\$BRANCH_NAME"/.test(benchmark) &&
             /gh workflow run benchmark\.yml --ref "\$BRANCH_NAME"/.test(benchmark),
        'the original two dispatches were lost');
    });

    await test('Visual Parity runs on ordinary PRs into the protected branch', () => {
      // A results PR covers itself via the auto-merger, but ordinary PRs are
      // enforced by branch protection -- and that only works if the workflow
      // actually triggers on pull_request to the protected branch.
      const parity = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'visual-parity.yml'), 'utf8');
      assert(/pull_request:[\s\S]*?branches:\s*\[\s*main\s*\]/.test(parity),
        'Visual Parity does not trigger on pull_request to main');
      assert(/^\s*(workflow_dispatch|push):/m.test(parity),
        'Visual Parity cannot be dispatched for a results branch');
    });

    await test('the regression suite runs as its own Visual Parity job', () => {
      // The suite re-runs the whole capture pipeline (nested self-containment),
      // so bundling it into the capture job pushed that job against the runner's
      // ~30m ceiling and got it evicted mid-run. It must be a separate job so the
      // capture job stays well under the limit. Parsing YAML would add a
      // dependency, so split on the two-space job header instead.
      const parity = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'visual-parity.yml'), 'utf8');
      const marker = '\n  regression:\n';
      const at = parity.indexOf(marker);
      assert(at !== -1, 'visual-parity.yml no longer defines a separate `regression` job');
      const captureJob = parity.slice(0, at);
      const regressionJob = parity.slice(at);
      assert(!/npm\s+test\b/.test(captureJob),
        'the capture job still runs `npm test`, so the split regressed');
      assert(/npm\s+test\b/.test(regressionJob),
        'the separate regression job does not run `npm test`');
    });

    await test('the maintainer docs require Visual Parity on the protected branch', () => {
      // The workflow existing is not enough: it must be a required status check,
      // which is a repository setting documented in WORKFLOWS_README.md.
      const doc = fs.readFileSync(path.join(ROOT, '.github', 'WORKFLOWS_README.md'), 'utf8');
      assert(/Visual Parity must be a required status check/.test(doc),
        'WORKFLOWS_README.md no longer documents Visual Parity as a required check');
      assert(/Capture \/ verify \/ parity \/ pixel/.test(doc),
        'the required-check name is not the Visual Parity job name');
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
        // The nested run repeats the whole suite, which now drives the capture
        // pipeline several times and takes ~15m on a runner. Its own timeout was
        // 15m, so the re-run was being killed just before it finished. Give it
        // the same generous headroom as the outer suite instead of a ceiling
        // that the suite has outgrown.
        timeout: 1800000,
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
