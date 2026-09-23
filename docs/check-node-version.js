#!/usr/bin/env node
/**
 * Enforce the Node.js minimum for the docs tooling in code, not only in prose.
 *
 * Playwright 1.63 requires Node >= 20, so `engines` in package.json is a
 * machine-readable signal but `npm` only warns by default. This check turns a
 * too-old runtime into a hard failure, and CI runs it before `npm ci` so a
 * runner on Node 18 fails with a clear message instead of a confusing Playwright
 * error later.
 *
 * Usage: node docs/check-node-version.js
 */
const REQUIRED_MAJOR = 20;

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(major) || major < REQUIRED_MAJOR) {
  console.error(
    `check-node-version.js: Node.js >= ${REQUIRED_MAJOR} is required for the docs ` +
    `tooling (Playwright 1.63), but this is ${process.versions.node}.`
  );
  process.exit(1);
}
console.log(`Node.js ${process.versions.node} satisfies the >= ${REQUIRED_MAJOR} requirement.`);
