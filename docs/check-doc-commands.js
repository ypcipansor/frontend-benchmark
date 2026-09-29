#!/usr/bin/env node
/**
 * Validate that documented `npm run <script>` commands can actually be followed
 * from the context they appear in.
 *
 * The repository publishes commands in several Markdown files. A bare
 * `npm run update-readme` is only meaningful inside `benchmarks/scripts/`, so any
 * occurrence must either be an inline `cd benchmarks/scripts && npm run ...`, or
 * sit in a fenced block whose earlier lines have already changed into that
 * directory. This checker proves both that the context is present and that the
 * target script exists in the owning package.json, so a published command can
 * never drift away from the file that defines it.
 *
 * Usage: node docs/check-doc-commands.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Which package.json owns a npm script, and the working directory a reader must
// be in for the bare `npm run <script>` form to resolve.
const OWNER = {
  'update-readme': { pkg: 'benchmarks/scripts/package.json', dir: 'benchmarks/scripts' },
};

// Markdown files that document commands. Kept explicit so a new doc is a
// deliberate addition rather than silently unchecked.
const DOCS = [
  'README.md',
  'BENCHMARK_GUIDE.md',
  'BENCHMARK_SPEC.md',
  'CONTRIBUTING.md',
  'COMPREHENSIVE_BENCHMARK_README.md',
  'DOCKER.md',
  'QUICKSTART_DOCKER.md',
  'RESULTS_TEMPLATE.md',
  'CI_CD_GUIDE.md',
  'docs/README.md',
  'AGENTS.md',
  'benchmarks/scripts/README.md',
];

const problems = [];
const fail = (msg) => problems.push(msg);

// `--doc <path>` checks one extra Markdown file (used by the regression tests to
// prove the checker rejects a bare command through the production code path).
const extraDocs = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--doc') {
    const value = argv[++i];
    if (!value) { console.error('check-doc-commands.js: --doc requires a path'); process.exit(2); }
    extraDocs.push(path.resolve(value));
  } else {
    console.error(`check-doc-commands.js: unknown argument ${argv[i]}`);
    process.exit(2);
  }
}

/** Scripts declared in a package.json, or null when it cannot be read. */
function scriptsOf(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, pkgPath), 'utf8'));
    return pkg.scripts || {};
  } catch (e) {
    fail(`cannot read ${pkgPath}: ${e.message}`);
    return null;
  }
}

// The owning script must exist before any occurrence can be accepted.
const scripts = {};
for (const [name, owner] of Object.entries(OWNER)) {
  const table = scriptsOf(owner.pkg);
  scripts[name] = table;
  if (table && !table[name]) {
    fail(`${owner.pkg} has no "${name}" script`);
  }
}

for (const doc of DOCS) {
  const file = path.join(ROOT, doc);
  if (!fs.existsSync(file)) continue;
  checkDoc(doc, file);
}
for (const file of extraDocs) {
  if (!fs.existsSync(file)) { fail(`--doc file not found: ${file}`); continue; }
  checkDoc(file, file);
}

function checkDoc(doc, file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  let inFence = false;
  let fencedDir = null; // working directory established earlier in this block
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      if (inFence) { inFence = false; fencedDir = null; } else { inFence = true; fencedDir = null; }
      return;
    }

    const at = i + 1;
    if (inFence) {
      // A `cd <dir>` line (alone, or chained with &&) sets the block's context.
      const cd = line.match(/\bcd\s+([^\s&;]+)/);
      if (cd) fencedDir = cd[1].replace(/\/+$/, '');
    }

    for (const name of Object.keys(OWNER)) {
      const { dir } = OWNER[name];
      if (!new RegExp(`npm run ${name}\\b`).test(line)) continue;

      // Inline form: `cd benchmarks/scripts && npm run update-readme`
      const inline = new RegExp(`cd\\s+${dir}\\s*&&[^\\n]*npm run ${name}\\b`).test(line);
      // Block form: an earlier `cd benchmarks/scripts` in the same fence.
      const block = inFence && fencedDir === dir;
      // A block whose cd is on the same line as the command.
      const sameLine = new RegExp(`cd\\s+${dir}[;&]`).test(line);
      // A doc that *lives* in the owning directory is already in that context.
      const selfDir = path.dirname(doc) === dir;
      // Prose that names the working directory on the same line, e.g.
      // "`npm run update-readme` from `benchmarks/scripts/`".
      const prose = new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`).test(line);

      if (!(inline || block || sameLine || selfDir || prose)) {
        fail(`${doc}:${at} runs "npm run ${name}" without a working directory; ` +
             `use "cd ${dir} && npm run ${name}" or run it from a block that has ` +
             `already changed into ${dir}`);
      }
    }
  });
}

if (problems.length) {
  console.error('check-doc-commands.js: documented commands are not reproducible:');
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log(`DOC COMMANDS OK (${Object.keys(OWNER).length} script(s) checked across ${DOCS.length} doc(s))`);
