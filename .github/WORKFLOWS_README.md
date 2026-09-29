# GitHub Actions Workflows - Quick Reference

## Available Workflows

### 1. Basic Checks ⚡
**File:** `.github/workflows/basic-checks.yml`

**Purpose:** Fast validation (no full builds)

**Runs on:**
- Every push to main/develop
- Every pull request
- Manual trigger

**Duration:** ~5-10 minutes

**What it checks:**
- ✅ Repository structure
- ✅ JavaScript dependencies resolve
- ✅ Rust code compiles
- ✅ PHP syntax valid
- ✅ Docker configs valid

**Status:** Required for merge

---

### 2. Frontend Benchmark CI 🏗️
**File:** `.github/workflows/benchmark.yml`

**Purpose:** Complete builds with artifacts

**Runs on:**
- Push to main/develop
- Pull requests
- Manual trigger

**Duration:** ~90-120 minutes

**What it does:**
- ✅ Build all 7 frameworks
- ✅ Upload build artifacts
- ✅ Docker image builds
- ✅ Verify outputs

**Status:** Optional (recommended for main)

---

## Job Matrix

| Framework | Basic Check | Full Build | Timeout |
|-----------|------------|------------|---------|
| React | ✅ | ✅ | 15 min |
| Vue | ✅ | ✅ | 15 min |
| Angular | ✅ | ✅ | 20 min |
| Leptos | ✅ | ✅ | 45 min |
| Yew | ✅ | ✅ | 45 min |
| Dioxus | ✅ | ✅ | 45 min |
| Blade | ✅ | ✅ | 10 min |

---

## Manual Trigger

To manually run a workflow:

1. Go to **Actions** tab
2. Select workflow (Basic Checks or Frontend Benchmark CI)
3. Click **Run workflow**
4. Choose branch
5. Click **Run workflow** button

---

## Viewing Results

### In GitHub UI:
1. Go to **Actions** tab
2. Click on workflow run
3. Click on job to see logs
4. Download artifacts (if available)

### Status Badges:

Add to README.md:
```markdown
![Basic Checks](https://github.com/analisaperlengkapan/frontend-benchmark/actions/workflows/basic-checks.yml/badge.svg)
![Build](https://github.com/analisaperlengkapan/frontend-benchmark/actions/workflows/benchmark.yml/badge.svg)
```

---

## Troubleshooting

### Workflow fails on npm install
**Cause:** Missing dependencies or network issue  
**Fix:** Check package.json, retry workflow

### Rust build times out
**Cause:** WASM compilation is slow  
**Fix:** Increase timeout in workflow (currently 45 min)

### Docker build fails
**Cause:** Dockerfile syntax or missing files  
**Fix:** Test locally: `docker build -t test .`

### All checks fail
**Cause:** Repository structure changed  
**Fix:** Check required files exist (see basic-checks.yml)

---

## Local Testing

Before pushing, test locally:

```bash
# Test JavaScript build
cd implementations/react && npm install && npm run build

# Test Rust build
cd implementations/leptos && cargo check

# Test PHP syntax
cd implementations/blade && php -l index.php

# Test Docker
docker compose config
```

---

## For Maintainers

### Branch Protection

Recommended settings for `main`:
1. ✅ Require status checks to pass
2. ✅ Select: "All Basic Checks Passed"
3. ✅ Select: "Capture / verify / parity / pixel" (the **Visual Parity** job)
4. ✅ Select: "Regression tests"
5. ✅ Select: "Regression tests (no captures)"
6. ✅ Require branches to be up to date

> **Visual Parity must be a required status check.** The results-PR auto-merger
> enforces it for benchmark-results PRs, but ordinary PRs rely on branch
> protection: without it here, a normal PR could merge before the
> capture/verify/parity/pixel gate has run. Branch protection is a repository
> setting (not a file), so it is listed here to keep the two in sync.
>
> **The regression suite is two more jobs** in the same workflow. The suite
> re-runs the whole capture pipeline, and it used to run twice inside one job
> (once normally, once with the captures hidden to prove self-containment),
> which pushed that job against the runner's ~30m ceiling and got it evicted
> mid-run. It is now split into "Regression tests" and
> "Regression tests (no captures)" so no job runs the suite twice. Both live in
> `visual-parity.yml`, so requiring the workflow (for the auto-merger) and all
> three check names (branch protection) covers the whole gate.

### Artifact Retention

Build artifacts kept for **7 days**

To change: Edit `retention-days` in workflow

### Adding New Framework

1. Add to `basic-checks.yml` (quick check)
2. Add to `benchmark.yml` (full build)
3. Test locally first
4. Update this README

---

## Cost Management

**GitHub Actions Minutes:**
- Free tier: 2,000 min/month
- Basic Checks: ~10 min/run
- Full Build: ~120 min/run

**Optimization:**
- Run full build only on main
- Use caching where possible
- Parallel execution enabled

---

## Need Help?

📖 Full documentation: `CI_CD_GUIDE.md`  
🐛 Issues: Open GitHub issue  
💬 Questions: Check CI_CD_GUIDE.md first

---

**Last updated:** 2025-11-04  
**Maintained by:** @copilot
