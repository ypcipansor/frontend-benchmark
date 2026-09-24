#!/usr/bin/env node
/**
 * Render side-by-side comparison montages (one per UI state) proving that all
 * seven frameworks draw the same screen. Each montage is produced by rendering
 * a styled HTML grid in Chromium and capturing the resulting page.
 *
 * Output: docs/images/comparison-<state>.png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'docs/images');
const OUT = path.join(ROOT, 'docs/images');

const FRAMEWORKS = [
  ['react', 'React'],
  ['vue', 'Vue.js'],
  ['angular', 'Angular'],
  ['leptos', 'Leptos'],
  ['yew', 'Yew'],
  ['dioxus', 'Dioxus'],
  ['blade', 'Blade.php'],
];
const STATES = [
  ['all', 'All — 100 todos, 67 remaining'],
  ['active', 'Active filter'],
  ['completed', 'Completed filter'],
  ['input-filled', 'Input with text'],
  ['empty-state', 'Empty state after deleting every todo'],
];

function buildHtml(state, label) {
  const cards = FRAMEWORKS.map(
    ([dir, name]) => `
    <figure>
      <figcaption>${name}</figcaption>
      <img src="images/${dir}/${state}.jpg" alt="${name} ${state}" />
    </figure>`
  ).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 24px 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a;
  }
  h1 {
    margin: 0 0 20px; font-size: 26px; font-weight: 700;
    color: #f8fafc; letter-spacing: -0.01em;
  }
  .grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  }
  figure {
    margin: 0; background: #1e293b; border-radius: 12px; overflow: hidden;
    border: 1px solid #334155;
  }
  figcaption {
    padding: 9px 14px; font-size: 14px; font-weight: 600; color: #e2e8f0;
    background: #334155; letter-spacing: 0.02em;
  }
  img { display: block; width: 100%; height: auto; }
</style></head>
<body>
  <h1>${label}</h1>
  <div class="grid">${cards}</div>
</body></html>`;
}

(async () => {
  const tmp = path.join(ROOT, 'docs', '.gallery-tmp.html');
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    for (const [state, label] of STATES) {
      fs.writeFileSync(tmp, buildHtml(state, label));
      const ctx = await browser.newContext({
        viewport: { width: 1800, height: 900 },
        deviceScaleFactor: 1,
      });
      try {
        const page = await ctx.newPage();
        await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const broken = await page.evaluate(() =>
          Array.from(document.images)
            .filter((img) => !img.complete || img.naturalWidth === 0)
            .map((img) => img.getAttribute('src'))
        );
        if (broken.length) {
          throw new Error(`montage ${state}: ${broken.length} image(s) failed to load: ${broken.join(', ')}`);
        }
        // Every figure must have rendered the full card, not a collapsed placeholder.
        const shortFigures = await page.evaluate(() =>
          Array.from(document.querySelectorAll('figure'))
            .filter((f) => f.querySelector('img').getBoundingClientRect().height < 200)
            .map((f) => f.querySelector('figcaption').textContent)
        );
        if (shortFigures.length) {
          throw new Error(`montage ${state}: card too small for ${shortFigures.join(', ')}`);
        }
        const out = path.join(OUT, `comparison-${state}.png`);
        await page.screenshot({ path: out, fullPage: true });
        const kb = (fs.statSync(out).size / 1024).toFixed(0);
        console.log(`wrote comparison-${state}.png (${kb} KB)`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { force: true });
  }
})().catch((e) => {
  console.error(`build-montage.js: ${e.message}`);
  process.exit(1);
});
