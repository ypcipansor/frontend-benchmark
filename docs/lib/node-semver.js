'use strict';
/**
 * A small, deliberately limited semver comparator shared by the Node.js engine
 * gates (`check-node-version.js` and `check-node-engines.js`).
 *
 * It understands the comparators this repository uses (`>=`, `>`, `<`, `<=`,
 * `=`, `^`, `~`) joined by spaces (AND) or `||` (OR), and compares numeric
 * triples. It is not a general semver implementation; a range it cannot parse
 * returns null so the caller can fail loudly rather than accidentally pass.
 */

/** Parse a version string into a numeric triple, or null if unparseable. */
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

/** True/false when the range parses, null when it does not. */
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

/** null when the version string or range is unparseable; otherwise true/false. */
function satisfiesRange(versionString, range) {
  const version = parseVersion(versionString);
  if (!version) return null;
  return satisfiesRangeTriple(version, range);
}

/**
 * A `node-version: '24'` pin makes setup-node install the newest 24.x, but which
 * 24.x that is depends on the day the job runs, so the pin stands for *every*
 * version in that major. Checking only the top of the major would accept a pin
 * whose lowest release does not meet the floor, so return both ends of the range
 * the pin denotes (a fully-qualified pin denotes a single version).
 */
function pinVersions(value) {
  const raw = String(value).trim().replace(/^v/, '');
  if (/^\d+$/.test(raw)) {
    const major = Number(raw);
    return [[major, 0, 0], [major, 999, 999]];
  }
  const exact = parseVersion(raw);
  return exact ? [exact] : null;
}

/** Kept for callers that want a single representative triple for a pin. */
function pinTriple(value) {
  const versions = pinVersions(value);
  return versions ? versions[versions.length - 1] : null;
}

module.exports = { parseVersion, compare, satisfiesRange, satisfiesRangeTriple, pinVersions, pinTriple };
