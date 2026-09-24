# Blade.php Todo Implementation

Blade.php implementation of the shared benchmark Todo app. See the [project README](../../README.md) for the specification and the cross-framework [parity checks](../../docs/parity-check.js).

## Screenshots

All five views of the Blade.php build, captured from its own dev server. They are identical to every other implementation apart from the framework name in the badge and footer.

| All (100 / 67 remaining) | Active (67) | Completed (33) | Input filled | Empty state |
|:---:|:---:|:---:|:---:|:---:|
| ![All](../../docs/images/blade/all.jpg) | ![Active](../../docs/images/blade/active.jpg) | ![Completed](../../docs/images/blade/completed.jpg) | ![Input-filled](../../docs/images/blade/input-filled.jpg) | ![Empty state](../../docs/images/blade/empty-state.jpg) |

Optimized crops live in [`docs/images/blade/`](../../docs/images/blade/); the full-resolution 1440×1024 PNGs are in [`docs/screenshots/blade/`](../../docs/screenshots/blade/). The [project README](../../README.md) shows the same five views side by side across all seven frameworks.

## Tech stack

| | |
|---|---|
| Templating | Laravel Blade, used standalone via `illuminate/view` 11 |
| Runtime | PHP 8.2+ |
| Interactivity | Vanilla JavaScript |
| Dependency manager | Composer |

This is the Blade **templating engine** running on its own, not a full Laravel application. It is the only server-rendered implementation in the benchmark, which is exactly what makes the comparison interesting.

## Prerequisites

```bash
composer install
```

If `vendor/` is missing the entry point exits with a clear message rather than a fatal error:

```
Please run "composer install" in implementations/blade directory.
```

## Running it

```bash
composer install
php -S 127.0.0.1:4007 -t .        # http://127.0.0.1:4007
```

`index.php` boots the Blade view factory by hand — compiler, engine resolver, view finder and factory — then renders the single view:

```php
$bladeCompiler = new BladeCompiler($filesystem, $cachePath);
$viewResolver->register('blade', fn () => new CompilerEngine($bladeCompiler));
$viewFinder = new FileViewFinder($filesystem, [$viewsPath]);
$viewFactory = new Factory($viewResolver, $viewFinder, $eventDispatcher);

echo $viewFactory->make('index', ['todos' => $todos])->render();
```

## Shared behaviour

The app implements the benchmark contract exactly:

- **100 todos** on first render — `Todo item 1` … `Todo item 100`
- **Every 3rd item completed** — items 3, 6, 9, …, 99 → **33 completed, 67 remaining**
- Filters **All / Active / Completed**, plus add, toggle, toggle-all and delete

The initial data is generated server-side and handed to the view:

```php
for ($i = 1; $i <= 100; $i++) {
    $todos[] = [
        'id' => $i,
        'text' => "Todo item $i",
        'completed' => $i % 3 === 0,
    ];
}
```

The remaining count is computed in Blade from the same data, so the server-rendered first paint already agrees with the client-side frameworks:

```blade
<div class="todo-stats" id="todo-stats">
    <span id="remaining-count">{{ collect($todos)->where('completed', false)->count() }}</span> items remaining
</div>
```

### A note on fairness

Interaction after first paint is handled by vanilla JavaScript so that the comparison against the other six frameworks is about rendering and reactivity, not about network round-trips. Blade earns its keep at first paint: the list and stats are in the HTML before any script runs.

The client-side `render()` mirrors the server output exactly — it emits `<li class="todo-item">` elements into the same container the Blade view uses, which keeps the DOM identical to the other frameworks (and is one of the parity fixes recorded in the main README).

### Pixel parity

`docs/pixel-parity.py` diffs this build against the React reference in every UI state and fails on any difference outside the two regions that hold the framework name. To keep the `.todo-stats` line byte-identical, the remaining-count digits are wrapped in their own `<span>`; leaving the digits and the `items remaining` suffix in one merged text node shifts subpixel glyph shaping by a fraction of a pixel and shows up as a real diff.


## Code structure

| File | Purpose |
|------|---------|
| `index.php` | Bootstraps Blade, builds the 100 todos, renders the view |
| `views/index.blade.php` | The Blade template and client-side JavaScript |
| `style.css` | Byte-identical copy of the shared stylesheet (checked by `npm run check:css`) |
| `composer.json` | Composer manifest |
| `cache/` | Blade compiled-view cache (gitignored) |

## Verify

```bash
cd ../../docs
npm run verify      # screenshot sanity
npm run parity      # cross-framework assertions
```
