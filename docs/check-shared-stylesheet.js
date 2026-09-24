#!/usr/bin/env node
/**
 * Prove that the shared stylesheet is a single source, not a copy that drifts.
 *
 * `shared/styles/todo.css` is the one stylesheet every implementation renders
 * with. The three Rust/WASM implementations link it directly from `index.html`,
 * so they can only ever diverge if that link is broken. React, Vue, Angular and
 * Blade build through tools that need the CSS inside their own source tree (Vite
 * resolves `./App.css`; the Angular builder takes a `styles` entry; Apache serves
 * `style.css` next to the PHP app), so each keeps a copy.
 *
 * A copy is only safe if it is *guaranteed* to match. This checker enforces that
 * byte-for-byte: change one rule in a copy (or in the source) without syncing and
 * the check fails. `--write` performs the sync. Because the check compares
 * content rather than trusting the docs, the "single source" claim in the READMEs
 * is a property of the build, not a statement someone has to keep true by hand.
 *
 * Usage:
 *   node docs/check-shared-stylesheet.js            # verify (CI gate)
 *   node docs/check-shared-stylesheet.js --write    # sync copies from the source
 *   node docs/check-shared-stylesheet.js --root <dir> [--write]
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const write = argv.includes('--write');
let rootArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--write') continue;
  if (a === '--root') {
    rootArg = argv[++i];
    if (!rootArg) {
      console.error('check-shared-stylesheet.js: --root requires a path');
      process.exit(2);
    }
    continue;
  }
  console.error(`check-shared-stylesheet.js: unknown argument ${a}`);
  process.exit(2);
}

const ROOT = rootArg ? path.resolve(rootArg) : path.resolve(__dirname, '..');
const SHARED = 'shared/styles/todo.css';

// Implementations that must link the shared file rather than hold a copy. The
// dists reference it as ../../shared/styles/todo.css (see AGENTS.md).
const DIRECT_LINKERS = [
  { file: 'implementations/leptos/index.html' },
  { file: 'implementations/yew/index.html' },
  { file: 'implementations/dioxus/index.html' },
];
const DIRECT_LINK = '../../shared/styles/todo.css';

// Files that must be byte-identical to the shared stylesheet. The test fixture
// is included: the regression suite renders the fixture app with it, so a
// divergence there is the same defect.
const COPIES = [
  'implementations/react/src/App.css',
  'implementations/vue/src/style.css',
  'implementations/angular/src/styles.css',
  'implementations/blade/style.css',
  'docs/tests/fixtures/fixture.css',
];

const problems = [];
const fail = (msg) => problems.push(msg);

const sharedPath = path.join(ROOT, SHARED);
if (!fs.existsSync(sharedPath)) {
  console.error(`check-shared-stylesheet.js: ${SHARED} is missing`);
  process.exit(1);
}
const source = fs.readFileSync(sharedPath);
if (source.length === 0) {
  console.error(`check-shared-stylesheet.js: ${SHARED} is empty`);
  process.exit(1);
}

if (write) {
  for (const rel of COPIES) {
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, source);
    console.log(`synced ${rel}`);
  }
} else {
  for (const rel of COPIES) {
    const copyPath = path.join(ROOT, rel);
    if (!fs.existsSync(copyPath)) {
      fail(`${rel} is missing (it must be a copy of ${SHARED})`);
      continue;
    }
    const copy = fs.readFileSync(copyPath);
    if (!copy.equals(source)) {
      fail(`${rel} has drifted from ${SHARED} ` +
           `(${copy.length} bytes vs ${source.length}); run ` +
           '`cd docs && npm run sync:css`');
    }
  }
}

// The direct linkers must reference the shared file, not a vendored copy: that
// is what makes "single source" true for them with no sync step at all.
for (const { file } of DIRECT_LINKERS) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    fail(`${file} is missing (it must link ${SHARED})`);
    continue;
  }
  const html = fs.readFileSync(p, 'utf8');
  if (!html.includes(DIRECT_LINK)) {
    fail(`${file} does not link ${DIRECT_LINK}; the Rust implementations must ` +
         'use the shared stylesheet directly rather than a copy');
  }
}

if (problems.length) {
  console.error('SHARED STYLESHEET DIVERGED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`SHARED STYLESHEET OK (${COPIES.length} copies match ${SHARED}, ` +
            `${DIRECT_LINKERS.length} direct linkers)`);
