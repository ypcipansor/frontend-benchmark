#!/usr/bin/env node
/**
 * Enforce the Node.js minimum for the docs tooling in code, not only in prose.
 *
 * The requirement lives in one place — `engines.node` in `docs/package.json` —
 * and this script turns it into a hard failure. `npm` only warns on an engine
 * mismatch by default, and CI runs this before `npm ci` so an unsupported
 * runtime fails with a clear message instead of a confusing Playwright or
 * Angular CLI error later.
 *
 * The floor is not only Playwright's: the visual-parity job starts the Angular
 * 22 dev server, whose CLI requires `^22.22.3 || ^24.15.0 || >=26.0.0`, so the
 * declared minimum must be high enough for Angular too.
 *
 * Usage: node docs/check-node-version.js [--root <dir>]
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
let root = path.resolve(__dirname, '..');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') {
    const value = argv[++i];
    if (!value) { console.error('check-node-version.js: --root requires a path'); process.exit(2); }
    root = path.resolve(value);
  } else {
    console.error(`check-node-version.js: unknown argument ${argv[i]}`);
    process.exit(2);
  }
}

/** Parse a simple `>=X[.Y[.Z]]` engines range into a numeric triple. */
function parseMinimum(range) {
  const m = /^\s*>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(range || '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

const pkgPath = path.join(root, 'docs', 'package.json');
let engines;
try {
  engines = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).engines || {};
} catch (e) {
  console.error(`check-node-version.js: cannot read ${pkgPath}: ${e.message}`);
  process.exit(1);
}

const min = parseMinimum(engines.node);
if (!min) {
  console.error(
    'check-node-version.js: docs/package.json engines.node must be a simple ' +
    `">=X.Y.Z" range, found ${JSON.stringify(engines.node)}`
  );
  process.exit(1);
}

const current = process.versions.node.split('.').map(Number);
for (let i = 0; i < 3; i++) {
  if (current[i] > min[i]) break;
  if (current[i] < min[i]) {
    console.error(
      `check-node-version.js: Node.js >= ${min.join('.')} is required for the docs ` +
      `tooling (Playwright 1.63 and Angular CLI 22), but this is ${process.versions.node}.`
    );
    process.exit(1);
  }
}
console.log(
  `Node.js ${process.versions.node} satisfies the >= ${min.join('.')} requirement ` +
  `(docs/package.json engines.node = ${engines.node}).`
);
