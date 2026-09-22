# Leptos Todo Implementation

Leptos (Rust/WebAssembly) implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the Leptos build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/leptos/all.jpg) | ![Active](../../docs/images/leptos/active.jpg) | ![Completed](../../docs/images/leptos/completed.jpg) | ![Input-filled](../../docs/images/leptos/input-filled.jpg) | ![Empty state](../../docs/images/leptos/empty-state.jpg) |

Optimized crops live in [`docs/images/leptos/`](../../docs/images/leptos/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/leptos/`](../../docs/screenshots/leptos/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Framework | Leptos 0.8 (`csr` feature) |
| Language | Rust, compiled to WebAssembly |
| Build tool | [Trunk](https://trunkrs.dev/) |
| Bindings | `wasm-bindgen`, `web-sys` |

## Prerequisites

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
```

## Running it

```bash
trunk serve --open                 # http://localhost:8080
trunk build --release              # production build in dist/
```

In the benchmark the built `dist/` is served as a static site on a fixed port:

```bash
trunk build --release
python3 -m http.server 4004 --bind 127.0.0.1 --directory dist
```

The build emits `dist/index.html`, a JS loader and a `*_bg.wasm` binary.

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete

The completion rule uses a 1-based index, which is the reference the JS implementations were aligned to:

```rust
let initial_todos: Vec<Todo> = (1..=100)
    .map(|i| Todo { id: i, text: format!("Todo item {}", i), completed: i % 3 == 0 })
    .collect();
```

## Styling and layout parity

`index.html` links the shared stylesheet directly, so Leptos and the other Rust implementations reuse the single source of truth:

```html
<link rel="stylesheet" href="../../shared/styles/todo.css">
```

The Docker build context includes the repository root so Trunk can resolve that path, and the same stylesheet neutralises every mount point so the card renders at **600px wide, x=420** just like the rest.

### Pixel parity

`docs/pixel-parity.py` diffs this build against the React reference in every UI state and fails on any difference outside the two regions that hold the framework name. To keep the `.todo-stats` line byte-identical, the remaining-count digits are wrapped in their own `<span>`; leaving the digits and the `items remaining` suffix in one merged text node shifts subpixel glyph shaping by a fraction of a pixel and shows up as a real diff.


## Code structure

| File | Purpose |
|------|---------|
| `src/main.rs` | Entry point, Todo model, signals and view |
| `index.html` | Trunk HTML template, `<title>Todo List - Leptos</title>` |
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
