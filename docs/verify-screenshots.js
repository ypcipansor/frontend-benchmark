#!/usr/bin/env node
/**
 * Validate captured screenshots: reject blank/white/near-uniform images and
 * images whose rendering does not match the expected shared layout.
 *
 * This is also a completeness check. Exactly seven frameworks with exactly five
 * states each must be present, every state must match the entry recorded in
 * screenshot-report.json, and the report itself must be error-free and show the
 * expected item counts. A partial or stale capture therefore cannot pass.
 *
 * Usage: node docs/verify-screenshots.js --dir docs/screenshots
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FRAMEWORKS = ['react', 'vue', 'angular', 'leptos', 'yew', 'dioxus', 'blade'];
const STATES = ['all', 'active', 'completed', 'input-filled', 'empty-state'];
const EXPECTED_REPORT = { renderedItems: 100, remaining: 67 };
// Must match REPORT_SCHEMA in screenshot.js.
const EXPECTED_SCHEMA = 2;

const EXPECTED = {
  // Card geometry in CSS pixels at a 1440x1024 viewport (2x DPR screenshots are
  // scaled by the verifier). The left edge and width are driven by fixed CSS and
  // must match exactly. Height depends on font metrics, which vary across
  // platforms (the same capture is 792px on the Ubuntu CI runner and 796px on
  // macOS), so height is checked for cross-framework agreement plus a generous
  // absolute band instead of a single hardcoded value.
  cardLeft: 420,
  cardWidth: 600,
  viewportWidth: 1440,
  populatedHeight: [700, 900],
  emptyHeight: [400, 700],
  // All frameworks run on the same host, so their heights must agree closely.
  heightAgreement: 6,
};

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { dir: 'docs/screenshots', framework: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dir') o.dir = a[++i];
    else if (a[i] === '--framework') o.framework = a[++i];
  }
  if (o.framework && !FRAMEWORKS.includes(o.framework)) {
    console.error(
      `verify-screenshots.js: unknown --framework "${o.framework}"; ` +
      `expected one of: ${FRAMEWORKS.join(', ')}`
    );
    process.exit(2);
  }
  return o;
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function byteStats(png) {
  const { width, height, data } = png;
  const colors = new Map();
  let white = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    colors.set(key, (colors.get(key) || 0) + 1);
    if (r > 248 && g > 248 && b > 248) white++;
  }
  const total = width * height;
  let top = 0;
  for (const v of colors.values()) top = Math.max(top, v);
  return {
    uniqueColors: colors.size,
    whiteRatio: white / total,
    dominantRatio: top / total,
  };
}

function whiteBounds(png) {
  const { width, height, data } = png;
  let minRow = height, maxRow = -1, minCol = width, maxCol = -1;
  const rowCount = new Array(height).fill(0);
  const colCount = new Array(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 248 && g > 248 && b > 248) {
        rowCount[y]++; colCount[x]++;
        if (y < minRow) minRow = y;
        if (y > maxRow) maxRow = y;
        if (x < minCol) minCol = x;
        if (x > maxCol) maxCol = x;
      }
    }
  }
  const rowThresh = width * 0.2;
  const colThresh = height * 0.2;
  const rows = [];
  const cols = [];
  rowCount.forEach((c, y) => c > rowThresh && rows.push(y));
  colCount.forEach((c, x) => c > colThresh && cols.push(x));
  if (!rows.length || !cols.length) return null;
  return {
    top: rows[0],
    bottom: rows[rows.length - 1],
    left: cols[0],
    right: cols[cols.length - 1],
    width: cols[cols.length - 1] - cols[0] + 1,
    height: rows[rows.length - 1] - rows[0] + 1,
  };
}

function loadReport(dir) {
  const reportPath = path.join(dir, 'screenshot-report.json');
  if (!fs.existsSync(reportPath)) return { error: `missing ${reportPath}` };
  try {
    return { report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
  } catch (e) {
    return { error: `unreadable ${reportPath}: ${e.message}` };
  }
}

/**
 * Prove the set is one capture generation. Every framework entry must carry its
 * *own* non-empty captureRunId that equals report.__meta.captureRunId. The meta
 * id is deliberately not a fallback: an entry that lost its id would otherwise
 * inherit the meta's and be accepted, leaving that entry's freshness unproven.
 * A scoped run still requires the entry to carry its own id.
 */
function checkFreshness(report, frameworks, { fullSet }) {
  let failures = 0;
  const fail = (msg) => { failures++; console.log(`  FAIL freshness${msg}`); };

  const meta = report && typeof report === 'object' ? report.__meta : null;
  if (!meta || typeof meta !== 'object') {
    fail(': report has no __meta freshness block (capture run/structure unknown)');
    return failures;
  }
  if (meta.schema !== EXPECTED_SCHEMA) {
    fail(`: report schema ${meta.schema} != expected ${EXPECTED_SCHEMA}`);
  }
  const metaId = meta.captureRunId;
  if (typeof metaId !== 'string' || !metaId) {
    fail(': report __meta.captureRunId is missing or not a non-empty string');
  }

  for (const fw of frameworks) {
    const entry = report[fw];
    if (!entry || entry.failed) continue; // other checks report these
    // Every entry needs its own id, of the right type, matching the meta id.
    if (typeof entry.captureRunId !== 'string' || !entry.captureRunId) {
      fail(`: ${fw} has no captureRunId of its own (cannot prove freshness)`);
      continue;
    }
    if (entry.captureRunId !== metaId) {
      fail(`: ${fw} captureRunId ${entry.captureRunId} != report ${metaId}`);
    }
  }
  if (fullSet) {
    // All seven entries must share the one meta id, so an incremental capture
    // (fresh meta id, older sibling entries) cannot be presented as a full set.
    const ids = new Set(frameworks.map((fw) => report[fw] && report[fw].captureRunId));
    ids.delete(undefined);
    ids.delete(null);
    if (ids.size > 1) {
      fail(
        `: frameworks were captured in different generations ` +
        `(${ids.size} distinct captureRunId values): ` +
        frameworks.map((fw) => `${fw}=${report[fw] && report[fw].captureRunId}`).join(', ')
      );
    }
    if (meta.fullSet !== true) {
      fail(`: report __meta.fullSet is ${meta.fullSet} (an incremental capture cannot claim a full set)`);
    }
  }
  return failures;
}

function checkReport(dir, frameworks) {
  let failures = 0;
  const fail = (msg) => { failures++; console.log(`  FAIL report${msg}`); };
  const { report, error } = loadReport(dir);
  if (error) {
    fail(`: ${error}`);
    return failures;
  }
  for (const fw of frameworks) {
    const entry = report[fw];
    if (!entry) { fail(`: no entry for ${fw}`); continue; }
    if (entry.failed || entry.error) { fail(`: ${fw} recorded ${entry.error}`); continue; }
    const problems = [];
    if (entry.renderedItems !== EXPECTED_REPORT.renderedItems)
      problems.push(`renderedItems=${entry.renderedItems} expected ${EXPECTED_REPORT.renderedItems}`);
    if (entry.emptyStateVisible !== true) problems.push('emptyStateVisible is not true');
    if (entry.emptyStateItems !== 0) problems.push(`emptyStateItems=${entry.emptyStateItems} expected 0`);
    if (Number((entry.stats || '').match(/\d+/)?.[0]) !== EXPECTED_REPORT.remaining)
      problems.push(`stats "${entry.stats}" expected ${EXPECTED_REPORT.remaining} remaining`);
    if (Array.isArray(entry.errors)) {
      if (entry.errors.length) problems.push(`errors: ${entry.errors.join(' | ')}`);
    } else problems.push('errors is not an array');
    for (const state of STATES) {
      const rects = entry.labelRects && entry.labelRects[state];
      if (!rects || !rects.badge || !rects.footer)
        problems.push(`labelRects missing for ${state}`);
      if (!entry.screenshots || !entry.screenshots.includes(`${fw}/${state}.png`))
        problems.push(`screenshots list missing ${fw}/${state}.png`);
    }
    if (problems.length) console.log(`  FAIL report ${fw}: ${problems.join('; ')}`), failures++;
    else console.log(`  OK   report ${fw}`);
  }
  return failures;
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.dir)) {
    console.error(`verify-screenshots.js: directory not found: ${opts.dir}`);
    process.exit(1);
  }

  // Full verification demands all seven frameworks in a single capture
  // generation. A scoped run checks one framework, but still requires it to
  // carry freshness metadata — and never claims the full set is fresh.
  const fullSet = !opts.framework;
  const frameworks = opts.framework ? [opts.framework] : FRAMEWORKS;

  let failures = 0;
  const t0 = Date.now();
  if (opts.framework) console.log(`Scoped verification: ${opts.framework} only`);

  const entries = fs.readdirSync(opts.dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  const found = entries.map((d) => d.name).sort();
  console.log(`Framework directories found: ${found.join(', ') || '(none)'}`);
  if (fullSet) {
    const missingFw = FRAMEWORKS.filter((f) => !found.includes(f));
    const extraFw = found.filter((f) => !FRAMEWORKS.includes(f));
    if (missingFw.length) {
      failures++;
      console.log(`  FAIL missing framework directory: ${missingFw.join(', ')}`);
    }
    if (extraFw.length) {
      failures++;
      console.log(`  FAIL unexpected framework directory: ${extraFw.join(', ')}`);
    }
  } else if (!found.includes(opts.framework)) {
    failures++;
    console.log(`  FAIL missing framework directory: ${opts.framework}`);
  }

  const cardHeights = {}; // framework -> { state: cssHeight }
  for (const fw of frameworks) {
    const dir = path.join(opts.dir, fw);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    const missingState = STATES.filter((s) => !files.includes(`${s}.png`));
    const extra = files.filter((f) => !STATES.includes(f.replace('.png', '')));
    console.log(`\n${fw} (${files.length} screenshots)`);
    if (missingState.length) {
      failures++;
      console.log(`  FAIL missing state file(s): ${missingState.join(', ')}`);
    }
    if (extra.length) {
      failures++;
      console.log(`  FAIL unexpected file(s): ${extra.join(', ')}`);
    }

    cardHeights[fw] = {};
    for (const f of files) {
      const file = path.join(dir, f);
      const png = readPng(file);
      const st = byteStats(png);
      const b = whiteBounds(png);
      const problems = [];
      if (st.uniqueColors < 200) problems.push(`too few colors (${st.uniqueColors})`);
      if (st.whiteRatio < 0.05) problems.push(`almost no content (whiteRatio=${st.whiteRatio.toFixed(3)})`);
      if (st.whiteRatio > 0.95) problems.push(`mostly white/blank (whiteRatio=${st.whiteRatio.toFixed(3)})`);
      if (st.dominantRatio > 0.9) problems.push(`dominant color ${(st.dominantRatio * 100).toFixed(1)}%`);
      if (!b) problems.push('no content card detected');

      // Geometry is expressed in CSS px; screenshots may use deviceScaleFactor.
      let geo = '';
      if (b) {
        const scale = png.width / EXPECTED.viewportWidth;
        const leftCss = Math.round(b.left / scale);
        const widthCss = Math.round(b.width / scale);
        const hCss = Math.round(b.height / scale);
        geo = `card ${leftCss},${widthCss} h${hCss}`;
        const isEmpty = f.startsWith('empty');
        const [lo, hi] = isEmpty ? EXPECTED.emptyHeight : EXPECTED.populatedHeight;
        if (leftCss !== EXPECTED.cardLeft) problems.push(`card left ${leftCss} != ${EXPECTED.cardLeft}`);
        if (widthCss !== EXPECTED.cardWidth) problems.push(`card width ${widthCss} != ${EXPECTED.cardWidth}`);
        if (hCss < lo || hCss > hi) problems.push(`card height ${hCss} outside ${lo}..${hi}`);
        cardHeights[fw][f.replace('.png', '')] = hCss;
      }

      if (problems.length) {
        failures++;
        console.log(`  FAIL ${f}: ${problems.join('; ')} [${geo}]`);
      } else {
        console.log(`  OK   ${f}  (colors=${st.uniqueColors}, ${geo})`);
      }
    }
  }

  // Height is font-metric dependent, but every framework runs on the same host in
  // the same step, so their cards must agree with each other. This catches a
  // framework whose CSS/layout diverges without hardcoding one platform's metric.
  const statesPresent = STATES.filter((s) => FRAMEWORKS.every((fw) => cardHeights[fw] && cardHeights[fw][s] !== undefined));
  for (const state of statesPresent) {
    const heights = FRAMEWORKS.filter((fw) => cardHeights[fw] && cardHeights[fw][state] !== undefined)
      .map((fw) => ({ fw, h: cardHeights[fw][state] }));
    const min = Math.min(...heights.map((x) => x.h));
    const max = Math.max(...heights.map((x) => x.h));
    if (max - min > EXPECTED.heightAgreement) {
      failures++;
      const detail = heights.map((x) => `${x.fw}=${x.h}`).join(', ');
      console.log(`\n  FAIL card height disagrees across frameworks for ${state}: ${detail}`);
    }
  }

  console.log('\n--- screenshot-report.json ---');
  failures += checkReport(opts.dir, frameworks);

  console.log('\n--- capture generation ---');
  {
    const { report, error } = loadReport(opts.dir);
    if (error) {
      failures++;
      console.log(`  FAIL freshness: ${error}`);
    } else {
      failures += checkFreshness(report, frameworks, { fullSet });
    }
  }

  console.log(`\n${failures === 0 ? 'ALL SCREENSHOTS OK' : failures + ' SCREENSHOT(S) FAILED'} (${Date.now() - t0}ms)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
