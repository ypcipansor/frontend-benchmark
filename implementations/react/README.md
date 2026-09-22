# React Todo Implementation

React implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the React build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/react/all.jpg) | ![Active](../../docs/images/react/active.jpg) | ![Completed](../../docs/images/react/completed.jpg) | ![Input-filled](../../docs/images/react/input-filled.jpg) | ![Empty state](../../docs/images/react/empty-state.jpg) |

Optimized crops live in [`docs/images/react/`](../../docs/images/react/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/react/`](../../docs/screenshots/react/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Framework | React 19.1.1 |
| Language | JavaScript (ESM) |
| Build tool | Vite 8 |
| Linting | ESLint 10 |

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production bundle in dist/
npm run preview        # serve the production build
npm run lint
```

In the benchmark the dev server is pinned to a fixed port so it can be reached by the screenshot tooling:

```bash
npm run dev -- --port 4001 --strictPort
```

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete
- Styling comes from `src/App.css`, a copy of [`shared/styles/todo.css`](../../shared/styles/todo.css)

The completion rule is the important detail for parity:

```js
completed: (i + 1) % 3 === 0,   // 1-based index: items 3, 6, 9, ... are completed
```

## Layout parity

React mounts into `#root`, while Blade renders `.todo-app` straight into `<body>`. To stop that wrapper from shrinking and re-centring the card, the shared stylesheet neutralises every framework mount point:

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
| `src/App.jsx` | The Todo component — state, derived values and handlers |
| `src/main.jsx` | React entry point |
| `src/App.css` | Copy of the shared stylesheet |
| `index.html` | Vite entry HTML, `<title>Todo List - React</title>` |

## Performance notes

- `useMemo` for the filtered list and the remaining count
- Keyed list rendering
- Single state object, so one update re-renders one subtree

## Verify

```bash
cd ../../docs
npm run verify      # screenshot sanity
npm run parity      # cross-framework assertions
```
