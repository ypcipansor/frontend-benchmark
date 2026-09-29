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
 * 22 dev server, whose CLI requires `^22.22.3 || ^24.15.0 || >=26.0.0`. That
 * range excludes Node 23 and 25, so the check must evaluate the *whole* declared
 * range rather than only its `>=` minimum: a plain minimum would accept Node 23
 * and then fail when Angular refuses to start.
 *
 * Usage: node docs/check-node-version.js [--root <dir>]
 */
const fs = require('fs');
const path = require('path');
const { satisfiesRange } = require('./lib/node-semver');

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

const pkgPath = path.join(root, 'docs', 'package.json');
let engines;
try {
  engines = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).engines || {};
} catch (e) {
  console.error(`check-node-version.js: cannot read ${pkgPath}: ${e.message}`);
  process.exit(1);
}

const range = engines.node;
if (!range) {
  console.error(
    'check-node-version.js: docs/package.json engines.node is missing, so the ' +
    'runtime requirement cannot be enforced.'
  );
  process.exit(1);
}

const satisfied = satisfiesRange(process.versions.node, range);
if (satisfied === null) {
  console.error(
    `check-node-version.js: docs/package.json engines.node ${JSON.stringify(range)} ` +
    'is not a range this checker can parse.'
  );
  process.exit(1);
}
if (!satisfied) {
  console.error(
    `check-node-version.js: Node.js satisfying ${range} is required for the docs ` +
    `tooling (Playwright 1.63 and Angular CLI 22), but this is ${process.versions.node}.`
  );
  process.exit(1);
}
console.log(
  `Node.js ${process.versions.node} satisfies ${range} ` +
  `(docs/package.json engines.node = ${range}).`
);
