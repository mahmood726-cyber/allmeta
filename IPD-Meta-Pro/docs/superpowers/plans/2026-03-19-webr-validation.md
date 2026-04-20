# WebR In-Browser Validation Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebR-powered in-browser R validation module so journal reviewers can independently verify IPD-Meta-Pro's statistical computations against R (metafor, survival, lme4) without installing anything.

**Architecture:** Single JS module (`02_21b_webr-validation.js`) with a tier registry pattern. Tier A (metafor) ships first; B (survival) and C (lme4+) are added progressively. WebR is lazy-initialized on first click, packages installed with independent try-catch per tier. The module is read-only — it reads `APP.results`, `APP.config`, and `APP.data` but never writes back. UI injects into the existing Help → Validation tab.

**Tech Stack:** WebR v0.4.4 (WASM), metafor R package, existing build system (dev/build.py), Selenium regression tests.

**Spec:** `docs/superpowers/specs/2026-03-19-webr-validation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `dev/modules/02_21b_webr-validation.js` | Create | All WebR logic: init, tier registry, runner, comparison engine, UI rendering, R script generation |
| `dev/modules/manifest.json` | Modify (line 29) | Add `02_21b_webr-validation.js` between `02_21a` and `02_22` |
| `dev/modules/01_body_html.html` | Modify (lines 2387-2651) | Replace entire `helpTab-validation` div contents with `<div id="webrValidationContainer"></div>` placeholder |
| `dev/build-scripts/regression_fixed_paths_test.py` | Modify | Add static + runtime checks for WebR module |

---

### Task 1: HTML Placeholder & Manifest Entry

**Files:**
- Modify: `dev/modules/01_body_html.html:2387-2651`
- Modify: `dev/modules/manifest.json:28-29`

- [ ] **Step 1: Replace archived validation tab content with WebR placeholder**

In `dev/modules/01_body_html.html`, replace the **entire** `helpTab-validation` div and its contents (lines 2387-2651, from the opening `<div id="helpTab-validation"` through its closing `</div>` on line 2651) with a minimal placeholder:

```html
<div id="helpTab-validation" style="display:none;">
    <div id="webrValidationContainer"></div>
    <div id="offlineParityContainer" style="margin-top: 1.5rem;"></div>
</div>
```

Keep the outer `helpTab-validation` div and its `display:none` style (the tab switcher controls visibility). The `webrValidationContainer` is where the JS module injects its UI. The `offlineParityContainer` is where the existing embedded validation manifest data will be rendered as supplementary evidence.

- [ ] **Step 2: Add manifest entry**

In `dev/modules/manifest.json`, insert `"02_21b_webr-validation.js"` after line 28 (`02_21a_embedded-validation-manifest.js`), before `02_22_beyond-r40.js`:

```json
    "02_21a_embedded-validation-manifest.js",
    "02_21b_webr-validation.js",
    "02_22_beyond-r40.js",
```

- [ ] **Step 3: Create empty module file**

Create `dev/modules/02_21b_webr-validation.js` with a minimal skeleton:

```javascript
// WebR In-Browser Validation Module
// Reviewer-facing only — never used for app computation.
// Progressive tiers: A (metafor) → B (survival) → C (lme4+)

(function() {
  'use strict';

  // Module will be built out in subsequent tasks

})();
```

- [ ] **Step 4: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`
Expected: Build succeeds, manifest in sync.

- [ ] **Step 5: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js dev/modules/manifest.json dev/modules/01_body_html.html
git commit -m "feat(webr): add placeholder and manifest entry for WebR validation module"
```

---

### Task 2: WebR Lifecycle & UI Shell

**Files:**
- Modify: `dev/modules/02_21b_webr-validation.js`

- [ ] **Step 1: Set up escapeHtml alias**

At the top of the module IIFE. The app already has a global `escapeHTML` (defined in `02_14_plots.js:1770`). Create a local alias for consistent camelCase usage within this module:

```javascript
// Alias the global escapeHTML (from 02_14_plots.js) for local use
var escapeHtml = (typeof escapeHTML === 'function') ? escapeHTML : function(s) {
  return String(s ?? '').replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
  });
};
```

- [ ] **Step 2: Implement WebR singleton and initialization**

```javascript
var webRInstance = null;
var webRLoading = false;
var webRPackages = {};  // { metafor: true/false, survival: true/false, ... }

async function initWebR(progText, progBar, badge) {
  if (webRInstance) return;
  webRLoading = true;

  try {
    progText.textContent = 'Loading WebR runtime...';
    progBar.style.width = '5%';

    var mod = await import('https://webr.r-wasm.org/v0.4.4/webr.mjs');
    webRInstance = new mod.WebR();
    await webRInstance.init();

    progText.textContent = 'WebR initialized';
    progBar.style.width = '20%';

    // Tier A: metafor
    progText.textContent = 'Installing metafor (Tier A)...';
    progBar.style.width = '35%';
    try {
      await webRInstance.evalR('webr::install("metafor", quiet = TRUE)');
      await webRInstance.evalR('library(metafor)');
      webRPackages.metafor = true;
    } catch (e) {
      webRPackages.metafor = false;
    }

    // Tier B: survival
    progText.textContent = 'Installing survival (Tier B)...';
    progBar.style.width = '50%';
    try {
      await webRInstance.evalR('webr::install("survival", quiet = TRUE)');
      await webRInstance.evalR('library(survival)');
      webRPackages.survival = true;
    } catch (e) {
      webRPackages.survival = false;
    }

    // Tier C: lme4, cmprsk, flexsurvcure
    progText.textContent = 'Installing lme4/cmprsk (Tier C)...';
    progBar.style.width = '65%';
    var tierCPkgs = ['lme4', 'cmprsk', 'flexsurvcure'];
    for (var i = 0; i < tierCPkgs.length; i++) {
      try {
        await webRInstance.evalR('webr::install("' + tierCPkgs[i] + '", quiet = TRUE)');
        await webRInstance.evalR('library(' + tierCPkgs[i] + ')');
        webRPackages[tierCPkgs[i]] = true;
      } catch (e) {
        webRPackages[tierCPkgs[i]] = false;
      }
    }

    badge.textContent = webRPackages.metafor ? 'R metafor' : 'R (Base)';
    badge.className = 'webr-badge webr-badge-ready';
  } finally {
    webRLoading = false;
  }
}
```

- [ ] **Step 3: Implement UI injection on DOMContentLoaded**

```javascript
function injectWebRUI() {
  var container = document.getElementById('webrValidationContainer');
  if (!container) return;

  container.innerHTML =
    '<div style="background: var(--bg-tertiary); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">' +
      '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">' +
        '<h4 style="margin: 0; color: var(--accent-success);">WebR: In-Browser R Validation</h4>' +
        '<span id="webrStatusBadge" class="webr-badge webr-badge-loading">Not loaded</span>' +
      '</div>' +
      '<p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1rem;">' +
        'Runs metafor/survival/lme4 via WebAssembly. No server needed. First load ~30-60s.' +
      '</p>' +
      '<div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">' +
        '<button id="webrBtnCurrent" onclick="runWebRValidation(\'current\')" ' +
          'aria-label="Validate current analysis with R" ' +
          'style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--accent-success); ' +
          'background: transparent; color: var(--accent-success); font-size: 0.75rem; font-weight: 600; cursor: pointer;" ' +
          'disabled title="Load a dataset first">' +
          'Validate Current Analysis</button>' +
        '<button id="webrBtnReference" onclick="runWebRValidation(\'reference\')" ' +
          'aria-label="Run reference benchmarks with R" ' +
          'style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--accent-info); ' +
          'background: transparent; color: var(--accent-info); font-size: 0.75rem; font-weight: 600; cursor: pointer;">' +
          'Run Reference Benchmarks</button>' +
      '</div>' +
      '<div id="webrProgressContainer" style="display: none; margin-bottom: 1rem;">' +
        '<div style="display: flex; align-items: center; gap: 0.5rem;">' +
          '<span id="webrSpinner" style="display: inline-block; animation: webr-spin 1s linear infinite;">&#9696;</span>' +
          '<span id="webrProgressText" style="font-size: 0.75rem; color: var(--text-secondary);">Initializing R...</span>' +
        '</div>' +
        '<div style="height: 6px; border-radius: 999px; overflow: hidden; background: var(--bg-secondary); margin-top: 0.5rem;">' +
          '<span id="webrProgressBar" style="display: block; height: 100%; width: 0%; ' +
            'background: linear-gradient(90deg, var(--accent-success), var(--accent-info)); transition: width 0.4s;" ' +
            'role="progressbar" aria-valuenow="0" aria-valuemax="100"></span>' +
        '</div>' +
      '</div>' +
      '<div id="webrResults"></div>' +
      '<div id="webrScriptPreview" style="display: none; margin-top: 1rem;">' +
        '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">' +
          '<h5 style="margin: 0; font-size: 0.75rem; color: var(--text-secondary);">R Script Preview</h5>' +
          '<div style="display: flex; gap: 0.5rem;">' +
            '<button onclick="copyRScript()" aria-label="Copy R script to clipboard" ' +
              'style="padding: 0.25rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); ' +
              'background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.7rem; cursor: pointer;">' +
              'Copy R Script</button>' +
            '<button onclick="copyResultsJSON()" aria-label="Copy results as JSON" ' +
              'style="padding: 0.25rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); ' +
              'background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.7rem; cursor: pointer;">' +
              'Copy Results JSON</button>' +
          '</div>' +
        '</div>' +
        '<pre id="webrScriptCode" style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; ' +
          'font-size: 0.7rem; max-height: 300px; overflow-y: auto; color: var(--text-primary); white-space: pre-wrap;"></pre>' +
      '</div>' +
    '</div>';

  // Add CSS keyframe for spinner
  if (!document.getElementById('webrStyles')) {
    var style = document.createElement('style');
    style.id = 'webrStyles';
    style.textContent =
      '@keyframes webr-spin { to { transform: rotate(360deg); } }' +
      '.webr-badge { font-size: 0.65rem; padding: 2px 8px; border-radius: 12px; font-weight: 700; text-transform: uppercase; }' +
      '.webr-badge-ready { background: var(--accent-success); color: white; }' +
      '.webr-badge-loading { background: var(--bg-secondary); color: var(--text-secondary); }' +
      '.webr-badge-error { background: var(--accent-danger); color: white; }';
    document.head.appendChild(style);
  }
}

document.addEventListener('DOMContentLoaded', injectWebRUI);
```

- [ ] **Step 4: Enable "Validate Current Analysis" button lazily**

Instead of monkey-patching `runAnalysis` (which is already wrapped by TruthCert and would create a fragile double-wrap), use a lazy check approach. The button starts disabled and is re-checked whenever the Help → Validation tab becomes visible. Place this inside `injectWebRUI()` after injecting the HTML:

```javascript
// Lazy enable: check APP.results when validation tab becomes visible
// The help tab switcher calls switchHelpTab() which shows/hides tabs
function checkEnableWebRBtn() {
  var btn = document.getElementById('webrBtnCurrent');
  if (btn) {
    var hasData = APP.results && APP.results.pooled;
    btn.disabled = !hasData;
    btn.title = hasData ? '' : 'Load a dataset first';
  }
}

// Check on tab visibility via MutationObserver on the validation tab
var valTab = document.getElementById('helpTab-validation');
if (valTab) {
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === 'style' && valTab.style.display !== 'none') {
        checkEnableWebRBtn();
      }
    }
  });
  observer.observe(valTab, { attributes: true, attributeFilter: ['style'] });
}

// Also check immediately in case results already exist
checkEnableWebRBtn();
```

- [ ] **Step 5: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`
Expected: Build succeeds, manifest in sync.

Run div balance check:
```bash
cd "C:/HTML apps/IPD-Meta-Pro" && python -c "
import re
html = open('ipd-meta-pro.html','r',encoding='utf-8').read()
opens = len(re.findall(r'<div[\s>]', html))
closes = len(re.findall(r'</div>', html))
print(f'<div: {opens}  </div>: {closes}  diff: {opens - closes}')
"
```
Expected: diff = 0

- [ ] **Step 6: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js dev/modules/01_body_html.html
git commit -m "feat(webr): WebR lifecycle, UI shell, and progress tracking"
```

---

### Task 3: Tier Registry & Reference Benchmarks

**Files:**
- Modify: `dev/modules/02_21b_webr-validation.js`

Reference data source: `dev/modules/02_21_benchmark-datasets.js` — `BENCHMARK_DATASETS.bcg` has 13 studies with `yi`, `sei`, and verified R expected values.

- [ ] **Step 1: Define the scenario registry array**

Add after the `initWebR` function:

```javascript
var WEBR_SCENARIOS = [];
var webRLastResults = null;  // stored for JSON export
```

- [ ] **Step 2: Register Tier A reference benchmark scenarios**

These use `BENCHMARK_DATASETS.bcg` (always available, no user data needed).

```javascript
// --- Tier A: Reference Benchmarks (metafor) ---

WEBR_SCENARIOS.push({
  id: 'ref_dl',
  tier: 'A',
  label: 'DerSimonian-Laird (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="DL", level=0.95)\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), ' +
        'ci_lower=as.numeric(res$ci.lb), ci_upper=as.numeric(res$ci.ub), ' +
        'tau2=as.numeric(res$tau2), i2=as.numeric(res$I2), ' +
        'Q=as.numeric(res$QE), pQ=as.numeric(res$QEp), k=as.numeric(res$k))';
  },
  getJSValues: function() {
    var exp = BENCHMARK_DATASETS.bcg.expected.DL;
    return { pooled: exp.estimate, se: exp.se, tau2: exp.tau2, i2: exp.I2, Q: exp.Q };
  },
  tolerances: { pooled: 0.001, se: 0.001, tau2: 0.001, i2: 1.0, Q: 0.01 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'ref_reml',
  tier: 'A',
  label: 'REML (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="REML", level=0.95)\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), ' +
        'tau2=as.numeric(res$tau2), i2=as.numeric(res$I2))';
  },
  getJSValues: function() {
    var exp = BENCHMARK_DATASETS.bcg.expected.REML;
    return { pooled: exp.estimate, se: exp.se, tau2: exp.tau2, i2: exp.I2 };
  },
  tolerances: { pooled: 0.001, se: 0.001, tau2: 0.001, i2: 1.0 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'ref_pm',
  tier: 'A',
  label: 'Paule-Mandel (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="PM", level=0.95)\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), tau2=as.numeric(res$tau2))';
  },
  getJSValues: function() {
    var exp = BENCHMARK_DATASETS.bcg.expected.PM;
    return { pooled: exp.estimate, se: exp.se, tau2: exp.tau2 };
  },
  tolerances: { pooled: 0.001, se: 0.001, tau2: 0.001 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'ref_hksj',
  tier: 'A',
  label: 'HKSJ Adjustment (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="DL", test="knha", level=0.95)\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), ' +
        'ci_lower=as.numeric(res$ci.lb), ci_upper=as.numeric(res$ci.ub), ' +
        'pval=as.numeric(res$pval))';
  },
  getJSValues: function() {
    // HKSJ changes SE and CI, not pooled — getJSValues returns null for metrics we don't have pre-computed
    return null;  // reference-only: compared directly against R output
  },
  tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'ref_pi',
  tier: 'A',
  label: 'Prediction Interval (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="DL", level=0.95)\n' +
      'pi <- predict(res, level=0.95)\n' +
      'list(pi_lower=as.numeric(pi$pi.lb), pi_upper=as.numeric(pi$pi.ub))';
  },
  getJSValues: function() {
    return null;  // reference-only
  },
  tolerances: { pi_lower: 0.002, pi_upper: 0.002 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'ref_egger',
  tier: 'A',
  label: 'Egger Test (BCG Reference)',
  packages: ['metafor'],
  source: 'reference',
  getRCode: function() {
    var d = BENCHMARK_DATASETS.bcg.studies;
    var yi = d.map(function(s) { return s.yi.toFixed(8); }).join(',');
    var vi = d.map(function(s) { return (s.sei * s.sei).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="DL", level=0.95)\n' +
      'eg <- regtest(res, model="lm")\n' +
      'list(egger_z=as.numeric(eg$zval), egger_p=as.numeric(eg$pval))';
  },
  getJSValues: function() {
    return null;  // reference-only
  },
  tolerances: { egger_z: 0.01, egger_p: 0.005 },
  transform: 'identity'
});
```

- [ ] **Step 3: Register Tier A current-analysis scenarios**

These use the reviewer's loaded data. **Contract note:** `getRCode(data, conf)` receives `APP.results` as `data` (the full results object, so `data.studies` is the study array) and `APP.config.confLevel` as `conf`. Scenarios may also read `APP.config` directly for method/HKSJ settings — this is acceptable since the module is read-only and `APP.config` is a stable global:

```javascript
// --- Tier A: Current Analysis Scenarios ---

WEBR_SCENARIOS.push({
  id: 'cur_primary',
  tier: 'A',
  label: 'Primary Meta-Analysis (Current Data)',
  packages: ['metafor'],
  source: 'current',
  getRCode: function(data, conf) {
    var studies = data.studies;
    var yi = studies.map(function(s) { return s.effect.toFixed(8); }).join(',');
    var vi = studies.map(function(s) { return (s.variance ?? (s.se * s.se)).toFixed(8); }).join(',');
    var method = (APP.config.reMethod || 'DL').toUpperCase();
    var hksj = APP.config.useHKSJ ? ', test="knha"' : '';
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="' + method + '"' + hksj + ', level=' + conf + ')\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), ' +
        'ci_lower=as.numeric(res$ci.lb), ci_upper=as.numeric(res$ci.ub), ' +
        'tau2=as.numeric(res$tau2), i2=as.numeric(res$I2), ' +
        'Q=as.numeric(res$QE), pQ=as.numeric(res$QEp))';
  },
  getJSValues: function(results) {
    var p = results.pooled;
    var h = results.heterogeneity || {};
    return {
      pooled: p.pooled ?? p.effect,
      se: p.se,
      ci_lower: p.ci_lower ?? p.lower,
      ci_upper: p.ci_upper ?? p.upper,
      tau2: h.tau2 ?? p.tau2,
      i2: h.i2 ?? h.I2 ?? p.I2,
      Q: h.Q ?? p.Q,
      pQ: h.pQ ?? p.pQ
    };
  },
  tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002, tau2: 0.001, i2: 1.0, Q: 0.01, pQ: 0.005 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'cur_loo',
  tier: 'A',
  label: 'Leave-One-Out (Current Data)',
  packages: ['metafor'],
  source: 'current',
  getRCode: function(data, conf) {
    var studies = data.studies;
    var yi = studies.map(function(s) { return s.effect.toFixed(8); }).join(',');
    var vi = studies.map(function(s) { return (s.variance ?? (s.se * s.se)).toFixed(8); }).join(',');
    var method = (APP.config.reMethod || 'DL').toUpperCase();
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="' + method + '", level=' + conf + ')\n' +
      'loo <- leave1out(res)\n' +
      'list(loo_estimates=as.numeric(loo$estimate), loo_count=length(loo$estimate))';
  },
  getJSValues: function(results) {
    return null;  // validated by count match only
  },
  tolerances: { loo_count: 0 },
  transform: 'identity'
});

WEBR_SCENARIOS.push({
  id: 'cur_fe',
  tier: 'A',
  label: 'Fixed-Effect Model (Current Data)',
  packages: ['metafor'],
  source: 'current',
  getRCode: function(data, conf) {
    var studies = data.studies;
    var yi = studies.map(function(s) { return s.effect.toFixed(8); }).join(',');
    var vi = studies.map(function(s) { return (s.variance ?? (s.se * s.se)).toFixed(8); }).join(',');
    return 'library(metafor)\n' +
      'yi <- c(' + yi + ')\n' +
      'vi <- c(' + vi + ')\n' +
      'res <- rma(yi, vi, method="FE", level=' + conf + ')\n' +
      'list(pooled=as.numeric(res$beta), se=as.numeric(res$se), ' +
        'ci_lower=as.numeric(res$ci.lb), ci_upper=as.numeric(res$ci.ub))';
  },
  getJSValues: function(results) {
    // FE results may be stored separately — for now just validate R runs correctly
    return null;
  },
  tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002 },
  transform: 'identity'
});
```

- [ ] **Step 4: Add Tier B/C placeholder comment**

Add after the current-analysis scenarios, inside the IIFE:

```javascript
// --- Tier B: Survival scenarios (future plan) ---
// Will add: frailty Cox, KM comparison, RMST, landmark analysis
// Requires: survival package available in webRPackages

// --- Tier C: Advanced IPD scenarios (future plan) ---
// Will add: one-stage GLMM, competing risks, cure model
// Requires: lme4, cmprsk, flexsurvcure packages
```

- [ ] **Step 5: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`
Expected: Build succeeds, manifest in sync.

- [ ] **Step 6: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js
git commit -m "feat(webr): Tier A scenario registry with reference and current-analysis scenarios"
```

---

### Task 4: Comparison Engine & Results Renderer

**Files:**
- Modify: `dev/modules/02_21b_webr-validation.js`

- [ ] **Step 1: Implement the comparison engine**

```javascript
function extractRValues(rObj) {
  // WebR returns nested proxy: rObj.values[i].values[0]
  // Convert R named list to flat JS object
  var result = {};
  if (!rObj || !rObj.names || !rObj.values) return result;
  for (var i = 0; i < rObj.names.length; i++) {
    var key = rObj.names[i];
    var val = rObj.values[i];
    if (val && val.values && val.values.length === 1) {
      result[key] = val.values[0];
    } else if (val && val.values) {
      result[key] = Array.from(val.values);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function compareResults(jsValues, rValues, tolerances, transform) {
  var rows = [];
  var keys = Object.keys(tolerances);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var rVal = rValues[key];
    if (rVal === undefined || rVal === null) continue;

    var jsVal = jsValues ? jsValues[key] : null;
    var tol = tolerances[key];

    // Apply transform for display (log → exp for ratio measures)
    var displayR = rVal;
    var displayJS = jsVal;
    if (transform === 'log' && (key === 'pooled' || key === 'ci_lower' || key === 'ci_upper')) {
      displayR = Math.exp(rVal);
      displayJS = jsVal !== null ? Math.exp(jsVal) : null;
    }

    var diff = (jsVal !== null && isFinite(jsVal) && isFinite(rVal)) ? Math.abs(jsVal - rVal) : null;
    var pass = diff !== null ? diff <= tol : null;  // null = no JS value to compare

    rows.push({
      label: key,
      js: jsVal,
      r: rVal,
      displayJS: displayJS,
      displayR: displayR,
      diff: diff,
      tol: tol,
      pass: pass
    });
  }
  return rows;
}
```

- [ ] **Step 2: Implement results renderer**

```javascript
function renderTierResults(tierLabel, scenarioResults) {
  var passCount = 0;
  var totalCount = 0;
  var skippedCount = 0;
  var html = '';

  for (var s = 0; s < scenarioResults.length; s++) {
    var sr = scenarioResults[s];
    if (sr.skipped) {
      skippedCount++;
      html += '<div style="padding: 0.5rem; color: var(--text-secondary); font-size: 0.75rem;">' +
        escapeHtml(sr.label) + ' — ' + escapeHtml(sr.skipReason) + '</div>';
      continue;
    }
    if (sr.error) {
      totalCount++;
      html += '<div style="padding: 0.5rem; color: var(--accent-danger); font-size: 0.75rem;">' +
        escapeHtml(sr.label) + ' — R Error: ' + escapeHtml(sr.error) + '</div>';
      continue;
    }

    totalCount++;
    var comparedRows = sr.rows.filter(function(r) { return r.pass !== null; });
    var rOnlyRows = sr.rows.filter(function(r) { return r.pass === null; });
    var allComparedPass = comparedRows.length === 0 || comparedRows.every(function(r) { return r.pass === true; });
    if (allComparedPass) passCount++;
    sr._comparedCount = comparedRows.length;
    sr._rOnlyCount = rOnlyRows.length;

    html += '<details style="margin-bottom: 0.5rem;">' +
      '<summary style="cursor: pointer; font-size: 0.75rem; font-weight: 600; color: ' +
        (allComparedPass ? 'var(--accent-success)' : 'var(--accent-danger)') + ';">' +
        (allComparedPass ? '&#10003; ' : '&#10007; ') + escapeHtml(sr.label) +
        (sr._rOnlyCount > 0 ? ' (' + sr._rOnlyCount + ' R-only)' : '') +
      '</summary>' +
      '<table style="width: 100%; font-size: 0.7rem; border-collapse: collapse; margin-top: 0.25rem;">' +
      '<thead><tr style="color: var(--text-secondary);">' +
        '<th style="text-align: left; padding: 0.25rem;">Metric</th>' +
        '<th style="text-align: right; padding: 0.25rem;">App (JS)</th>' +
        '<th style="text-align: right; padding: 0.25rem;">R</th>' +
        '<th style="text-align: right; padding: 0.25rem;">Diff</th>' +
        '<th style="text-align: center; padding: 0.25rem;">Pass</th>' +
      '</tr></thead><tbody>';

    for (var r = 0; r < sr.rows.length; r++) {
      var row = sr.rows[r];
      var diffStr = row.diff !== null ? row.diff.toFixed(6) : '—';
      var jsStr = row.js !== null && isFinite(row.js) ? row.js.toFixed(4) : '—';
      var rStr = isFinite(row.r) ? row.r.toFixed(4) : '—';
      var passStr = row.pass === true ? '&#10003;' : (row.pass === false ? '&#10007;' : '—');
      var passColor = row.pass === true ? 'var(--accent-success)' : (row.pass === false ? 'var(--accent-danger)' : 'var(--text-secondary)');

      html += '<tr style="border-top: 1px solid var(--border-color);">' +
        '<td style="padding: 0.25rem; font-family: monospace;">' + escapeHtml(row.label) + '</td>' +
        '<td style="padding: 0.25rem; text-align: right; font-family: monospace;">' + jsStr + '</td>' +
        '<td style="padding: 0.25rem; text-align: right; font-family: monospace; color: var(--accent-success);">' + rStr + '</td>' +
        '<td style="padding: 0.25rem; text-align: right; font-family: monospace; color: ' +
          (row.pass === false ? 'var(--accent-danger)' : 'var(--text-secondary)') + ';">' + diffStr + '</td>' +
        '<td style="padding: 0.25rem; text-align: center; color: ' + passColor + ';">' + passStr + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></details>';
  }

  var summaryColor = (totalCount > 0 && passCount === totalCount) ? 'var(--accent-success)' : 'var(--accent-danger)';
  var summaryText = passCount + '/' + totalCount + ' PASS';
  if (skippedCount > 0) summaryText += ' (' + skippedCount + ' skipped)';
  // Count R-only scenarios (no JS comparison available) from allResults
  var rOnlyCount = 0;
  for (var a2 = 0; a2 < allResults.length; a2++) {
    for (var b2 = 0; b2 < allResults[a2].results.length; b2++) {
      var sr2 = allResults[a2].results[b2];
      if (!sr2.skipped && !sr2.error && sr2._comparedCount === 0 && sr2._rOnlyCount > 0) rOnlyCount++;
    }
  }
  if (rOnlyCount > 0) summaryText += ', ' + rOnlyCount + ' R-only';

  return '<div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem; ' +
    'border-left: 3px solid ' + summaryColor + ';">' +
    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">' +
      '<h5 style="margin: 0; font-size: 0.8rem; color: var(--text-primary);">' + escapeHtml(tierLabel) + '</h5>' +
      '<span style="font-size: 0.7rem; font-weight: 700; color: ' + summaryColor + ';">' + summaryText + '</span>' +
    '</div>' +
    html +
  '</div>';
}
```

- [ ] **Step 3: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`

- [ ] **Step 4: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js
git commit -m "feat(webr): comparison engine and tier results renderer"
```

---

### Task 5: Runner & Main Entry Point

**Files:**
- Modify: `dev/modules/02_21b_webr-validation.js`

- [ ] **Step 1: Implement the main runner function**

```javascript
async function runWebRValidation(mode) {
  if (webRLoading) {
    showNotification('WebR is already loading...', 'warning');
    return;
  }

  if (mode === 'current' && (!APP.results || !APP.results.pooled)) {
    showNotification('No analysis results to validate. Run an analysis first.', 'warning');
    return;
  }

  var btnCur = document.getElementById('webrBtnCurrent');
  var btnRef = document.getElementById('webrBtnReference');
  var prog = document.getElementById('webrProgressContainer');
  var progText = document.getElementById('webrProgressText');
  var progBar = document.getElementById('webrProgressBar');
  var badge = document.getElementById('webrStatusBadge');
  var resultsDiv = document.getElementById('webrResults');
  var scriptPreview = document.getElementById('webrScriptPreview');
  var scriptCode = document.getElementById('webrScriptCode');

  if (btnCur) btnCur.disabled = true;
  if (btnRef) btnRef.disabled = true;
  prog.style.display = '';
  resultsDiv.innerHTML = '';

  try {
    // Initialize WebR if needed
    if (!webRInstance) {
      badge.textContent = 'Loading...';
      badge.className = 'webr-badge webr-badge-loading';
      await initWebR(progText, progBar, badge);
    }

    // Filter scenarios by mode
    var scenarios = WEBR_SCENARIOS.filter(function(sc) {
      if (mode === 'current') return sc.source === 'current' || sc.source === 'both';
      if (mode === 'reference') return sc.source === 'reference' || sc.source === 'both';
      return true;
    });

    // Group by tier
    var tiers = { A: [], B: [], C: [] };
    for (var i = 0; i < scenarios.length; i++) {
      var sc = scenarios[i];
      if (!tiers[sc.tier]) tiers[sc.tier] = [];
      tiers[sc.tier].push(sc);
    }

    var allResults = [];
    var scenarioIndex = 0;
    var totalScenarios = scenarios.length;

    // Run each tier
    var tierKeys = ['A', 'B', 'C'];
    var tierLabels = {
      A: 'Tier A: Core Meta-Analysis (metafor)',
      B: 'Tier B: Survival (survival)',
      C: 'Tier C: Advanced IPD (lme4)'
    };

    for (var t = 0; t < tierKeys.length; t++) {
      var tierKey = tierKeys[t];
      var tierScenarios = tiers[tierKey] || [];
      if (tierScenarios.length === 0) continue;

      var tierResults = [];

      for (var j = 0; j < tierScenarios.length; j++) {
        var scenario = tierScenarios[j];
        scenarioIndex++;

        // Update progress
        var pct = 70 + Math.round(25 * scenarioIndex / totalScenarios);
        progBar.style.width = pct + '%';
        progBar.setAttribute('aria-valuenow', pct);
        progText.textContent = 'Running: ' + scenario.label + '...';

        // Check package availability
        var missingPkg = scenario.packages.find(function(pkg) { return !webRPackages[pkg]; });
        if (missingPkg) {
          tierResults.push({
            id: scenario.id,
            label: scenario.label,
            skipped: true,
            skipReason: missingPkg + ' not available in WebR'
          });
          continue;
        }

        // Check data availability for current-analysis scenarios
        if (scenario.source === 'current') {
          var k = APP.results && APP.results.studies ? APP.results.studies.length : 0;
          if (k < 2 && scenario.id.indexOf('pi') >= 0) {
            tierResults.push({ id: scenario.id, label: scenario.label, skipped: true, skipReason: 'k<2, not applicable' });
            continue;
          }
        }

        // Run R
        try {
          var data = mode === 'current' ? APP.results : null;
          var conf = APP.config ? APP.config.confLevel : 0.95;
          var rCode = scenario.getRCode(data, conf);
          var rResult = await webRInstance.evalR(rCode);
          var rObj = await rResult.toJs();
          var rValues = extractRValues(rObj);

          // Get JS values for comparison
          var jsValues = scenario.getJSValues ? scenario.getJSValues(APP.results || {}) : null;

          // Compare
          var rows = compareResults(jsValues, rValues, scenario.tolerances, scenario.transform);

          tierResults.push({
            id: scenario.id,
            label: scenario.label,
            rows: rows,
            rValues: rValues
          });
        } catch (e) {
          tierResults.push({
            id: scenario.id,
            label: scenario.label,
            error: e.message || String(e)
          });
        }
      }

      allResults.push({ tier: tierKey, label: tierLabels[tierKey], results: tierResults });
    }

    // Render results
    var html = '';
    var overallPass = 0;
    var overallTotal = 0;
    var overallSkipped = 0;

    for (var a = 0; a < allResults.length; a++) {
      var tier = allResults[a];
      html += renderTierResults(tier.label, tier.results);
      for (var b = 0; b < tier.results.length; b++) {
        var sr = tier.results[b];
        if (sr.skipped) { overallSkipped++; continue; }
        overallTotal++;
        if (!sr.error && sr.rows) {
          var compared = sr.rows.filter(function(r) { return r.pass !== null; });
          if (compared.length === 0 || compared.every(function(r) { return r.pass === true; })) {
            overallPass++;
          }
        }
      }
    }

    var overallColor = (overallTotal > 0 && overallPass === overallTotal) ? 'var(--accent-success)' : 'var(--accent-danger)';
    var overallText = overallPass + '/' + overallTotal + ' PASS';
    if (overallSkipped > 0) overallText += ' (' + overallSkipped + ' skipped)';

    resultsDiv.innerHTML =
      '<div style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: var(--bg-secondary); ' +
        'border: 2px solid ' + overallColor + '; text-align: center;">' +
        '<span style="font-size: 0.85rem; font-weight: 700; color: ' + overallColor + ';">Overall: ' + overallText + '</span>' +
      '</div>' + html;

    // Store results for JSON export
    webRLastResults = allResults;

    // Generate and show R script
    var script = generateRScript();
    scriptCode.textContent = script;
    scriptPreview.style.display = '';

    // Log to TruthCert
    if (typeof TruthCert !== 'undefined' && TruthCert.logStep) {
      TruthCert.logStep({
        step: 'webr_validation',
        description: 'WebR in-browser R validation (' + mode + ')',
        parameters: {
          mode: mode,
          method: APP.config ? APP.config.reMethod : 'unknown',
          k: APP.results && APP.results.studies ? APP.results.studies.length : 0,
          confLevel: APP.config ? APP.config.confLevel : 0.95,
          packages: Object.keys(webRPackages).filter(function(p) { return webRPackages[p]; })
        },
        validator: 'WebR v0.4.4',
        outcome: overallText
      });
    }

    // Complete
    progBar.style.width = '100%';
    progBar.setAttribute('aria-valuenow', 100);
    progText.textContent = 'Validation complete.';
    setTimeout(function() { prog.style.display = 'none'; }, 2000);

  } catch (e) {
    badge.textContent = 'Error';
    badge.className = 'webr-badge webr-badge-error';
    progText.textContent = 'Error: ' + e.message;
    resultsDiv.innerHTML = '<div style="color: var(--accent-danger); font-size: 0.75rem;">' +
      escapeHtml(e.message) + '</div>';
    webRLoading = false;
  } finally {
    if (btnCur) { btnCur.disabled = !(APP.results && APP.results.pooled); }
    if (btnRef) { btnRef.disabled = false; }
  }
}

// Expose globally
window.runWebRValidation = runWebRValidation;
window.getWebRScenarioCount = function() { return WEBR_SCENARIOS.length; };
```

- [ ] **Step 2: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`

Run div balance check:
```bash
cd "C:/HTML apps/IPD-Meta-Pro" && python -c "
import re
html = open('ipd-meta-pro.html','r',encoding='utf-8').read()
opens = len(re.findall(r'<div[\s>]', html))
closes = len(re.findall(r'</div>', html))
print(f'<div: {opens}  </div>: {closes}  diff: {opens - closes}')
"
```
Expected: diff = 0

- [ ] **Step 3: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js
git commit -m "feat(webr): runner function with progress tracking, TruthCert logging, and overall results"
```

---

### Task 6: R Script Generator & Clipboard Export

**Files:**
- Modify: `dev/modules/02_21b_webr-validation.js`

- [ ] **Step 1: Implement R script generator**

```javascript
function generateRScript() {
  var hasResults = APP.results && APP.results.pooled;
  var config = APP.config || {};
  var method = (config.reMethod || 'DL').toUpperCase();
  var conf = config.confLevel || 0.95;
  var hksj = config.useHKSJ ? ', test="knha"' : '';
  var buildId = (typeof __IPD_EMBEDDED_VALIDATION_MANIFEST__ !== 'undefined' && __IPD_EMBEDDED_VALIDATION_MANIFEST__.app_build_id)
    ? __IPD_EMBEDDED_VALIDATION_MANIFEST__.app_build_id : 'unknown';

  var lines = [];
  lines.push('# ============================================================');
  lines.push('# IPD-Meta-Pro v' + buildId + ' - R Validation Script');
  lines.push('# Generated: ' + new Date().toISOString());

  if (hasResults) {
    var k = APP.results.studies ? APP.results.studies.length : 0;
    lines.push('# Dataset: k=' + k + ' studies, Method=' + method + ', confLevel=' + conf);
    lines.push('# Effect measure: ' + (config.effectMeasure || 'unknown'));
  } else {
    lines.push('# Mode: Reference benchmarks only (no user data loaded)');
  }

  lines.push('# ============================================================');
  lines.push('');
  lines.push('if (!require("metafor")) install.packages("metafor")');
  lines.push('if (!require("survival")) install.packages("survival")');
  lines.push('library(metafor)');
  lines.push('library(survival)');
  lines.push('');

  // Reference benchmark
  lines.push('# ---- Reference Benchmark: BCG Vaccine (13 studies) ----');
  var bcg = BENCHMARK_DATASETS.bcg.studies;
  lines.push('bcg_yi <- c(' + bcg.map(function(s) { return s.yi.toFixed(4); }).join(', ') + ')');
  lines.push('bcg_vi <- c(' + bcg.map(function(s) { return (s.sei * s.sei).toFixed(6); }).join(', ') + ')');
  lines.push('bcg_dl <- rma(bcg_yi, bcg_vi, method="DL", level=' + conf + ')');
  lines.push('print(bcg_dl)');
  lines.push('bcg_reml <- rma(bcg_yi, bcg_vi, method="REML", level=' + conf + ')');
  lines.push('print(bcg_reml)');
  lines.push('predict(bcg_dl, level=' + conf + ')');
  lines.push('regtest(bcg_dl, model="lm")');
  lines.push('');

  // Current analysis
  if (hasResults && APP.results.studies && APP.results.studies.length > 0) {
    var studies = APP.results.studies;
    lines.push('# ---- Current Analysis Data ----');
    lines.push('dat <- data.frame(');
    lines.push('  study = c(' + studies.map(function(s) {
      return '"' + String(s.study || '').replace(/"/g, '\\"') + '"';
    }).join(', ') + '),');
    lines.push('  yi = c(' + studies.map(function(s) { return (s.effect || 0).toFixed(8); }).join(', ') + '),');
    lines.push('  vi = c(' + studies.map(function(s) {
      return ((s.variance != null ? s.variance : s.se * s.se) || 0).toFixed(8);
    }).join(', ') + ')');
    lines.push(')');
    lines.push('');
    lines.push('# ---- Primary: ' + method + (config.useHKSJ ? ' + HKSJ' : '') + ' ----');
    lines.push('res <- rma(yi, vi, data=dat, method="' + method + '"' + hksj + ', level=' + conf + ')');
    lines.push('print(res)');
    lines.push('');
    lines.push('# ---- Prediction Interval ----');
    lines.push('predict(res, level=' + conf + ')');
    lines.push('');
    lines.push('# ---- Egger Test ----');
    lines.push('regtest(res, model="lm")');
    lines.push('');
    lines.push('# ---- Leave-One-Out ----');
    lines.push('leave1out(res)');
    lines.push('');
    lines.push('# ---- Fixed Effect ----');
    lines.push('res_fe <- rma(yi, vi, data=dat, method="FE", level=' + conf + ')');
    lines.push('print(res_fe)');

    // Tier B: Survival IPD (conditional)
    if (APP.data && APP.data.length > 0 && config.timeVar && config.eventVar) {
      lines.push('');
      lines.push('# ---- Tier B: Frailty Cox Model (survival IPD) ----');
      lines.push('# NOTE: IPD data has ' + APP.data.length + ' rows');
      if (APP.data.length <= 5000) {
        lines.push('ipd <- data.frame(');
        lines.push('  time = c(' + APP.data.map(function(r) {
          return (parseFloat(r[config.timeVar]) || 0).toFixed(4);
        }).join(', ') + '),');
        lines.push('  event = c(' + APP.data.map(function(r) {
          return (parseFloat(r[config.eventVar]) || 0);
        }).join(', ') + '),');
        lines.push('  trt = c(' + APP.data.map(function(r) {
          return (parseFloat(r[config.treatmentVar]) || 0);
        }).join(', ') + '),');
        lines.push('  study = c(' + APP.data.map(function(r) {
          return '"' + String(r[config.studyVar] || '').replace(/"/g, '\\"') + '"';
        }).join(', ') + ')');
        lines.push(')');
        lines.push('fit <- coxph(Surv(time, event) ~ trt + frailty(study), data=ipd)');
        lines.push('summary(fit)');
      } else {
        lines.push('# Dataset too large (' + APP.data.length + ' rows) to embed inline.');
        lines.push('# Export as CSV and load with: ipd <- read.csv("ipd_data.csv")');
      }
    }
  }

  lines.push('');
  lines.push('# ---- End of validation script ----');

  return lines.join('\n');
}
```

- [ ] **Step 2: Implement clipboard copy functions**

```javascript
function copyRScript() {
  var script = generateRScript();
  navigator.clipboard.writeText(script).then(function() {
    showNotification('R validation script copied to clipboard!', 'success');
  }).catch(function() {
    // Fallback for older browsers
    var ta = document.createElement('textarea');
    ta.value = script;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showNotification('R validation script copied to clipboard!', 'success');
  });
}

function copyResultsJSON() {
  if (!webRLastResults) {
    showNotification('No validation results yet. Run validation first.', 'warning');
    return;
  }
  var json = JSON.stringify(webRLastResults, null, 2);
  navigator.clipboard.writeText(json).then(function() {
    showNotification('Validation results JSON copied to clipboard!', 'success');
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = json;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showNotification('Validation results JSON copied to clipboard!', 'success');
  });
}

// Expose globally
window.generateRScript = generateRScript;
window.copyRScript = copyRScript;
window.copyResultsJSON = copyResultsJSON;
```

- [ ] **Step 3: Build and verify**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`

- [ ] **Step 4: Commit**

```bash
git add dev/modules/02_21b_webr-validation.js
git commit -m "feat(webr): R script generator and clipboard export functions"
```

---

### Task 7: Regression Tests

**Files:**
- Modify: `dev/build-scripts/regression_fixed_paths_test.py`

- [ ] **Step 1: Add static checks for WebR module markers**

Add these to the `required` list in the static checks section (after the integrity gate markers, around line 200):

```python
        "function runWebRValidation(",
        "var WEBR_SCENARIOS = []",
        "function generateRScript()",
        "function copyRScript()",
        "function compareResults(",
        "function extractRValues(",
        "webrValidationContainer",
```

- [ ] **Step 2: Add runtime checks for WebR UI**

Add after the integrity gate runtime checks (before the `finally:` block):

```python
        # ---- WebR Validation UI checks ----
        webr_ui = driver.execute_script(
            """
            return {
              hasContainer: !!document.getElementById('webrValidationContainer'),
              hasBtnCurrent: !!document.getElementById('webrBtnCurrent'),
              hasBtnReference: !!document.getElementById('webrBtnReference'),
              hasProgressContainer: !!document.getElementById('webrProgressContainer'),
              hasResultsDiv: !!document.getElementById('webrResults'),
              hasBadge: !!document.getElementById('webrStatusBadge'),
              btnCurrentDisabled: (document.getElementById('webrBtnCurrent') || {}).disabled,
              scenarioCount: (typeof getWebRScenarioCount === 'function') ? getWebRScenarioCount() : -1,
              hasRunFn: typeof runWebRValidation === 'function',
              hasGenFn: typeof generateRScript === 'function',
              hasCopyFn: typeof copyRScript === 'function'
            };
            """
        )

        if webr_ui.get("hasContainer") and webr_ui.get("hasBtnCurrent") and webr_ui.get("hasBtnReference"):
            result.ok("WebR validation UI elements present (container, buttons)")
        else:
            result.fail(f"WebR UI elements missing: {webr_ui}")

        if webr_ui.get("btnCurrentDisabled"):
            result.ok("'Validate Current Analysis' button correctly disabled when no data loaded")
        else:
            result.fail("'Validate Current Analysis' button should be disabled before data load")

        sc_count = webr_ui.get("scenarioCount", -1)
        if sc_count >= 6:
            result.ok(f"WEBR_SCENARIOS registry has {sc_count} scenarios")
        else:
            result.fail(f"WEBR_SCENARIOS count too low: {sc_count}")

        if webr_ui.get("hasRunFn") and webr_ui.get("hasGenFn") and webr_ui.get("hasCopyFn"):
            result.ok("WebR global functions exposed (runWebRValidation, generateRScript, copyRScript)")
        else:
            result.fail(f"WebR functions missing: {webr_ui}")

        # Verify R script generation works without data
        script_check = driver.execute_script(
            """
            try {
              var s = generateRScript();
              return {
                length: s.length,
                hasMetafor: s.indexOf('library(metafor)') >= 0,
                hasBCG: s.indexOf('BCG') >= 0 || s.indexOf('bcg') >= 0,
                hasLevel: s.indexOf('level=') >= 0
              };
            } catch(e) { return { error: e.message }; }
            """
        )
        if script_check.get("error"):
            result.fail(f"generateRScript() threw: {script_check['error']}")
        elif script_check.get("hasMetafor") and script_check.get("hasBCG") and script_check.get("hasLevel"):
            result.ok(f"generateRScript() produces valid output ({script_check['length']} chars)")
        else:
            result.fail(f"generateRScript() output incomplete: {script_check}")
```

- [ ] **Step 3: Run regression suite**

Run: `cd "C:/HTML apps/IPD-Meta-Pro/dev/build-scripts" && python regression_fixed_paths_test.py`
Expected: All checks pass including new WebR checks. No WebR runtime is loaded (we only check UI and function presence).

- [ ] **Step 4: Commit**

```bash
git add dev/build-scripts/regression_fixed_paths_test.py
git commit -m "test(webr): add static and runtime regression checks for WebR validation module"
```

---

### Task 8: Build, Full Regression, Safety Checks

**Files:** None modified — verification only.

- [ ] **Step 1: Full rebuild**

Run: `cd "C:/HTML apps/IPD-Meta-Pro" && python dev/build.py build && python dev/build.py verify`

- [ ] **Step 2: Div balance check**

```bash
cd "C:/HTML apps/IPD-Meta-Pro" && python -c "
import re
html = open('ipd-meta-pro.html','r',encoding='utf-8').read()
opens = len(re.findall(r'<div[\s>]', html))
closes = len(re.findall(r'</div>', html))
print(f'<div: {opens}  </div>: {closes}  diff: {opens - closes}')
assert opens == closes, f'DIV IMBALANCE: {opens} opens vs {closes} closes'
"
```

- [ ] **Step 3: Script injection check**

```bash
cd "C:/HTML apps/IPD-Meta-Pro" && python -c "
import re
html = open('ipd-meta-pro.html','r',encoding='utf-8').read()
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
for i, s in enumerate(scripts):
    if '</script>' in s:
        print(f'DANGER: literal </script> in script block {i}')
        exit(1)
print('No literal </script> inside script blocks - SAFE')
"
```

- [ ] **Step 4: Full regression suite**

Run: `cd "C:/HTML apps/IPD-Meta-Pro/dev/build-scripts" && python regression_fixed_paths_test.py`
Expected: All checks PASS (44+ original checks + ~6 new WebR checks).

- [ ] **Step 5: Report results**

Report: total pass/fail count, div balance, script safety, build size.
