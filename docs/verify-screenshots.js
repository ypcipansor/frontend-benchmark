#!/usr/bin/env node
/**
 * Validate captured screenshots: reject blank/white/near-uniform images and
 * images whose rendering does not match the expected shared layout.
 *
 * Usage: node docs/verify-screenshots.js --dir docs/screenshots
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const EXPECTED = {
  // Card geometry in CSS pixels at a 1440x1024 viewport (2x DPR screenshots are
  // scaled by the verifier). Every framework must match.
  cardLeft: 420,
  cardWidth: 600,
  viewportWidth: 1440,
};

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { dir: 'docs/screenshots' };
  for (let i = 0; i < a.length; i++) if (a[i] === '--dir') o.dir = a[++i];
  return o;
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function byteStats(png) {
  const { width, height, data } = png;
  const colors = new Map();
  let white = 0;
  let nonWhiteNonBg = 0;
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

function main() {
  const opts = parseArgs();
  const frameworks = fs
    .readdirSync(opts.dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let failures = 0;
  const t0 = Date.now();
  for (const fw of frameworks) {
    const dir = path.join(opts.dir, fw);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    console.log(`\n${fw} (${files.length} screenshots)`);
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
        geo = `card ${leftCss},${widthCss}`;
        const isEmpty = f.startsWith('empty');
        const expH = isEmpty ? 562 : 796;
        const hCss = Math.round(b.height / scale);
        if (leftCss !== EXPECTED.cardLeft) problems.push(`card left ${leftCss} != ${EXPECTED.cardLeft}`);
        if (widthCss !== EXPECTED.cardWidth) problems.push(`card width ${widthCss} != ${EXPECTED.cardWidth}`);
        if (Math.abs(hCss - expH) > 3) problems.push(`card height ${hCss} != expected ~${expH}`);
      }

      if (problems.length) {
        failures++;
        console.log(`  FAIL ${f}: ${problems.join('; ')} [${geo}]`);
      } else {
        console.log(`  OK   ${f}  (colors=${st.uniqueColors}, ${geo})`);
      }
    }
  }
  console.log(`\n${failures === 0 ? 'ALL SCREENSHOTS OK' : failures + ' SCREENSHOT(S) FAILED'} (${Date.now() - t0}ms)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
