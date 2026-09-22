# Agent notes

Seven implementations of one Todo app, compared for **fairness**: identical UI,
identical state, measured by the same code path. All live in `implementations/`.

## Running the dev servers

Each implementation must listen on its fixed port, otherwise the screenshot and
parity tooling cannot reach it.

| Framework | Port | Command |
|-----------|-----:|---------|
| React | 4001 | `cd implementations/react && npm run dev -- --port 4001 --host 127.0.0.1 --strictPort` |
| Vue.js | 4002 | `cd implementations/vue && npm run dev -- --port 4002 --host 127.0.0.1 --strictPort` |
| Angular | 4003 | `cd implementations/angular && npm start -- --port 4003 --host 127.0.0.1` |
| Leptos | 4004 | `trunk build` then serve `implementations/leptos/dist` |
| Yew | 4005 | `trunk build` then serve `implementations/yew/dist` |
| Dioxus | 4006 | `trunk build` then serve `implementations/dioxus/dist` |
| Blade.php | 4007 | `cd implementations/blade && php -S 127.0.0.1:4007 -t .` |

Blade needs `composer install` first. The Rust dists reference the stylesheet as
`../../shared/styles/todo.css`, so when serving `dist/` directly, place the repo's
`shared/` next to each dist (or serve a tree that keeps the relative path valid).

## Verifying changes

```bash
cd docs
npm install && npx playwright install chromium
npm run capture   # 35 screenshots -> docs/screenshots/
npm run verify    # rejects blank / white / mis-sized captures
npm run parity    # DOM, geometry, content and state equality  (needs live servers)
npm run pixel     # pixel diff vs the React reference          (works offline)
npm run optimize  # card-cropped docs/images/*/*.jpg
npm run montage   # docs/images/comparison-*.png
```

`npm run pixel` reads the saved screenshots and `screenshot-report.json`, so it
works without any server running. `npm run parity` and `npm run capture` need all
seven servers up.

## Gotchas

- **Pixel parity is strict.** The only tolerated differences are the header badge
  and the footer, and even those masks come from live element geometry recorded
  during capture — not hardcoded rows. Anything else must be byte-identical.
- **Keep `.todo-stats` segmented the same way everywhere.** Wrap the remaining
  count in its own `<span>`. Merging the digits and the suffix into one text node
  changes subpixel glyph shaping and shows up as a pixel diff even though the text
  reads the same.
- **Every mount point must stay `display: contents`.** `#root`, `#app`, `#main`
  and `app-root` are neutralised in `shared/styles/todo.css` so the card is the
  only flex child of `<body>`. Overriding this collapses the card to 389px.
- **Completion is 1-based.** Use `(i + 1) % 3 === 0` so items 3, 6, …, 99 are
  completed (33 completed, 67 remaining).
- **The Rust dists are build output.** `dist/` is gitignored; rebuild with
  `trunk build` after changing a Rust implementation. Blade must render
  `<li class="todo-item">`, never a `<div>` inside `<ul>`.
- `docs/` has its own `package.json`; run its scripts from inside `docs/`.

## Screenshots in docs

`README.md` shows all 5 states × 7 frameworks (35 crops) plus 5 montages. Keep it
that way — a state is considered "captured" only if it appears there. Regenerate
with `npm run optimize && npm run montage` after recapturing.
