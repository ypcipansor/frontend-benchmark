# Dioxus Todo Implementation

Dioxus (Rust/WebAssembly) implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the Dioxus build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/dioxus/all.jpg) | ![Active](../../docs/images/dioxus/active.jpg) | ![Completed](../../docs/images/dioxus/completed.jpg) | ![Input-filled](../../docs/images/dioxus/input-filled.jpg) | ![Empty state](../../docs/images/dioxus/empty-state.jpg) |

Optimized crops live in [`docs/images/dioxus/`](../../docs/images/dioxus/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/dioxus/`](../../docs/screenshots/dioxus/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Framework | Dioxus 0.7 (`web` feature) |
| Language | Rust, compiled to WebAssembly |
| Build tool | [Trunk](https://trunkrs.dev/) (the `dx` CLI also works) |

## Prerequisites

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
```

## Running it

Trunk reads the `data-trunk rel="rust"` directive from `index.html`, compiles the crate and injects the loader script:

```bash
trunk serve --open                 # http://localhost:8080
trunk build --release              # production build in dist/
```

In the benchmark the built `dist/` is served as a static site on a fixed port:

```bash
trunk build --release
python3 -m http.server 4006 --bind 127.0.0.1 --directory dist
```

> The `dx` CLI (`cargo install dioxus-cli`, then `dx serve`) works too, but Trunk keeps the build story identical to Leptos and Yew.

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete

The completion rule uses a 1-based index, matching the other Rust and PHP implementations.

## Styling and layout parity

`index.html` links the shared stylesheet directly:

```html
<link rel="stylesheet" href="../../shared/styles/todo.css">
```

Dioxus mounts into `#main`; the shared stylesheet neutralises that wrapper (along with `#root`, `#app` and `app-root`) so the card renders at **600px wide, x=420** just like every other implementation.

### Pixel parity

`docs/pixel-parity.py` diffs this build against the React reference in every UI state and fails on any difference outside the two regions that hold the framework name. To keep the `.todo-stats` line byte-identical, the remaining-count digits are wrapped in their own `<span>`; leaving the digits and the `items remaining` suffix in one merged text node shifts subpixel glyph shaping by a fraction of a pixel and shows up as a real diff.


## Code structure

| File | Purpose |
|------|---------|
| `src/main.rs` | Entry point, Todo model, state and RSX view |
| `index.html` | Trunk template, `<div id="main">` and `<title>Todo List - Dioxus</title>` |
| `Cargo.toml` | Crate manifest and release profile |
| `Dockerfile` | Containerised build |

Release profile used for the benchmark numbers:

```toml
[profile.release]
opt-level = 'z'
lto = true
codegen-units = 1
```

## Verify

```bash
cd ../../docs
npm run verify      # screenshot sanity
npm run parity      # cross-framework assertions
```
