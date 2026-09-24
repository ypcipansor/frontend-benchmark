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

// The content contract each framework must satisfy. Title, badge and footer are
// per-target expected values rather than being inferred from the target name, so
// a wrong label cannot pass just because it was compared against itself.
const DEFAULT_TARGETS = [
  { name: 'react', port: 4001, title: 'Todo List - React', badge: 'React', footer: 'Frontend Benchmark - React Implementation' },
  { name: 'vue', port: 4002, title: 'Todo List - Vue.js', badge: 'Vue.js', footer: 'Frontend Benchmark - Vue.js Implementation' },
  { name: 'angular', port: 4003, title: 'Todo List - Angular', badge: 'Angular', footer: 'Frontend Benchmark - Angular Implementation' },
  { name: 'leptos', port: 4004, title: 'Todo List - Leptos', badge: 'Leptos', footer: 'Frontend Benchmark - Leptos Implementation' },
  { name: 'yew', port: 4005, title: 'Todo List - Yew', badge: 'Yew', footer: 'Frontend Benchmark - Yew Implementation' },
  { name: 'dioxus', port: 4006, title: 'Todo List - Dioxus', badge: 'Dioxus', footer: 'Frontend Benchmark - Dioxus Implementation' },
  { name: 'blade', port: 4007, title: 'Todo List - Blade.php', badge: 'Blade.php', footer: 'Frontend Benchmark - Blade.php Implementation' },
];

const EXPECTED_TOTAL = 100;
const EXPECTED_COMPLETED = 33; // items 3, 6, ... 99
const EXPECTED_REMAINING = EXPECTED_TOTAL - EXPECTED_COMPLETED;
const FILTER_LABELS = ['All', 'Active', 'Completed'];
const FIRST_ITEM = 'Todo item 1';
const LAST_ITEM = `Todo item ${EXPECTED_TOTAL}`;
const STATS_TEXT = `${EXPECTED_REMAINING} items remaining`;
const NEW_ITEM_TEXT = 'Parity check item';

function parseArgs() {
  const args = process.argv.slice(2);
  const targets = [];
  const opts = { reference: 'react', referenceExpect: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') {
      const [name, port] = String(args[++i]).split(':');
      if (!name || !port) throw new Error(`--target expects name:port, got "${args[i]}"`);
      targets.push({ name, port: Number(port) });
    } else if (a === '--reference') {
      opts.reference = args[++i];
    } else if (a === '--expect') {
      // JSON content contract for a fixture target: {title,badge,footer}.
      opts.referenceExpect = JSON.parse(args[++i]);
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  // Tests point --target at fixture servers; a plain run uses the real ports.
  opts.targets = targets.length ? targets : DEFAULT_TARGETS;
  return opts;
}

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
      badge: text('.framework-badge'),
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
      firstItem: items[0] ? (items[0].querySelector('.todo-text')?.textContent || '').replace(/\s+/g, ' ').trim() : null,
      lastItem: items[items.length - 1]
        ? (items[items.length - 1].querySelector('.todo-text')?.textContent || '').replace(/\s+/g, ' ').trim()
        : null,
      completedItems: items.filter((li) => li.querySelector('.todo-checkbox')?.checked).length,
      checkedCount: document.querySelectorAll('.todo-checkbox:checked').length,
      filterLabels: [...document.querySelectorAll('.todo-filters [aria-label^="Show "]')].map((b) =>
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

  // Filter by aria-label, not visible text: a wrong/renamed label is a content
  // bug that the content assertions must catch — it should not turn into an
  // interaction timeout and hide the real finding.
  const filterBtn = (label) =>
    page.locator(`.todo-filters [aria-label="Show ${label.toLowerCase()} todos"]`).first();

  // Filter: Active
  await filterBtn('Active').click();
  await page.waitForTimeout(250);
  results.activeCount = await page.locator('.todo-item').count();

  // Filter: Completed
  await filterBtn('Completed').click();
  await page.waitForTimeout(250);
  results.completedCount = await page.locator('.todo-item').count();

  // Back to All, then add a todo
  await filterBtn('All').click();
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
  const byName = new Map(TARGETS.map((t) => [t.name, t]));
  const refTarget = byName.get(opts.reference);
  // Expected content for the reference target. `--expect` lets the regression
  // tests describe a fixture's contract explicitly instead of guessing it.
  const refExpect = opts.referenceExpect || (refTarget && {
    title: refTarget.title,
    badge: refTarget.badge,
    footer: refTarget.footer,
  });
  if (!refExpect) {
    throw new Error(`no expected content known for reference target "${opts.reference}"`);
  }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const snaps = {};
  const exercises = {};

  try {
    for (const { name, port } of TARGETS) {
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

  console.log('=== Structural parity ===');
  for (const { name, title, badge, footer } of TARGETS) {
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

    // Content contract: exact text, not substring/count checks, so a wrong
    // wording (e.g. "68 items") or a missing filter cannot slip through.
    const expect = name === opts.reference ? refExpect : { title, badge, footer };
    if (s.title !== expect.title) issues.push(`title "${s.title}" != "${expect.title}"`);
    if (s.badge !== expect.badge) issues.push(`badge "${s.badge}" != "${expect.badge}"`);
    if (s.footerText !== expect.footer)
      issues.push(`footer "${s.footerText}" != "${expect.footer}"`);
    if (s.statsRaw !== STATS_TEXT) issues.push(`stats "${s.statsRaw}" != "${STATS_TEXT}"`);
    if (s.firstItem !== FIRST_ITEM) issues.push(`firstItem "${s.firstItem}" != "${FIRST_ITEM}"`);
    if (s.lastItem !== LAST_ITEM) issues.push(`lastItem "${s.lastItem}" != "${LAST_ITEM}"`);
    if (JSON.stringify(s.filterLabels) !== JSON.stringify(FILTER_LABELS))
      issues.push(`filterLabels ${JSON.stringify(s.filterLabels)} != ${JSON.stringify(FILTER_LABELS)}`);
    if (s.errors.length) issues.push(`console errors: ${s.errors.join(' | ')}`);

    // Every framework must also agree with the reference on the content that is
    // not framework-specific, so a shared drift is caught, not just per-target.
    for (const k of ['statsRaw', 'firstItem', 'lastItem']) {
      if (JSON.stringify(s[k]) !== JSON.stringify(reference[k]))
        issues.push(`${k} ${JSON.stringify(s[k])} differs from ${opts.reference}`);
    }
    if (JSON.stringify(s.filterLabels) !== JSON.stringify(reference.filterLabels))
      issues.push(`filterLabels differ from ${opts.reference}`);

    if (issues.length) fail(`${name}: ${issues.join('; ')}`);
    else console.log(`  ✓ ${name}`);
  }

  console.log('\n=== Interaction parity ===');
  const refEx = exercises[opts.reference];
  for (const { name } of TARGETS) {
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
