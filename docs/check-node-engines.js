#!/usr/bin/env node
/**
 * Prove every Node.js version pinned in GitHub Actions satisfies the engine
 * ranges the checked-out code actually needs.
 *
 * The visual-parity workflow starts the Angular 22 dev server. Angular CLI 22
 * requires `^22.22.3 || ^24.15.0 || >=26.0.0`, so a workflow that pins an older
 * Node installs fine and then fails when `npm start` rejects the runtime — all
 * seven captures never happen. Pinning a version in the YAML is easy to do once
 * and forget when a dependency's floor moves, so this checker reads the floors
 * from `docs/package.json` and `implementations/angular/package.json` (and, when
 * present, the installed `@angular/cli`) and fails if any pinned version does not
 * satisfy them.
 *
 * Usage: node docs/check-node-engines.js [--root <dir>]
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
let root = path.resolve(__dirname, '..');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') {
    const value = argv[++i];
    if (!value) { console.error('check-node-engines.js: --root requires a path'); process.exit(2); }
    root = path.resolve(value);
  } else {
    console.error(`check-node-engines.js: unknown argument ${argv[i]}`);
    process.exit(2);
  }
}

/**
 * A small, deliberately limited semver comparator: it understands the comparators
 * this repository uses (`>=`, `>`, `<`, `<=`, `=`, `^`, `~`) joined by spaces
 * (AND) or `||` (OR), and compares numeric triples. It is not a general semver
 * implementation; a range it cannot parse is a hard failure rather than an
 * accidental pass.
 */
function parseVersion(value) {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]+)?\s*$/.exec(String(value));
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function satisfiesComparator(version, comparator) {
  let op = '=';
  let rest = comparator;
  for (const candidate of ['>=', '<=', '>', '<', '^', '~', '=']) {
    if (comparator.startsWith(candidate)) { op = candidate; rest = comparator.slice(candidate.length); break; }
  }
  const target = parseVersion(rest);
  if (!target) return null; // unparseable
  switch (op) {
    case '>=': return compare(version, target) >= 0;
    case '<=': return compare(version, target) <= 0;
    case '>': return compare(version, target) > 0;
    case '<': return compare(version, target) < 0;
    case '^': return compare(version, target) >= 0 && compare(version, [target[0] + 1, 0, 0]) < 0;
    case '~': return compare(version, target) >= 0 && compare(version, [target[0], target[1] + 1, 0]) < 0;
    default: return compare(version, target) === 0;
  }
}

/** null when the range is unparseable; otherwise true/false. */
function satisfiesRange(versionString, range) {
  const version = parseVersion(versionString);
  if (!version) return null;
  return satisfiesRangeTriple(version, range);
}

function satisfiesRangeTriple(version, range) {
  const clauses = String(range).split('||');
  let sawComparator = false;
  for (const clause of clauses) {
    const comparators = clause.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) continue;
    let clauseOk = true;
    for (const comparator of comparators) {
      const result = satisfiesComparator(version, comparator);
      if (result === null) return null; // unparseable comparator
      sawComparator = true;
      if (!result) { clauseOk = false; break; }
    }
    if (clauseOk && sawComparator) return true;
  }
  return false;
}

/**
 * A `node-version: '24'` pin selects the newest 24.x, not exactly 24.0.0, so it
 * is compared as the top of that major when only a major is given.
 */
function pinTriple(value) {
  const raw = String(value).trim().replace(/^v/, '');
  const majorOnly = /^\d+$/.test(raw);
  if (majorOnly) return [Number(raw), 999, 999];
  return parseVersion(raw);
}

const problems = [];
const fail = (msg) => problems.push(msg);

/** Read and JSON.parse a file, or return null with a recorded failure. */
function readJson(relOrAbs, label) {
  const file = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`cannot parse ${label || file}: ${e.message}`);
    return null;
  }
}

// The ranges a pinned workflow Node version must satisfy. Each entry is a floor
// that will actually be exercised by the pipeline.
const requirements = [];
function addRequirement(label, range) {
  if (!range) return; // an implementation that declares nothing constrains nothing
  requirements.push({ label, range });
}

const docsPkg = readJson('docs/package.json', 'docs/package.json');
if (!docsPkg) fail('docs/package.json is missing');
else addRequirement('docs/package.json engines.node', docsPkg.engines && docsPkg.engines.node);

const angularPkg = readJson('implementations/angular/package.json', 'implementations/angular/package.json');
if (!angularPkg) fail('implementations/angular/package.json is missing');
else addRequirement('implementations/angular/package.json engines.node', angularPkg.engines && angularPkg.engines.node);

// The declared floor must not drift from the CLI that is actually installed.
const installedCli = readJson(
  'implementations/angular/node_modules/@angular/cli/package.json',
  'installed @angular/cli'
);
if (installedCli && installedCli.engines && installedCli.engines.node) {
  const declared = angularPkg && angularPkg.engines && angularPkg.engines.node;
  if (declared) {
    // Every version the installed CLI accepts must be accepted by the declared
    // floor, otherwise the declaration understates the real requirement.
    const sampleVersions = ['22.22.3', '22.23.0', '23.0.0', '24.15.0', '24.21.0', '26.0.0'];
    for (const v of sampleVersions) {
      const installedOk = satisfiesRange(v, installedCli.engines.node);
      const declaredOk = satisfiesRange(v, declared);
      if (installedOk === null || declaredOk === null) {
        fail(`cannot compare ${v} against the Angular CLI engines`);
      } else if (installedOk && !declaredOk) {
        fail(
          `implementations/angular/package.json engines.node (${declared}) rejects Node ${v}, ` +
          `which the installed @angular/cli ${installedCli.version} accepts (${installedCli.engines.node})`
        );
      }
    }
  }
}

if (requirements.length === 0) {
  fail('no Node.js engine requirements were found to check');
}

// Collect every `node-version:` pin from the workflows.
const workflowsDir = path.join(root, '.github', 'workflows');
const pins = [];
if (!fs.existsSync(workflowsDir)) {
  fail(`no .github/workflows directory under ${root}`);
} else {
  for (const name of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const text = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      const m = /^\s*node-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (m) pins.push({ workflow: name, line: idx + 1, version: m[1] });
    });
  }
}
if (pins.length === 0) {
  fail('no node-version pins were found in .github/workflows');
}

for (const pin of pins) {
  // A bare major pin ("24") makes setup-node install the newest 24.x, so the
  // comparison uses the top of that major rather than exactly major.0.0.
  const candidate = pinTriple(pin.version);
  if (!candidate) {
    fail(`${pin.workflow}:${pin.line}: cannot parse Node version ${JSON.stringify(pin.version)}`);
    continue;
  }
  for (const req of requirements) {
    const ok = satisfiesRangeTriple(candidate, req.range);
    if (ok === null) {
      fail(
        `${pin.workflow}:${pin.line}: cannot compare Node ${pin.version} against ${req.label} (${req.range})`
      );
    } else if (!ok) {
      fail(
        `${pin.workflow}:${pin.line} pins Node ${pin.version}, which does not satisfy ` +
        `${req.label} (${req.range})`
      );
    }
  }
}

if (problems.length) {
  console.error('check-node-engines.js: Node.js pins do not satisfy the engine requirements:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

const summary = requirements.map((r) => `${r.label} (${r.range})`).join(', ');
console.log(
  `NODE ENGINES OK: ${pins.length} workflow pin(s) satisfy ${summary}`
);
