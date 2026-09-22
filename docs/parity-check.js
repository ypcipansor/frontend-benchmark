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
const { collectPageErrors } = require('./lib/console-errors');

const DEFAULT_TARGETS = [
  ['react', 4001],
  ['vue', 4002],
  ['angular', 4003],
  ['leptos', 4004],
  ['yew', 4005],
  ['dioxus', 4006],
  ['blade', 4007],
];

function parseArgs() {
  const args = process.argv.slice(2);
  const targets = [];
  const opts = { reference: 'react' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') {
      const [name, port] = String(args[++i]).split(':');
      if (!name || !port) throw new Error(`--target expects name:port, got "${args[i]}"`);
      targets.push([name, Number(port)]);
    } else if (a === '--reference') {
      opts.reference = args[++i];
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  // Tests point --target at fixture servers; a plain run uses the real ports.
  opts.targets = targets.length ? targets : DEFAULT_TARGETS;
  return opts;
}

const EXPECTED_TOTAL = 100;
const EXPECTED_COMPLETED = 33; // items 3, 6, ... 99
const EXPECTED_REMAINING = EXPECTED_TOTAL - EXPECTED_COMPLETED;
const NEW_ITEM_TEXT = 'Parity check item';

// Toggle-all is part of the documented benchmark contract. The control must
// exist and behave uniformly, so a missing or misbehaving toggle-all is fatal.
const TOGGLE_ALL_SELECTOR = '.todo-toggle-all, #toggle-all';

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function snapshot(page) {
  await page.waitForSelector('.todo-item', { timeout: 20000 });
  await page.waitForTimeout(700);
  return page.evaluate((toggleSel) => {
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
      toggleAll: rect(toggleSel),
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
      hasToggleAll: !!document.querySelector(toggleSel),
      footerText: text('.todo-footer'),
    };
  }, TOGGLE_ALL_SELECTOR);
}

/** The single row whose text is exactly `text`, asserted to be unique. */
function itemByText(page, text) {
  return page.locator('.todo-item').filter({ has: page.locator('.todo-text', { hasText: text }) });
}

async function exercise(page) {
  const results = {};

  // Toggle-all is required by the benchmark contract. Fail immediately — with a
  // clear message — if the control is absent, before anything else runs.
  const toggleAll = page.locator(TOGGLE_ALL_SELECTOR);
  results.toggleAllMatches = await toggleAll.count();
  if (results.toggleAllMatches < 1) {
    throw new Error('toggle-all control is missing (looked for ' + TOGGLE_ALL_SELECTOR + ')');
  }
  const toggleAllBtn = toggleAll.first();

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
  await page.locator('.todo-input').first().fill(NEW_ITEM_TEXT);
  await page.locator('.todo-input').first().press('Enter');
  await page.waitForTimeout(300);
  results.afterAddCount = await page.locator('.todo-item').count();
  results.afterAddStats = norm(await page.locator('.todo-stats').first().textContent());

  // Locate the new item by its unique text — not by position. The app prepends
  // new todos, so `.last()` would have exercised a pre-existing item.
  const target = itemByText(page, NEW_ITEM_TEXT);
  results.newItemMatches = await target.count();
  if (results.newItemMatches !== 1) {
    throw new Error(`expected exactly 1 "${NEW_ITEM_TEXT}" item, found ${results.newItemMatches}`);
  }

  // Toggle the new item complete
  await target.locator('.todo-checkbox').click();
  await page.waitForTimeout(250);
  results.afterToggleStats = norm(await page.locator('.todo-stats').first().textContent());
  results.afterToggleChecked = await page.locator('.todo-checkbox:checked').count();
  results.afterToggleTargetCompleted = await target.evaluate((li) =>
    li.classList.contains('completed')
  );

  // Delete the new item
  await target.locator('.btn-delete').click();
  await page.waitForTimeout(250);
  results.afterDeleteCount = await page.locator('.todo-item').count();
  results.afterDeleteStats = norm(await page.locator('.todo-stats').first().textContent());
  results.afterDeleteNewItemGone = await itemByText(page, NEW_ITEM_TEXT).count();

  // Toggle-all: every item becomes completed, remaining drops to 0.
  await toggleAllBtn.click();
  await page.waitForTimeout(300);
  results.toggleAllOnCount = await page.locator('.todo-item').count();
  results.toggleAllOnChecked = await page.locator('.todo-checkbox:checked').count();
  results.toggleAllOnStats = norm(await page.locator('.todo-stats').first().textContent());

  // Toggle-all again: every item becomes active, remaining returns to 100.
  await toggleAllBtn.click();
  await page.waitForTimeout(300);
  results.toggleAllOffCount = await page.locator('.todo-item').count();
  results.toggleAllOffChecked = await page.locator('.todo-checkbox:checked').count();
  results.toggleAllOffStats = norm(await page.locator('.todo-stats').first().textContent());

  return results;
}

(async () => {
  const opts = parseArgs();
  const TARGETS = opts.targets;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const snaps = {};
  const exercises = {};

  try {
    for (const [name, port] of TARGETS) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
      try {
        const page = await ctx.newPage();
        const errors = collectPageErrors(page);
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
        try {
          snaps[name] = await snapshot(page);
          snaps[name].errors = errors;
          exercises[name] = await exercise(page);
        } catch (e) {
          snaps[name] = { fatal: e.message };
        }
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Compare geometry across frameworks (ignore framework-specific text).
  const geoKeys = ['card', 'header', 'input', 'filters', 'list', 'footer', 'toggleAll'];
  const reference = snaps[opts.reference];
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
    if (!s.hasToggleAll) issues.push('toggle-all control is missing');
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
  const refEx = exercises[opts.reference];
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
    if (e.newItemMatches !== 1)
      issues.push(`new item matched ${e.newItemMatches} rows, expected 1`);
    if (e.afterAddStats !== `${EXPECTED_REMAINING + 1} items remaining`)
      issues.push(`afterAddStats "${e.afterAddStats}" != "${EXPECTED_REMAINING + 1} items remaining"`);
    if (e.afterToggleTargetCompleted !== true)
      issues.push('toggled new item did not become completed');
    if (e.afterToggleChecked !== EXPECTED_COMPLETED + 1)
      issues.push(`afterToggleChecked=${e.afterToggleChecked} expected ${EXPECTED_COMPLETED + 1}`);
    if (e.afterToggleStats !== `${EXPECTED_REMAINING} items remaining`)
      issues.push(`afterToggleStats "${e.afterToggleStats}" != "${EXPECTED_REMAINING} items remaining"`);
    if (e.afterDeleteCount !== EXPECTED_TOTAL)
      issues.push(`afterDelete=${e.afterDeleteCount} expected ${EXPECTED_TOTAL}`);
    if (e.afterDeleteNewItemGone !== 0)
      issues.push('deleted new item is still rendered');
    if (e.afterDeleteStats !== `${EXPECTED_REMAINING} items remaining`)
      issues.push(`afterDeleteStats "${e.afterDeleteStats}" != "${EXPECTED_REMAINING} items remaining"`);
    if (e.toggleAllOnCount !== EXPECTED_TOTAL)
      issues.push(`toggleAllOnCount=${e.toggleAllOnCount} expected ${EXPECTED_TOTAL}`);
    if (e.toggleAllOnChecked !== EXPECTED_TOTAL)
      issues.push(`toggleAllOnChecked=${e.toggleAllOnChecked} expected ${EXPECTED_TOTAL}`);
    if (e.toggleAllOnStats !== '0 items remaining')
      issues.push(`toggleAllOnStats "${e.toggleAllOnStats}" != "0 items remaining"`);
    if (e.toggleAllOffCount !== EXPECTED_TOTAL)
      issues.push(`toggleAllOffCount=${e.toggleAllOffCount} expected ${EXPECTED_TOTAL}`);
    if (e.toggleAllOffChecked !== 0)
      issues.push(`toggleAllOffChecked=${e.toggleAllOffChecked} expected 0`);
    if (e.toggleAllOffStats !== `${EXPECTED_TOTAL} items remaining`)
      issues.push(`toggleAllOffStats "${e.toggleAllOffStats}" != "${EXPECTED_TOTAL} items remaining"`);
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
