# Frontend Benchmark Specification

## Overview
This benchmark compares the performance and characteristics of various frontend frameworks by implementing the same application across different technologies.

## Frameworks to Benchmark

1. **JavaScript/TypeScript Frameworks**
   - React
   - Vue.js
   - Angular

2. **Rust WebAssembly Frameworks**
   - Leptos (CSR mode)
   - Yew
   - Dioxus

3. **Server-Side Rendering**
   - Laravel Blade.php

## Benchmark Application

The benchmark application is a **Todo List** with the following features:

### Core Features
1. Display a list of todos
2. Add new todos
3. Mark todos as complete/incomplete
4. Delete todos
5. Filter todos (All, Active, Completed)
6. Display count of remaining todos

### Technical Requirements

- Initial load with **100 pre-populated todos**
- **Every 3rd item completed** — items 3, 6, 9, …, 99, i.e. **33 completed** and **67 remaining**
- Real-time UI updates
- Local state management (no backend API calls for core functionality)
- Responsive design
- Accessibility considerations (ARIA labels, keyboard navigation)

### Visual Parity Contract

All implementations must render an **identical** screen. These values are asserted automatically by [`docs/parity-check.js`](docs/parity-check.js), which drives all seven dev servers through the same script and fails on any deviation:

| Element | Selector | Required value in a 1440×1024 viewport |
|---------|----------|----------------------------------------|
| Card | `.todo-app` | **600px wide**, `x = 420` |
| Header | `.todo-header` | identical across frameworks |
| Input | `.todo-input` | identical across frameworks |
| Filters | `.todo-filters` | identical across frameworks |
| List | `.todo-list` | identical across frameworks |
| Footer | `.todo-footer` | identical across frameworks |

Required text content:

| Check | Expected |
|-------|----------|
| Item labels | `Todo item 1` … `Todo item 100` |
| Checked boxes | **33** (multiples of 3, 1-based) |
| Stats | `<n> items remaining` where `n = 67` initially |
| `Active` filter | **67** items |
| `Completed` filter | **33** items |
| Add one todo | **101** items |
| Delete it | **100** items |
| Console | no errors or uncaught exceptions |
| Page title | `Todo List - <Framework>` |

To make the card the only flex child of `<body>`, the shared stylesheet neutralises every mount point (`#root`, `#app`, `#main`, `app-root`) with `display: contents`. Implementations that mount into a wrapper must not override this.

Parity is checked at two levels:

- [`docs/parity-check.js`](docs/parity-check.js) asserts DOM structure, geometry, content and state.
- [`docs/pixel-parity.py`](docs/pixel-parity.py) diffs each framework's screenshot against the React reference in every UI state and fails on any difference outside the two regions that hold the framework name (the header badge and the footer).

Because that pixel check is strict, the remaining-count line must be segmented identically everywhere: wrap the digits in their own element rather than emitting `<count> items remaining` as a single merged text node. Different text-node segmentation changes subpixel glyph shaping and produces a real diff even when the rendered text is the same.

## Metrics to Measure

### Performance Metrics
1. **Initial Load Time**
   - Time to First Byte (TTFB)
   - First Contentful Paint (FCP)
   - Time to Interactive (TTI)
   - Total Bundle Size (JS + CSS + WASM)

2. **Runtime Performance**
   - Time to add 1000 todos
   - Time to toggle all todos (100 items)
   - Time to filter todos
   - Memory usage (heap size)
   - Frame rate during interactions

3. **Build Metrics**
   - Build time
   - Development server startup time
   - Hot Module Replacement (HMR) speed

### Developer Experience Metrics
1. Lines of code
2. Build complexity
3. Type safety
4. Documentation quality
5. Learning curve assessment

## Testing Methodology

### Environment
- **Browser**: Chrome (latest stable)
- **Hardware**: Consistent testing environment
- **Network**: Simulated 3G and Fast 3G
- **CPU**: 4x slowdown for performance testing

### Test Scenarios
1. **Cold Start**: Clear cache, measure initial load
2. **Warm Start**: With cache, measure subsequent loads
3. **Stress Test**: Add/remove/toggle 1000 items
4. **Memory Test**: Monitor memory over 5 minutes of interaction

### Tools
- Lighthouse for performance audits
- Chrome DevTools Performance tab
- WebPageTest for network testing
- Custom timing scripts for framework-specific metrics

## Implementation Guidelines

Each implementation should:
1. Follow framework best practices
2. Use official routing if applicable
3. Implement the same visual design (provided CSS)
4. Use production builds for measurements
5. Avoid external dependencies where possible (except framework core)

## Results Format

Results are published in the **Benchmark Results** section of [README.md](README.md), which is regenerated automatically from the comprehensive run JSON by `benchmarks/scripts/update-readme-results.js`. The raw JSON is a CI artifact rather than a committed file; [RESULTS_TEMPLATE.md](RESULTS_TEMPLATE.md) documents its shape.

Reported output includes:

- Performance metric tables
- Bundle size comparisons
- Screenshots of every implementation and UI state (see the [project README](README.md#visual-parity--every-framework-every-state))
- Developer experience notes
- Recommendations based on use cases
