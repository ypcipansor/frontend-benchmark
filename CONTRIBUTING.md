# Contributing to Frontend Benchmark

Thank you for your interest in contributing to the Frontend Framework Benchmark project!

## How to Contribute

### Adding a New Framework Implementation

1. **Create a new directory** under `implementations/` with your framework name
2. **Follow the specification** in [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) — including the [Visual Parity Contract](BENCHMARK_SPEC.md#visual-parity-contract)
3. **Implement the Todo app** with all required features:
   - Add, toggle, toggle-all and delete todos
   - Filter by All, Active, Completed
   - Display remaining count
   - Pre-populate with 100 todos
   - Complete every 3rd item (3, 6, 9, … → 33 completed, 67 remaining)
   - Use shared CSS from `shared/styles/todo.css`
4. **Create a README** with setup, build and verification instructions
5. **Pass the parity checks** — `docs/parity-check.js` and `docs/pixel-parity.py` must both report full parity (see below)
6. **Capture screenshots** of all five UI states with `docs/screenshot.js`
7. **Build for production** and document bundle sizes

### Framework Implementation Checklist

- [ ] Directory created under `implementations/{framework-name}/`
- [ ] All core features implemented:
  - [ ] Add new todos
  - [ ] Toggle completion status
  - [ ] Toggle all
  - [ ] Delete todos
  - [ ] Filter todos (All/Active/Completed)
  - [ ] Display remaining count
  - [ ] 100 pre-populated todos, every 3rd completed (33 completed / 67 remaining)
- [ ] Shared CSS styles used/copied
- [ ] Page title follows `Todo List - <Framework>`
- [ ] README.md with:
  - [ ] Framework and version
  - [ ] Installation instructions
  - [ ] Development server commands
  - [ ] Build commands
  - [ ] Performance considerations
- [ ] Production build tested
- [ ] Bundle size documented
- [ ] `docs/parity-check.js` reports full parity
- [ ] `docs/pixel-parity.py` reports full parity in every state
- [ ] Screenshots captured and verified for all five states

### Verifying Your Implementation

Visual parity is enforced, not optional. Start your dev server on its benchmark port, then:

```bash
cd docs
npm install
npx playwright install chromium

npm run parity      # DOM, geometry, text and stats must match the other frameworks
npm run capture     # capture all UI states
npm run verify      # reject blank, white, mis-sized or error-free screenshots
npm run pixel       # pixel-diff every state against the reference
npm run optimize    # card-cropped JPEGs for the README
npm run montage     # side-by-side comparison montages
```

A screenshot that is blank, entirely white, not showing the card, or reporting console errors is treated as a failure — fix the implementation rather than the expectation. `npm run pixel` is stricter still: it fails on any pixel difference outside the two regions that hold the framework name, so subpixel text shaping must match too.


### Reporting Issues

When reporting issues, please include:
- Framework and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Browser and OS information

### Benchmark Results

If you're submitting benchmark results:
1. Use the testing methodology from [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md)
2. Include:
   - Hardware specifications
   - Browser version
   - Testing environment details
   - Raw data in JSON format
3. Add results to `benchmarks/results/` (gitignored — CI keeps them as a 90-day artifact)
4. Regenerate the results tables with `npm run update-readme` from `benchmarks/scripts/`

### Code Style

- Follow the existing code style of each framework
- Use framework best practices
- Keep implementations simple and comparable
- Add comments only where necessary for clarity
- Use consistent naming conventions

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/add-framework-name`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request with:
   - Clear description of changes
   - Screenshots of the implementation
   - Bundle size comparison
   - Any notable implementation details

### Guidelines

**DO:**
- Follow the benchmark specification exactly
- Keep implementations comparable
- Document any framework-specific optimizations
- Test on multiple browsers
- Use production builds for measurements
- Pass `docs/parity-check.js`, `docs/verify-screenshots.js` and `docs/pixel-parity.py` before opening a PR

**DON'T:**
- Add unnecessary external dependencies
- Use non-standard optimizations
- Skip required features
- Use different UI/UX from the specification
- Re-centre or resize the card by overriding the shared mount-point rules

## Development Setup

```bash
# Clone the repository
git clone https://github.com/ypcipansor/frontend-benchmark.git
cd frontend-benchmark

# Navigate to a specific implementation
cd implementations/react

# Follow the README in that directory
npm install
npm run dev
```

## Testing Your Changes

Before submitting:

1. **Visual Test**: Run the dev server and manually test all features
2. **Parity Test**: Run `npm run parity` from `docs/` and confirm full parity
3. **Screenshot Test**: Run `npm run capture && npm run verify` and confirm every state passes
4. **Build Test**: Create a production build and verify it works
5. **Bundle Size**: Document the production bundle size
6. **Performance**: Run basic performance tests
7. **Accessibility**: Check basic accessibility with browser DevTools

## Questions?

- Open an issue for questions about contributing
- Check existing implementations for examples
- Review [BENCHMARK_SPEC.md](BENCHMARK_SPEC.md) for requirements

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
