# WebR In-Browser Validation Module — Design Spec

**Date:** 2026-03-19
**Module:** `dev/modules/02_21b_webr-validation.js`
**Manifest position:** In `manifest.json`, between `02_21a_embedded-validation-manifest.js` (index 28) and `02_22_beyond-r40.js` (index 29)
**Purpose:** Reviewer-facing in-browser R validation. NOT part of the app's computation pipeline.

---

## 1. Constraints

- **Validation only.** WebR is never used for app computation. No analysis path calls WebR.
- **Read-only.** The module reads `APP.results` (including `.studies`, `.pooled`, `.heterogeneity`), `APP.config` (confLevel, reMethod, effectMeasure, studyVar, treatmentVar, timeVar, eventVar), and `APP.data` (raw IPD rows) but never writes to any analysis state.
- **Reviewer-initiated.** Runs only on explicit button click — no automatic execution.
- **Progressive tiers.** Tier A ships first; B and C are added incrementally. If a package fails to install, that tier is skipped gracefully.

## 2. WebR Lifecycle

### Singleton
```
webRInstance = null       // lazy-initialized on first validation run
webRLoading = false       // prevents concurrent init
webRPackages = {}         // { metafor: true, survival: false, lme4: false, ... }
```

### Initialization sequence
1. Reviewer clicks "Run R Validation" (either mode)
2. If `webRInstance` is null:
   - `import('https://webr.r-wasm.org/v0.4.4/webr.mjs')`
   - `new WebR()` → `init()`
   - Install packages progressively (each in independent try-catch):
     - Tier A: `metafor`
     - Tier B: `survival`
     - Tier C: `lme4`, `cmprsk`, `flexsurvcure`
   - Record success/failure in `webRPackages`
3. Subsequent runs reuse the singleton (~2-3s)

### Progress milestones
| Progress | Status text |
|----------|-------------|
| 5% | Loading WebR runtime... |
| 20% | WebR initialized |
| 35% | Installing metafor (Tier A)... |
| 50% | Installing survival (Tier B)... |
| 65% | Installing lme4/cmprsk (Tier C)... |
| 70-95% | Running scenarios (incremented per scenario) |
| 100% | Validation complete |

## 3. Tier Registry

Each validation scenario is an object in `WEBR_SCENARIOS`:

```javascript
{
  id: 'dl_two_stage',
  tier: 'A',                          // A=metafor, B=survival, C=lme4+
  label: 'DerSimonian-Laird (Two-Stage)',
  packages: ['metafor'],              // required packages
  source: 'current',                  // 'current' | 'reference' | 'both'
  getRCode: function(data, conf) {},  // generates R code string from data + confLevel
  getJSValues: function(results) {},  // extracts JS values from APP.results (passed as param)
  tolerances: { pooled: 0.001, se: 0.001, tau2: 0.001, i2: 1.0, ci: 0.002 },
  transform: 'log'                    // 'log' for ratio measures, 'identity' for MD/SMD
}
```

**`source` field semantics:**
- `'current'`: scenario runs only in "Validate Current Analysis" mode, using loaded data
- `'reference'`: scenario runs only in "Run Reference Benchmarks" mode, using built-in data
- `'both'`: scenario runs in both modes — once with built-in data (reference), once with loaded data (current). When the user clicks either button, only the matching half runs. When both are triggered together, both halves run and are reported separately (e.g., "DL [reference]" and "DL [current]").

**`getJSValues(results)` contract:** Receives `APP.results` as its argument (explicit parameter, not implicit global access). Returns an object like `{ pooled: -0.71, se: 0.18, tau2: 0.31, i2: 92.1, ci_lower: -1.06, ci_upper: -0.36 }`. Field names use the app's normalized schema: `ci_lower`/`ci_upper` (not `ci_lb`/`ci_ub`), `i2` from `results.heterogeneity.i2` (normalized path), `pooled` from `results.pooled.pooled`.

**`getRCode(data, conf)` contract:** Receives study-level data array and `APP.config.confLevel` (0-1 proportion, e.g., 0.95). The function must pass `confLevel` directly to `rma(... level=conf)` — metafor accepts both proportion and percentage, but the app and existing R validation scripts use the 0-1 convention consistently.

### Tier A scenarios (~12, requires metafor)
- DL, REML, PM, SJ, HE, ML two-stage pooling
- HKSJ adjustment
- Prediction intervals
- I-squared confidence intervals (Q-profile)
- Egger's test for publication bias
- Leave-one-out sensitivity analysis
- Fixed-effect (inverse variance) model

### Tier B scenarios (~8, requires survival)
- Frailty Cox model (`coxph + frailty`)
- Kaplan-Meier comparison
- RMST (restricted mean survival time)
- Landmark analysis

### Tier C scenarios (~6, requires lme4/cmprsk/flexsurvcure)
- One-stage GLMM random slope
- Competing risks (Fine-Gray)
- Cure model fraction

### Reference benchmarks (built-in data, always available)
- BCG vaccine trials (13 studies, log RR) — canonical metafor dataset
- Survival dataset matching app's example data

### Runner logic
1. Filter scenarios by available packages (`webRPackages`) and mode (`current`/`reference`/`both`)
2. For each scenario: generate R code → `evalR()` → extract values → compare with tolerances → push result
3. Aggregate pass/fail per tier + overall (skipped tiers excluded from denominator)

### WebR API pattern
WebR's `evalR()` returns a proxy object, not a plain JS value. The extraction pattern:

```javascript
// Return an R list from evalR
const rResult = await webRInstance.evalR(
  'list(est=as.numeric(res$beta), se=as.numeric(res$se), ' +
  'tau2=as.numeric(res$tau2), I2=as.numeric(res$I2))'
);
const rObj = await rResult.toJs();
// Access: rObj.values[0].values[0] = est, rObj.values[1].values[0] = se, etc.
// R NA values become JS null — check with !== null before comparing.
```

Always wrap R return values with `as.numeric()` to ensure scalar extraction. Always call `.toJs()` on proxy objects. Handle R `NA` → JS `null` explicitly.

### IPD data serialization (Tier B/C)
Tier B and C scenarios require raw IPD rows from `APP.data`. Serialization approach:

- Column names read from `APP.config`: `timeVar`, `eventVar`, `treatmentVar`, `studyVar`
- Data serialized as comma-joined vectors: `c(1.2, 3.4, ...)` for each column
- **Row limit:** If `APP.data.length > 5000`, show a warning "Large dataset (N rows) — WebR validation may be slow" but proceed. If `APP.data.length > 20000`, skip Tier B/C with message "Dataset too large for in-browser R (>20K rows). Use the exported R script in RStudio instead."
- Variable names in R code use generic names (`time`, `event`, `trt`, `study`) regardless of the user's column names, with a mapping comment in the script header

### WebR memory safeguards
WebR WASM has ~256MB-1GB memory depending on browser. Safeguards:
- Package installation OOM: caught by existing try-catch, tier skipped
- Evaluation OOM: caught by per-scenario try-catch, reported as error
- No explicit memory monitoring — rely on browser's WASM error propagation

## 4. UI Integration

### Location
Replaces archived content in Help → Statistical Validation tab. The existing embedded validation manifest (02_21a) is retained below the WebR section as supplementary build-time evidence.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ WebR: In-Browser R Validation              [badge]      │
│ Runs metafor/survival/lme4 via WebAssembly.             │
│ No server needed. First load ~30-60s.                   │
│                                                         │
│ [Validate Current Analysis]  [Run Reference Benchmarks] │
│                                                         │
│ ┌─ Progress ────────────────────────────────────────┐   │
│ │ spinner Installing metafor...      [======  35%]  │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Tier A: Core Meta-Analysis (metafor) ────────────┐  │
│ │ Metric       │ App (JS) │ R      │ Diff  │ Pass   │  │
│ │ Pooled (log) │ -0.7145  │-0.7145 │0.0000 │  Y     │  │
│ │ SE           │  0.1793  │ 0.1793 │0.0000 │  Y     │  │
│ │ tau-squared  │  0.3088  │ 0.3088 │0.0000 │  Y     │  │
│ │ I-squared    │ 92.12    │ 92.12  │ 0.00  │  Y     │  │
│ │ ...                                               │  │
│ │                                    12/12 PASS      │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Tier B: Survival (survival) ─────────────────────┐  │
│ │ ...                                 8/8 PASS       │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Tier C: Advanced IPD (lme4) ─────────────────────┐  │
│ │ warning lme4 not available in WebR - skipped       │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ Overall: 20/20 PASS (Tier C skipped)                    │
│                                                         │
│ [Copy R Script]  [Copy Results JSON]                    │
│                                                         │
│ ┌─ R Script Preview (scrollable) ───────────────────┐  │
│ │ library(metafor)                                   │  │
│ │ dat <- data.frame(yi = c(...), vi = c(...))        │  │
│ │ res <- rma(yi, vi, method="DL", level=0.95)          │  │
│ │ ...                                                │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Offline Parity Gate (Build-Time) ────────────────┐  │
│ │ 99/99 scenarios pass (embedded 2026-03-12)         │  │
│ │ SHA-256: 635691141709e55e...                        │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Tab integration approach
The module dynamically populates the existing `helpTab-validation` div in `01_body_html.html`. The existing archived benchmark tables are replaced by a `<div id="webrValidationContainer"></div>` placeholder in the HTML template. The JS module injects its UI into this container on `DOMContentLoaded`. This keeps the HTML template minimal and the JS module self-contained.

### UI elements
- **Two buttons:** "Validate Current Analysis" (disabled if no data loaded, tooltip "Load a dataset first") and "Run Reference Benchmarks" (always available). Both are `<button>` elements with native keyboard support (Enter/Space to activate). Both have `aria-label` attributes describing their function.
- **Progress bar** with spinner + text status, `role="progressbar"` and `aria-valuenow`/`aria-valuemax` attributes
- **Results grouped by tier** — each tier section collapsible via `<details>`/`<summary>` (natively keyboard-accessible)
- **Graceful skip messages** for unavailable tiers
- **Badge** on validation tab: Not loaded / Loading / Ready / Error
- **R Script preview** in scrollable `<pre>` block
- **Copy buttons** with toast notifications via `showNotification()` (existing app notification system)
- **Dark mode:** All WebR UI elements use the app's CSS variables (`var(--bg-tertiary)`, `var(--text-secondary)`, etc.) to ensure compatibility with the dark mode toggle

## 5. R Script Generation

Dynamic standalone R script built from current analysis state:

```r
# IPD-Meta-Pro v[build] - R Validation Script
# Generated: [timestamp]
# Dataset: [name], k=[studies], N=[total patients]
# Analysis: [method] [effect measure] at [confLevel]%

if (!require("metafor")) install.packages("metafor")
if (!require("survival")) install.packages("survival")
library(metafor); library(survival)

# ---- Data ----
dat <- data.frame(
  study = c("Study A", "Study B", ...),
  yi = c(-0.89, -1.59, ...),
  vi = c(0.035, 0.007, ...)
)

# ---- Two-Stage: DerSimonian-Laird ----
res_dl <- rma(yi, vi, data=dat, method="DL", level=0.95)
print(res_dl)

# ---- Two-Stage: REML ----
res_reml <- rma(yi, vi, data=dat, method="REML", level=0.95)
print(res_reml)

# ---- HKSJ Adjustment ----
res_hksj <- rma(yi, vi, data=dat, method="DL", test="knha", level=0.95)
print(res_hksj)

# ---- Prediction Interval ----
predict(res_dl, level=0.95)

# ---- Egger's Test ----
regtest(res_dl, model="lm")

# ---- Leave-One-Out ----
leave1out(res_dl)

# ---- [Tier B: conditional on survival IPD] ----
# ipd <- data.frame(time=c(...), event=c(...), treatment=c(...), study=c(...))
# fit <- coxph(Surv(time, event) ~ treatment + frailty(study), data=ipd)
# summary(fit)
```

**Design decisions:**
- `if (!require(...))` guards for fresh R sessions
- Data embedded as literal vectors (no external file deps)
- Each section labeled by tier
- Tier B/C conditional on loaded data type
- Study names sanitized (quotes escaped)
- Script includes build ID + dataset hash in header for traceability

## 6. Comparison Engine

### Per-metric tolerances

| Metric | Tolerance | Rationale |
|--------|-----------|-----------|
| Pooled effect (log scale) | 0.001 | High precision for primary estimate |
| SE | 0.001 | Must match for CI/p-value consistency |
| CI bounds | 0.002 | Compound of pooled + SE rounding |
| tau-squared | 0.001 | Key heterogeneity output |
| I-squared (%) | 1.0 | Percentage scale |
| Q statistic | 0.01 | Chi-square, larger values |
| p-value | 0.005 | Floating-point divergence |
| HR (frailty) | 0.005 | Iterative convergence |
| theta (frailty variance) | 0.01 | EM convergence tolerance |

### Transform handling
- Ratio measures (OR, RR, HR): compare on log scale, display both log and natural
- Difference measures (MD, SMD): compare on identity scale
- Transform set per-scenario in registry, not inferred at runtime

### Pass/fail logic
- **Per-scenario:** All metrics must pass for scenario to pass
- **Per-tier:** Count of passed/total scenarios
- **Overall:** Aggregate across attempted tiers (skipped tiers excluded from denominator)

## 7. Error Handling

### Package failures
- Each package install in independent try-catch
- metafor failure: Tier A falls back to base R weighted mean (limited but functional), badge shows "R (Base)"
- survival failure: Tier B skipped with message
- lme4/cmprsk/flexsurvcure failure: Tier C skipped (expected initially)

### R evaluation failures
- Individual scenario `evalR()` wrapped in try-catch
- Failed scenario reported as "R Error: [message]" in results table
- Runner continues to next scenario

### Data edge cases
- No data loaded + "Validate Current Analysis": button disabled with tooltip
- k=1: heterogeneity scenarios skipped with "k<2, not applicable"
- k=2: prediction interval skipped (needs k>=3 for df=k-2)
- Zero events: R script includes `add=0.5` continuity correction to match JS
- All-zero variance: Q=0, tau-squared=0 — comparison runs, should match exactly

### Network failures
- WebR CDN unreachable: caught at import() stage, badge shows "Error", message "WebR requires internet for first load"
- After first successful load: WASM is browser-cached, works offline

### Security
- All R code generated internally — no user-supplied R code execution
- All rendered output sanitized via a module-local `escapeHtml(str)` utility that escapes `<`, `>`, `&`, `"`, `'`. This function is defined within the module (the app does not have a shared utility for this):
  ```javascript
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
    });
  }
  ```
- No `innerHTML` with unsanitized content — all dynamic values pass through `escapeHtml()` before insertion
- R script export is plain text clipboard copy (no HTML rendering)

## 8. Exposed API

Window-level functions (the module's public surface):

| Function | Purpose |
|----------|---------|
| `runWebRValidation(mode)` | Run validation. mode: 'current', 'reference', or 'both' |
| `generateRScript()` | Returns R script string for current analysis |
| `copyRScript()` | Clipboard copy of R script + toast |
| `copyResultsJSON()` | Clipboard copy of comparison results as JSON |

No other functions are exposed. No existing functions are overridden.

## 9. TruthCert Integration

- Validation results logged via `TruthCert.logStep()`:
  ```javascript
  TruthCert.logStep({
    step: 'webr_validation',
    description: 'WebR in-browser R validation',
    inputHash: datasetContentHash,
    outputHash: resultsHash,
    parameters: { method: 'DL', k: 13, confLevel: 0.95, tiers: 'A,B' },
    validator: 'WebR v0.4.4 + metafor',
    outcome: 'Tier A 12/12, Tier B 8/8, Tier C skipped. Overall 20/20 PASS.'
  });
  ```
- R script header includes app build ID (from `02_21a` manifest: `app_build_id`) and dataset content hash
- Offline parity gate (02_21a) retained as complementary build-time evidence

## 10. Testing Strategy

### Regression test additions (regression_fixed_paths_test.py)
- Static check: `runWebRValidation` function marker present in built HTML
- Static check: `WEBR_SCENARIOS` registry present
- Static check: `generateRScript` function present
- Runtime check: WebR UI elements rendered (buttons, progress container, results div)
- Runtime check: "Validate Current Analysis" button disabled when no data loaded
- Runtime check: Reference benchmark scenarios registered (count > 0)

### Manual verification
- First-load WebR init completes within 60s
- Reference benchmarks produce 12/12 Tier A pass on BCG data
- Current-analysis validation matches offline parity gate results
- Copied R script runs successfully in RStudio
- Copied results JSON is valid and contains all scenario results

### Browser compatibility
- Chrome 120+, Edge 120+, Firefox 120+ (WebR WASM requirement)
- No IE11 or Safari <17 support (WebR limitation, acceptable for reviewer tool)
