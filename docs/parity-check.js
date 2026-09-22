#!/usr/bin/env node
/**
 * Structural + visual parity checks across every framework implementation.
 *
 * Runs the same interaction script against all seven dev servers and asserts
 * that the rendered DOM, geometry, text content and derived stats are equal.
 * Exits non-zero if any framework deviates.
 *
 * Usage: node docs/parity-check.js
 */
const { chromium } = require('playwright');

const TARGETS = [
  ['react', 4001],
  ['vue', 4002],
  ['angular', 4003],
  ['leptos', 4004],
  ['yew', 4005],
  ['dioxus', 4006],
  ['blade', 4007],
];

const EXPECTED_TOTAL = 100;
const EXPECTED_COMPLETED = 33; // items 3, 6, ... 99
const EXPECTED_REMAINING = EXPECTED_TOTAL - EXPECTED_COMPLETED;

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function snapshot(page) {
  await page.waitForSelector('.todo-item', { timeout: 20000 });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    };
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    const items = [...document.querySelectorAll('.todo-item')];
    return {
      title: document.title,
      card: rect('.todo-app'),
      header: rect('.todo-header'),
      input: rect('.todo-input'),
      filters: rect('.todo-filters'),
      list: rect('.todo-list'),
      footer: rect('.todo-footer'),
      statsRaw: text('.todo-stats'),
      statsNumbers: (text('.todo-stats') || '').match(/\d+/g),
      itemCount: items.length,
      firstItem: items[0] ? items[0].textContent.replace(/\s+/g, ' ').trim() : null,
      lastItem: items[items.length - 1]
        ? items[items.length - 1].textContent.replace(/\s+/g, ' ').trim()
        : null,
      completedItems: items.filter((li) => li.querySelector('.todo-checkbox')?.checked).length,
      checkedCount: document.querySelectorAll('.todo-checkbox:checked').length,
      filterLabels: [...document.querySelectorAll('.todo-filters button, .todo-filter')].map((b) =>
        b.textContent.replace(/\s+/g, ' ').trim()
      ),
      hasToggleAll: !!document.querySelector('.todo-toggle-all, #toggle-all'),
      footerText: text('.todo-footer'),
    };
  });
}

async function exercise(page) {
  const results = {};

  // Filter: Active
  await page.locator('.todo-filters button, .todo-filter').filter({ hasText: /^\s*Active\s*$/ }).first().click();
  await page.waitForTimeout(250);
  results.activeCount = await page.locator('.todo-item').count();

  // Filter: Completed
  await page.locator('.todo-filters button, .todo-filter').filter({ hasText: /^\s*Completed\s*$/ }).first().click();
  await page.waitForTimeout(250);
  results.completedCount = await page.locator('.todo-item').count();

  // Back to All, then add a todo
  await page.locator('.todo-filters button, .todo-filter').filter({ hasText: /^\s*All\s*$/ }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.todo-input').first().fill('Parity check item');
  await page.locator('.todo-input').first().press('Enter');
  await page.waitForTimeout(300);
  results.afterAddCount = await page.locator('.todo-item').count();
  results.afterAddStats = norm(await page.locator('.todo-stats').first().textContent());

  // Toggle the new item complete
  await page.locator('.todo-item').last().locator('.todo-checkbox').click();
  await page.waitForTimeout(250);
  results.afterToggleStats = norm(await page.locator('.todo-stats').first().textContent());

  // Delete the new item
  await page.locator('.todo-item').last().locator('.btn-delete').click();
  await page.waitForTimeout(250);
  results.afterDeleteCount = await page.locator('.todo-item').count();
  results.afterDeleteStats = norm(await page.locator('.todo-stats').first().textContent());

  return results;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const snaps = {};
  const exercises = {};

  for (const [name, port] of TARGETS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('console: ' + m.text());
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    try {
      snaps[name] = await snapshot(page);
      snaps[name].errors = errors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
      exercises[name] = await exercise(page);
    } catch (e) {
      snaps[name] = { fatal: e.message };
    }
    await ctx.close();
  }
  await browser.close();

  // Compare geometry across frameworks (ignore framework-specific text).
  const geoKeys = ['card', 'header', 'input', 'filters', 'list', 'footer'];
  const reference = snaps.react;
  let failures = 0;
  const fail = (msg) => {
    failures++;
    console.log('  ✗ ' + msg);
  };

  console.log('=== Structural parity (vs react) ===');
  for (const [name] of TARGETS) {
    const s = snaps[name];
    if (!s || s.fatal) {
      fail(`${name}: ${s && s.fatal}`);
      continue;
    }
    const issues = [];
    for (const k of geoKeys) {
      if (JSON.stringify(s[k]) !== JSON.stringify(reference[k])) {
        issues.push(`${k} ${JSON.stringify(s[k])} != ${JSON.stringify(reference[k])}`);
      }
    }
    if (s.itemCount !== EXPECTED_TOTAL) issues.push(`itemCount ${s.itemCount} != ${EXPECTED_TOTAL}`);
    if (s.checkedCount !== EXPECTED_COMPLETED)
      issues.push(`checked ${s.checkedCount} != ${EXPECTED_COMPLETED}`);
    if (Number(s.statsNumbers?.[0]) !== EXPECTED_REMAINING)
      issues.push(`remaining ${s.statsNumbers?.[0]} != ${EXPECTED_REMAINING}`);
    if (s.errors.length) issues.push(`console errors: ${s.errors.join(' | ')}`);
    if (issues.length) fail(`${name}: ${issues.join('; ')}`);
    else console.log(`  ✓ ${name}`);
  }

  console.log('\n=== Interaction parity ===');
  const refEx = exercises.react;
  for (const [name] of TARGETS) {
    const e = exercises[name];
    if (!e) {
      fail(`${name}: no interaction results`);
      continue;
    }
    const issues = [];
    if (e.activeCount !== EXPECTED_REMAINING)
      issues.push(`active=${e.activeCount} expected ${EXPECTED_REMAINING}`);
    if (e.completedCount !== EXPECTED_COMPLETED)
      issues.push(`completed=${e.completedCount} expected ${EXPECTED_COMPLETED}`);
    if (e.afterAddCount !== EXPECTED_TOTAL + 1)
      issues.push(`afterAdd=${e.afterAddCount} expected ${EXPECTED_TOTAL + 1}`);
    if (e.afterDeleteCount !== EXPECTED_TOTAL)
      issues.push(`afterDelete=${e.afterDeleteCount} expected ${EXPECTED_TOTAL}`);
    if (JSON.stringify(e) !== JSON.stringify(refEx)) {
      const diffs = Object.keys({ ...e, ...refEx }).filter(
        (k) => JSON.stringify(e[k]) !== JSON.stringify(refEx[k])
      );
      issues.push(`differs from reference on: ${diffs.join(', ')}`);
    }
    if (issues.length) fail(`${name}: ${issues.join('; ')}`);
    else console.log(`  ✓ ${name}`);
  }

  console.log(
    `\n${failures === 0 ? 'ALL FRAMEWORKS IN PARITY' : failures + ' PARITY FAILURE(S)'}`
  );
  if (failures) {
    console.log('\nReference snapshot (react):');
    console.log(JSON.stringify(reference, null, 2));
    console.log('\nReference exercise (react):');
    console.log(JSON.stringify(refEx, null, 2));
  }
  process.exit(failures === 0 ? 0 : 1);
})();
