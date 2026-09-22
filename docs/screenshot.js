#!/usr/bin/env node
/**
 * Capture screenshots of every benchmark implementation.
 *
 * Usage:
 *   node docs/screenshot.js --out docs/screenshots [--base <url>] [--framework <name>]
 *
 * Without --base, each framework's dev server is used:
 *   react 4001 | vue 4002 | angular 4003 | leptos 4004 | yew 4005 | dioxus 4006 | blade 4007
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRAMEWORKS = [
  { name: 'react',   label: 'React',   port: 4001 },
  { name: 'vue',     label: 'Vue.js',  port: 4002 },
  { name: 'angular', label: 'Angular', port: 4003 },
  { name: 'leptos',  label: 'Leptos',  port: 4004 },
  { name: 'yew',     label: 'Yew',     port: 4005 },
  { name: 'dioxus',  label: 'Dioxus',  port: 4006 },
  { name: 'blade',   label: 'Blade.php', port: 4007 },
];

const VIEWS = [
  { key: 'all',       filter: 'All' },
  { key: 'active',    filter: 'Active' },
  { key: 'completed', filter: 'Completed' },
];

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
  }
  return opts;
}

async function clickFilter(page, label) {
  const btn = page.locator(`button:has-text("${label}")`).first();
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(400);
}

async function captureFramework(browser, fw, opts, report) {
  const base = opts.base || `http://127.0.0.1:${fw.port}`;
  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const url = `${base}/`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  // Allow WASM/framework hydration to finish
  await page.waitForSelector('.todo-app', { timeout: 45000 });
  await page.waitForTimeout(1200);

  const dir = path.join(opts.out, fw.name);
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

  const entries = [];
  for (const view of VIEWS) {
    if (view.key !== 'all') await clickFilter(page, view.filter);
    await recordLabels(view.key);
    const file = path.join(dir, `${view.key}.png`);
    await page.screenshot({ path: file, fullPage: false });
    entries.push({ view: view.key, file });
  }
  // Return to All
  await clickFilter(page, 'All');

  // Input-filled state (exercises the controlled input path)
  await page.locator('.todo-input').first().fill('Benchmark smoke test');
  await page.waitForTimeout(200);
  await recordLabels('input-filled');
  const added = path.join(dir, 'input-filled.png');
  await page.screenshot({ path: added, fullPage: false });
  entries.push({ view: 'input-filled', file: added });
  await page.locator('.todo-input').first().fill('');

  // Baseline measurements before destructive interaction
  const stats = await page.locator('.todo-stats').first().textContent().catch(() => null);
  const badge = await page.locator('.framework-badge').first().textContent().catch(() => null);
  const itemCount = await page.locator('.todo-item').count();

  // Empty state: filter to Completed and delete every item (also verifies delete).
  await clickFilter(page, 'Completed');
  let guard = 0;
  while ((await page.locator('.todo-item').count()) > 0 && guard < 200) {
    await page.locator('.todo-item .btn-delete').first().click({ timeout: 15000 });
    await page.waitForTimeout(30);
    guard++;
  }
  await page.waitForTimeout(400);
  await recordLabels('empty-state');
  const emptyVisible = await page.locator('.empty-state').first().isVisible().catch(() => false);
  const emptyFile = path.join(dir, 'empty-state.png');
  await page.screenshot({ path: emptyFile, fullPage: false });
  entries.push({ view: 'empty-state', file: emptyFile });

  report[fw.name] = {
    url,
    badge: (badge || '').trim(),
    stats: (stats || '').trim(),
    renderedItems: itemCount,
    emptyStateVisible: emptyVisible,
    labelRects,
    errors: errors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e)),
    screenshots: entries.map((e) => path.relative(opts.out, e.file)),
  };
  await ctx.close();
}

(async () => {
  const opts = parseArgs();
  const list = opts.framework
    ? FRAMEWORKS.filter((f) => f.name === opts.framework)
    : FRAMEWORKS;
  fs.mkdirSync(opts.out, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const reportPath = path.join(opts.out, 'screenshot-report.json');
  let report = {};
  if (opts.framework && fs.existsSync(reportPath)) {
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
  }
  for (const fw of list) {
    process.stdout.write(`capturing ${fw.name} ... `);
    try {
      await captureFramework(browser, fw, opts, report);
      const r = report[fw.name];
      console.log(`ok (items=${r.renderedItems}, errors=${r.errors.length})`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      report[fw.name] = { error: e.message };
    }
  }
  await browser.close();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nReport written to', reportPath);
})();
