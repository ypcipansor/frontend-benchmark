# Vue.js Todo Implementation

Vue implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the Vue.js build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/vue/all.jpg) | ![Active](../../docs/images/vue/active.jpg) | ![Completed](../../docs/images/vue/completed.jpg) | ![Input-filled](../../docs/images/vue/input-filled.jpg) | ![Empty state](../../docs/images/vue/empty-state.jpg) |

Optimized crops live in [`docs/images/vue/`](../../docs/images/vue/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/vue/`](../../docs/screenshots/vue/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Framework | Vue.js 3.5.22 |
| API style | Composition API with `<script setup>` |
| Build tool | Vite 8 |

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production bundle in dist/
npm run preview        # serve the production build
```

In the benchmark the dev server is pinned to a fixed port so it can be reached by the screenshot tooling:

```bash
npm run dev -- --port 4002 --strictPort
```

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete
- Styling comes from `src/style.css`, a byte-identical copy of [`shared/styles/todo.css`](../../shared/styles/todo.css). The copy is enforced: `cd docs && npm run check:css` fails if it drifts, and `npm run sync:css` resyncs it.

The completion rule is the important detail for parity:

```js
completed: (i + 1) % 3 === 0,   // 1-based index: items 3, 6, 9, ... are completed
```

## Layout parity

Vue mounts into `#app`, while Blade renders `.todo-app` straight into `<body>`. To stop that wrapper from shrinking and re-centring the card, the shared stylesheet neutralises every framework mount point:

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
| `src/App.vue` | The Todo component — `ref` state and `computed` derived values |
| `src/main.js` | Vue entry point |
| `src/style.css` | Byte-identical copy of the shared stylesheet (checked by `npm run check:css`) |
| `index.html` | Vite entry HTML, `<title>Todo List - Vue.js</title>` |

## Performance notes

- `computed` for the filtered list and the remaining count, so they only recompute when state changes
- Keyed `v-for` rendering
- Direct reactive state, no watchers on the hot path

## Verify

```bash
cd ../../docs
npm run verify      # screenshot sanity
npm run parity      # cross-framework assertions
```
