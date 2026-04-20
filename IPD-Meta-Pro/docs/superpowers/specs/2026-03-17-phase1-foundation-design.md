# Phase 1: Foundation — Bug Safety, Determinism & Test Coverage

**Date:** 2026-03-17
**Project:** IPD-Meta-Pro (`C:\HTML apps\IPD-Meta-Pro`)
**Goal:** Establish a rock-solid numerical foundation before adding new statistical methods (Phases 3-9)

---

## 1. Problem Statement

IPD-Meta-Pro is a 114,846-line single-HTML IPD meta-analysis application with 919+ functions, 40+ statistical methods, and 100% R parity on DL/REML pooling. However, four audits revealed foundational risks:

| Issue | Count | Severity |
|-------|-------|----------|
| `\|\| fallback` dropping valid zero | ~20 P0 + ~18 P1 (incl. beyond-r40) | **Critical** — silent data corruption |
| `Number()/parseFloat() \|\| 0` patterns | ~60 across all modules | **Critical** — zero-dropping |
| Math.random() unpatched in statistical code | 5 + ~60 | **Critical** — non-reproducible results |
| Unit test coverage | ~2-3% of functions (~28 passing) | **Severe** — no safety net for changes |
| Div balance | 0 (false alarm) | N/A — resolved during audit |
| BOM in smoke test file | 1 file | Minor — prevents Node execution |

These must be fixed before any new statistical method is safe to add.

---

## 2. Success Criteria

1. **Zero `|| fallback` on numeric-zero-valid variables** — all P0 + P1 replaced with `??` (incl. beyond-r40 module)
2. **All statistical Math.random() calls deterministic** — SeededRNG or mulberry32 wrapping verified
3. **Distribution functions validated vs R** — normalCDF, tQuantile, chiSquareQuantile, betaCDF match R to 1e-6
4. **Core MA methods validated vs R** — HE, SJ, ML, PM estimators match metafor to 1e-6
5. **Cox PH validated vs R** — coxRegression matches survival::coxph to 1e-4
6. **Publication bias methods tested** — eggerTest, beggTest, trimAndFill have unit tests
7. **Test count: 28 → 100+** — covering all user-facing numerical outputs
8. **Build passes** — `python dev/build.py build` succeeds, all existing tests green
9. **BOM fixed** in `core_stats_meta_smoke.js` so all test files execute cleanly

---

## 3. Architecture

No architectural changes. All fixes are in-place edits to existing source modules in `dev/modules/`.

**Build system:** `dev/build.py` assembles 35 source modules via manifest into `ipd-meta-pro.html`.

**Known issue:** `02_22b_ipd-integrity-gate.js` is in the manifest but may be missing from disk. Verify before starting work; create stub if needed.

**Test infrastructure:** Node.js VM-isolated unit tests (`dev/tests/`) + Selenium E2E (`dev/build-scripts/`).

---

## 4. Workstream A: Fix `||` Fallback Bugs

### 4.1 P0 Fixes — Zero Is Valid

Replace `||` with `??` (nullish coalescing) for all instances where the variable can legitimately be zero. Grep each file for the exact pattern before editing — agent audit may have phantom entries.

**CRITICAL WARNING:** ES2020 prohibits mixing `??` with `||` without parentheses. `a ?? b || c` is a SyntaxError that kills the entire `<script>` block. Always use `a ?? (b || c)` or `(a ?? b) || c`.

| ID | File | Pattern | Fix |
|----|------|---------|-----|
| P0-1 | `02_08_meta-analysis.js` | `tau2 \|\| 1e-6` | `tau2 ?? 1e-6` |
| P0-2 | `02_20_virtual-scroller.js` | `pooled.tau2 \|\| 0.1` (OIS calc) | `pooled.tau2 ?? 0.1` |
| P0-3..8 | `02_20_virtual-scroller.js` | `het.tau2 \|\| 0` (6 instances: std residual, LOO, display, text) | `het.tau2 ?? 0` |
| P0-9 | `02_02_advanced-features.js` | `results.pooled.tau2 \|\| 0` (weight calc) | `results.pooled.tau2 ?? 0` |
| P0-10 | `02_02_advanced-features.js` | `s.yi \|\| s.effect \|\| 0` | `s.yi ?? (s.effect ?? 0)` |
| P0-11 | `02_02_advanced-features.js` | `params.tau2 \|\| 0.04` (power calc) | `params.tau2 ?? 0.04` |
| P0-12 | `02_17_run-analysis.js` | `pooled.tau2 \|\| 0` (results display) | `pooled.tau2 ?? 0` |
| P0-13 | `02_18_network-meta-analysis.js` | `het.tau2 \|\| het.tau_sq \|\| 0` | `het.tau2 ?? (het.tau_sq ?? 0)` |
| P0-14 | `02_18_network-meta-analysis.js` | `r.het?.tau2 \|\| r.tau2 \|\| 0` | `r.het?.tau2 ?? (r.tau2 ?? 0)` |
| P0-15 | `02_01_math-utils.js` | `nmaResults.effects[i] \|\| 0` | `nmaResults.effects[i] ?? 0` |
| P0-16 | `02_01_math-utils.js` | `(effects[i] \|\| 0) - (effects[j] \|\| 0)` | `(effects[i] ?? 0) - (effects[j] ?? 0)` |
| P0-17 | `export_schema_module.js` | `s.events \|\| ''` | `s.events ?? ''` |

**Note:** P0-11 and P0-12 from original audit in `02_03_collaboration.js` (`s.yi || s.effect || 0`) must be verified against actual file — reviewer flagged as potentially phantom. Grep before editing.

### 4.1b P0 Fixes — `02_22_beyond-r40.js` (~25 instances)

The beyond-r40 module was **missing from the original audit**. It contains ~25 `Number() || 0` patterns on effect sizes, tau2, I2, and SE values. Full grep-and-fix pass required:

```
Patterns to find and fix:
  Number(...) || 0        → isFinite guard
  .tau2 || 0              → .tau2 ?? 0
  .I2 || 0                → .I2 ?? 0
  .effect || 0            → .effect ?? 0
  .se || 0.1              → .se ?? 0.1
```

### 4.2 P1 Fixes — Edge-Case Risk

| ID | File | Pattern | Fix |
|----|------|---------|-----|
| P1-1 | `02_01_math-utils.js` | `rmst.variance \|\| 0` | `rmst.variance ?? 0` |
| P1-2 | `02_01_math-utils.js` | `nmaResults.ses[i] \|\| 0.1` | `nmaResults.ses[i] ?? 0.1` |
| P1-3 | `02_02_advanced-features.js` | `s.vi \|\| s.variance \|\| 0.01` | `s.vi ?? (s.variance ?? 0.01)` |
| P1-4 | `02_18_network-meta-analysis.js` | `d.se \|\| d.SE \|\| 0.1` | `d.se ?? (d.SE ?? 0.1)` |
| P1-5 | `02_18_network-meta-analysis.js` | `r.pooledSE \|\| r.se \|\| 0.1` | `r.pooledSE ?? (r.se ?? 0.1)` |
| P1-6 | `02_01_math-utils.js` | `se \|\| 0.1` | `se ?? 0.1` |
| P1-7 | `02_01_math-utils.js` | `s.cal_se \|\| 0.1` | `s.cal_se ?? 0.1` |
| P1-8..17 | `02_20_virtual-scroller.js` + 4 other files | `het.I2 \|\| 0` (10 instances total) | `het.I2 ?? 0` |

### 4.3 parseFloat/Number Chains (~60 instances)

Full sweep of all modules required. The initial audit found 4, but the reviewer identified ~60 across all files.

| Pattern | Fix Template |
|---------|-------------|
| `parseFloat(x) \|\| fallback` | `const n = parseFloat(x); isFinite(n) ? n : fallback` |
| `Number(x) \|\| fallback` | `const n = Number(x); isFinite(n) ? n : fallback` |
| `+x \|\| fallback` | `const n = +x; isFinite(n) ? n : fallback` |

**Files to sweep:** All `.js` files in `dev/modules/`, especially `02_22_beyond-r40.js` (~25), `02_18_network-meta-analysis.js` (~15), `02_01_math-utils.js` (~10), `02_20_virtual-scroller.js` (~5).

---

## 5. Workstream B: Fix Math.random Determinism

### 5.1 BUG — `02_22_beyond-r40.js` (5 instances)

**Problem:** `normalSample()`, jittering functions, and `laplace()` use raw `Math.random()` without SeededRNG wrapping.

**Fix:** Add `rng` as an **additional optional parameter** (preserving existing `mean, sd` signature):
```javascript
// CORRECT — preserves existing signature
function normalSample(mean, sd, rng) {
    rng = rng || Math.random;
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

**WARNING:** The original `normalSample(mean, sd)` signature must be preserved — existing call sites pass mean and sd. Breaking this would silently corrupt the reconstruction uncertainty analysis.

### 5.2 CRITICAL — `02_18_network-meta-analysis.js` (~60 instances)

**Problem:** Line ~29650 defines `const rng = ...createSeededRNG(20240101)...` but downstream code calls raw `Math.random()` instead of `rng()`. The `rng` variable is **function-scoped** and inaccessible from top-level functions like `mcmc()`, `runModelMCMC()`, `bootstrap()`.

**Fix strategy — use `SeededRNG.patchMathRandom(seed)` with try/finally:**

The spec originally suggested replacing `Math.random()` with `rng()`, but since `rng` is out of scope for most call sites, the correct approach is:

1. At each top-level analysis entry point (GOSH, MCMC, bootstrap, sensitivity), wrap with `SeededRNG.patchMathRandom(seed)` in a try/finally block
2. Check if `SeededRNG.withDeterminism(seed, fn)` already exists — if so, use it (handles cleanup automatically)
3. Leave ID generation (`Math.random().toString(36)`) and demo data generation as-is
4. Remove the unused `const rng = ...` at line ~29650 (dead code)

```javascript
// PATTERN: wrap entry points, not individual calls
function runGOSHAnalysis(studies, opts) {
    SeededRNG.patchMathRandom(opts.seed || 42);
    try {
        // ... all Math.random() calls inside are now deterministic
    } finally {
        SeededRNG.restoreMathRandom();
    }
}
```

**Risk:** Forgetting `restoreMathRandom()` in error paths contaminates all subsequent Math.random(). The try/finally pattern prevents this.

**Scope:** ~40 instances in MCMC/bootstrap/GOSH/sensitivity paths. ~20 in demo data (leave as-is).

### 5.3 REVIEW — MICE and k-fold (10 instances)

**Problem:** MICE imputation and k-fold cross-validation use raw Math.random(). These are UI-triggered, not in the main `runAnalysis()` path.

**Fix:** Add `SeededRNG.patchMathRandom(seed)` at the entry of `runMICEFromModal()` and `kFoldCrossValidation()` for user-reproducible results.

### 5.4 Verification

After fixes, add a **determinism regression test**:
- Run full analysis twice with seed=42 on BCG benchmark dataset
- Assert all outputs identical: pooled estimate, CI, tau2, I2, p-values, PI, LOO, trim-fill
- Run MCMC twice, assert chain values identical
- Run GOSH twice, assert subset results identical

---

## 6. Workstream C: Expand Test Coverage

### 6.1 Priority 1 — Distribution Functions (vs R)

| Function | R Reference | Tolerance |
|----------|-------------|-----------|
| `Stats.normalCDF(x)` | `pnorm(x)` | 1e-6 |
| `Stats.normalQuantile(p)` | `qnorm(p)` | 1e-6 |
| `Stats.tCDF(x, df)` | `pt(x, df)` | 1e-6 |
| `Stats.tQuantile(p, df)` | `qt(p, df)` | 1e-6 |
| `Stats.chiSquareCDF(x, df)` | `pchisq(x, df)` | 1e-6 |
| `Stats.chiSquareQuantile(p, df)` | `qchisq(p, df)` | 1e-6 (Newton-Raphson should achieve this) |
| `Stats.betaCDF(x, a, b)` | `pbeta(x, a, b)` | 1e-6 |
| `Stats.linearRegression(x, y)` | `lm(y ~ x)` | 1e-6 |
| `Stats.weightedMean(x, w)` | `weighted.mean(x, w)` | 1e-10 |

**Test values:** Pre-computed from R, hardcoded as fixtures. Cover edge cases: x=0, x=negative, df=1, df=2, df=100, p=0.001, p=0.999.

### 6.2 Priority 2 — Meta-Analysis Methods (vs metafor)

| Method | R Reference | Dataset |
|--------|-------------|---------|
| `randomEffectsHE()` | `rma(method="HE")` | BCG |
| `randomEffectsSJ()` | `rma(method="SJ")` | BCG |
| `randomEffectsML()` | `rma(method="ML")` | BCG |
| `randomEffectsPM()` | `rma(method="PM")` | BCG |
| `confidenceInterval()` | Manual z/t CI | Multiple |
| `predictionInterval()` | `predict(rma(...))` | BCG |

### 6.3 Priority 3 — Survival Analysis (vs survival)

| Function | R Reference | Tolerance |
|----------|-------------|-----------|
| `coxRegression()` | `coxph(Surv(time,status) ~ trt)` | 1e-4 |
| `kaplanMeier()` | `survfit(Surv(time,status) ~ 1)` | 1e-6 |
| `logRankTest()` | `survdiff(Surv(time,status) ~ trt)` | 1e-4 |

**Fixture:** Generate synthetic IPD from R with `set.seed(42)`: 200 patients (primary) + 50 patients (edge-case), 2 arms, exponential survival. Embed as test data.

### 6.4 Priority 4 — Publication Bias (vs meta/metafor)

| Function | R Reference |
|----------|-------------|
| `eggerTest()` | `regtest(rma(...))` |
| `beggTest()` | `ranktest(rma(...))` |
| `trimAndFill()` | `trimfill(rma(...))` |

### 6.5 Test File Structure

```
dev/tests/
  core_stats_meta_test.js       (existing — 30 assertions)
  core_stats_meta_smoke.js      (existing — 7 tests)
  distribution_functions_test.js (NEW — ~30 assertions)
  meta_methods_test.js           (NEW — ~20 assertions)
  survival_analysis_test.js      (NEW — ~15 assertions)
  publication_bias_test.js       (NEW — ~10 assertions)
  determinism_test.js            (NEW — ~5 assertions)
  fixtures/
    r_distribution_values.json   (NEW — pre-computed R reference values)
    r_meta_bcg.json              (NEW — metafor BCG results for all methods)
    r_survival_synthetic.json    (NEW — synthetic IPD + coxph results)
    r_pubbias_bcg.json           (NEW — regtest/ranktest/trimfill results)
```

---

## 7. Workstream D: parseFloat Safety Audit (~60 instances)

Full sweep of ALL `.js` files in `dev/modules/` for these patterns:
- `parseFloat(x) || default` — replace with `isFinite` guard
- `Number(x) || default` — same treatment
- `+x || default` — same treatment

The reviewer found ~60 instances across all modules (initial audit found only 4). The `02_22_beyond-r40.js` module alone has ~25.

Fix template:
```javascript
// BEFORE (drops zero):
const val = parseFloat(x) || fallback;

// AFTER (safe):
const parsed = parseFloat(x);
const val = isFinite(parsed) ? parsed : fallback;
```

**Approach:** Run `grep -n 'parseFloat\|Number(' dev/modules/*.js | grep '|| '` to get the full list, then fix each in context.

---

## 8. Out of Scope (Phase 1)

- New statistical methods (Phase 3+)
- UI/UX changes (Phase 10)
- Accessibility improvements (Phase 2)
- F1000 manuscript (Phase 11)
- Performance optimization
- Code splitting / lazy loading

---

## 9. Verification Plan

### Pre-fix snapshot (capture BEFORE any changes)
- Run BCG benchmark analysis, save all numerical outputs (pooled, CI, tau2, I2, PI, LOO)
- Run a homogeneous dataset (tau2=0), save outputs — this is the critical "zero case"
- Save GOSH/MCMC outputs for before/after comparison (these WILL change — expected)

### Post-fix gates
1. **Unit tests pass:** `node dev/tests/*.js` — all green (including new tests)
2. **Selenium tests pass:** `python dev/build-scripts/selenium_test.py` — 17/17
3. **Build succeeds:** `python dev/build.py build` — no errors
4. **Determinism test:** Same seed → identical outputs on two consecutive runs (new test)
5. **Zero-value regression test:** Automated test with homogeneous data asserting tau2=0.0000, I2=0.0, effect=0 displayed correctly
6. **R parity gate:** Existing 72-row validation still 100% pass
7. **parseFloat sweep verified:** All `parseFloat/Number || fallback` instances in analysis code confirmed safe or fixed
8. **No `?? ... ||` mixing:** Grep for `??.*\|\|` and `\|\|.*??` on same line without parens — must find 0

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| `??` not supported in old browsers | Target ES2020+. IPD-Meta-Pro already uses optional chaining (`?.`) which is ES2020. |
| **`?? ... \|\|` mixing is a SyntaxError** | ES2020 prohibits `a ?? b \|\| c` without parens — kills entire `<script>` block. Always wrap: `a ?? (b \|\| c)`. Add grep gate to verification plan. |
| Changing `\|\|` to `??` breaks non-zero falsy cases (empty string, NaN) | Each replacement verified: `??` only differs from `\|\|` for `0`, `""`, `false`. For numeric vars, only `0` matters. |
| PRNG wrapping changes output values | Expected — results become deterministic. Existing R parity benchmarks use pre-seeded data, unaffected. Pre-fix snapshot captures before state. |
| `restoreMathRandom()` forgotten in error path | Use try/finally pattern exclusively. Check for existing `SeededRNG.withDeterminism()` helper. |
| `normalSample()` signature break | Add `rng` as 3rd optional param, NOT as replacement for existing `mean, sd` params. |
| Missing manifest module `02_22b` | Check at start; create stub or remove from manifest. |
| New tests reveal existing bugs | Good — fix them. Track as P0s with IDs. |

---

## 11. Estimated Scope

| Workstream | Files Touched | Edits |
|-----------|---------------|-------|
| A: `\|\|` fixes (P0+P1+beyond-r40) | 8 source modules | ~80 line changes |
| B: Math.random determinism | 3 source modules | ~80 line changes |
| C: Tests + BOM fix | 5 new test files + fixtures + 1 fix | ~500 new lines |
| D: parseFloat/Number sweep (~60) | 6 source modules | ~60 line changes |
| E: Pre-fix snapshot + verification | Scripts | ~50 lines |
| **Total** | ~12 files | ~770 lines |
