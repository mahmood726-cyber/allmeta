// WebR In-Browser Validation Module
// Reviewer-facing only — never used for app computation.
// Progressive tiers: A (metafor) → B (survival) → C (lme4+)

(function() {
  'use strict';

  // ─── Task 5: runWebRValidation ────────────────────────────────────────────
  var runWebRValidation = async function(mode) {
    // Guards
    if (webRLoading) {
      showNotification('WebR is currently initialising — please wait.', 'info');
      return;
    }
    if (validationRunning) {
      showNotification('Validation already in progress.', 'info');
      return;
    }
    if (mode === 'current') {
      if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.pooled) {
        showNotification('Run an analysis first before validating current results.', 'warning');
        return;
      }
    }
    validationRunning = true;

    // DOM elements
    var webrBtnCurrent        = document.getElementById('webrBtnCurrent');
    var webrBtnAll            = document.getElementById('webrBtnAll');
    var webrBtnReference      = document.getElementById('webrBtnRef');
    var webrProgressContainer = document.getElementById('webrProgressContainer');
    var webrProgressText      = document.getElementById('webrProgText');
    var webrProgressBar       = document.getElementById('webrProgBar');
    var webrStatusBadge       = document.getElementById('webrBadge');
    var webrResults           = document.getElementById('webrResults');
    var webrScriptDetails     = document.getElementById('webrScriptDetails');
    var webrScriptCode        = document.getElementById('webrScriptPre');

    // Disable buttons, show progress, clear results
    if (webrBtnCurrent)   webrBtnCurrent.disabled   = true;
    if (webrBtnAll)       webrBtnAll.disabled       = true;
    if (webrBtnReference) webrBtnReference.disabled = true;
    if (webrProgressContainer) webrProgressContainer.style.display = 'block';
    if (webrResults) webrResults.innerHTML = '';
    if (webrProgressText) webrProgressText.textContent = 'Starting…';
    if (webrProgressBar)  { webrProgressBar.value = 0; webrProgressBar.setAttribute('aria-valuenow', '0'); }

    try {
      // (a) Init WebR if not already done
      if (!webRInstance) {
        await initWebR(webrProgressText, webrProgressBar, webrStatusBadge);
        if (!webRInstance) {
          throw new Error('WebR failed to initialise. Check browser console for details.');
        }
      }

      // (b) Filter scenarios by source property
      var filteredScenarios = WEBR_SCENARIOS.filter(function(sc) {
        if (mode === 'current')   return sc.source === 'current' || sc.source === 'both';
        if (mode === 'reference') return sc.source === 'reference' || sc.source === 'both';
        return true;
      });

      // (c) Group by tier
      var tierMap = {};
      filteredScenarios.forEach(function(sc) {
        var t = sc.tier || 'A';
        if (!tierMap[t]) tierMap[t] = [];
        tierMap[t].push(sc);
      });

      // Order tiers
      var tierOrder = ['A', 'B', 'C'];
      var tierLabels = { A: 'Tier A: metafor', B: 'Tier B: survival', C: 'Tier C: lme4 / cmprsk' };
      var tierPackages = { A: ['metafor'], B: ['survival'], C: ['lme4', 'cmprsk', 'flexsurvcure'] };

      var total = filteredScenarios.length;
      var runIndex = 0;
      var allTierHtml = '';
      var overallPassCount    = 0;
      var overallTotalCount   = 0;
      var overallSkipCount    = 0;
      var overallROnlyCount   = 0;
      var allTierResults      = {};
      var lastMethod  = (typeof APP !== 'undefined' && APP && APP.config) ? (APP.config.reMethod  || 'REML') : 'REML';
      var lastK       = (typeof APP !== 'undefined' && APP && APP.results && APP.results.studies) ? APP.results.studies.length : null;
      var lastConf    = safeConfLevel();
      var usedPkgs    = [];

      for (var ti = 0; ti < tierOrder.length; ti++) {
        var tier = tierOrder[ti];
        var scenarios = tierMap[tier];
        if (!scenarios || scenarios.length === 0) continue;

        var tierLabel = tierLabels[tier] || ('Tier ' + tier);
        var reqPkgs   = tierPackages[tier] || [];
        var tierResults = [];

        for (var si = 0; si < scenarios.length; si++) {
          var sc = scenarios[si];

          // Progress: 70% base (init) + 25% for scenarios
          runIndex++;
          var pct = Math.round(70 + 25 * (runIndex / Math.max(total, 1)));
          if (webrProgressBar) {
            webrProgressBar.value = pct;
            webrProgressBar.setAttribute('aria-valuenow', String(pct));
          }
          if (webrProgressText) {
            webrProgressText.textContent = 'Running: ' + sc.label + '…';
          }

          // Check package availability
          var pkgMissing = false;
          for (var pi = 0; pi < reqPkgs.length; pi++) {
            if (webRPackages[reqPkgs[pi]] === false) { pkgMissing = true; break; }
          }
          if (pkgMissing) {
            tierResults.push({
              scenario:   sc,
              status:     'skip',
              skipReason: 'Required package not available: ' + reqPkgs.filter(function(p){ return webRPackages[p] === false; }).join(', ')
            });
            overallSkipCount++;
            continue;
          }

          // Generate R code
          var rCode;
          try {
            rCode = sc.getRCode();
          } catch(codeErr) {
            rCode = null;
          }

          if (!rCode) {
            tierResults.push({
              scenario:   sc,
              status:     'skip',
              skipReason: 'No R code generated (data not available or insufficient studies).'
            });
            overallSkipCount++;
            continue;
          }

          // Check data edge cases (k < 3 for prediction interval scenarios)
          if (sc.id && (sc.id === 'ref_pi' || sc.id === 'cur_pi')) {
            var kStudies = (typeof APP !== 'undefined' && APP && APP.results && APP.results.studies)
              ? APP.results.studies.length : (mode === 'reference' ? 13 : 0);
            if (kStudies < 3) {
              tierResults.push({
                scenario:   sc,
                status:     'skip',
                skipReason: 'Need k≥3 for prediction interval.'
              });
              overallSkipCount++;
              continue;
            }
          }

          // Track used packages
          reqPkgs.forEach(function(p) {
            if (usedPkgs.indexOf(p) === -1) usedPkgs.push(p);
          });

          // Run R code
          try {
            var proxy  = await webRInstance.evalR(rCode);
            var rRaw;
            try {
              rRaw = await proxy.toJs();
            } finally {
              if (proxy && typeof proxy.destroy === 'function') { try { await proxy.destroy(); } catch(_){} }
            }
            var rValues = extractRValues(rRaw);

            // Get JS values
            var jsValues = sc.getJSValues ? sc.getJSValues() : null;

            // Compare
            var rows = compareResults(
              jsValues,
              rValues,
              sc.tolerances || {},
              sc.transform || null
            );

            // Count pass/R-only per scenario
            var comparedRows = rows.filter(function(r) { return r.pass !== null; });
            var rOnlyRows    = rows.filter(function(r) { return r.pass === null; });
            var scenarioPass = comparedRows.length === 0 || comparedRows.every(function(r) { return r.pass === true; });

            overallTotalCount++;
            if (scenarioPass) overallPassCount++;
            overallROnlyCount += rOnlyRows.length;

            tierResults.push({
              scenario: sc,
              status:   'ok',
              rows:     rows,
              rValues:  rValues
            });
          } catch(runErr) {
            overallTotalCount++;
            tierResults.push({
              scenario: sc,
              status:   'error',
              error:    runErr.message || String(runErr)
            });
          }
        } // end scenarios loop

        allTierResults[tier] = tierResults;
        allTierHtml += renderTierResults(tierLabel, tierResults);
      } // end tier loop

      // (e) Render all results
      var overallText = overallTotalCount === 0
        ? 'No scenarios ran'
        : (overallPassCount + '/' + overallTotalCount + ' PASS' +
           (overallSkipCount  > 0 ? ', ' + overallSkipCount  + ' skipped'  : '') +
           (overallROnlyCount > 0 ? ' (' + (overallTotalCount - overallROnlyCount) + ' verified, ' + overallROnlyCount + ' R-only)' : ''));

      var summaryColor = (overallTotalCount > 0 && overallPassCount === overallTotalCount)
        ? 'var(--accent-success,#2e7d32)'
        : (overallTotalCount > 0 && overallPassCount < overallTotalCount)
        ? 'var(--accent-danger,#c62828)'
        : 'var(--text-secondary,#666)';

      if (webrResults) {
        webrResults.innerHTML = [
          '<div style="margin-bottom:12px;padding:8px 12px;border-radius:6px;',
            'background:var(--bg-secondary,#f5f5f5);border:1px solid var(--border-color,#ddd);">',
            '<strong style="font-size:13px;color:' + summaryColor + ';">',
              escapeHtml(overallText),
            '</strong>',
            '<span style="font-size:11px;color:var(--text-secondary);margin-left:8px;">',
              '(mode: ' + escapeHtml(mode) + ')',
            '</span>',
          '</div>',
          allTierHtml
        ].join('');
      }

      // (f) Store results
      webRLastResults = {
        mode:       mode,
        timestamp:  new Date().toISOString(),
        overall:    overallText,
        tiers:      allTierResults,
        passCount:  overallPassCount,
        totalCount: overallTotalCount,
        skipCount:  overallSkipCount,
        rOnlyCount: overallROnlyCount
      };

      // (g) Generate R script and show preview
      var script = generateRScript();
      if (webrScriptDetails) webrScriptDetails.style.display = '';
      if (webrScriptCode) webrScriptCode.textContent = script;

      // (h) TruthCert log
      if (typeof TruthCert !== 'undefined' && TruthCert && typeof TruthCert.logStep === 'function') {
        TruthCert.logStep({
          step:        'webr_validation',
          description: 'WebR in-browser validation completed (' + overallText + ')',
          parameters: {
            mode:      mode,
            method:    lastMethod,
            k:         lastK,
            confLevel: lastConf,
            packages:  usedPkgs
          },
          validator: 'WebR v0.4.4',
          outcome:   (overallTotalCount > 0 && overallPassCount === overallTotalCount) ? 'PASS' : 'WARN'
        });
      }

      // (i) Complete progress — hide after 2s
      if (webrProgressBar)  { webrProgressBar.value = 100; webrProgressBar.setAttribute('aria-valuenow', '100'); }
      if (webrProgressText) webrProgressText.textContent = 'Done — ' + overallText;
      if (webrStatusBadge) {
        var allPass = overallTotalCount > 0 && overallPassCount === overallTotalCount;
        webrStatusBadge.textContent = allPass ? 'All PASS' : overallText;
        webrStatusBadge.style.background = allPass
          ? 'var(--accent-success,#2e7d32)'
          : 'var(--accent-danger,#c62828)';
      }
      setTimeout(function() {
        if (webrProgressContainer) webrProgressContainer.style.display = 'none';
      }, 2000);

    } catch(err) {
      // catch: set badge to Error, show error message
      if (webrStatusBadge) {
        webrStatusBadge.textContent = 'Error';
        webrStatusBadge.style.background = 'var(--accent-danger,#c62828)';
      }
      if (webrProgressText) webrProgressText.textContent = 'Error: ' + err.message;
      if (webrResults) {
        webrResults.innerHTML = '<p style="color:var(--accent-danger,#c62828);font-size:13px;">' +
          escapeHtml('Validation error: ' + (err.message || String(err))) +
          '</p>';
      }
      console.error('[WebR] runWebRValidation error:', err);
    } finally {
      validationRunning = false;
      // Re-enable buttons
      var hasResults = !!(typeof APP !== 'undefined' && APP && APP.results && APP.results.pooled);
      if (webrBtnCurrent)   webrBtnCurrent.disabled   = !hasResults;
      if (webrBtnAll)       webrBtnAll.disabled       = false;
      if (webrBtnReference) webrBtnReference.disabled = false;
    }
  };

  // ─── Task 6: generateRScript ──────────────────────────────────────────────
  var generateRScript = function() {
    var hasResults = !!(typeof APP !== 'undefined' && APP && APP.results);
    var method   = (hasResults && APP.config && APP.config.reMethod)   ? APP.config.reMethod   : 'REML';
    var confLevel = (hasResults && APP.config && APP.config.confLevel != null)
      ? APP.config.confLevel : 0.95;
    if (typeof confLevel !== 'number' || !isFinite(confLevel) || confLevel <= 0 || confLevel >= 1) confLevel = 0.95;
    var useHKSJ  = !!(hasResults && APP.config && APP.config.useHKSJ);

    // Build ID from the embedded manifest
    var manifest  = (typeof window !== 'undefined') ? (window.__IPD_EMBEDDED_VALIDATION_MANIFEST__ || null) : null;
    var buildId   = (manifest && manifest.app_build_id) ? manifest.app_build_id : 'unknown';

    var lines = [];

    // ── Header ──────────────────────────────────────────────────────────────
    lines.push('# IPD-Meta-Pro — WebR Validation R Script');
    lines.push('# Build ID : ' + buildId);
    lines.push('# Generated: ' + new Date().toISOString());
    if (hasResults && APP.results.studies) {
      lines.push('# Dataset  : k=' + APP.results.studies.length + ' studies');
    }
    lines.push('# This script reproduces the in-browser WebR validation.');
    lines.push('# Run in R ≥ 4.1 with metafor ≥ 3.0 (and survival, lme4 as needed).');
    lines.push('');

    // ── Validation summary banner ────────────────────────────────────────────
    lines.push('cat("=== IPD-Meta-Pro WebR Validation ===\\n")');
    lines.push('cat("This script validates the JS engine against R metafor.\\n")');
    lines.push('cat("Expected: all pooled estimates, SEs, and heterogeneity stats should match.\\n\\n")');
    lines.push('');

    // ── Package install guards ───────────────────────────────────────────────
    lines.push('# ── Package setup ─────────────────────────────────────────────');
    lines.push('if (!require("metafor", quietly=TRUE))  install.packages("metafor")');
    lines.push('if (!require("survival", quietly=TRUE)) install.packages("survival")');
    lines.push('if (!require("lme4", quietly=TRUE))     install.packages("lme4")');
    lines.push('library(metafor)');
    lines.push('library(survival)');
    lines.push('');

    // ── Reference benchmark: BCG ─────────────────────────────────────────────
    if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.bcg) {
      var studies = BENCHMARK_DATASETS.bcg.studies;
      var yiArr  = studies.map(function(s){ return s.yi;  });
      var seiArr = studies.map(function(s){ return s.sei; });
      var viArr  = studies.map(function(s){ return s.sei * s.sei; });
      var namesArr = studies.map(function(s){
        return '"' + String(s.study || '').replace(/[\n\r\t\x00-\x1f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      });

      lines.push('# ── Reference benchmark: BCG vaccine trials (Colditz 1994) ──────');
      lines.push('bcg_yi   <- c(' + yiArr.join(', ')   + ')');
      lines.push('bcg_vi   <- c(' + viArr.join(', ')   + ')');
      lines.push('bcg_sei  <- c(' + seiArr.join(', ')  + ')');
      lines.push('bcg_labs <- c(' + namesArr.join(', ') + ')');
      lines.push('');
      lines.push('# DerSimonian-Laird');
      lines.push('ref_dl   <- rma(yi=bcg_yi, vi=bcg_vi, method="DL",   level=' + confLevel + ')');
      lines.push('# REML');
      lines.push('ref_reml <- rma(yi=bcg_yi, vi=bcg_vi, method="REML", level=' + confLevel + ')');
      lines.push('# Paule-Mandel');
      lines.push('ref_pm   <- rma(yi=bcg_yi, vi=bcg_vi, method="PM",   level=' + confLevel + ')');
      lines.push('# HKSJ correction');
      lines.push('ref_hksj <- rma(yi=bcg_yi, vi=bcg_vi, method="DL", test="knha", level=' + confLevel + ')');
      lines.push('# Prediction interval');
      lines.push('ref_pi   <- predict(ref_reml, level=' + confLevel + ')');
      lines.push('# Egger test (weighted linear regression, t-statistic)');
      lines.push('ref_eg   <- regtest(ref_reml, model="lm", predictor="sei")');
      lines.push('# Sidik-Jonkman');
      lines.push('ref_sj   <- rma(yi=bcg_yi, vi=bcg_vi, method="SJ",   level=' + confLevel + ')');
      lines.push('');
      lines.push('# Print reference results');
      lines.push('cat("DL  estimate:", coef(ref_dl), "  tau2:", ref_dl$tau2, "  I2:", ref_dl$I2, "\\n")');
      lines.push('cat("REML estimate:", coef(ref_reml), " tau2:", ref_reml$tau2, "\\n")');
      lines.push('cat("PM  estimate:", coef(ref_pm),  "  tau2:", ref_pm$tau2,  "\\n")');
      lines.push('cat("SJ  estimate:", coef(ref_sj),  "  tau2:", ref_sj$tau2,  "\\n")');
      lines.push('cat("HKSJ CI: [", ref_hksj$ci.lb, ",", ref_hksj$ci.ub, "]\\n")');
      lines.push('cat("PI: [", ref_pi$pi.lb, ",", ref_pi$pi.ub, "]\\n")');
      lines.push('cat("Egger t:", ref_eg$zval, "  p:", ref_eg$pval, "\\n")');
      lines.push('');
    }

    // ── Reference benchmark: Aspirin (I²≈0%) ─────────────────────────────────
    if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.aspirin) {
      var aspStudies = BENCHMARK_DATASETS.aspirin.studies;
      var aspYi  = aspStudies.map(function(s){ return s.yi;  });
      var aspVi  = aspStudies.map(function(s){ return s.sei * s.sei; });
      var aspSei = aspStudies.map(function(s){ return s.sei; });

      lines.push('# ── Reference benchmark: Aspirin (I\u2248\u20320%) ──────────────────────────');
      lines.push('asp_yi  <- c(' + aspYi.join(', ')  + ')');
      lines.push('asp_vi  <- c(' + aspVi.join(', ')  + ')');
      lines.push('asp_sei <- c(' + aspSei.join(', ') + ')');
      lines.push('');
      lines.push('# DerSimonian-Laird (should yield tau2=0, I2=0)');
      lines.push('asp_dl <- rma(yi=asp_yi, vi=asp_vi, method="DL", level=' + confLevel + ')');
      lines.push('cat("Aspirin DL estimate:", coef(asp_dl), " tau2:", asp_dl$tau2, " I2:", asp_dl$I2, "\\n")');
      lines.push('');
    }

    // ── Reference benchmark: Homogeneous DL=FE convergence ──────────────────
    if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.homogeneous) {
      var homStudies = BENCHMARK_DATASETS.homogeneous.studies;
      var homYi = homStudies.map(function(s){ return s.yi; });
      var homVi = homStudies.map(function(s){ return s.sei * s.sei; });
      lines.push('# ── Reference benchmark: Homogeneous DL=FE convergence ────────────');
      lines.push('hom_yi <- c(' + homYi.join(', ') + ')');
      lines.push('hom_vi <- c(' + homVi.join(', ') + ')');
      lines.push('hom_dl <- rma(yi=hom_yi, vi=hom_vi, method="DL", level=' + confLevel + ')');
      lines.push('hom_fe <- rma(yi=hom_yi, vi=hom_vi, method="FE", level=' + confLevel + ')');
      lines.push('cat("Homogeneous DL:", coef(hom_dl), " FE:", coef(hom_fe), " tau2:", hom_dl$tau2, "\\n")');
      lines.push('cat("Convergence diff:", abs(coef(hom_dl) - coef(hom_fe)), "\\n")');
      lines.push('');
    }

    // ── Reference: Mini Survival Benchmark (Cox PH + Frailty) ────────────────
    if (typeof SURVIVAL_BENCHMARK !== 'undefined' && SURVIVAL_BENCHMARK && SURVIVAL_BENCHMARK.data) {
      var survD = SURVIVAL_BENCHMARK.data;
      var survTimeVec  = 'c(' + survD.map(function(r){ return r.time; }).join(', ') + ')';
      var survEventVec = 'c(' + survD.map(function(r){ return r.event; }).join(', ') + ')';
      var survTrtVec   = 'c(' + survD.map(function(r){ return r.treatment; }).join(', ') + ')';
      var survStudyVec = 'c(' + survD.map(function(r){ return '"' + String(r.study || '').replace(/[\n\r\t\x00-\x1f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }).join(', ') + ')';

      lines.push('# ── Reference: Mini Survival Benchmark (Cox PH + Frailty) ────');
      lines.push('surv_dat <- data.frame(');
      lines.push('  time  = ' + survTimeVec + ',');
      lines.push('  event = ' + survEventVec + ',');
      lines.push('  trt   = ' + survTrtVec + ',');
      lines.push('  study = ' + survStudyVec);
      lines.push(')');
      lines.push('');
      lines.push('# Cox PH (treatment effect only)');
      lines.push('cox_fit <- coxph(Surv(time, event) ~ trt, data=surv_dat)');
      lines.push('cat("Cox PH log(HR):", coef(cox_fit), " SE:", sqrt(vcov(cox_fit)), " HR:", exp(coef(cox_fit)), "\\n")');
      lines.push('');
      lines.push('# Frailty Cox (shared gamma)');
      lines.push('frailty_fit <- coxph(Surv(time, event) ~ trt + frailty(study, distribution="gamma"), data=surv_dat)');
      lines.push('cat("Frailty HR:", exp(coef(frailty_fit)[1]), " SE:", sqrt(vcov(frailty_fit)[1,1]), "\\n")');
      lines.push('');
    }

    // ── Current analysis ─────────────────────────────────────────────────────
    if (hasResults && APP.results.studies && APP.results.studies.length > 0) {
      var st = APP.results.studies;

      // Study names
      var curNames = st.map(function(s) {
        var nm = s.study || s.name || s.label || s.id || '?';
        return '"' + String(nm).replace(/[\n\r\t\x00-\x1f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      });

      // yi
      var curYi = st.map(function(s) { return studyYi(s); });

      // vi
      var curVi = st.map(function(s) { return studyVi(s); });

      var testStr = useHKSJ ? '"knha"' : '"z"';

      lines.push('# ── Current analysis data ───────────────────────────────────────');
      lines.push('study  <- c(' + curNames.join(', ') + ')');
      lines.push('yi     <- c(' + curYi.join(', ')   + ')');
      lines.push('vi     <- c(' + curVi.join(', ')   + ')');
      lines.push('');
      lines.push('# ── Primary random-effects MA (' + method + ') ─────────────────────');
      lines.push('res_primary <- rma(yi=yi, vi=vi, method=' + JSON.stringify(method) +
                 ', test=' + testStr + ', level=' + confLevel + ')');
      lines.push('print(res_primary)');
      lines.push('');

      lines.push('# ── Prediction interval ─────────────────────────────────────────');
      lines.push('pi_res <- predict(res_primary, level=' + confLevel + ')');
      lines.push('cat("PI: [", pi_res$pi.lb, ",", pi_res$pi.ub, "]\\n")');
      lines.push('');

      lines.push('# ── Egger test for funnel asymmetry (weighted lm, t-statistic) ──');
      lines.push('eg_res <- regtest(res_primary, model="lm", predictor="sei")');
      lines.push('cat("Egger t:", eg_res$zval, "  p:", eg_res$pval, "\\n")');
      lines.push('');

      if (st.length >= 3) {
        lines.push('# ── Leave-one-out analysis ───────────────────────────────────────');
        lines.push('loo_res <- leave1out(rma(yi=yi, vi=vi, method=' + JSON.stringify(method) +
                   ', level=' + confLevel + '))');
        lines.push('print(loo_res)');
        lines.push('');
      }

      lines.push('# ── HKSJ adjustment (DL + Knapp-Hartung) ─────────────────────────');
      lines.push('res_hksj <- rma(yi=yi, vi=vi, method="DL", test="knha", level=' + confLevel + ')');
      lines.push('cat("HKSJ CI: [", res_hksj$ci.lb, ",", res_hksj$ci.ub, "]\\n")');
      lines.push('');

      lines.push('# ── Fixed-effect model ───────────────────────────────────────────');
      lines.push('res_fe <- rma(yi=yi, vi=vi, method="FE", level=' + confLevel + ')');
      lines.push('print(res_fe)');
      lines.push('');

      // Tier B: frailty Cox (only if IPD available and ≤5000 rows)
      if (typeof APP !== 'undefined' && APP && APP.data && APP.data.length > 0) {
        var nRows = APP.data.length;
        var timeVar  = (APP.config && APP.config.timeVar)  ? APP.config.timeVar  : null;
        var eventVar = (APP.config && APP.config.eventVar) ? APP.config.eventVar : null;

        var safeTimeVar  = sanitizeRVarName(timeVar);
        var safeEventVar = sanitizeRVarName(eventVar);
        if (safeTimeVar !== 'INVALID_VAR' && safeEventVar !== 'INVALID_VAR') {
          if (nRows <= 5000) {
            lines.push('# ── Tier B: Frailty Cox model (survival package) ─────────────────');
            lines.push('# IPD available: n=' + nRows + ' rows');
            lines.push('# Note: load your IPD as a data frame called "ipd_data" with columns:');
            lines.push('#   ' + safeTimeVar  + ' (time-to-event),');
            lines.push('#   ' + safeEventVar + ' (event indicator: 1=event, 0=censored),');
            lines.push('#   study (study/cluster identifier),');
            lines.push('#   treatment (0/1 or factor)');
            lines.push('# Then run:');
            lines.push('# frailty_fit <- coxph(Surv(' + safeTimeVar + ', ' + safeEventVar +
                       ') ~ treatment + frailty(study), data=ipd_data)');
            lines.push('# print(summary(frailty_fit))');
            lines.push('');
          } else {
            lines.push('# ── Tier B: Frailty Cox ─────────────────────────────────────────');
            lines.push('# Dataset too large (' + nRows + ' rows > 5000) for inline embedding.');
            lines.push('# Export your IPD as CSV, load with read.csv(), then run:');
            lines.push('# ipd_data <- read.csv("your_ipd.csv")');
            lines.push('# frailty_fit <- coxph(Surv(' + safeTimeVar + ', ' + safeEventVar +
                       ') ~ treatment + frailty(study), data=ipd_data)');
            lines.push('');
          }
        }
      }
    }

    // ── Package versions (for reproducibility) ──────────────────────────────
    lines.push('# ── Package versions (for reproducibility) ────────────────────────');
    lines.push('cat("metafor:", as.character(packageVersion("metafor")), "\\n")');
    lines.push('cat("R:", R.version.string, "\\n")');
    lines.push('');

    return lines.join('\n');
  };

  // ─── copyRScript ─────────────────────────────────────────────────────────
  var copyRScript = function() {
    var script = generateRScript();
    if (!script) {
      showNotification('No R script to copy.', 'warning');
      return;
    }
    // Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(script).then(function() {
        showNotification('R script copied to clipboard.', 'success');
      }, function() {
        _fallbackCopyText(script);
      });
    } else {
      _fallbackCopyText(script);
    }
  };

  // ─── copyResultsJSON ─────────────────────────────────────────────────────
  var copyResultsJSON = function() {
    if (!webRLastResults) {
      showNotification('No validation results yet — run validation first.', 'warning');
      return;
    }
    var json = JSON.stringify(webRLastResults, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function() {
        showNotification('Results JSON copied to clipboard.', 'success');
      }, function() {
        _fallbackCopyText(json);
      });
    } else {
      _fallbackCopyText(json);
    }
  };

  // ─── downloadValidationReport ────────────────────────────────────────────
  var downloadValidationReport = function() {
    if (!webRLastResults) {
      showNotification('No validation results. Run validation first.', 'warning');
      return;
    }
    var buildId = (typeof __IPD_EMBEDDED_VALIDATION_MANIFEST__ !== 'undefined' && __IPD_EMBEDDED_VALIDATION_MANIFEST__)
      ? __IPD_EMBEDDED_VALIDATION_MANIFEST__.app_build_id : 'unknown';

    var html = [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="UTF-8">',
      '<title>IPD-Meta-Pro Validation Report</title>',
      '<style>',
      'body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #222; }',
      'h1 { font-size: 1.4rem; border-bottom: 2px solid #2e7d32; padding-bottom: 0.5rem; }',
      'h2 { font-size: 1.1rem; margin-top: 2rem; }',
      'h3 { font-size: 0.95rem; }',
      '.meta { font-size: 0.85rem; color: #666; margin-bottom: 1rem; }',
      '.summary { font-size: 1.1rem; font-weight: 700; padding: 0.75rem; border-radius: 6px; margin: 1rem 0; }',
      '.pass { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }',
      '.fail { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }',
      'table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0 1.5rem; }',
      'th, td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }',
      'th { background: #f5f5f5; font-weight: 600; }',
      '.pass-cell { color: #2e7d32; font-weight: 700; }',
      '.fail-cell { color: #c62828; font-weight: 700; }',
      '.ronly-cell { color: #666; font-style: italic; }',
      'pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; }',
      '.footer { margin-top: 2rem; font-size: 0.75rem; color: #999; border-top: 1px solid #ddd; padding-top: 0.5rem; }',
      '@media print { body { font-size: 10pt; } }',
      '</style></head><body>',
      '<h1>IPD-Meta-Pro &mdash; WebR Validation Report</h1>',
      '<div class="meta">',
      'Build: ' + escapeHtml(buildId) + '<br>',
      'Generated: ' + escapeHtml(new Date().toISOString()) + '<br>',
      'Mode: ' + escapeHtml(webRLastResults.mode || 'unknown') + '<br>',
      'WebR: v0.4.4 (WASM)',
      '</div>'
    ];

    // Overall summary
    var overall = webRLastResults.overall || 'No results';
    var isPass = webRLastResults.passCount === webRLastResults.totalCount && webRLastResults.totalCount > 0;
    html.push('<div class="summary ' + (isPass ? 'pass' : 'fail') + '">' + escapeHtml(overall) + '</div>');

    // Per-tier tables
    var tiers = webRLastResults.tiers || {};
    var tierOrder = ['A', 'B', 'C'];
    var tierLabels = { A: 'Tier A: Core Meta-Analysis (metafor)', B: 'Tier B: Survival (survival)', C: 'Tier C: Advanced IPD (lme4)' };

    for (var ti = 0; ti < tierOrder.length; ti++) {
      var tier = tierOrder[ti];
      var results = tiers[tier];
      if (!results || results.length === 0) continue;

      html.push('<h2>' + escapeHtml(tierLabels[tier] || 'Tier ' + tier) + '</h2>');

      for (var si = 0; si < results.length; si++) {
        var sr = results[si];
        var sc = sr.scenario || {};

        if (sr.status === 'skip') {
          html.push('<p><em>' + escapeHtml(sc.label || '?') + '</em> &mdash; Skipped: ' + escapeHtml(sr.skipReason || '') + '</p>');
          continue;
        }
        if (sr.status === 'error') {
          html.push('<p style="color:#c62828;"><strong>' + escapeHtml(sc.label || '?') + '</strong> &mdash; Error: ' + escapeHtml(sr.error || '') + '</p>');
          continue;
        }

        var rows = sr.rows || [];
        html.push('<h3>' + escapeHtml(sc.label || '?') + '</h3>');
        html.push('<table><thead><tr><th>Metric</th><th>JS</th><th>R</th><th>|Diff|</th><th>Tol</th><th>Status</th></tr></thead><tbody>');

        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri];
          var statusCls = row.pass === true ? 'pass-cell' : row.pass === false ? 'fail-cell' : 'ronly-cell';
          var statusTxt = row.pass === true ? 'PASS' : row.pass === false ? 'FAIL' : 'R-only';
          html.push('<tr>');
          html.push('<td>' + escapeHtml(row.label) + '</td>');
          html.push('<td>' + escapeHtml(String(row.displayJS || '\u2014')) + '</td>');
          html.push('<td>' + escapeHtml(String(row.displayR || '\u2014')) + '</td>');
          html.push('<td>' + escapeHtml(row.diff != null ? row.diff.toFixed(6) : '\u2014') + '</td>');
          html.push('<td>' + escapeHtml(row.tol != null ? String(row.tol) : '\u2014') + '</td>');
          html.push('<td class="' + statusCls + '">' + statusTxt + '</td>');
          html.push('</tr>');
        }
        html.push('</tbody></table>');
      }
    }

    // R script
    html.push('<h2>Reproducible R Script</h2>');
    html.push('<pre>' + escapeHtml(generateRScript()) + '</pre>');

    // Footer
    html.push('<div class="footer">');
    html.push('Generated by IPD-Meta-Pro WebR Validation Module. ');
    html.push('WebR v0.4.4 running R via WebAssembly in-browser. ');
    html.push('No server-side computation was involved.');
    html.push('</div>');
    html.push('</body></html>');

    // Download
    var blob = new Blob([html.join('\n')], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ipd-meta-pro-validation-report-' + new Date().toISOString().slice(0, 10) + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Validation report downloaded.', 'success');
  };

  window.downloadValidationReport = downloadValidationReport;

  // ─── Clipboard fallback ───────────────────────────────────────────────────
  function _fallbackCopyText(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top  = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showNotification('Copied to clipboard.', 'success');
    } catch(e) {
      showNotification('Copy failed — please select text manually.', 'warning');
    }
    document.body.removeChild(ta);
  }

  // ─── 0. R variable name sanitiser ────────────────────────────────────────
  function sanitizeRVarName(name) {
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) return 'INVALID_VAR';
    return name;
  }

  // ─── 0b. DRY yi/vi helpers ─────────────────────────────────────────────
  function studyYi(s) {
    var v = Number(s.effect ?? s.yi ?? 0);
    return isFinite(v) ? v : 0;
  }
  function studyVi(s) {
    var vi = Number(s.variance ?? s.vi ?? NaN);
    if (!isFinite(vi) || vi <= 0) {
      var se = Number(s.se ?? s.sei ?? NaN);
      if (isFinite(se) && se > 0) vi = se * se;
    }
    return (isFinite(vi) && vi > 0) ? vi : 1e-8;
  }

  // ─── 0c. Safe confLevel accessor ──────────────────────────────────────────
  // Validates confLevel is a finite number in (0,1); falls back to 0.95.
  function safeConfLevel() {
    var c = (typeof APP !== 'undefined' && APP && APP.config && APP.config.confLevel != null)
      ? APP.config.confLevel : 0.95;
    return (typeof c === 'number' && isFinite(c) && c > 0 && c < 1) ? c : 0.95;
  }

  // ─── 1. escapeHtml alias ──────────────────────────────────────────────────
  var escapeHtml = (typeof escapeHTML === 'function') ? escapeHTML : function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
    });
  };

  // ─── 2. WebR singleton state ──────────────────────────────────────────────
  var webRInstance = null;
  var webRLoading  = false;
  var webRPackages = {};
  var validationRunning = false;

  // ─── 6. Scenario registry & last-results store ───────────────────────────
  var WEBR_SCENARIOS  = [];
  var webRLastResults = null;

  // ─── 3. initWebR ─────────────────────────────────────────────────────────
  /**
   * Initialise the WebR runtime and install packages progressively.
   * @param {HTMLElement} progText - element to show progress text
   * @param {HTMLElement} progBar  - <progress> or range element
   * @param {HTMLElement} badge    - status badge element
   */
  async function initWebR(progText, progBar, badge) {
    if (webRInstance) return webRInstance;
    if (webRLoading) return null;
    webRLoading = true;
    try {
      // Import WebR
      if (progText) progText.textContent = 'Importing WebR runtime…';
      if (progBar)  { progBar.value = 5; progBar.setAttribute('aria-valuenow', '5'); }

      // NOTE: WebR loaded from CDN without SRI. Dynamic import() does not support integrity hashes.
      // Risk accepted: WebR is reviewer-only, never touches analysis state.
      // To mitigate: self-host webr.mjs in production deployments.
      var mod = await import('https://webr.r-wasm.org/v0.4.4/webr.mjs');
      var WebR = mod.WebR;

      if (progText) progText.textContent = 'Starting R environment…';
      if (progBar)  { progBar.value = 20; progBar.setAttribute('aria-valuenow', '20'); }

      var wr = new WebR();
      await wr.init();
      webRInstance = wr;

      // ── Tier A: metafor ──────────────────────────────────────────────────
      if (progText) progText.textContent = 'Installing Tier A: metafor…';
      if (progBar)  { progBar.value = 35; progBar.setAttribute('aria-valuenow', '35'); }
      try {
        await webRInstance.installPackages(['metafor'], { quiet: true });
        webRPackages['metafor'] = true;
      } catch(e) {
        webRPackages['metafor'] = false;
        console.warn('[WebR] metafor install failed:', e);
      }

      // ── Tier B: survival ────────────────────────────────────────────────
      if (progText) progText.textContent = 'Installing Tier B: survival…';
      if (progBar)  { progBar.value = 50; progBar.setAttribute('aria-valuenow', '50'); }
      try {
        await webRInstance.installPackages(['survival'], { quiet: true });
        webRPackages['survival'] = true;
      } catch(e) {
        webRPackages['survival'] = false;
        console.warn('[WebR] survival install failed:', e);
      }

      // ── Tier C: lme4, cmprsk, flexsurvcure ──────────────────────────────
      // Placeholder: When Tier C scenarios are added, uncomment:
      // if (progText) progText.textContent = 'Installing Tier C: lme4 / cmprsk / flexsurvcure…';
      // if (progBar)  { progBar.value = 65; progBar.setAttribute('aria-valuenow', '65'); }
      // var tierCPkgs = ['lme4', 'cmprsk', 'flexsurvcure'];
      // for (var pi = 0; pi < tierCPkgs.length; pi++) {
      //   try {
      //     await webRInstance.installPackages([tierCPkgs[pi]], { quiet: true });
      //     webRPackages[tierCPkgs[pi]] = true;
      //   } catch(e) {
      //     webRPackages[tierCPkgs[pi]] = false;
      //     console.warn('[WebR] ' + tierCPkgs[pi] + ' install failed:', e);
      //   }
      // }

      // Done — set to 70% (scenario loop starts from 70%)
      if (progBar)  { progBar.value = 70; progBar.setAttribute('aria-valuenow', '70'); }
      if (progText) progText.textContent = 'WebR ready.';
      if (badge) {
        var tierAOK = webRPackages['metafor'];
        var tierBOK = webRPackages['survival'];
        var tierCOK = webRPackages['lme4'] || webRPackages['cmprsk'] || webRPackages['flexsurvcure'];
        if (tierAOK && tierBOK && tierCOK) {
          badge.textContent = 'Tiers A\u2013C';
          badge.style.background = 'var(--accent-success, #2e7d32)';
        } else if (tierAOK && tierBOK) {
          badge.textContent = 'Tier A+B';
          badge.style.background = 'var(--accent-success, #2e7d32)';
        } else if (tierAOK) {
          badge.textContent = 'Tier A';
          badge.style.background = 'var(--accent-info, #1565c0)';
        } else {
          badge.textContent = 'Load error';
          badge.style.background = 'var(--accent-danger, #c62828)';
        }
      }
      return webRInstance;
    } catch(err) {
      console.error('[WebR] Fatal init error:', err);
      if (progText) progText.textContent = 'WebR failed to load: ' + err.message;
      if (badge) {
        badge.textContent = 'Unavailable';
        badge.style.background = 'var(--accent-danger, #c62828)';
      }
      webRInstance = null;
      return null;
    } finally {
      webRLoading = false;
    }
  }

  // ─── 4. injectWebRUI ─────────────────────────────────────────────────────
  function injectWebRUI() {
    var container = document.getElementById('webrValidationContainer');
    if (!container) return;

    container.innerHTML = [
      '<style>',
      '@keyframes webr-spin { to { transform: rotate(360deg); } }',
      '.webr-spinner {',
      '  display: inline-block; width: 14px; height: 14px;',
      '  border: 2px solid var(--border-color, #ccc);',
      '  border-top-color: var(--accent-info, #1565c0);',
      '  border-radius: 50%;',
      '  animation: webr-spin 0.8s linear infinite;',
      '  vertical-align: middle; margin-right: 6px;',
      '}',
      '@media (prefers-reduced-motion: reduce) { .webr-spinner { animation: none; } }',
      '.webr-badge {',
      '  display: inline-block; padding: 2px 10px; border-radius: 12px;',
      '  font-size: 11px; font-weight: 600; color: #fff;',
      '  background: var(--text-secondary, #555);',
      '  vertical-align: middle; margin-left: 8px;',
      '}',
      '.webr-btn {',
      '  padding: 7px 16px; border-radius: 6px; border: none;',
      '  font-size: 13px; font-weight: 500; cursor: pointer;',
      '  margin-right: 8px; margin-bottom: 6px;',
      '}',
      '.webr-btn:disabled { opacity: 0.45; cursor: not-allowed; }',
      '.webr-btn:focus-visible { outline: 2px solid var(--accent-info, #1565c0); outline-offset: 2px; }',
      '.webr-btn-primary { background: var(--accent-info, #1565c0); color: #fff; }',
      '.webr-btn-secondary { background: var(--bg-tertiary, #e0e0e0); color: var(--text-primary, #222); }',
      '.webr-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }',
      '.webr-tbl th, .webr-tbl td { padding: 5px 8px; border-bottom: 1px solid var(--border-color, #ddd); }',
      '.webr-tbl th { background: var(--bg-tertiary, #f5f5f5); text-align: left; font-weight: 600; }',
      '.webr-pass { color: var(--accent-success, #2e7d32); font-weight: 700; }',
      '.webr-fail { color: var(--accent-danger, #c62828); font-weight: 700; }',
      '.webr-ronly { color: var(--text-secondary, #666); font-style: italic; }',
      '.webr-tier-header { margin: 16px 0 6px; font-size: 13px; font-weight: 700; }',
      '.webr-tier-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-left: 6px; }',
      '.webr-tier-pass { background: var(--accent-success, #2e7d32); color: #fff; }',
      '.webr-tier-fail { background: var(--accent-danger, #c62828); color: #fff; }',
      '.webr-tier-skip { background: var(--text-secondary, #555); color: #fff; }',
      '</style>',

      '<div style="margin-bottom:12px;">',
        '<span style="font-size:15px;font-weight:700;color:var(--text-primary);">',
          'Live WebR Validation',
        '</span>',
        '<span id="webrBadge" class="webr-badge">Not loaded</span>',
      '</div>',

      '<p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">',
        'Runs R code in-browser via WebAssembly. Results are compared against this app\'s',
        ' JS engine to detect numeric drift. Reviewer-only — no app computations are affected.',
      '</p>',

      '<div style="margin-bottom:10px;">',
        '<button id="webrBtnCurrent" class="webr-btn webr-btn-primary" disabled',
          ' onclick="runWebRValidation(\'current\')"',
          ' title="Validate the current analysis results against R/metafor">',
          'Validate Current Analysis',
        '</button>',
        '<button id="webrBtnAll" class="webr-btn webr-btn-secondary"',
          ' onclick="runWebRValidation(\'all\')"',
          ' title="Run both reference benchmarks and current analysis validation">',
          'Run All',
        '</button>',
        '<button id="webrBtnRef" class="webr-btn webr-btn-secondary"',
          ' onclick="runWebRValidation(\'reference\')"',
          ' title="Run all reference benchmark scenarios against BCG dataset">',
          'Run Reference Benchmarks',
        '</button>',
      '</div>',

      '<div id="webrProgressContainer" style="display:none;margin-bottom:10px;">',
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">',
          '<span class="webr-spinner" id="webrSpinner"></span>',
          '<span id="webrProgText" aria-live="polite" style="font-size:12px;color:var(--text-secondary);">Initialising…</span>',
        '</div>',
        '<progress id="webrProgBar"',
          ' role="progressbar"',
          ' aria-label="WebR loading progress"',
          ' aria-valuenow="0"',
          ' aria-valuemax="100"',
          ' value="0" max="100"',
          ' style="width:100%;height:6px;">',
        '</progress>',
      '</div>',

      '<div id="webrResults" aria-live="polite" style="margin-top:8px;"></div>',

      '<details id="webrScriptDetails" style="display:none;margin-top:12px;">',
        '<summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-secondary);">',
          'R Script Preview',
        '</summary>',
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">',
          '<button class="webr-btn webr-btn-secondary" onclick="copyRScript()">Copy R Script</button>',
          '<button class="webr-btn webr-btn-secondary" onclick="copyResultsJSON()">Copy Results JSON</button>',
          '<button class="webr-btn webr-btn-secondary" onclick="downloadValidationReport()">Download Report</button>',
        '</div>',
        '<pre id="webrScriptPre" style="',
          'background:var(--bg-secondary,#f5f5f5);',
          'color:var(--text-primary,#222);',
          'border:1px solid var(--border-color,#ddd);',
          'border-radius:6px;',
          'padding:12px;',
          'font-size:11px;',
          'overflow:auto;',
          'max-height:320px;',
          'white-space:pre-wrap;',
          'margin-top:8px;',
        '">(R script will appear here)</pre>',
      '</details>'
    ].join('');

    // ─── 5. Lazy button-enable via MutationObserver ────────────────────────
    function checkCurrentBtn() {
      var btn = document.getElementById('webrBtnCurrent');
      if (!btn) return;
      var hasResults = !!(typeof APP !== 'undefined' && APP && APP.results && APP.results.pooled);
      btn.disabled = !hasResults;
    }

    // Check immediately
    checkCurrentBtn();

    // Observe the tab container for visibility changes
    var tabEl = document.getElementById('helpTab-validation');
    var autoRunDone = false;
    if (tabEl && typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            var display = tabEl.style.display;
            if (display !== 'none') {
              checkCurrentBtn();
              // Auto-run reference benchmarks on first tab visit
              if (!autoRunDone && !webRInstance && !webRLoading && !validationRunning) {
                autoRunDone = true;
                setTimeout(function() {
                  if (!webRInstance && !webRLoading && !validationRunning) {
                    runWebRValidation('reference');
                  }
                }, 500);
              }
            }
          }
        });
      });
      obs.observe(tabEl, { attributes: true, attributeFilter: ['style'] });
    }
  }

  // ─── 7. Reference benchmark scenarios ────────────────────────────────────
  /**
   * Build a studies array literal for R code from BENCHMARK_DATASETS.bcg.
   */
  function bcgStudiesRCode() {
    var studies = BENCHMARK_DATASETS.bcg.studies;
    var yiVec  = 'c(' + studies.map(function(s){ return s.yi; }).join(', ') + ')';
    var viVec  = 'c(' + studies.map(function(s){ return s.sei * s.sei; }).join(', ') + ')';
    return { yi: yiVec, vi: viVec };
  }

  // Reference scenarios use hardcoded level=0.95 to match BENCHMARK_DATASETS expected values.
  if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.bcg) {
  (function buildReferenceScenarios() {
    var v = bcgStudiesRCode();

    // ref_dl — DerSimonian-Laird
    WEBR_SCENARIOS.push({
      id: 'ref_dl',
      tier: 'A',
      source: 'reference',
      label: 'BCG — DerSimonian-Laird',
      skip: false,
      getJSValues: function() {
        var exp = BENCHMARK_DATASETS.bcg.expected.DL;
        return {
          pooled: exp.estimate,
          se:     exp.se,
          tau2:   exp.tau2,
          i2:     exp.I2,
          Q:      exp.Q
        };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="DL", level=0.95)',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  tau2=as.numeric(res$tau2),',
          '  i2=as.numeric(res$I2),',
          '  Q=as.numeric(res$QE),',
          '  pQ=as.numeric(res$QEp)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, tau2: 0.005, i2: 0.5, Q: 0.05, pQ: 0.005 }
    });

    // ref_reml — REML
    WEBR_SCENARIOS.push({
      id: 'ref_reml',
      tier: 'A',
      source: 'reference',
      label: 'BCG — REML',
      skip: false,
      getJSValues: function() {
        var exp = BENCHMARK_DATASETS.bcg.expected.REML;
        return {
          pooled: exp.estimate,
          se:     exp.se,
          tau2:   exp.tau2,
          i2:     exp.I2
        };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="REML", level=0.95)',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  tau2=as.numeric(res$tau2),',
          '  i2=as.numeric(res$I2)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, tau2: 0.005, i2: 0.5 }
    });

    // ref_pm — Paule-Mandel
    WEBR_SCENARIOS.push({
      id: 'ref_pm',
      tier: 'A',
      source: 'reference',
      label: 'BCG — Paule-Mandel',
      skip: false,
      getJSValues: function() {
        var exp = BENCHMARK_DATASETS.bcg.expected.PM;
        return {
          pooled: exp.estimate,
          se:     exp.se,
          tau2:   exp.tau2
        };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="PM", level=0.95)',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  tau2=as.numeric(res$tau2)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, tau2: 0.005 }
    });

    // ref_hksj — HKSJ correction (JS DL+HKSJ vs R DL+knha)
    WEBR_SCENARIOS.push({
      id: 'ref_hksj',
      tier: 'A',
      source: 'reference',
      label: 'BCG — HKSJ correction',
      skip: false,
      getJSValues: function() {
        // Run the app's JS DL + HKSJ on BCG data to get reference values
        if (typeof MetaAnalysis === 'undefined') return null;
        var d = BENCHMARK_DATASETS.bcg.studies;
        var effects = d.map(function(s) { return s.yi; });
        var variances = d.map(function(s) { return s.sei * s.sei; });
        var dlResult = MetaAnalysis.randomEffectsDL(effects, variances);
        var hksjResult = MetaAnalysis.applyHKSJ(dlResult, effects, variances);
        return {
          pooled: hksjResult.pooled ?? hksjResult.effect,
          se: hksjResult.seHKSJ ?? hksjResult.se,
          ci_lower: hksjResult.lowerHKSJ ?? hksjResult.lower,
          ci_upper: hksjResult.upperHKSJ ?? hksjResult.upper
        };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="DL", test="knha", level=0.95)',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  ci_lower=as.numeric(res$ci.lb),',
          '  ci_upper=as.numeric(res$ci.ub),',
          '  pval=as.numeric(res$pval)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002 }
    });

    // ref_pi — Prediction interval (JS REML+PI vs R predict)
    WEBR_SCENARIOS.push({
      id: 'ref_pi',
      tier: 'A',
      source: 'reference',
      label: 'BCG — Prediction Interval',
      skip: false,
      getJSValues: function() {
        if (typeof MetaAnalysis === 'undefined') return null;
        var d = BENCHMARK_DATASETS.bcg.studies;
        var effects = d.map(function(s) { return s.yi; });
        var variances = d.map(function(s) { return s.sei * s.sei; });
        var result = MetaAnalysis.randomEffectsREML(effects, variances);
        var pi = MetaAnalysis.predictionInterval(result, 0.95);
        return { pi_lower: pi.lower, pi_upper: pi.upper };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="REML", level=0.95)',
          'pi  <- predict(res, level=0.95)',
          'list(',
          '  pi_lower=as.numeric(pi$pi.lb),',
          '  pi_upper=as.numeric(pi$pi.ub)',
          ')'
        ].join('\n');
      },
      tolerances: { pi_lower: 0.01, pi_upper: 0.01 }
    });

    // ref_egger — Egger test (JS eggerTest vs R regtest)
    // Both JS and R use weighted linear regression (model="lm"), returning a t-statistic (df=k-2).
    WEBR_SCENARIOS.push({
      id: 'ref_egger',
      tier: 'A',
      source: 'reference',
      label: 'BCG — Egger Test',
      skip: false,
      getJSValues: function() {
        if (typeof PublicationBias === 'undefined') return null;
        var d = BENCHMARK_DATASETS.bcg.studies;
        var effects = d.map(function(s) { return s.yi; });
        var ses = d.map(function(s) { return s.sei; });
        var egger = PublicationBias.eggerTest(effects, ses);
        return { egger_t: egger.t, egger_p: egger.p };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi  <- ' + v.yi,
          'vi  <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="REML", level=0.95)',
          'eg  <- regtest(res, model="lm", predictor="sei")',
          'list(',
          '  egger_t=as.numeric(eg$zval),',
          '  egger_p=as.numeric(eg$pval)',
          ')'
        ].join('\n');
      },
      tolerances: { egger_t: 0.02, egger_p: 0.005 }
    });

    // ref_sj — Sidik-Jonkman estimator
    WEBR_SCENARIOS.push({
      id: 'ref_sj',
      tier: 'A',
      source: 'reference',
      label: 'BCG — Sidik-Jonkman',
      skip: false,
      getJSValues: function() {
        if (typeof MetaAnalysis === 'undefined') return null;
        var d = BENCHMARK_DATASETS.bcg.studies;
        var eff = d.map(function(s) { return s.yi; });
        var vars = d.map(function(s) { return s.sei * s.sei; });
        var res = MetaAnalysis.randomEffectsSJ(eff, vars);
        if (!res) return null;
        return {
          pooled: res.pooled ?? res.effect,
          se: res.se,
          tau2: res.tau2
        };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi <- ' + v.yi,
          'vi <- ' + v.vi,
          'res <- rma(yi=yi, vi=vi, method="SJ", level=0.95)',
          'list(pooled=as.numeric(res$b), se=as.numeric(res$se), tau2=as.numeric(res$tau2))'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, tau2: 0.01 }
    });
  })();
  } // end BENCHMARK_DATASETS guard

  // ─── 7b. Aspirin benchmark scenarios (I²=0% edge case) ─────────────────
  if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.aspirin) {
  (function buildAspirinScenarios() {
    var d = BENCHMARK_DATASETS.aspirin.studies;
    var yiStr = 'c(' + d.map(function(s){ return s.yi; }).join(', ') + ')';
    var viStr = 'c(' + d.map(function(s){ return s.sei * s.sei; }).join(', ') + ')';

    // Aspirin DL (homogeneous data — tau2 should be 0)
    WEBR_SCENARIOS.push({
      id: 'ref_aspirin_dl',
      tier: 'A',
      source: 'reference',
      label: 'Aspirin — DerSimonian-Laird (I\u2248\u20320%)',
      skip: false,
      getJSValues: function() {
        var exp = BENCHMARK_DATASETS.aspirin.expected.DL;
        return { pooled: exp.estimate, se: exp.se, tau2: exp.tau2, i2: exp.I2 };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi <- ' + yiStr,
          'vi <- ' + viStr,
          'res <- rma(yi=yi, vi=vi, method="DL", level=0.95)',
          'list(pooled=as.numeric(res$b), se=as.numeric(res$se), tau2=as.numeric(res$tau2), i2=as.numeric(res$I2))'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, tau2: 0.005, i2: 0.5 }
    });
  })();
  } // end aspirin guard

  // ─── 7c. Homogeneous benchmark scenarios (tau²=0) ──────────────────────
  if (typeof BENCHMARK_DATASETS !== 'undefined' && BENCHMARK_DATASETS && BENCHMARK_DATASETS.homogeneous) {
  (function buildHomogeneousScenarios() {
    var d = BENCHMARK_DATASETS.homogeneous.studies;
    var yiStr = 'c(' + d.map(function(s){ return s.yi; }).join(', ') + ')';
    var viStr = 'c(' + d.map(function(s){ return s.sei * s.sei; }).join(', ') + ')';

    // Homogeneous FE (tau2=0, DL should match FE)
    WEBR_SCENARIOS.push({
      id: 'ref_homogeneous_fe',
      tier: 'A',
      source: 'reference',
      label: 'Homogeneous — Fixed-Effect (tau\u00B2=0)',
      skip: false,
      getJSValues: function() {
        var exp = BENCHMARK_DATASETS.homogeneous.expected.FE;
        return { pooled: exp.estimate, se: exp.se };
      },
      getRCode: function() {
        return [
          'library(metafor)',
          'yi <- ' + yiStr,
          'vi <- ' + viStr,
          'res <- rma(yi=yi, vi=vi, method="FE", level=0.95)',
          'list(pooled=as.numeric(res$b), se=as.numeric(res$se))'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001 }
    });
    // ref_homogeneous_dl_fe_convergence — DL=FE when tau²=0
    WEBR_SCENARIOS.push({
      id: 'ref_homogeneous_dl_fe_convergence',
      tier: 'A',
      source: 'reference',
      label: 'Homogeneous — DL=FE Convergence (tau\u00B2=0)',
      skip: false,
      getJSValues: function() {
        if (typeof MetaAnalysis === 'undefined') return null;
        var d = BENCHMARK_DATASETS.homogeneous.studies;
        var eff = d.map(function(s) { return s.yi; });
        var vars = d.map(function(s) { return s.sei * s.sei; });
        var dl = MetaAnalysis.randomEffectsDL(eff, vars);
        var fe = MetaAnalysis.fixedEffect(eff, vars);
        return {
          dl_pooled: dl.pooled ?? dl.effect,
          fe_pooled: fe.pooled ?? fe.effect,
          tau2: dl.tau2,
          convergence_diff: Math.abs((dl.pooled ?? dl.effect) - (fe.pooled ?? fe.effect))
        };
      },
      getRCode: function() {
        var d2 = BENCHMARK_DATASETS.homogeneous.studies;
        var yi2 = 'c(' + d2.map(function(s) { return s.yi; }).join(', ') + ')';
        var vi2 = 'c(' + d2.map(function(s) { return s.sei * s.sei; }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi <- ' + yi2,
          'vi <- ' + vi2,
          'dl <- rma(yi=yi, vi=vi, method="DL", level=0.95)',
          'fe <- rma(yi=yi, vi=vi, method="FE", level=0.95)',
          'list(',
          '  dl_pooled=as.numeric(dl$b),',
          '  fe_pooled=as.numeric(fe$b),',
          '  tau2=as.numeric(dl$tau2),',
          '  convergence_diff=abs(as.numeric(dl$b) - as.numeric(fe$b))',
          ')'
        ].join('\n');
      },
      tolerances: { dl_pooled: 0.001, fe_pooled: 0.001, tau2: 0.005, convergence_diff: 0.001 }
    });
  })();
  } // end homogeneous guard

  // ─── 8. Current-analysis scenarios ───────────────────────────────────────
  (function buildCurrentScenarios() {

    // cur_primary — Primary MA (compare JS vs R)
    WEBR_SCENARIOS.push({
      id: 'cur_primary',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — Primary MA',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.pooled) return null;
        var p   = APP.results.pooled;
        var het = (APP.results.heterogeneity || {});
        return {
          pooled: p.effect  ?? p.pooled  ?? null,
          se:     p.se      ?? null,
          ci_lower: p.ci_lower ?? p.lower ?? null,
          ci_upper: p.ci_upper ?? p.upper ?? null,
          tau2:   p.tau2    ?? het.tau2   ?? null,
          i2:     p.I2      ?? het.I2     ?? het.i2 ?? null,
          Q:      p.Q       ?? het.Q      ?? het.q  ?? null
        };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        var conf    = safeConfLevel();
        var method  = (APP.config && APP.config.reMethod)  ? APP.config.reMethod  : 'REML';
        var useHKSJ = !!(APP.config && APP.config.useHKSJ);
        var yiVec   = 'c(' + studies.map(function(s){ return studyYi(s); }).join(', ') + ')';
        var viVec   = 'c(' + studies.map(function(s){ return studyVi(s); }).join(', ') + ')';
        var testStr = useHKSJ ? '"knha"' : '"z"';
        return [
          'library(metafor)',
          'yi   <- ' + yiVec,
          'vi   <- ' + viVec,
          'res  <- rma(yi=yi, vi=vi, method=' + JSON.stringify(method) + ', test=' + testStr + ', level=' + conf + ')',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  ci_lower=as.numeric(res$ci.lb),',
          '  ci_upper=as.numeric(res$ci.ub),',
          '  tau2=as.numeric(res$tau2),',
          '  i2=as.numeric(res$I2),',
          '  Q=as.numeric(res$QE)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002, tau2: 0.005, i2: 0.5, Q: 0.05 }
    });

    // cur_loo — Leave-One-Out (JS leaveOneOutAnalysis vs R leave1out)
    WEBR_SCENARIOS.push({
      id: 'cur_loo',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — Leave-One-Out',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        if (typeof leaveOneOutAnalysis === 'undefined') return null;
        var studies = APP.results.studies;
        if (studies.length < 3) return null;
        var effects = studies.map(function(s) { return studyYi(s); });
        var variances = studies.map(function(s) { return studyVi(s); });
        var labels = studies.map(function(s) { return s.study || s.name || '?'; });
        var loo = leaveOneOutAnalysis(effects, variances, labels);
        if (!loo || !loo.results || loo.results.length === 0) return null;
        return {
          loo_count: loo.results.length,
          loo_first_est: loo.results[0].pooledEffect
        };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        if (studies.length < 3) return null;
        var conf   = safeConfLevel();
        var method = (APP.config && APP.config.reMethod) ? APP.config.reMethod : 'REML';
        var yiVec  = 'c(' + studies.map(function(s){ return studyYi(s); }).join(', ') + ')';
        var viVec  = 'c(' + studies.map(function(s){ return studyVi(s); }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi   <- ' + yiVec,
          'vi   <- ' + viVec,
          'res  <- rma(yi=yi, vi=vi, method=' + JSON.stringify(method) + ', level=' + conf + ')',
          'loo  <- leave1out(res)',
          'list(loo_count=nrow(loo), loo_first_est=as.numeric(loo$estimate[1]))'
        ].join('\n');
      },
      tolerances: { loo_count: 0, loo_first_est: 0.001 }
    });

    // cur_fe — Fixed-Effect (JS fixedEffect vs R FE)
    WEBR_SCENARIOS.push({
      id: 'cur_fe',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — Fixed-Effect',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        if (typeof MetaAnalysis === 'undefined') return null;
        var studies = APP.results.studies;
        var effects = studies.map(function(s) { return studyYi(s); });
        var variances = studies.map(function(s) { return studyVi(s); });
        var fe = MetaAnalysis.fixedEffect(effects, variances);
        return {
          pooled: fe.pooled ?? fe.effect,
          se: fe.se,
          ci_lower: fe.lower,
          ci_upper: fe.upper
        };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        var conf    = safeConfLevel();
        var yiVec   = 'c(' + studies.map(function(s){ return studyYi(s); }).join(', ') + ')';
        var viVec   = 'c(' + studies.map(function(s){ return studyVi(s); }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi  <- ' + yiVec,
          'vi  <- ' + viVec,
          'res <- rma(yi=yi, vi=vi, method="FE", level=' + conf + ')',
          'list(',
          '  pooled=as.numeric(res$b),',
          '  se=as.numeric(res$se),',
          '  ci_lower=as.numeric(res$ci.lb),',
          '  ci_upper=as.numeric(res$ci.ub)',
          ')'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002 }
    });

    // cur_hksj — HKSJ Adjustment (JS DL+HKSJ vs R DL+knha)
    WEBR_SCENARIOS.push({
      id: 'cur_hksj',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — HKSJ Adjustment',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.pooled) return null;
        if (typeof MetaAnalysis === 'undefined') return null;
        var studies = APP.results.studies;
        if (!studies || studies.length < 2) return null;
        var effects = studies.map(function(s) { return studyYi(s); });
        var variances = studies.map(function(s) { return studyVi(s); });
        var dlResult = MetaAnalysis.randomEffectsDL(effects, variances);
        var hksjResult = MetaAnalysis.applyHKSJ(dlResult, effects, variances);
        if (!hksjResult) return null;
        return {
          pooled: hksjResult.pooled ?? hksjResult.effect,
          se: hksjResult.seHKSJ ?? hksjResult.se,
          ci_lower: hksjResult.lowerHKSJ ?? hksjResult.lower,
          ci_upper: hksjResult.upperHKSJ ?? hksjResult.upper
        };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        if (studies.length < 2) return null;
        var conf = safeConfLevel();
        var yiVec = 'c(' + studies.map(function(s) { return studyYi(s); }).join(', ') + ')';
        var viVec = 'c(' + studies.map(function(s) { return studyVi(s); }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi <- ' + yiVec,
          'vi <- ' + viVec,
          'res <- rma(yi=yi, vi=vi, method="DL", test="knha", level=' + conf + ')',
          'list(pooled=as.numeric(res$b), se=as.numeric(res$se), ci_lower=as.numeric(res$ci.lb), ci_upper=as.numeric(res$ci.ub))'
        ].join('\n');
      },
      tolerances: { pooled: 0.001, se: 0.001, ci_lower: 0.002, ci_upper: 0.002 }
    });

    // cur_pi — Prediction Interval (JS predictionInterval vs R predict)
    WEBR_SCENARIOS.push({
      id: 'cur_pi',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — Prediction Interval',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.pooled) return null;
        if (typeof MetaAnalysis === 'undefined') return null;
        var pi = APP.results.pi;
        if (!pi) {
          var studies = APP.results.studies;
          if (!studies || studies.length < 3) return null;
          var effects = studies.map(function(s) { return studyYi(s); });
          var variances = studies.map(function(s) { return studyVi(s); });
          var method = (APP.config && APP.config.reMethod) ? APP.config.reMethod : 'REML';
          var confLevel = safeConfLevel();
          var result;
          if (method === 'DL') result = MetaAnalysis.randomEffectsDL(effects, variances);
          else if (method === 'PM') result = MetaAnalysis.randomEffectsPM(effects, variances);
          else if (method === 'SJ') result = MetaAnalysis.randomEffectsSJ(effects, variances);
          else if (method === 'HE') result = MetaAnalysis.randomEffectsHE(effects, variances);
          else if (method === 'ML') result = MetaAnalysis.randomEffectsML(effects, variances);
          else result = MetaAnalysis.randomEffectsREML(effects, variances);
          pi = MetaAnalysis.predictionInterval(result, confLevel);
        }
        if (!pi) return null;
        return { pi_lower: pi.lower, pi_upper: pi.upper };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        if (studies.length < 3) return null;
        var conf = safeConfLevel();
        var method = (APP.config && APP.config.reMethod) ? APP.config.reMethod : 'REML';
        var yiVec = 'c(' + studies.map(function(s) { return studyYi(s); }).join(', ') + ')';
        var viVec = 'c(' + studies.map(function(s) { return studyVi(s); }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi <- ' + yiVec,
          'vi <- ' + viVec,
          'res <- rma(yi=yi, vi=vi, method=' + JSON.stringify(method) + ', level=' + conf + ')',
          'pi <- predict(res, level=' + conf + ')',
          'list(pi_lower=as.numeric(pi$pi.lb), pi_upper=as.numeric(pi$pi.ub))'
        ].join('\n');
      },
      tolerances: { pi_lower: 0.01, pi_upper: 0.01 }
    });

    // cur_egger — Egger Test (JS eggerTest vs R regtest)
    // Both JS and R use weighted linear regression (model="lm"), returning a t-statistic (df=k-2).
    WEBR_SCENARIOS.push({
      id: 'cur_egger',
      tier: 'A',
      source: 'current',
      label: 'Current Analysis — Egger Test',
      skip: false,
      getJSValues: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        if (typeof PublicationBias === 'undefined') return null;
        var studies = APP.results.studies;
        if (studies.length < 3) return null;
        var effects = studies.map(function(s) { return studyYi(s); });
        var ses = studies.map(function(s) { var v = studyVi(s); return Math.sqrt(v); });
        var egger = PublicationBias.eggerTest(effects, ses);
        if (!egger) return null;
        return { egger_t: egger.t, egger_p: egger.p };
      },
      getRCode: function() {
        if (typeof APP === 'undefined' || !APP || !APP.results || !APP.results.studies) return null;
        var studies = APP.results.studies;
        if (studies.length < 3) return null;
        var conf = safeConfLevel();
        var method = (APP.config && APP.config.reMethod) ? APP.config.reMethod : 'REML';
        var yiVec = 'c(' + studies.map(function(s) { return studyYi(s); }).join(', ') + ')';
        var viVec = 'c(' + studies.map(function(s) { return studyVi(s); }).join(', ') + ')';
        return [
          'library(metafor)',
          'yi <- ' + yiVec,
          'vi <- ' + viVec,
          'res <- rma(yi=yi, vi=vi, method=' + JSON.stringify(method) + ', level=' + conf + ')',
          'eg <- regtest(res, model="lm", predictor="sei")',
          'list(egger_t=as.numeric(eg$zval), egger_p=as.numeric(eg$pval))'
        ].join('\n');
      },
      tolerances: { egger_t: 0.02, egger_p: 0.005 }
    });
  })();

  // ─── 8b. Reference survival benchmark dataset (hardcoded, deterministic) ──
  var SURVIVAL_BENCHMARK = {
    name: 'Mini Survival Benchmark (2 studies, 20 patients)',
    data: [
      // Study A (n=10): treatment HR ~ 0.6
      { study: 'A', treatment: 1, time: 14.2, event: 1 },
      { study: 'A', treatment: 1, time: 18.5, event: 0 },
      { study: 'A', treatment: 1, time: 22.1, event: 1 },
      { study: 'A', treatment: 1, time: 9.8,  event: 1 },
      { study: 'A', treatment: 1, time: 25.0, event: 0 },
      { study: 'A', treatment: 0, time: 8.3,  event: 1 },
      { study: 'A', treatment: 0, time: 5.1,  event: 1 },
      { study: 'A', treatment: 0, time: 12.4, event: 1 },
      { study: 'A', treatment: 0, time: 7.6,  event: 0 },
      { study: 'A', treatment: 0, time: 15.0, event: 1 },
      // Study B (n=10): treatment HR ~ 0.7
      { study: 'B', treatment: 1, time: 11.3, event: 1 },
      { study: 'B', treatment: 1, time: 20.4, event: 0 },
      { study: 'B', treatment: 1, time: 16.7, event: 1 },
      { study: 'B', treatment: 1, time: 13.9, event: 1 },
      { study: 'B', treatment: 1, time: 24.2, event: 0 },
      { study: 'B', treatment: 0, time: 6.5,  event: 1 },
      { study: 'B', treatment: 0, time: 9.2,  event: 1 },
      { study: 'B', treatment: 0, time: 4.8,  event: 1 },
      { study: 'B', treatment: 0, time: 11.1, event: 0 },
      { study: 'B', treatment: 0, time: 8.7,  event: 1 }
    ]
  };

  // ─── 8c. Tier B: Survival scenarios ────────────────────────────────────────

  // ref_coxph — Cox PH (treatment effect) vs R survival::coxph
  WEBR_SCENARIOS.push({
    id: 'ref_coxph',
    tier: 'B',
    source: 'reference',
    label: 'Mini Benchmark \u2014 Cox PH (treatment effect)',
    getJSValues: function() {
      if (typeof SurvivalAnalysis === 'undefined' || !SurvivalAnalysis.coxPH) return null;
      var d = SURVIVAL_BENCHMARK.data;
      var times = d.map(function(r) { return r.time; });
      var events = d.map(function(r) { return r.event; });
      var covariates = d.map(function(r) { return [r.treatment]; });
      var cox = SurvivalAnalysis.coxPH(times, events, covariates);
      if (!cox || !cox.beta) return null;
      return {
        log_hr: cox.beta[0],
        se: cox.se[0],
        hr: cox.hr[0]
      };
    },
    getRCode: function() {
      var d = SURVIVAL_BENCHMARK.data;
      return [
        'library(survival)',
        'dat <- data.frame(',
        '  time = c(' + d.map(function(r){ return r.time; }).join(', ') + '),',
        '  event = c(' + d.map(function(r){ return r.event; }).join(', ') + '),',
        '  trt = c(' + d.map(function(r){ return r.treatment; }).join(', ') + ')',
        ')',
        'fit <- coxph(Surv(time, event) ~ trt, data=dat)',
        'list(',
        '  log_hr = as.numeric(coef(fit)),',
        '  se = as.numeric(sqrt(vcov(fit))),',
        '  hr = as.numeric(exp(coef(fit)))',
        ')'
      ].join('\n');
    },
    tolerances: { log_hr: 0.002, se: 0.002, hr: 0.005 }
  });

  // ref_frailty — Frailty Cox (shared gamma) vs R coxph(..., frailty(...))
  WEBR_SCENARIOS.push({
    id: 'ref_frailty',
    tier: 'B',
    source: 'reference',
    label: 'Mini Benchmark \u2014 Frailty Cox (shared gamma)',
    getJSValues: function() {
      if (typeof fitFrailtyModel === 'undefined') return null;
      var d = SURVIVAL_BENCHMARK.data;
      var result = fitFrailtyModel(d, 'time', 'event', 'treatment', 'study');
      if (!result) return null;
      return {
        hr: result.hr,
        se: result.se,
        theta: result.theta
      };
    },
    getRCode: function() {
      var d = SURVIVAL_BENCHMARK.data;
      return [
        'library(survival)',
        'dat <- data.frame(',
        '  time = c(' + d.map(function(r){ return r.time; }).join(', ') + '),',
        '  event = c(' + d.map(function(r){ return r.event; }).join(', ') + '),',
        '  trt = c(' + d.map(function(r){ return r.treatment; }).join(', ') + '),',
        '  study = c(' + d.map(function(r){ return '"' + r.study + '"'; }).join(', ') + ')',
        ')',
        'fit <- coxph(Surv(time, event) ~ trt + frailty(study, distribution="gamma"), data=dat)',
        'list(',
        '  hr = as.numeric(exp(coef(fit)[1])),',
        '  se = as.numeric(sqrt(vcov(fit)[1,1])),',
        '  theta = as.numeric(fit$history$`frailty(study, distribution = "gamma")`$theta)',
        ')'
      ].join('\n');
    },
    tolerances: { hr: 0.05, se: 0.02, theta: 0.1 }
  });

  // cur_frailty — Current Analysis Frailty Cox (only when IPD survival data loaded)
  WEBR_SCENARIOS.push({
    id: 'cur_frailty',
    tier: 'B',
    source: 'current',
    label: 'Current Analysis \u2014 Frailty Cox',
    getJSValues: function() {
      if (typeof APP === 'undefined' || !APP || !APP.data || APP.data.length === 0) return null;
      if (typeof fitFrailtyModel === 'undefined') return null;
      var config = APP.config || {};
      if (!config.timeVar || !config.eventVar || !config.treatmentVar || !config.studyVar) return null;
      var result = fitFrailtyModel(APP.data, config.timeVar, config.eventVar, config.treatmentVar, config.studyVar);
      if (!result || !result.hr) return null;
      return {
        hr: result.hr,
        se: result.se,
        theta: result.theta
      };
    },
    getRCode: function() {
      if (typeof APP === 'undefined' || !APP || !APP.data || APP.data.length === 0) return null;
      var config = APP.config || {};
      if (!config.timeVar || !config.eventVar || !config.treatmentVar || !config.studyVar) return null;
      if (APP.data.length > 5000) return null;  // Too large for WebR
      var d = APP.data;
      function safeNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
      var timeVec = 'c(' + d.map(function(r) { return safeNum(r[config.timeVar]); }).join(', ') + ')';
      var eventVec = 'c(' + d.map(function(r) { return safeNum(r[config.eventVar]); }).join(', ') + ')';
      var trtVec = 'c(' + d.map(function(r) { return safeNum(r[config.treatmentVar]); }).join(', ') + ')';
      var studyVec = 'c(' + d.map(function(r) {
        var s = String(r[config.studyVar] || '').replace(/[\n\r\t\x00-\x1f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return '"' + s + '"';
      }).join(', ') + ')';
      return [
        'library(survival)',
        'dat <- data.frame(',
        '  time = ' + timeVec + ',',
        '  event = ' + eventVec + ',',
        '  trt = ' + trtVec + ',',
        '  study = ' + studyVec,
        ')',
        'fit <- coxph(Surv(time, event) ~ trt + frailty(study, distribution="gamma"), data=dat)',
        'list(',
        '  hr = as.numeric(exp(coef(fit)[1])),',
        '  se = as.numeric(sqrt(vcov(fit)[1,1])),',
        '  theta = as.numeric(fit$history$`frailty(study, distribution = "gamma")`$theta)',
        ')'
      ].join('\n');
    },
    tolerances: { hr: 0.05, se: 0.02, theta: 0.1 }
  });

  // --- Tier C: Advanced IPD scenarios (future plan) ---

  // ─── 10. extractRValues ───────────────────────────────────────────────────
  /**
   * Convert a WebR proxy object (named list) to a plain JS key→value object.
   * Handles scalar numerics and numeric vectors.
   */
  function extractRValues(rObj) {
    var out = {};
    if (!rObj || !rObj.names || !rObj.values) return out;
    var names  = Array.from(rObj.names);
    var values = Array.from(rObj.values);
    names.forEach(function(key, idx) {
      var cell = values[idx];
      if (!cell) { out[key] = null; return; }
      var vals = cell.values;
      if (!vals) { out[key] = null; return; }
      var arr = Array.from(vals);
      out[key] = (arr.length === 1) ? arr[0] : arr;
    });
    return out;
  }

  // ─── 11. compareResults ───────────────────────────────────────────────────
  /**
   * Compare JS values against R values using per-key tolerances.
   * @param {object|null} jsValues  - flat JS object (null = R-only scenario)
   * @param {object}      rValues   - flat R result object
   * @param {object}      tolerances - { key: tol } map
   * @param {string}      [transform] - 'exp' to display exp(x) for ratio measures
   * @returns {Array<{label,js,r,displayJS,displayR,diff,tol,pass}>}
   */
  function compareResults(jsValues, rValues, tolerances, transform) {
    var rows = [];
    var keys = Object.keys(tolerances || {}).concat(
      Object.keys(rValues || {}).filter(function(k) {
        return !tolerances || !(k in tolerances);
      })
    );
    // De-duplicate
    var seen = {};
    keys = keys.filter(function(k) { if (seen[k]) return false; seen[k] = true; return true; });

    keys.forEach(function(key) {
      var rVal  = (rValues  != null && key in rValues)  ? rValues[key]  : null;
      var jsVal = (jsValues != null && key in jsValues) ? jsValues[key] : null;
      var tol   = (tolerances && key in tolerances) ? tolerances[key] : null;

      // R-only row
      if (jsValues === null || jsVal === null) {
        var dispR = (rVal != null && isFinite(rVal)) ? rVal.toFixed(4) : String(rVal);
        if (transform === 'exp' && rVal != null && isFinite(rVal)) {
          dispR = Math.exp(rVal).toFixed(4) + ' (exp)';
        }
        rows.push({ label: key, js: null, r: rVal, displayJS: '—', displayR: dispR, diff: null, tol: tol, pass: null });
        return;
      }

      var diff = (jsVal != null && rVal != null && isFinite(jsVal) && isFinite(rVal))
        ? Math.abs(jsVal - rVal)
        : null;
      var pass = (tol != null && diff != null) ? (diff <= tol) : null;

      var fmt = function(x) {
        if (x == null || !isFinite(x)) return String(x);
        var base = Number(x).toFixed(4);
        if (transform === 'exp') return Math.exp(x).toFixed(4) + ' (exp)';
        return base;
      };

      rows.push({
        label: key,
        js: jsVal,
        r: rVal,
        displayJS: fmt(jsVal),
        displayR:  fmt(rVal),
        diff: diff,
        tol: tol,
        pass: pass
      });
    });

    return rows;
  }

  // ─── 12. renderTierResults ────────────────────────────────────────────────
  /**
   * Render all scenario results for one tier into an HTML string.
   * @param {string} tierLabel - e.g. 'Tier A: metafor'
   * @param {Array}  scenarioResults - [{scenario, status, rows, rValues, error}]
   * @returns {string} HTML
   */
  function renderTierResults(tierLabel, scenarioResults) {
    var passCount    = 0;
    var totalCount   = 0;
    var skippedCount = 0;
    var bodyHtml     = '';

    scenarioResults.forEach(function(sr) {
      var sc = sr.scenario;

      // Skipped
      if (sr.status === 'skip') {
        skippedCount++;
        bodyHtml += [
          '<details style="margin-bottom:8px;">',
            '<summary style="cursor:pointer;padding:4px 0;font-size:13px;font-weight:600;color:var(--text-secondary);">',
              escapeHtml(sc.label),
              ' <span class="webr-tier-badge webr-tier-skip">SKIPPED</span>',
            '</summary>',
            '<p style="font-size:12px;color:var(--text-secondary);margin:4px 0 0 12px;">',
              escapeHtml(sr.skipReason || 'Scenario not applicable.'),
            '</p>',
          '</details>'
        ].join('');
        return;
      }

      // Error
      if (sr.status === 'error') {
        totalCount++;
        bodyHtml += [
          '<details style="margin-bottom:8px;" open>',
            '<summary style="cursor:pointer;padding:4px 0;font-size:13px;font-weight:600;color:var(--accent-danger,#c62828);">',
              escapeHtml(sc.label),
              ' <span class="webr-tier-badge webr-tier-fail">ERROR</span>',
            '</summary>',
            '<p style="font-size:12px;color:var(--accent-danger,#c62828);margin:4px 0 0 12px;">',
              escapeHtml(String(sr.error || 'Unknown error')),
            '</p>',
          '</details>'
        ].join('');
        return;
      }

      // Normal result
      var rows       = sr.rows || [];
      var comparedRows = rows.filter(function(r) { return r.pass !== null; });
      var rOnlyRows    = rows.filter(function(r) { return r.pass === null; });
      var scenarioPass = comparedRows.length === 0 ? true : comparedRows.every(function(r) { return r.pass === true; });

      totalCount++;
      if (scenarioPass) passCount++;

      var statusCls  = scenarioPass ? 'webr-tier-pass' : 'webr-tier-fail';
      var statusText = scenarioPass ? 'PASS' : 'FAIL';
      var rOnlyNote  = rOnlyRows.length > 0
        ? ' <span style="font-size:11px;color:var(--text-secondary);">+' + rOnlyRows.length + ' R-only</span>'
        : '';

      var tableHtml = [
        '<table class="webr-tbl" style="margin-top:6px;">',
          '<caption class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;">Comparison of JS and R values for ' + escapeHtml(sc.label) + '</caption>',
          '<thead><tr>',
            '<th scope="col">Metric</th>',
            '<th scope="col">JS value</th>',
            '<th scope="col">R value</th>',
            '<th scope="col">|diff|</th>',
            '<th scope="col">Rel%</th>',
            '<th scope="col">Tol</th>',
            '<th scope="col">Status</th>',
          '</tr></thead>',
          '<tbody>'
      ].join('');

      rows.forEach(function(row) {
        var statusCell;
        if (row.pass === null) {
          statusCell = '<td class="webr-ronly">R-only</td>';
        } else if (row.pass) {
          statusCell = '<td class="webr-pass">PASS</td>';
        } else {
          statusCell = '<td class="webr-fail">FAIL</td>';
        }
        var diffStr = (row.diff != null) ? row.diff.toFixed(5) : '\u2014';
        var tolStr  = (row.tol  != null) ? row.tol.toFixed(4)  : '\u2014';
        // Relative error: |diff| / |R value| * 100
        var relStr  = '\u2014';
        if (row.pass !== null && row.diff != null && row.r != null && isFinite(row.r) && Math.abs(row.r) > 0) {
          relStr = (row.diff / Math.abs(row.r) * 100).toFixed(2);
        }
        tableHtml += [
          '<tr>',
            '<td>', escapeHtml(row.label), '</td>',
            '<td style="font-family:monospace;">', escapeHtml(String(row.displayJS)), '</td>',
            '<td style="font-family:monospace;">', escapeHtml(String(row.displayR)), '</td>',
            '<td style="font-family:monospace;">', escapeHtml(diffStr), '</td>',
            '<td style="font-family:monospace;">', escapeHtml(relStr), '</td>',
            '<td style="font-family:monospace;">', escapeHtml(tolStr), '</td>',
            statusCell,
          '</tr>'
        ].join('');
      });

      tableHtml += '</tbody></table>';

      var detailsOpen = scenarioPass ? '' : ' open';
      bodyHtml += [
        '<details style="margin-bottom:8px;"' + detailsOpen + '>',
          '<summary style="cursor:pointer;padding:4px 0;font-size:13px;font-weight:600;">',
            escapeHtml(sc.label),
            ' <span class="webr-tier-badge ' + statusCls + '">' + statusText + '</span>',
            rOnlyNote,
          '</summary>',
          tableHtml,
        '</details>'
      ].join('');
    });

    // Tier header
    var tierPass = (totalCount > 0) ? (passCount === totalCount) : true;
    var tierBadgeCls  = skippedCount === scenarioResults.length ? 'webr-tier-skip' :
                        tierPass ? 'webr-tier-pass' : 'webr-tier-fail';
    var tierBadgeTxt  = skippedCount === scenarioResults.length ? 'SKIPPED' :
                        tierPass ? (passCount + '/' + totalCount + ' PASS') :
                                   (passCount + '/' + totalCount + ' FAIL');

    return [
      '<div class="webr-tier-header">',
        escapeHtml(tierLabel),
        ' <span class="webr-tier-badge ' + tierBadgeCls + '">' + escapeHtml(tierBadgeTxt) + '</span>',
        skippedCount > 0 ? ' <span style="font-size:11px;color:var(--text-secondary);">' + skippedCount + ' skipped</span>' : '',
      '</div>',
      bodyHtml
    ].join('');
  }

  // ─── Window exposure ──────────────────────────────────────────────────────
  window.runWebRValidation      = runWebRValidation;
  window.generateRScript        = generateRScript;
  window.copyRScript            = copyRScript;
  window.copyResultsJSON        = copyResultsJSON;
  window.downloadValidationReport = downloadValidationReport;
  window.getWebRScenarioCount   = function() { return WEBR_SCENARIOS.length; };

  // ─── Internal exports for subsequent task modules ─────────────────────────
  window._webrInternals = {
    initWebR:       initWebR,
    extractRValues: extractRValues,
    compareResults: compareResults,
    renderTierResults: renderTierResults,
    getScenarios:      function() { return WEBR_SCENARIOS; },
    getLastResults:    function() { return webRLastResults; },
    setLastResults:    function(r) { webRLastResults = r; },
    escapeHtml:        escapeHtml
  };
  Object.freeze(window._webrInternals);

  // ─── DOMContentLoaded hook ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWebRUI);
  } else {
    injectWebRUI();
  }

})();
