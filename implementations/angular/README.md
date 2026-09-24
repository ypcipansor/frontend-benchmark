# Angular Todo Implementation

Angular implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the Angular build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/angular/all.jpg) | ![Active](../../docs/images/angular/active.jpg) | ![Completed](../../docs/images/angular/completed.jpg) | ![Input-filled](../../docs/images/angular/input-filled.jpg) | ![Empty state](../../docs/images/angular/empty-state.jpg) |

Optimized crops live in [`docs/images/angular/`](../../docs/images/angular/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/angular/`](../../docs/screenshots/angular/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Framework | Angular 22.1 |
| Language | TypeScript 5.9 |
| Components | Standalone components |
| State | Angular Signals |
| Node.js | 22.22.3+ (or 24.15+, or 26+) — `@angular/cli` 22 refuses older runtimes |

## Running it

Node.js 22.22.3+ is required: Angular CLI 22 declares
`engines.node ^22.22.3 || ^24.15.0 || >=26.0.0` and exits on anything older. The
requirement is declared in this package's `engines.node` and enforced by
`npm run check:node-engines` in `docs/`, which fails if any CI workflow pins an
older Node.

```bash
npm install
npm start              # http://localhost:4200
npm run build          # production bundle in dist/angular-todo/
```

In the benchmark the dev server is pinned to a fixed port so it can be reached by the screenshot tooling:

```bash
npx ng serve --port 4003 --host 127.0.0.1
```

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete
- Styling comes from `src/styles.css`, a byte-identical copy of [`shared/styles/todo.css`](../../shared/styles/todo.css). The copy is enforced: `cd docs && npm run check:css` fails if it drifts, and `npm run sync:css` resyncs it.

The completion rule is the important detail for parity:

```ts
completed: (i + 1) % 3 === 0,   // 1-based index: items 3, 6, 9, ... are completed
```

## Layout parity

Angular mounts into an `<app-root>` element, while Blade renders `.todo-app` straight into `<body>`. To stop that wrapper from shrinking and re-centring the card, the shared stylesheet neutralises every framework mount point:

```css
#root,
#app,
#main,
app-root {
  display: contents;
}
```

With that in place the card is the only flex child of `<body>` and renders at **600px wide, x=420**, identical to the other six implementations.

### Pixel parity

`docs/pixel-parity.py` diffs this build against the React reference in every UI state and fails on any difference outside the two regions that hold the framework name. To keep the `.todo-stats` line byte-identical, the remaining-count digits are wrapped in their own `<span>`; leaving the digits and the `items remaining` suffix in one merged text node shifts subpixel glyph shaping by a fraction of a pixel and shows up as a real diff.


## Code structure

| File | Purpose |
|------|---------|
| `src/app/app.ts` | The Todo component — signal state and computed values |
| `src/app/app.html` | Component template |
| `src/app/app.config.ts` | Application bootstrap config |
| `src/styles.css` | Byte-identical copy of the shared stylesheet (checked by `npm run check:css`) |
| `src/index.html` | Entry HTML, `<title>Todo List - Angular</title>` |

## Performance notes

- Signals for state, so updates are targeted rather than zone-wide
- `computed` for the filtered list and the remaining count
- Standalone components with a keyed list

## Verify

```bash
cd ../../docs
npm run verify      # screenshot sanity
npm run parity      # cross-framework assertions
```
