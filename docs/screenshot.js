#!/usr/bin/env node
/**
 * Capture screenshots of every benchmark implementation.
 *
 * Usage:
 *   node docs/screenshot.js --out docs/screenshots [--base <url>] [--framework <name>]
 *
 * Without --base, each framework's dev server is used:
 *   react 4001 | vue 4002 | angular 4003 | leptos 4004 | yew 4005 | dioxus 4006 | blade 4007
 *
 * A failed framework is fatal: its screenshots are removed, the failure is
 * recorded in screenshot-report.json and the process exits non-zero so a stale
 * artifact can never be mistaken for a fresh capture.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { collectPageErrors } = require('./lib/console-errors');

const FRAMEWORKS = [
  { name: 'react',   label: 'React',   port: 4001 },
  { name: 'vue',     label: 'Vue.js',  port: 4002 },
  { name: 'angular', label: 'Angular', port: 4003 },
  { name: 'leptos',  label: 'Leptos',  port: 4004 },
  { name: 'yew',     label: 'Yew',     port: 4005 },
  { name: 'dioxus',  label: 'Dioxus',  port: 4006 },
  { name: 'blade',   label: 'Blade.php', port: 4007 },
];

const EXPECTED_TOTAL = 100;

// Bumped whenever the report shape or the capture procedure changes, so a
// verifier can reject artefacts produced by an incompatible generation instead
// of silently trusting them.
const REPORT_SCHEMA = 2;

const VIEWS = [
  { key: 'all',       filter: 'All' },
  { key: 'active',    filter: 'Active' },
  { key: 'completed', filter: 'Completed' },
];

function newCaptureRunId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${process.pid.toString(36)}-${rand}`;
}

function fail(message) {
  console.error(`\nscreenshot.js: ${message}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { out: 'docs/screenshots', base: null, framework: null, width: 1440, height: 1024 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opts.out = args[++i];
    else if (a === '--base') opts.base = args[++i];
    else if (a === '--framework') opts.framework = args[++i];
    else if (a === '--width') opts.width = parseInt(args[++i], 10);
    else if (a === '--height') opts.height = parseInt(args[++i], 10);
    else fail(`unknown argument ${a}`);
  }
  return opts;
}

async function clickFilter(page, label) {
  // Filter by aria-label: matching on visible text would also match the
  // toggle-all control or any todo whose text happens to contain the word.
  const btn = page.locator(`[aria-label="Show ${label.toLowerCase()} todos"]`).first();
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(400);
}

// Wait until CSS transitions/animations have finished so a capture never records
// a mid-transition value. `.todo-input` transitions its border colour over 300ms
// when focused, and screenshotting after a fixed delay captured a different
// interpolation on different runs/frameworks — a real pixel diff that is pure
// timing noise, not a rendering difference.
async function settleAnimations(page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations().map((a) => a.finished.catch(() => {}));
    await Promise.race([
      Promise.all(animations),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  });
}

async function captureFramework(browser, fw, opts) {
  const base = opts.base || `http://127.0.0.1:${fw.port}`;
  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  const dir = path.join(opts.out, fw.name);
  try {
    const page = await ctx.newPage();
    const errors = collectPageErrors(page);

    const url = `${base}/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    // Allow WASM/framework hydration to finish
    await page.waitForSelector('.todo-app', { timeout: 45000 });
    await page.waitForTimeout(1200);

    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    // Geometry of the two elements whose text is intentionally framework-specific
    // (the badge and the footer both embed the framework name). Recorded per
    // state so the pixel-parity checker can mask exactly those boxes: the empty
    // state moves the footer, so a single row range cannot describe both.
    const labelRects = {};
    const recordLabels = async (key) => {
      labelRects[key] = await page.evaluate(() => {
        const rect = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        };
        return { badge: rect('.framework-badge'), footer: rect('.todo-footer') };
      });
    };

    // The viewport and device scale factor are part of the capture parameters:
    // two runs with different values produce incomparable images, so they are
    // recorded and compared alongside the run id.
    const viewport = { width: opts.width, height: opts.height, deviceScaleFactor: 1 };

    const entries = [];
    for (const view of VIEWS) {
      if (view.key !== 'all') await clickFilter(page, view.filter);
      await settleAnimations(page);
      await recordLabels(view.key);
      const file = path.join(dir, `${view.key}.png`);
      await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
      entries.push({ view: view.key, file });
    }
    // Return to All
    await clickFilter(page, 'All');

    // Input-filled state (exercises the controlled input path)
    await page.locator('.todo-input').first().fill('Benchmark smoke test');
    await settleAnimations(page);
    await recordLabels('input-filled');
    const added = path.join(dir, 'input-filled.png');
    await page.screenshot({ path: added, fullPage: false, animations: 'disabled' });
    entries.push({ view: 'input-filled', file: added });
    await page.locator('.todo-input').first().fill('');

    // Baseline measurements before destructive interaction
    const stats = await page.locator('.todo-stats').first().textContent().catch(() => null);
    const badge = await page.locator('.framework-badge').first().textContent().catch(() => null);
    const itemCount = await page.locator('.todo-item').count();
    if (itemCount !== EXPECTED_TOTAL) {
      throw new Error(`expected ${EXPECTED_TOTAL} rendered items, found ${itemCount}`);
    }

    // Empty state: delete every todo (from the unfiltered view, so all 100 rows
    // are reachable) and keep going until the list is truly empty.
    await clickFilter(page, 'All');
    let guard = 0;
    while ((await page.locator('.todo-item').count()) > 0) {
      if (guard >= EXPECTED_TOTAL + 20) {
        throw new Error(
          `empty-state: guard tripped after ${guard} deletes with ` +
          `${await page.locator('.todo-item').count()} items still rendered`
        );
      }
      await page.locator('.todo-item .btn-delete').first().click({ timeout: 15000 });
      await page.waitForTimeout(30);
      guard++;
    }
    await page.waitForTimeout(400);

    const emptyItemCount = await page.locator('.todo-item').count();
    const emptyVisible = await page.locator('.empty-state').first().isVisible().catch(() => false);
    if (emptyItemCount !== 0) {
      throw new Error(`empty-state: ${emptyItemCount} todo items still rendered`);
    }
    if (!emptyVisible) {
      throw new Error('empty-state: .empty-state is not visible after deleting every todo');
    }

    await settleAnimations(page);
    await recordLabels('empty-state');
    const emptyFile = path.join(dir, 'empty-state.png');
    await page.screenshot({ path: emptyFile, fullPage: false, animations: 'disabled' });
    entries.push({ view: 'empty-state', file: emptyFile });

    return {
      url,
      badge: (badge || '').trim(),
      stats: (stats || '').trim(),
      renderedItems: itemCount,
      emptyStateVisible: emptyVisible,
      emptyStateItems: emptyItemCount,
      deletedItems: guard,
      labelRects,
      errors,
      screenshots: entries.map((e) => path.relative(opts.out, e.file)),
      // Freshness provenance: which run produced this entry, with which capture
      // parameters. The verifier requires all seven entries to agree, so a
      // full-set claim can never mix artefacts from different invocations.
      captureRunId: opts.captureRunId,
      capturedAt: new Date().toISOString(),
      schema: REPORT_SCHEMA,
      viewport,
      captureParams: { out: opts.out, scope: opts.framework || 'all' },
      fullSet: !opts.framework,
    };
  } catch (err) {
    // Invalidate the whole framework: a partial set or a stale screenshot must
    // never survive a failed capture.
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  } finally {
    await ctx.close();
  }
}

(async () => {
  const opts = parseArgs();

  // --framework accepts either a known name (react, vue, …) or `name:port` so
  // the regression tests can point the same code path at a fixture server.
  let list = FRAMEWORKS;
  if (opts.framework) {
    const [name, port] = opts.framework.split(':');
    if (port !== undefined) {
      const n = Number(port);
      if (!name || !Number.isInteger(n) || n <= 0) {
        fail(`invalid --framework "${opts.framework}"; expected name:port`);
      }
      list = [{ name, label: name, port: n }];
    } else {
      list = FRAMEWORKS.filter((f) => f.name === name);
      if (list.length === 0) {
        fail(
          `unknown --framework "${opts.framework}"; expected one of: ` +
          FRAMEWORKS.map((f) => f.name).join(', ')
        );
      }
    }
  }
  if (list.length === 0) fail('no frameworks to capture');

  // Every invocation gets its own run id. A full capture writes all seven
  // entries with the same id; an incremental one writes a *different* id for the
  // single framework it touches, which invalidates the whole set for a full
  // verification (the verifier requires one shared id). That is deliberate: a
  // partial run must never be able to claim "35 screenshots fresh".
  opts.captureRunId = newCaptureRunId();

  fs.mkdirSync(opts.out, { recursive: true });
  const reportPath = path.join(opts.out, 'screenshot-report.json');

  // A full run starts from an empty report so removed frameworks cannot linger.
  // An incremental run keeps the other frameworks' entries but records that the
  // set is no longer a single full generation.
  const isFullSet = !opts.framework;
  let report = {};
  if (!isFullSet && fs.existsSync(reportPath)) {
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
    if (!report || typeof report !== 'object' || Array.isArray(report)) report = {};
  }

  // Write the report atomically: a temp file in the same directory plus rename,
  // so an interrupted run can never leave a half-written file that still parses.
  const writeReport = (obj) => {
    const tmp = `${reportPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, reportPath);
  };

  const failures = [];
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    for (const fw of list) {
      process.stdout.write(`capturing ${fw.name} ... `);
      try {
        const entry = await captureFramework(browser, fw, opts);
        report[fw.name] = entry;
        console.log(`ok (items=${entry.renderedItems}, errors=${entry.errors.length})`);
        if (entry.errors.length) {
          for (const err of entry.errors) console.error(`    ! ${err}`);
          failures.push(`${fw.name}: ${entry.errors.length} console/network error(s)`);
        }
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
        delete report[fw.name];
        report[fw.name] = { error: e.message, failed: true, captureRunId: opts.captureRunId };
        failures.push(`${fw.name}: ${e.message}`);
      }
    }
    report.__meta = {
      schema: REPORT_SCHEMA,
      fullSet: isFullSet,
      captureRunId: opts.captureRunId,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
    writeReport(report);
    console.log('\nReport written to', reportPath);
  }

  if (failures.length) {
    console.error(`\nCAPTURE FAILED for ${failures.length} framework(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`\nCAPTURE OK: ${list.length} framework(s), ${list.length * 5} screenshots`);
})();
