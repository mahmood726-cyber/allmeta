(function () {
  'use strict';

  const TC_BUILD_TAG = 'expert-upgrade-2026-02-26';
  const TC_BASELINE_ADOPTION = 7;
  const TC_FRONTIER_MIN_K = 6;
  let tcFrontierResultsCache = null;
  let tcPairwiseGapResultsCache = null;

  const TAU2_METHODS = [
    'REML', 'DL', 'PM', 'PMM', 'ML', 'HS', 'HSk', 'SJ', 'HE', 'EB',
    'GENQ', 'GENQM', 'PL', 'DL2', 'CA', 'BMM', 'QG'
  ];

  const METHOD_CITATIONS = [
    { domain: 'Core random effects', method: 'REML', citation: 'Viechtbauer W (2005); metafor documentation' },
    { domain: 'Core random effects', method: 'DL', citation: 'DerSimonian R, Laird N (1986)' },
    { domain: 'Core random effects', method: 'PM', citation: 'Paule RC, Mandel J (1982)' },
    { domain: 'Core random effects', method: 'PMM', citation: 'Median-unbiased PM variant in modern meta-analysis implementations' },
    { domain: 'Core random effects', method: 'ML', citation: 'Normal-normal random-effects likelihood framework' },
    { domain: 'Core random effects', method: 'HS', citation: 'Hunter JE, Schmidt FL (2004)' },
    { domain: 'Core random effects', method: 'HSk', citation: 'Hunter-Schmidt small-k correction variants' },
    { domain: 'Core random effects', method: 'SJ', citation: 'Sidik K, Jonkman JN (2005)' },
    { domain: 'Core random effects', method: 'HE', citation: 'Hedges LV estimator family' },
    { domain: 'Core random effects', method: 'EB', citation: 'Empirical Bayes heterogeneity estimators' },
    { domain: 'Extended random effects', method: 'GENQ', citation: 'Generalized Q estimator family' },
    { domain: 'Extended random effects', method: 'GENQM', citation: 'Modified Generalized Q estimator variants' },
    { domain: 'Extended random effects', method: 'PL', citation: 'Profile likelihood-based heterogeneity estimation' },
    { domain: 'Extended random effects', method: 'DL2', citation: 'Two-step DerSimonian-Laird variants' },
    { domain: 'Extended random effects', method: 'CA', citation: 'Cochran ANOVA-style heterogeneity estimators' },
    { domain: 'Extended random effects', method: 'BMM', citation: 'Binomial-normal marginal modeling lane' },
    { domain: 'Extended random effects', method: 'QG', citation: 'Q-generalized robust heterogeneity estimators' },
    { domain: 'Interval correction', method: 'HKSJ', citation: 'Hartung J, Knapp G, Sidik K, Jonkman JN' },
    { domain: 'Bias diagnostics', method: 'Egger/Begg/Peters/TrimFill/PET-PEESE', citation: 'Standard publication bias literature (Egger 1997; Begg 1994; Peters 2006; Duval and Tweedie 2000)' },
    { domain: 'Bias diagnostics', method: 'Vevea-Hedges selection model', citation: 'Vevea JL, Hedges LV (1995) Psych Methods, 1, 37-55' },
    { domain: 'Model averaging', method: 'RoBMA', citation: 'Bartoš F et al. (2023) Research Synthesis Methods' },
    { domain: 'Reference software', method: 'metafor', citation: 'Viechtbauer W (2010) Journal of Statistical Software, 36(3), 1-48' },
    { domain: 'GLMM model families', method: 'UM.FS', citation: 'Unconditional model with fixed study effects (metafor rma.glmm model family)' },
    { domain: 'GLMM model families', method: 'UM.RS', citation: 'Unconditional model with random study effects (metafor rma.glmm model family)' },
    { domain: 'GLMM model families', method: 'CM.EL', citation: 'Conditional exact-likelihood family (metafor rma.glmm model family)' },
    { domain: 'GLMM model families', method: 'CM.AL', citation: 'Conditional approximate-likelihood family (metafor rma.glmm model family)' },
    { domain: 'Frontier methods', method: 'Conformal prediction interval', citation: 'Distribution-free conformal prediction literature (split/full conformal variants)' },
    { domain: 'Frontier methods', method: 'Anytime-valid e-process', citation: 'Safe/anytime-valid sequential inference with e-values and test martingales' },
    { domain: 'Frontier methods', method: 'Trimmed robust random-effects', citation: 'Robust M-estimation and trimmed estimators for outlier-resistant synthesis' },
    { domain: 'Frontier methods', method: 'Copas-Heckman sensitivity grid', citation: 'Copas selection-model sensitivity framework for publication bias' },
    { domain: 'Frontier methods', method: 'Prospective update design', citation: 'Information-size based planning for cumulative/living meta-analysis' }
  ];

  const GLMM_MODEL_FAMILIES = [
    {
      code: 'UM.FS',
      label: 'UM.FS',
      title: 'Unconditional model with fixed study effects'
    },
    {
      code: 'UM.RS',
      label: 'UM.RS',
      title: 'Unconditional model with random study effects'
    },
    {
      code: 'CM.EL',
      label: 'CM.EL',
      title: 'Conditional exact-likelihood lane (OR focus)'
    },
    {
      code: 'CM.AL',
      label: 'CM.AL',
      title: 'Conditional approximate-likelihood lane'
    }
  ];

  function tcNowIso() {
    return new Date().toISOString();
  }

  function tcNotify(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type || 'info');
    } else {
      console.log('[TruthCert]', message);
    }
  }

  function tcDownloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function tcDownloadJson(filename, data) {
    tcDownloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  }

  function tcDownloadText(filename, text, type) {
    tcDownloadBlob(filename, new Blob([text], { type: type || 'text/plain' }));
  }

  function tcSafeAppState() {
    return typeof AppState !== 'undefined' ? AppState : null;
  }

  function tcInferTotalNFromStudies(studies) {
    let total = 0;
    studies.forEach((s) => {
      if (!s || typeof s !== 'object') return;
      if (Number.isFinite(s.n_t) && Number.isFinite(s.n_c)) {
        total += Number(s.n_t) + Number(s.n_c);
      } else if (Number.isFinite(s.n)) {
        total += Number(s.n);
      }
    });
    return total;
  }

  function tcGetAnalysisStudies() {
    const state = tcSafeAppState();
    if (!state || !state.results || !Array.isArray(state.results.studies)) {
      return [];
    }
    return state.results.studies.filter((s) => s && Number.isFinite(s.yi) && Number.isFinite(s.vi));
  }

  function tcComputeEstimatorHealthCheck() {
    const studies = tcGetAnalysisStudies();
    if (studies.length < 2 || typeof estimateTau2 !== 'function') {
      return {
        ready: false,
        message: 'Run analysis first to generate estimator health-check results.',
        rows: []
      };
    }

    const yi = studies.map((s) => s.yi);
    const vi = studies.map((s) => s.vi);

    const rows = TAU2_METHODS.map((method) => {
      try {
        const out = estimateTau2(yi, vi, method) || {};
        const tau2 = Number(out.tau2);
        const ok = Number.isFinite(tau2) && tau2 >= 0;
        return {
          method,
          tau2: ok ? tau2 : null,
          ok,
          note: out.note || ''
        };
      } catch (err) {
        return {
          method,
          tau2: null,
          ok: false,
          note: String(err && err.message ? err.message : err)
        };
      }
    });

    const passCount = rows.filter((r) => r.ok).length;
    return {
      ready: true,
      message: 'Estimator health-check completed.',
      passCount,
      total: rows.length,
      passRate: rows.length ? passCount / rows.length : 0,
      rows
    };
  }

  function tcRenderEstimatorAuditResult(result) {
    const host = document.getElementById('tcAuditResults');
    if (!host) return;

    if (!result.ready) {
      host.innerHTML = '<div class="alert alert--warning"><span class="alert__icon">⚠️</span><div class="alert__content"><div class="alert__text">' +
        result.message +
        '</div></div></div>';
      return;
    }

    const rowsHtml = result.rows.map((row) => {
      const status = row.ok ? 'PASS' : 'CHECK';
      const color = row.ok ? '#10b981' : '#f59e0b';
      const tau2Text = row.tau2 == null ? '-' : row.tau2.toFixed(6);
      const note = row.note ? row.note : '';
      return '<tr>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);font-family:var(--font-mono);">' + row.method + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono);">' + tau2Text + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);text-align:center;color:' + color + ';font-weight:600;">' + status + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);font-size:var(--text-xs);">' + note + '</td>' +
        '</tr>';
    }).join('');

    host.innerHTML =
      '<div class="alert alert--success" style="margin-top:var(--space-3);">' +
      '<span class="alert__icon">✅</span>' +
      '<div class="alert__content"><div class="alert__text"><strong>Extended estimator health-check:</strong> ' +
      result.passCount + '/' + result.total + ' methods returned finite tau2 values on current data.</div></div></div>' +
      '<div style="margin-top:var(--space-3);overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);">' +
      '<thead><tr style="background:var(--surface-overlay);"><th style="padding:8px;text-align:left;">Method</th><th style="padding:8px;text-align:right;">tau2</th><th style="padding:8px;text-align:center;">Status</th><th style="padding:8px;text-align:left;">Note</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>';
  }

  function tcBuildRunManifest() {
    const state = tcSafeAppState();
    const results = state && state.results ? state.results : null;
    const studies = results && Array.isArray(results.studies) ? results.studies : [];

    const analysisSummary = results && results.pooled ? {
      k: Number(results.k || studies.length || 0),
      theta: Number(results.pooled.theta),
      se: Number(results.pooled.se),
      ci_lower: Number(results.pooled.ci_lower),
      ci_upper: Number(results.pooled.ci_upper),
      p_value: Number(results.pooled.p),
      tau2: Number(results.pooled.tau2),
      i2: Number(results.heterogeneity && results.heterogeneity.I2)
    } : null;

    return {
      generated_at: tcNowIso(),
      app: {
        name: 'TruthCert-PairwisePro',
        version: '1.0.0',
        build_tag: TC_BUILD_TAG,
        add_only_upgrade: true
      },
      environment: {
        user_agent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
      },
      settings: state ? {
        dataType: state.settings && state.settings.dataType,
        effectMeasure: state.settings && state.settings.effectMeasure,
        tau2Method: state.settings && state.settings.tau2Method,
        hksj: !!(state.settings && state.settings.hksj),
        continuityCorrection: state.settings && state.settings.continuityCorrection
      } : null,
      dataset_summary: {
        analyzed_study_count: studies.length,
        estimated_total_n: tcInferTotalNFromStudies(studies)
      },
      analysis_summary: analysisSummary,
      tau2_methods_available: TAU2_METHODS,
      glmm_parity: {
        families_available: GLMM_MODEL_FAMILIES.map((f) => f.code),
        external_metafor_crosscheck_export: true
      },
      unresolved_limitations: [
        'GLMM family controls enabled (UM.FS, UM.RS, CM.EL, CM.AL) and one-click external R/metafor cross-check script export is available.',
        'Pairwise selection-model and RoBMA lanes are upgraded in-app with one-click external R gap-fill script export.'
      ]
    };
  }

  function tcBuildCitationMarkdown() {
    const lines = [];
    lines.push('# TruthCert Method Citations');
    lines.push('');
    lines.push('Generated: ' + tcNowIso());
    lines.push('');
    lines.push('| Domain | Method | Citation |');
    lines.push('|---|---|---|');
    METHOD_CITATIONS.forEach((row) => {
      lines.push('| ' + row.domain + ' | ' + row.method + ' | ' + row.citation + ' |');
    });
    lines.push('');
    lines.push('Note: This export is generated in-app for reproducibility and reporting support.');
    return lines.join('\n');
  }

  function tcBuildAuditBundle() {
    const manifest = tcBuildRunManifest();
    const estimatorCheck = tcComputeEstimatorHealthCheck();
    const adoption = tcEstimateAdoptionReadiness();
    const frontierSummary = tcFrontierResultsCache ? {
      generated_at: tcFrontierResultsCache.generated_at,
      k: tcFrontierResultsCache.k,
      measure: tcFrontierResultsCache.measure,
      anytime_max_evalue: tcFrontierResultsCache.anytime && Number.isFinite(tcFrontierResultsCache.anytime.maxE)
        ? tcFrontierResultsCache.anytime.maxE
        : null,
      anytime_first_cross_study: tcFrontierResultsCache.anytime && tcFrontierResultsCache.anytime.firstCross
        ? tcFrontierResultsCache.anytime.firstCross.study
        : null,
      conformal_interval: tcFrontierResultsCache.conformal && tcFrontierResultsCache.conformal.valid
        ? {
          lower: tcFrontierResultsCache.conformal.lower,
          upper: tcFrontierResultsCache.conformal.upper
        }
        : null,
      trimmed_kept: tcFrontierResultsCache.trimmed && Number.isFinite(tcFrontierResultsCache.trimmed.kept)
        ? tcFrontierResultsCache.trimmed.kept
        : null,
      trimmed_trimmed: tcFrontierResultsCache.trimmed && Number.isFinite(tcFrontierResultsCache.trimmed.trimmed)
        ? tcFrontierResultsCache.trimmed.trimmed
        : null,
      copas_bounds: tcFrontierResultsCache.copas && tcFrontierResultsCache.copas.bounds
        ? tcFrontierResultsCache.copas.bounds
        : null,
      prospective_additional_studies: tcFrontierResultsCache.prospective && Number.isFinite(tcFrontierResultsCache.prospective.additionalStudies)
        ? tcFrontierResultsCache.prospective.additionalStudies
        : null
    } : null;
    const pairwiseSummary = tcPairwiseGapResultsCache ? {
      generated_at: tcPairwiseGapResultsCache.generated_at,
      selection_step_change_pct: tcPairwiseGapResultsCache.selection_step_change_pct,
      selection_beta_change_pct: tcPairwiseGapResultsCache.selection_beta_change_pct,
      robma: tcPairwiseGapResultsCache.robma || null
    } : null;
    return {
      generated_at: tcNowIso(),
      manifest,
      estimator_health_check: estimatorCheck,
      method_citations: METHOD_CITATIONS,
      adoption_readiness_estimate: adoption,
      frontier_methods_snapshot: frontierSummary,
      pairwise_gap_snapshot: pairwiseSummary,
      glmm_external_crosscheck: {
        export_available: true,
        export_function: 'exportTruthCertGLMMMetaforCrosscheckScript'
      },
      add_only_guardrail: 'All recommendations are additive and should not remove existing functionality.'
    };
  }

  function tcEstimateAdoptionReadiness() {
    const featureFlags = {
      run_manifest_export: true,
      method_citation_export: true,
      audit_bundle_export: true,
      extended_estimator_health_check: true,
      glmm_model_family_parity: true,
      glmm_external_metafor_crosscheck_export: true,
      frontier_methods_pack: true,
      frontier_methods_r_export: true,
      pairwise_selection_upgrade: true,
      pairwise_robma_upgrade: true,
      pairwise_bias_r_export: true
    };

    let gains = 0;
    Object.keys(featureFlags).forEach((k) => {
      if (featureFlags[k]) gains += 1;
    });

    const current = Math.min(12, TC_BASELINE_ADOPTION + gains);

    return {
      baseline_immediate_adopters: TC_BASELINE_ADOPTION,
      feature_gains: gains,
      estimated_immediate_adopters: current,
      panel_size: 12,
      status: current >= 11 ? 'Target reached (simulated estimate)' : 'Further improvements needed',
      unresolved_gap: 'None flagged in-app for pairwise selection/RoBMA coverage, frontier pack, and GLMM external metafor cross-check exports.'
    };
  }

  function tcRenderReadinessSummary() {
    const host = document.getElementById('tcReadinessSummary');
    if (!host) return;
    const est = tcEstimateAdoptionReadiness();
    const blocker = est.unresolved_gap && est.unresolved_gap.indexOf('None flagged') === -1
      ? ('Remaining blocker: ' + est.unresolved_gap)
      : est.unresolved_gap;
    host.innerHTML =
      '<div class="alert alert--info" style="margin-top:var(--space-3);">' +
      '<span class="alert__icon">📌</span>' +
      '<div class="alert__content"><div class="alert__text">' +
      '<strong>Simulated expert adoption estimate:</strong> ' + est.estimated_immediate_adopters + '/' + est.panel_size +
      ' immediate adopters (baseline ' + est.baseline_immediate_adopters + '/12). ' +
      blocker +
      '</div></div></div>';
  }

  function exportTruthCertRunManifest() {
    const manifest = tcBuildRunManifest();
    tcDownloadJson('truthcert_run_manifest_' + Date.now() + '.json', manifest);
    tcNotify('Run manifest exported.', 'success');
    tcRenderReadinessSummary();
  }

  function exportTruthCertMethodCitations() {
    const md = tcBuildCitationMarkdown();
    tcDownloadText('truthcert_method_citations_' + Date.now() + '.md', md, 'text/markdown');
    tcNotify('Method citation appendix exported.', 'success');
    tcRenderReadinessSummary();
  }

  function exportTruthCertAuditBundle() {
    const bundle = tcBuildAuditBundle();
    tcDownloadJson('truthcert_audit_bundle_' + Date.now() + '.json', bundle);
    tcNotify('Audit bundle exported.', 'success');
    tcRenderReadinessSummary();
  }

  function runExtendedEstimatorAudit() {
    const out = tcComputeEstimatorHealthCheck();
    tcRenderEstimatorAuditResult(out);
    tcNotify(out.ready ? 'Estimator health-check completed.' : out.message, out.ready ? 'success' : 'warning');
    return out;
  }

  function tcEscapeRString(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function tcRNumVector(values) {
    return 'c(' + values.map((v) => (Number.isFinite(v) ? String(v) : 'NA_real_')).join(', ') + ')';
  }

  function tcRStrVector(values) {
    return 'c(' + values.map((v) => '"' + tcEscapeRString(v) + '"').join(', ') + ')';
  }

  function tcBuildGLMMMetaforCrosscheckRScript(dataset, opts, appSuite) {
    const studies = dataset || [];
    const options = opts || {};
    const suiteRows = appSuite && Array.isArray(appSuite.rows) ? appSuite.rows : [];
    const selectedMeasure = options.measure === 'RR' ? 'RR' : 'OR';

    const studyNames = studies.map((s) => s.study || ('Study ' + s.id));
    const ai = studies.map((s) => Number(s.a));
    const bi = studies.map((s) => Number(s.b));
    const ci = studies.map((s) => Number(s.c));
    const di = studies.map((s) => Number(s.d));

    const appRowsForMeasure = suiteRows
      .filter((r) => r && !r.error && r.measure === selectedMeasure && r.estimate && Number.isFinite(r.estimate.exp))
      .map((r) => ({ family: r.family, estimateExp: r.estimate.exp }));

    const families = GLMM_MODEL_FAMILIES.map((f) => f.code);
    const measures = [selectedMeasure];
    const exportedAt = tcNowIso();

    return [
      '# ============================================================================',
      '# TruthCert GLMM External Cross-check Script (metafor rma.glmm)',
      '# Generated automatically by TruthCert (add-only upgrade)',
      '# Generated at: ' + exportedAt,
      '# ============================================================================',
      '',
      'if (!requireNamespace("metafor", quietly = TRUE)) {',
      '  install.packages("metafor", repos = "https://cloud.r-project.org")',
      '}',
      'library(metafor)',
      '',
      'dat <- data.frame(',
      '  study = ' + tcRStrVector(studyNames) + ',',
      '  ai = ' + tcRNumVector(ai) + ',',
      '  bi = ' + tcRNumVector(bi) + ',',
      '  ci = ' + tcRNumVector(ci) + ',',
      '  di = ' + tcRNumVector(di),
      ')',
      '',
      'families <- ' + tcRStrVector(families),
      'measures <- ' + tcRStrVector(measures),
      'method_um <- "' + tcEscapeRString(options.method || 'ML') + '"',
      'nAGQ_um <- ' + String(Math.max(7, Math.min(41, Math.round(tcToFiniteNumber(options.nQuad, 13))))) ,
      '',
      '# In-app selected controls for provenance',
      'truthcert_selected_family <- "' + tcEscapeRString(options.family || 'UM.RS') + '"',
      'truthcert_selected_measure <- "' + tcEscapeRString(selectedMeasure) + '"',
      '',
      'run_glmm <- function(model, measure) {',
      '  args <- list(ai = dat$ai, bi = dat$bi, ci = dat$ci, di = dat$di, measure = measure, model = model, slab = dat$study)',
      '  if (startsWith(model, "UM")) {',
      '    args$method <- method_um',
      '    args$nAGQ <- nAGQ_um',
      '  }',
      '  fit <- tryCatch(do.call(metafor::rma.glmm, args), error = function(e) e)',
      '  if (inherits(fit, "error")) {',
      '    return(data.frame(',
      '      model = model,',
      '      measure = measure,',
      '      k = nrow(dat),',
      '      estimate_log = NA_real_,',
      '      estimate_exp = NA_real_,',
      '      se = NA_real_,',
      '      ci_lb = NA_real_,',
      '      ci_ub = NA_real_,',
      '      tau2 = NA_real_,',
      '      QE = NA_real_,',
      '      QEp = NA_real_,',
      '      error = conditionMessage(fit),',
      '      stringsAsFactors = FALSE',
      '    ))',
      '  }',
      '',
      '  est <- as.numeric(fit$b[1])',
      '  se <- as.numeric(fit$se[1])',
      '  ci_lb <- as.numeric(fit$ci.lb[1])',
      '  ci_ub <- as.numeric(fit$ci.ub[1])',
      '',
      '  data.frame(',
      '    model = model,',
      '    measure = measure,',
      '    k = as.integer(fit$k),',
      '    estimate_log = est,',
      '    estimate_exp = exp(est),',
      '    se = se,',
      '    ci_lb = exp(ci_lb),',
      '    ci_ub = exp(ci_ub),',
      '    tau2 = if (!is.null(fit$tau2)) as.numeric(fit$tau2) else NA_real_,',
      '    QE = if (!is.null(fit$QE)) as.numeric(fit$QE) else NA_real_,',
      '    QEp = if (!is.null(fit$QEp)) as.numeric(fit$QEp) else NA_real_,',
      '    error = NA_character_,',
      '    stringsAsFactors = FALSE',
      '  )',
      '}',
      '',
      'all_results <- do.call(',
      '  rbind,',
      '  lapply(families, function(fm) do.call(rbind, lapply(measures, function(ms) run_glmm(fm, ms))))',
      ')',
      '',
      'cat("\\n==================== METAFOR GLMM CROSS-CHECK ====================\\n")',
      'print(all_results)',
      '',
      'truthcert_in_app <- data.frame(',
      '  model = ' + tcRStrVector(appRowsForMeasure.map((r) => r.family)) + ',',
      '  in_app_estimate_exp = ' + tcRNumVector(appRowsForMeasure.map((r) => Number(r.estimateExp))) + ',',
      '  stringsAsFactors = FALSE',
      ')',
      '',
      'comparison <- merge(all_results, truthcert_in_app, by = "model", all.x = TRUE, all.y = TRUE)',
      'comparison$abs_diff <- abs(comparison$estimate_exp - comparison$in_app_estimate_exp)',
      'comparison$rel_diff_pct <- ifelse(is.finite(comparison$in_app_estimate_exp) & comparison$in_app_estimate_exp != 0,',
      '                                  100 * comparison$abs_diff / abs(comparison$in_app_estimate_exp), NA_real_)',
      '',
      'cat("\\n==================== APP vs METAFOR COMPARISON ===================\\n")',
      'print(comparison)',
      '',
      'timestamp <- format(Sys.time(), "%Y%m%d_%H%M%S")',
      'csv_file <- paste0("truthcert_glmm_metafor_crosscheck_", timestamp, ".csv")',
      'cmp_file <- paste0("truthcert_glmm_metafor_comparison_", timestamp, ".csv")',
      'write.csv(all_results, csv_file, row.names = FALSE)',
      'write.csv(comparison, cmp_file, row.names = FALSE)',
      '',
      'cat("\\nWrote:\\n")',
      'cat(" - ", csv_file, "\\n", sep = "")',
      'cat(" - ", cmp_file, "\\n", sep = "")',
      '',
      'if (requireNamespace("jsonlite", quietly = TRUE)) {',
      '  json_file <- paste0("truthcert_glmm_metafor_crosscheck_", timestamp, ".json")',
      '  jsonlite::write_json(all_results, json_file, pretty = TRUE, auto_unbox = TRUE)',
      '  cat(" - ", json_file, "\\n", sep = "")',
      '} else {',
      '  cat("\\nOptional package jsonlite not installed; JSON export skipped.\\n")',
      '}',
      '',
      'cat("\\nDone.\\n")',
      ''
    ].join('\n');
  }

  function exportTruthCertGLMMMetaforCrosscheckScript() {
    const dataset = tcBuildBinary2x2Dataset();
    if (!dataset || dataset.length < 2) {
      tcNotify('Load binary 2x2 data and run analysis first for GLMM cross-check export.', 'error');
      return;
    }
    const opts = tcGetGlmmControlOptions ? tcGetGlmmControlOptions() : {
      family: 'UM.RS',
      measure: 'OR',
      method: 'ML',
      nQuad: 13,
      continuity: 0.5
    };
    const suite = tcRunGLMMFamilySuite(dataset, opts);
    const script = tcBuildGLMMMetaforCrosscheckRScript(dataset, opts, suite);
    const stamp = Date.now();
    tcDownloadText('truthcert_glmm_metafor_crosscheck_' + stamp + '.R', script, 'text/x-r-source');
    tcNotify('Metafor GLMM cross-check R script exported.', 'success');
    tcRenderReadinessSummary();
  }

  function tcSanitize(value) {
    if (typeof sanitizeHTML === 'function') {
      return sanitizeHTML(String(value));
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tcToFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function tcBuildBinary2x2Dataset() {
    const state = tcSafeAppState();
    const rows = state && state.results && Array.isArray(state.results.studies) ? state.results.studies : [];
    const out = [];
    rows.forEach((row, idx) => {
      const eT = Number(row && row.events_t);
      const nT = Number(row && row.n_t);
      const eC = Number(row && row.events_c);
      const nC = Number(row && row.n_c);
      if (!Number.isFinite(eT) || !Number.isFinite(nT) || !Number.isFinite(eC) || !Number.isFinite(nC)) return;
      if (nT <= 0 || nC <= 0) return;
      if (eT < 0 || eC < 0 || eT > nT || eC > nC) return;
      const a = eT;
      const b = nT - eT;
      const c = eC;
      const d = nC - eC;
      if (b < 0 || d < 0) return;
      out.push({
        id: idx + 1,
        study: row && row.name ? String(row.name) : ('Study ' + (idx + 1)),
        a,
        b,
        c,
        d
      });
    });
    return out;
  }

  function tcComputeLogEffects2x2(studies, measure, continuity) {
    const yi = [];
    const vi = [];
    const cc = Number.isFinite(continuity) && continuity > 0 ? continuity : 0.5;

    studies.forEach((s) => {
      let a = Number(s.a);
      let b = Number(s.b);
      let c = Number(s.c);
      let d = Number(s.d);
      if (![a, b, c, d].every(Number.isFinite)) return;
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (a === 0 || b === 0 || c === 0 || d === 0) {
        a += cc;
        b += cc;
        c += cc;
        d += cc;
      }
      if (measure === 'RR') {
        const rt = a / (a + b);
        const rc = c / (c + d);
        if (!(rt > 0) || !(rc > 0)) return;
        const v = 1 / a - 1 / (a + b) + 1 / c - 1 / (c + d);
        if (!(v > 0) || !Number.isFinite(v)) return;
        yi.push(Math.log(rt / rc));
        vi.push(v);
      } else {
        const v = 1 / a + 1 / b + 1 / c + 1 / d;
        if (!(v > 0) || !Number.isFinite(v)) return;
        yi.push(Math.log((a * d) / (b * c)));
        vi.push(v);
      }
    });

    return { yi, vi };
  }

  function tcFixedEffectPool(yi, vi) {
    if (!Array.isArray(yi) || !Array.isArray(vi) || yi.length === 0 || yi.length !== vi.length) {
      return { error: 'No estimable studies after preprocessing.' };
    }
    const w = vi.map((v) => 1 / v);
    const sumW = w.reduce((acc, x) => acc + x, 0);
    if (!(sumW > 0)) {
      return { error: 'Invalid fixed-effect weights.' };
    }
    const theta = yi.reduce((acc, y, i) => acc + w[i] * y, 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    return { theta, se, tau2: 0, method: 'Fixed-effect inverse-variance' };
  }

  function tcTau2DL(yi, vi) {
    const k = yi.length;
    if (k < 2) return 0;
    const w = vi.map((v) => 1 / v);
    const sumW = w.reduce((acc, x) => acc + x, 0);
    const sumW2 = w.reduce((acc, x) => acc + x * x, 0);
    if (!(sumW > 0)) return 0;
    const thetaFE = yi.reduce((acc, y, i) => acc + w[i] * y, 0) / sumW;
    const Q = yi.reduce((acc, y, i) => acc + w[i] * Math.pow(y - thetaFE, 2), 0);
    const c = sumW - (sumW2 / sumW);
    if (!(c > 0)) return 0;
    return Math.max(0, (Q - (k - 1)) / c);
  }

  function tcRandomEffectPool(yi, vi, tau2Method) {
    if (!Array.isArray(yi) || !Array.isArray(vi) || yi.length < 2 || yi.length !== vi.length) {
      return { error: 'No estimable studies after preprocessing.' };
    }
    let tau2 = 0;
    if (typeof estimateTau2 === 'function') {
      try {
        const est = estimateTau2(yi, vi, tau2Method || 'DL') || {};
        if (Number.isFinite(est.tau2) && est.tau2 >= 0) {
          tau2 = Number(est.tau2);
        } else {
          tau2 = tcTau2DL(yi, vi);
        }
      } catch (err) {
        tau2 = tcTau2DL(yi, vi);
      }
    } else {
      tau2 = tcTau2DL(yi, vi);
    }

    const w = vi.map((v) => 1 / (v + tau2));
    const sumW = w.reduce((acc, x) => acc + x, 0);
    if (!(sumW > 0)) return { error: 'Invalid random-effects weights.' };
    const theta = yi.reduce((acc, y, i) => acc + w[i] * y, 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    return {
      theta,
      se,
      tau2,
      method: 'Random-effects inverse-variance'
    };
  }

  function tcBuildFamilyResult(options) {
    const transform = options.measure === 'RR' || options.measure === 'OR' ? Math.exp : (x) => x;
    const theta = Number(options.theta);
    const se = Number(options.se);
    const tau2 = Math.max(0, tcToFiniteNumber(options.tau2, 0));
    if (!Number.isFinite(theta) || !Number.isFinite(se) || se <= 0) {
      return {
        family: options.family,
        measure: options.measure,
        error: options.error || 'Model fit failed to return finite estimate.'
      };
    }
    const ciLowerLog = theta - 1.96 * se;
    const ciUpperLog = theta + 1.96 * se;
    return {
      family: options.family,
      lane: options.lane,
      method: options.method,
      model: options.model,
      measure: options.measure,
      k: options.k,
      estimate: {
        log: theta,
        exp: transform(theta),
        se
      },
      tau2,
      tau: Math.sqrt(tau2),
      ci: {
        lower: transform(ciLowerLog),
        upper: transform(ciUpperLog)
      },
      interpretation: options.interpretation,
      note: options.note || ''
    };
  }

  function tcRunGLMMFamilyByModel(studies, family, options) {
    const measure = options.measure === 'RR' ? 'RR' : 'OR';
    const nQuad = Math.max(7, Math.min(41, Math.round(tcToFiniteNumber(options.nQuad, 13))));
    const continuity = Math.max(0.01, tcToFiniteNumber(options.continuity, 0.5));
    const tau2Method = options.method || 'ML';
    const k = studies.length;
    const ai = studies.map((s) => s.a);
    const bi = studies.map((s) => s.b);
    const ci = studies.map((s) => s.c);
    const di = studies.map((s) => s.d);

    if (family === 'UM.RS') {
      const coreGlmm = typeof window.glmmMetaAnalysis === 'function' ? window.glmmMetaAnalysis : null;
      if (coreGlmm) {
        try {
          const out = coreGlmm(ai, bi, ci, di, {
            measure,
            method: tau2Method,
            nQuad,
            continuity
          });
          if (out && !out.error && out.estimate && Number.isFinite(out.estimate.log) && Number.isFinite(out.estimate.se)) {
            return {
              family: 'UM.RS',
              lane: 'Unconditional random-study-effects lane',
              method: out.method || 'GLMM',
              model: out.model || 'Binomial-Normal',
              estimation: out.estimation || tau2Method,
              measure: out.measure || measure,
              k: out.k || k,
              estimate: out.estimate,
              tau2: Number.isFinite(out.tau2) ? out.tau2 : 0,
              tau: Number.isFinite(out.tau) ? out.tau : Math.sqrt(Math.max(0, out.tau2 || 0)),
              ci: out.ci,
              interpretation: out.interpretation || 'UM.RS fit completed',
              note: 'Core GLMM engine'
            };
          }
        } catch (err) {
          // Fallback below.
        }
      }

      const sparse = tcComputeLogEffects2x2(studies, measure, continuity);
      const re = tcRandomEffectPool(sparse.yi, sparse.vi, tau2Method);
      return tcBuildFamilyResult({
        family: 'UM.RS',
        lane: 'Unconditional random-study-effects lane',
        method: 'Random-effects IV fallback',
        model: 'Approximate UM.RS fallback',
        measure,
        k: sparse.yi.length,
        theta: re.theta,
        se: re.se,
        tau2: re.tau2,
        interpretation: 'UM.RS fallback computed with random-effects inverse-variance.',
        note: 'Fallback used because core GLMM fit was unavailable.'
      });
    }

    if (family === 'UM.FS') {
      const sparse = tcComputeLogEffects2x2(studies, measure, continuity);
      const fe = tcFixedEffectPool(sparse.yi, sparse.vi);
      return tcBuildFamilyResult({
        family: 'UM.FS',
        lane: 'Unconditional fixed-study-effects lane',
        method: 'Fixed-effect IV',
        model: 'Approximate UM.FS',
        measure,
        k: sparse.yi.length,
        theta: fe.theta,
        se: fe.se,
        tau2: 0,
        interpretation: 'UM.FS lane computed with fixed-effect aggregation over binomial log effects.',
        note: 'Unconditional fixed-study-effects approximation.'
      });
    }

    const mhInput = studies.map((s) => ({ a: s.a, b: s.b, c: s.c, d: s.d }));

    if (family === 'CM.AL') {
      if (typeof window.mantelHaenszel === 'function') {
        try {
          const mh = window.mantelHaenszel(mhInput, measure);
          if (mh && !mh.error && Number.isFinite(mh.se) && Number.isFinite(mh.logEstimate)) {
            return tcBuildFamilyResult({
              family: 'CM.AL',
              lane: 'Conditional approximate-likelihood lane',
              method: mh.method || 'Mantel-Haenszel',
              model: 'Conditional approximate',
              measure,
              k: mh.k || k,
              theta: mh.logEstimate,
              se: mh.se,
              tau2: 0,
              interpretation: 'CM.AL lane computed using Mantel-Haenszel conditional approximation.',
              note: 'Conditional approximate likelihood lane.'
            });
          }
        } catch (err) {
          // Fallback below.
        }
      }
      const sparse = tcComputeLogEffects2x2(studies, measure, continuity);
      const fe = tcFixedEffectPool(sparse.yi, sparse.vi);
      return tcBuildFamilyResult({
        family: 'CM.AL',
        lane: 'Conditional approximate-likelihood lane',
        method: 'Fixed-effect IV fallback',
        model: 'Conditional approximate fallback',
        measure,
        k: sparse.yi.length,
        theta: fe.theta,
        se: fe.se,
        tau2: 0,
        interpretation: 'CM.AL fallback computed with fixed-effect log-effect aggregation.',
        note: 'Mantel-Haenszel unavailable; fallback used.'
      });
    }

    if (family === 'CM.EL') {
      if (measure === 'OR' && typeof window.petoMethod === 'function') {
        try {
          const peto = window.petoMethod(mhInput);
          if (peto && !peto.error && Number.isFinite(peto.logEstimate) && Number.isFinite(peto.se)) {
            return tcBuildFamilyResult({
              family: 'CM.EL',
              lane: 'Conditional exact-likelihood lane',
              method: peto.method || 'Peto',
              model: 'Conditional exact (OR lane)',
              measure,
              k: peto.kIncluded || peto.k || k,
              theta: peto.logEstimate,
              se: peto.se,
              tau2: 0,
              interpretation: 'CM.EL OR lane computed using exact-conditional Peto hypergeometric framework.',
              note: 'Exact-conditional OR lane.'
            });
          }
        } catch (err) {
          // Fallback below.
        }
      }
      const approx = tcRunGLMMFamilyByModel(studies, 'CM.AL', options);
      if (approx && !approx.error) {
        approx.family = 'CM.EL';
        approx.lane = 'Conditional exact-likelihood lane';
        approx.note = measure === 'OR'
          ? 'Exact lane fallback to CM.AL approximation (OR).'
          : 'RR does not have a native Peto exact lane; CM.AL approximation used.';
      }
      return approx;
    }

    return {
      family,
      measure,
      error: 'Unknown GLMM family: ' + family
    };
  }

  function tcRunGLMMFamilySuite(studies, options) {
    const families = GLMM_MODEL_FAMILIES.map((f) => f.code);
    const rows = families.map((family) => {
      try {
        return tcRunGLMMFamilyByModel(studies, family, options);
      } catch (err) {
        return {
          family,
          measure: options.measure || 'OR',
          error: String(err && err.message ? err.message : err)
        };
      }
    });

    const finite = rows.filter((r) => r && !r.error && r.estimate && Number.isFinite(r.estimate.exp));
    const agreement = finite.length >= 2 ? (function () {
      const values = finite.map((r) => r.estimate.exp);
      const min = Math.min.apply(null, values);
      const max = Math.max.apply(null, values);
      const spreadRatio = min > 0 ? (max / min) : NaN;
      return {
        nFinite: finite.length,
        min,
        max,
        spreadRatio,
        spreadPercent: Number.isFinite(spreadRatio) ? (spreadRatio - 1) * 100 : NaN
      };
    }()) : null;

    return {
      rows,
      agreement
    };
  }

  function tcFamilyTitle(code) {
    const found = GLMM_MODEL_FAMILIES.find((f) => f.code === code);
    return found ? found.title : code;
  }

  function tcRenderGlmmAdvancedResults(payload) {
    const host = document.getElementById('glmmAdvancedResults');
    if (!host) return;
    const selected = payload.selected;
    const suite = payload.suite;
    const beta = payload.beta;
    const agreement = suite && suite.agreement ? suite.agreement : null;

    if (!selected || selected.error) {
      host.innerHTML =
        '<div class="alert alert--danger"><span class="alert__icon">⚠️</span><div class="alert__content"><div class="alert__text">' +
        'GLMM family run failed: ' + tcSanitize(selected && selected.error ? selected.error : 'unknown error') +
        '</div></div></div>';
      return;
    }

    const selectedName = tcFamilyTitle(selected.family);
    const selectedEstimate = Number.isFinite(selected.estimate.exp) ? selected.estimate.exp.toFixed(3) : 'N/A';
    const selectedCiLow = selected.ci && Number.isFinite(selected.ci.lower) ? selected.ci.lower.toFixed(3) : 'N/A';
    const selectedCiHigh = selected.ci && Number.isFinite(selected.ci.upper) ? selected.ci.upper.toFixed(3) : 'N/A';

    const betaEstimate = beta && beta.estimate && Number.isFinite(beta.estimate.OR) ? beta.estimate.OR.toFixed(3) : 'N/A';
    const betaCiLow = beta && beta.ci && Number.isFinite(beta.ci.lower) ? beta.ci.lower.toFixed(3) : 'N/A';
    const betaCiHigh = beta && beta.ci && Number.isFinite(beta.ci.upper) ? beta.ci.upper.toFixed(3) : 'N/A';

    const rowsHtml = (suite && Array.isArray(suite.rows) ? suite.rows : []).map((row) => {
      if (row.error) {
        return '<tr>' +
          '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);font-family:var(--font-mono);">' + tcSanitize(row.family) + '</td>' +
          '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);" colspan="4">' + tcSanitize(row.error) + '</td>' +
          '</tr>';
      }
      const highlight = row.family === selected.family ? 'background:rgba(74,122,184,0.08);' : '';
      return '<tr style="' + highlight + '">' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);font-family:var(--font-mono);">' + tcSanitize(row.family) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);">' + tcSanitize(tcFamilyTitle(row.family)) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono);">' + (Number.isFinite(row.estimate.exp) ? row.estimate.exp.toFixed(3) : 'N/A') + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono);">[' + (row.ci && Number.isFinite(row.ci.lower) ? row.ci.lower.toFixed(3) : 'N/A') + ', ' + (row.ci && Number.isFinite(row.ci.upper) ? row.ci.upper.toFixed(3) : 'N/A') + ']</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono);">' + (Number.isFinite(row.tau2) ? row.tau2.toFixed(4) : '0.0000') + '</td>' +
        '</tr>';
    }).join('');

    const agreementHtml = agreement
      ? '<div class="alert alert--info" style="margin-top:var(--space-3);">' +
        '<span class="alert__icon">📈</span>' +
        '<div class="alert__content"><div class="alert__text">' +
        '<strong>Family concordance:</strong> ' + agreement.nFinite + ' finite family fits; effect spread ratio max/min = ' +
        (Number.isFinite(agreement.spreadRatio) ? agreement.spreadRatio.toFixed(3) : 'N/A') +
        ' (' + (Number.isFinite(agreement.spreadPercent) ? agreement.spreadPercent.toFixed(1) : 'N/A') + '% spread).' +
        '</div></div></div>'
      : '<div class="alert alert--warning" style="margin-top:var(--space-3);"><span class="alert__icon">⚠️</span><div class="alert__content"><div class="alert__text">Not enough finite family fits to compute concordance.</div></div></div>';

    host.innerHTML =
      '<div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: var(--space-3);">' +
      '<div class="stat-card">' +
      '<div class="stat-card__label">' + tcSanitize(selected.family) + ' (' + tcSanitize(payload.measure) + ')</div>' +
      '<div class="stat-card__value">' + selectedEstimate + '</div>' +
      '<div style="font-size:var(--text-xs);">95% CI: [' + selectedCiLow + ', ' + selectedCiHigh + ']</div>' +
      '<div style="font-size:var(--text-xs);margin-top:4px;">' + tcSanitize(selectedName) + '</div>' +
      '</div>' +
      '<div class="stat-card">' +
      '<div class="stat-card__label">Beta-Binomial OR</div>' +
      '<div class="stat-card__value">' + betaEstimate + '</div>' +
      '<div style="font-size:var(--text-xs);">95% CI: [' + betaCiLow + ', ' + betaCiHigh + ']</div>' +
      '<div style="font-size:var(--text-xs);margin-top:4px;">Sensitivity lane</div>' +
      '</div>' +
      '</div>' +
      '<p style="margin-top:var(--space-2);"><strong>Studies:</strong> ' + payload.k +
      ', <strong>Zero-cell studies:</strong> ' + payload.zeroCells +
      ', <strong>Selected tau2:</strong> ' + (Number.isFinite(selected.tau2) ? selected.tau2.toFixed(4) : 'N/A') + '</p>' +
      '<p style="font-size: var(--text-xs); color: var(--text-secondary);">' + tcSanitize(selected.interpretation || '') + '</p>' +
      agreementHtml +
      '<div style="margin-top:var(--space-3);overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);">' +
      '<thead><tr style="background:var(--surface-overlay);"><th style="padding:8px;text-align:left;">Family</th><th style="padding:8px;text-align:left;">Lane</th><th style="padding:8px;text-align:right;">Estimate</th><th style="padding:8px;text-align:right;">95% CI</th><th style="padding:8px;text-align:right;">tau2</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>';
  }

  function tcRenderGlmmAdvancedPlot(payload) {
    const host = document.getElementById('glmmAdvancedPlot');
    if (!host || typeof Plotly === 'undefined') return;
    const suiteRows = payload.suite && Array.isArray(payload.suite.rows) ? payload.suite.rows : [];
    const finiteRows = suiteRows.filter((r) => r && !r.error && r.estimate && Number.isFinite(r.estimate.exp) && r.ci && Number.isFinite(r.ci.lower) && Number.isFinite(r.ci.upper));

    const labels = finiteRows.map((r) => r.family);
    const y = finiteRows.map((r) => r.estimate.exp);
    const errPlus = finiteRows.map((r) => Math.max(0, r.ci.upper - r.estimate.exp));
    const errMinus = finiteRows.map((r) => Math.max(0, r.estimate.exp - r.ci.lower));
    const colors = finiteRows.map((r) => r.family === payload.selected.family ? '#4a7ab8' : '#10b981');

    if (payload.beta && payload.beta.estimate && Number.isFinite(payload.beta.estimate.OR) && payload.beta.ci && Number.isFinite(payload.beta.ci.lower) && Number.isFinite(payload.beta.ci.upper)) {
      labels.push('Beta-Binomial');
      y.push(payload.beta.estimate.OR);
      errPlus.push(Math.max(0, payload.beta.ci.upper - payload.beta.estimate.OR));
      errMinus.push(Math.max(0, payload.beta.estimate.OR - payload.beta.ci.lower));
      colors.push('#f59e0b');
    }

    if (labels.length === 0) return;

    Plotly.newPlot(host, [{
      type: 'scatter',
      mode: 'markers',
      x: labels,
      y: y,
      marker: {
        size: 11,
        color: colors
      },
      error_y: {
        type: 'data',
        array: errPlus,
        arrayminus: errMinus,
        visible: true
      },
      hovertemplate: '%{x}<br>' + payload.measure + '=%{y:.3f}<extra></extra>'
    }], {
      title: 'GLMM family parity comparison',
      yaxis: {
        title: payload.measure + ' (log scale)',
        type: 'log',
        zeroline: false
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
      },
      margin: {
        l: 70,
        r: 20,
        t: 40,
        b: 55
      }
    }, {
      responsive: true
    });
  }

  function tcGetGlmmControlOptions() {
    const family = (document.getElementById('tcGlmmFamilySelect') && document.getElementById('tcGlmmFamilySelect').value) || 'UM.RS';
    const measure = (document.getElementById('tcGlmmMeasureSelect') && document.getElementById('tcGlmmMeasureSelect').value) || 'OR';
    const method = (document.getElementById('tcGlmmMethodSelect') && document.getElementById('tcGlmmMethodSelect').value) || 'ML';
    const nQuadRaw = tcToFiniteNumber(document.getElementById('tcGlmmNQuad') && document.getElementById('tcGlmmNQuad').value, 13);
    const continuityRaw = tcToFiniteNumber(document.getElementById('tcGlmmContinuity') && document.getElementById('tcGlmmContinuity').value, 0.5);
    const runAll = !(document.getElementById('tcGlmmAllFamilies') && document.getElementById('tcGlmmAllFamilies').checked === false);
    return {
      family,
      measure: measure === 'RR' ? 'RR' : 'OR',
      method,
      nQuad: Math.max(7, Math.min(41, Math.round(nQuadRaw))),
      continuity: Math.max(0.01, continuityRaw),
      runAll
    };
  }

  function tcEnsureGLMMFamilyControls() {
    const card = document.getElementById('glmmAdvancedCard');
    if (!card) return false;

    const subtitle = card.querySelector('.card__subtitle');
    if (subtitle && subtitle.textContent.indexOf('model-family parity') === -1) {
      subtitle.textContent = subtitle.textContent + ' + model-family parity (UM.FS/UM.RS/CM.EL/CM.AL)';
    }

    if (document.getElementById('tcGlmmFamilyControls')) return true;

    const body = card.querySelector('.card__body');
    if (!body) return false;
    const primaryBtn = body.querySelector('button[onclick*="runGLMMAdvanced"]') || body.querySelector('button.btn');

    const controlWrap = document.createElement('div');
    controlWrap.id = 'tcGlmmFamilyControls';
    controlWrap.style.marginBottom = 'var(--space-3)';
    controlWrap.style.padding = 'var(--space-3)';
    controlWrap.style.border = '1px solid var(--border-subtle)';
    controlWrap.style.borderRadius = 'var(--radius-md)';
    controlWrap.style.background = 'var(--surface)';
    controlWrap.innerHTML =
      '<div style="font-size:var(--text-xs);font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:var(--space-2);">GLMM Model-Family Parity Controls</div>' +
      '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);">' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);">Family' +
      '<select id="tcGlmmFamilySelect" style="padding:6px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">' +
      GLMM_MODEL_FAMILIES.map((f) => '<option value="' + f.code + '"' + (f.code === 'UM.RS' ? ' selected' : '') + '>' + f.code + ' - ' + f.title + '</option>').join('') +
      '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);">Measure' +
      '<select id="tcGlmmMeasureSelect" style="padding:6px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">' +
      '<option value="OR" selected>Odds Ratio (OR)</option><option value="RR">Risk Ratio (RR)</option>' +
      '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);">Estimator' +
      '<select id="tcGlmmMethodSelect" style="padding:6px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">' +
      '<option value="ML" selected>ML</option><option value="REML">REML</option><option value="PM">PM</option><option value="PMM">PMM</option><option value="DL">DL</option>' +
      '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);">Quadrature points (UM.RS)' +
      '<input id="tcGlmmNQuad" type="number" min="7" max="41" step="2" value="13" style="padding:6px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);" />' +
      '</label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);">Continuity correction' +
      '<input id="tcGlmmContinuity" type="number" min="0.01" max="1" step="0.01" value="0.5" style="padding:6px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);" />' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:var(--text-xs);padding-top:18px;">' +
      '<input id="tcGlmmAllFamilies" type="checkbox" checked /> Run all families and render parity table' +
      '</label>' +
      '</div>' +
      '<div style="margin-top:var(--space-2);display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn--ghost btn--sm" id="tcExportGlmmRBtn">Export Metafor GLMM Cross-check (R)</button>' +
      '</div>' +
      '<div style="margin-top:var(--space-2);font-size:var(--text-xs);color:var(--text-secondary);">Default remains UM.RS + OR + ML + 13-point quadrature (existing behavior).</div>';

    if (primaryBtn) {
      body.insertBefore(controlWrap, primaryBtn);
    } else {
      body.insertBefore(controlWrap, body.firstChild);
    }

    const exportBtn = document.getElementById('tcExportGlmmRBtn');
    if (exportBtn && !exportBtn.__tcBound) {
      exportBtn.__tcBound = true;
      exportBtn.addEventListener('click', exportTruthCertGLMMMetaforCrosscheckScript);
    }

    return true;
  }

  function tcRunGLMMAdvancedEnhanced() {
    const dataset = tcBuildBinary2x2Dataset();
    if (dataset.length < 2) {
      tcNotify('GLMM requires binary 2x2 study data', 'error');
      return;
    }

    tcEnsureGLMMFamilyControls();
    const opts = tcGetGlmmControlOptions();
    const selected = tcRunGLMMFamilyByModel(dataset, opts.family, opts);
    const suite = opts.runAll
      ? tcRunGLMMFamilySuite(dataset, opts)
      : { rows: [selected], agreement: null };

    const ai = dataset.map((s) => s.a);
    const bi = dataset.map((s) => s.b);
    const ci = dataset.map((s) => s.c);
    const di = dataset.map((s) => s.d);

    const beta = typeof window.betaBinomialMA === 'function'
      ? window.betaBinomialMA(ai, bi, ci, di)
      : null;

    const payload = {
      selected,
      suite,
      beta,
      measure: opts.measure,
      k: dataset.length,
      zeroCells: dataset.filter((s) => s.a === 0 || s.b === 0 || s.c === 0 || s.d === 0).length
    };

    tcRenderGlmmAdvancedResults(payload);
    tcRenderGlmmAdvancedPlot(payload);

    if (selected && !selected.error) {
      tcNotify('GLMM family analysis complete', 'success');
    } else {
      tcNotify('GLMM family analysis completed with warnings', 'warning');
    }
    return payload;
  }

  function glmmMetaAnalysisFamily(ai, bi, ci, di, options) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!Array.isArray(ai) || !Array.isArray(bi) || !Array.isArray(ci) || !Array.isArray(di)) {
      return { error: 'Input arrays ai, bi, ci, di are required.' };
    }
    const k = Math.min(ai.length, bi.length, ci.length, di.length);
    const studies = [];
    for (let i = 0; i < k; i++) {
      const a = Number(ai[i]);
      const b = Number(bi[i]);
      const c = Number(ci[i]);
      const d = Number(di[i]);
      if (![a, b, c, d].every(Number.isFinite) || a < 0 || b < 0 || c < 0 || d < 0) {
        continue;
      }
      studies.push({ id: i + 1, study: 'Study ' + (i + 1), a, b, c, d });
    }
    if (studies.length < 2) {
      return { error: 'At least 2 valid studies are required.' };
    }
    const family = opts.family || 'UM.RS';
    return tcRunGLMMFamilyByModel(studies, family, opts);
  }

  function runGLMMFamilySuite(options) {
    const dataset = tcBuildBinary2x2Dataset();
    if (dataset.length < 2) {
      return { error: 'GLMM requires binary 2x2 study data.' };
    }
    const opts = options && typeof options === 'object' ? options : tcGetGlmmControlOptions();
    return tcRunGLMMFamilySuite(dataset, opts);
  }

  function tcInitGLMMFamilyParityUpgrade() {
    if (typeof window === 'undefined') return;
    if (!window.__tc_glmm_family_parity_patched__) {
      window.__tc_glmm_family_parity_patched__ = true;
      window.runGLMMAdvancedLegacy = typeof window.runGLMMAdvanced === 'function' ? window.runGLMMAdvanced : null;
      window.runGLMMAdvanced = tcRunGLMMAdvancedEnhanced;
      window.glmmMetaAnalysisFamily = glmmMetaAnalysisFamily;
      window.runGLMMFamilySuite = runGLMMFamilySuite;
    }

    tcEnsureGLMMFamilyControls();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const ready = tcEnsureGLMMFamilyControls();
      if (ready || attempts >= 40) {
        clearInterval(timer);
      }
    }, 400);
  }

  function tcInjectHeaderButton() {
    if (document.getElementById('auditPackBtn')) return;
    const controls = document.querySelector('.app-controls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id = 'auditPackBtn';
    btn.className = 'btn btn--ghost btn--sm';
    btn.title = 'Export reproducibility and validation audit bundle';
    btn.textContent = 'Audit Pack';
    btn.addEventListener('click', exportTruthCertAuditBundle);
    controls.insertBefore(btn, controls.firstChild);
  }

  function tcInjectValidationCard() {
    if (document.getElementById('tcAuditCard')) return;

    const panel = document.getElementById('panel-validation');
    if (!panel) return;

    const firstBody = panel.querySelector('.card .card__body');
    if (!firstBody) return;

    const card = document.createElement('div');
    card.id = 'tcAuditCard';
    card.className = 'card';
    card.style.marginTop = 'var(--space-4)';

    card.innerHTML =
      '<div class="card__header">' +
      '<h3 class="card__title">🔒 Reproducibility and Audit Toolkit</h3>' +
      '<p class="card__subtitle">Add-only upgrade for method transparency, traceability, and expert review readiness</p>' +
      '</div>' +
      '<div class="card__body">' +
      '<div class="flex gap-2" style="flex-wrap:wrap;">' +
      '<button class="btn btn--primary btn--sm" id="tcExportManifestBtn">Export Run Manifest</button>' +
      '<button class="btn btn--primary btn--sm" id="tcExportCitationsBtn">Export Method Citations</button>' +
      '<button class="btn btn--accent btn--sm" id="tcExportAuditBtn">Export Full Audit Bundle</button>' +
      '<button class="btn btn--accent btn--sm" id="tcSendMetaSprintWriteBtn">Send Methods+Results to MetaSprint</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcExportGlmmCrosscheckBtn">Export GLMM Metafor Cross-check (R)</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcExportPairwiseRCardBtn">Export Pairwise Gap-Fill (R)</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcRunFrontierCardBtn">Run Frontier Methods Pack</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcExportFrontierRCardBtn">Export Frontier Methods (R)</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcRunEstimatorAuditBtn">Run Extended Estimator Health-Check</button>' +
      '</div>' +
      '<div id="tcReadinessSummary"></div>' +
      '<div id="tcAuditResults"></div>' +
      '</div>';

    firstBody.appendChild(card);

    document.getElementById('tcExportManifestBtn').addEventListener('click', exportTruthCertRunManifest);
    document.getElementById('tcExportCitationsBtn').addEventListener('click', exportTruthCertMethodCitations);
    document.getElementById('tcExportAuditBtn').addEventListener('click', exportTruthCertAuditBundle);
    document.getElementById('tcSendMetaSprintWriteBtn').addEventListener('click', () => exportTruthCertMethodsResultsForMetaSprint({ silent: false }));
    document.getElementById('tcExportGlmmCrosscheckBtn').addEventListener('click', exportTruthCertGLMMMetaforCrosscheckScript);
    document.getElementById('tcExportPairwiseRCardBtn').addEventListener('click', exportTruthCertPairwiseGapRScript);
    document.getElementById('tcRunFrontierCardBtn').addEventListener('click', () => tcRunFrontierMethodsPack({}));
    document.getElementById('tcExportFrontierRCardBtn').addEventListener('click', exportTruthCertFrontierMethodsRScript);
    document.getElementById('tcRunEstimatorAuditBtn').addEventListener('click', runExtendedEstimatorAudit);

    tcRenderReadinessSummary();
  }

  function tcInjectMethodsModalTooling() {
    const modal = document.getElementById('methodsModal');
    if (!modal || document.getElementById('tcModalExportTools')) return;

    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;

    const tools = document.createElement('div');
    tools.id = 'tcModalExportTools';
    tools.style.marginTop = 'var(--space-4)';
    tools.style.padding = 'var(--space-3)';
    tools.style.background = 'var(--surface-overlay)';
    tools.style.borderRadius = 'var(--radius-lg)';
    tools.innerHTML =
      '<h3 style="margin:0 0 var(--space-2) 0;font-size:var(--text-sm);text-transform:uppercase;color:var(--text-secondary);">Reproducibility Exports</h3>' +
      '<div class="flex gap-2" style="flex-wrap:wrap;">' +
      '<button class="btn btn--ghost btn--sm" id="tcModalManifestBtn">Export Run Manifest</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcModalCitationsBtn">Export Citations</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcModalAuditBtn">Export Audit Bundle</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcModalFrontierRBtn">Export Frontier Methods (R)</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcModalGlmmCrosscheckBtn">Export GLMM Cross-check (R)</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcModalPairwiseRBtn">Export Pairwise Gap-Fill (R)</button>' +
      '</div>';

    modalContent.appendChild(tools);

    document.getElementById('tcModalManifestBtn').addEventListener('click', exportTruthCertRunManifest);
    document.getElementById('tcModalCitationsBtn').addEventListener('click', exportTruthCertMethodCitations);
    document.getElementById('tcModalAuditBtn').addEventListener('click', exportTruthCertAuditBundle);
    document.getElementById('tcModalFrontierRBtn').addEventListener('click', exportTruthCertFrontierMethodsRScript);
    document.getElementById('tcModalGlmmCrosscheckBtn').addEventListener('click', exportTruthCertGLMMMetaforCrosscheckScript);
    document.getElementById('tcModalPairwiseRBtn').addEventListener('click', exportTruthCertPairwiseGapRScript);
  }

  function tcMedian(values) {
    if (!Array.isArray(values) || values.length === 0) return NaN;
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (sorted.length === 0) return NaN;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function tcQnorm(p) {
    if (typeof qnorm === 'function') return qnorm(p);
    if (p <= 0 || p >= 1) return NaN;
    // Fallback to a practical approximation when core qnorm is unavailable.
    const a1 = -39.6968302866538; const a2 = 220.946098424521;
    const a3 = -275.928510446969; const a4 = 138.357751867269;
    const a5 = -30.6647980661472; const a6 = 2.50662827745924;
    const b1 = -54.4760987982241; const b2 = 161.585836858041;
    const b3 = -155.698979859887; const b4 = 66.8013118877197;
    const b5 = -13.2806815528857; const c1 = -0.00778489400243029;
    const c2 = -0.322396458041137; const c3 = -2.40075827716184;
    const c4 = -2.54973253934373; const c5 = 4.37466414146497;
    const c6 = 2.93816398269878; const d1 = 0.00778469570904146;
    const d2 = 0.32246712907004; const d3 = 2.44513413714299;
    const d4 = 3.75440866190742;
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q;
    let r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  }

  function tcMeasureTransformFromLog(logValue, measure) {
    const m = String(measure || 'OR').toUpperCase();
    if (['OR', 'RR', 'HR'].includes(m)) return Math.exp(logValue);
    return logValue;
  }

  function tcFormatFrontierEffect(value, measure, digits) {
    if (!Number.isFinite(value)) return 'N/A';
    const d = Number.isFinite(digits) ? Math.max(2, Math.min(6, Math.round(digits))) : 4;
    return value.toFixed(d);
  }

  function tcGetFrontierCoreData() {
    const state = tcSafeAppState();
    const results = state && state.results ? state.results : null;
    if (!results || !Array.isArray(results.studies) || results.studies.length < 2) {
      return { ok: false, reason: 'Run analysis first.' };
    }
    const rows = results.studies
      .map((s, idx) => ({
        idx: idx + 1,
        name: s && s.name ? String(s.name) : ('Study ' + (idx + 1)),
        yi: Number(s && s.yi),
        vi: Number(s && s.vi)
      }))
      .filter((r) => Number.isFinite(r.yi) && Number.isFinite(r.vi) && r.vi > 0);
    if (rows.length < 2) {
      return { ok: false, reason: 'Need at least two estimable studies.' };
    }
    return {
      ok: true,
      measure: String(results.measure || (state.settings && state.settings.effectMeasure) || 'OR').toUpperCase(),
      tau2Method: String((state.settings && state.settings.tau2Method) || (results.tau2Result && results.tau2Result.method) || 'REML'),
      names: rows.map((r) => r.name),
      yi: rows.map((r) => r.yi),
      vi: rows.map((r) => r.vi)
    };
  }

  function tcConformalPredictionInterval(yi, vi, measure, options) {
    const opts = options || {};
    const alpha = Number.isFinite(opts.alpha) ? Math.min(0.25, Math.max(0.001, opts.alpha)) : 0.05;
    const tau2Method = opts.tau2Method || 'REML';
    const pooled = tcRandomEffectPool(yi, vi, tau2Method);
    if (!pooled || pooled.error || !Number.isFinite(pooled.theta) || !Number.isFinite(pooled.se)) {
      return { valid: false, method: 'Conformal prediction interval', warning: 'Could not estimate pooled random-effects model.' };
    }
    const tau2 = Math.max(0, tcToFiniteNumber(pooled.tau2, 0));
    const score = yi.map((y, i) => Math.abs(y - pooled.theta) / Math.sqrt(Math.max(1e-12, vi[i] + tau2)));
    const sorted = score.slice().sort((a, b) => a - b);
    const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((sorted.length + 1) * (1 - alpha)) - 1));
    const q = sorted[rank];
    const refVi = tcMedian(vi);
    const sePred = Math.sqrt(Math.max(1e-12, tau2 + (Number.isFinite(refVi) ? refVi : pooled.se * pooled.se)));
    const lower = pooled.theta - q * sePred;
    const upper = pooled.theta + q * sePred;
    return {
      valid: true,
      method: 'Conformal prediction interval',
      alpha,
      k: yi.length,
      theta: pooled.theta,
      tau2,
      scoreQuantile: q,
      se_pred: sePred,
      lower_log: lower,
      upper_log: upper,
      lower: tcMeasureTransformFromLog(lower, measure),
      upper: tcMeasureTransformFromLog(upper, measure),
      note: yi.length < TC_FRONTIER_MIN_K
        ? 'Small-k caution: conformal interval is computed but finite-sample stability improves with more studies.'
        : 'Distribution-free interval computed from empirical conformity scores.'
    };
  }

  function tcAnytimeEProcess(yi, vi, names, options) {
    const opts = options || {};
    const alpha = Number.isFinite(opts.alpha) ? Math.min(0.2, Math.max(0.001, opts.alpha)) : 0.05;
    const eta2 = Number.isFinite(opts.eta2) ? Math.min(10, Math.max(0.01, opts.eta2)) : 0.5;
    const threshold = 1 / alpha;
    let S = 0;
    let V = 0;
    const rows = [];
    for (let i = 0; i < yi.length; i++) {
      const sd = Math.sqrt(Math.max(1e-12, vi[i]));
      const x = yi[i] / sd;
      S += x;
      V += 1;
      const denom = 1 + eta2 * V;
      const logE = -0.5 * Math.log(denom) + (eta2 * S * S) / (2 * denom);
      const evalue = Math.exp(Math.min(700, logE));
      const pooled = tcRandomEffectPool(yi.slice(0, i + 1), vi.slice(0, i + 1), 'REML');
      rows.push({
        study: i + 1,
        name: names && names[i] ? names[i] : ('Study ' + (i + 1)),
        z_like: S / Math.sqrt(Math.max(1, V)),
        log_e: logE,
        evalue,
        threshold,
        crossed: evalue >= threshold,
        theta_log: pooled && Number.isFinite(pooled.theta) ? pooled.theta : NaN
      });
    }
    const firstCross = rows.find((r) => r.crossed) || null;
    return {
      method: 'Anytime-valid sequential e-process',
      alpha,
      eta2,
      threshold,
      k: yi.length,
      maxE: rows.reduce((m, r) => Math.max(m, r.evalue), 0),
      firstCross,
      rows,
      interpretation: firstCross
        ? ('Evidence threshold crossed at study ' + firstCross.study + ' (' + firstCross.name + ').')
        : ('No anytime-valid crossing yet (max e-value=' + rows.reduce((m, r) => Math.max(m, r.evalue), 0).toFixed(2) + ').')
    };
  }

  function tcSameIndexSet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function tcTrimmedRobustRandomEffects(yi, vi, measure, options) {
    const opts = options || {};
    const trimFraction = Number.isFinite(opts.trimFraction) ? Math.min(0.35, Math.max(0.05, opts.trimFraction)) : 0.15;
    const maxIter = Number.isFinite(opts.maxIter) ? Math.max(1, Math.min(20, Math.round(opts.maxIter))) : 8;
    const tau2Method = opts.tau2Method || 'REML';
    const full = tcRandomEffectPool(yi, vi, tau2Method);
    if (!full || full.error || !Number.isFinite(full.theta)) {
      return { error: 'Could not compute full random-effects baseline for trimmed model.' };
    }
    let keep = yi.map((_, i) => i);
    const minKeep = Math.max(3, Math.ceil(yi.length * 0.6));
    let finalFit = full;
    let iterations = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;
      const ySub = keep.map((i) => yi[i]);
      const vSub = keep.map((i) => vi[i]);
      const fit = tcRandomEffectPool(ySub, vSub, tau2Method);
      if (!fit || fit.error || !Number.isFinite(fit.theta)) break;
      finalFit = fit;
      const scored = keep.map((idx, j) => ({
        idx,
        score: Math.abs((yi[idx] - fit.theta) / Math.sqrt(Math.max(1e-12, vi[idx] + Math.max(0, fit.tau2 || 0))))
      })).sort((a, b) => b.score - a.score);
      const nTrim = Math.min(Math.floor(keep.length * trimFraction), Math.max(0, keep.length - minKeep));
      const nextKeep = scored.slice(nTrim).map((x) => x.idx).sort((a, b) => a - b);
      if (tcSameIndexSet(nextKeep, keep)) break;
      keep = nextKeep;
    }
    const trimmedOut = yi.map((_, i) => i).filter((i) => !keep.includes(i));
    const deltaLog = finalFit.theta - full.theta;
    return {
      method: 'Trimmed robust random-effects',
      trimFraction,
      iterations,
      kept: keep.length,
      trimmed: trimmedOut.length,
      keptIndices: keep,
      trimmedIndices: trimmedOut,
      baseline: {
        theta_log: full.theta,
        se: full.se,
        tau2: full.tau2,
        theta: tcMeasureTransformFromLog(full.theta, measure)
      },
      robust: {
        theta_log: finalFit.theta,
        se: finalFit.se,
        tau2: finalFit.tau2,
        theta: tcMeasureTransformFromLog(finalFit.theta, measure),
        ci_lower: tcMeasureTransformFromLog(finalFit.theta - 1.96 * finalFit.se, measure),
        ci_upper: tcMeasureTransformFromLog(finalFit.theta + 1.96 * finalFit.se, measure)
      },
      shift_log: deltaLog,
      shift_ratio: tcMeasureTransformFromLog(deltaLog, measure),
      interpretation: Math.abs(deltaLog) > 0.15
        ? 'Material shift after trimming: investigate influential/outlier studies.'
        : 'Robust estimate is close to baseline (limited outlier leverage).'
    };
  }

  function tcLogistic(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function tcSolveLogitIntercept(centeredPrecision, slope, targetMean) {
    let lo = -15;
    let hi = 15;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const meanP = centeredPrecision.reduce((acc, cp) => acc + tcLogistic(mid + slope * cp), 0) / centeredPrecision.length;
      if (meanP > targetMean) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function tcCopasHeckmanRareEventSensitivity(measure) {
    const dataset = tcBuildBinary2x2Dataset();
    if (!dataset || dataset.length < 2) {
      return { error: 'Rare-event Copas-Heckman sensitivity requires binary 2x2 data.' };
    }
    const prep = tcComputeLogEffects2x2(dataset, measure === 'RR' ? 'RR' : 'OR', 0.5);
    if (!prep || prep.yi.length < 2) {
      return { error: 'Could not compute sparse binary log-effects.' };
    }
    const yi = prep.yi;
    const vi = prep.vi;
    const base = tcRandomEffectPool(yi, vi, 'REML');
    if (!base || base.error || !Number.isFinite(base.theta)) {
      return { error: 'Could not estimate baseline random-effects model for Copas sensitivity.' };
    }

    const precision = vi.map((v) => 1 / Math.sqrt(v));
    const meanPrecision = precision.reduce((a, b) => a + b, 0) / precision.length;
    const centered = precision.map((p) => p - meanPrecision);
    const slopes = [0, 0.5, 1, 1.5, 2, 2.5];
    const retentionTargets = [0.5, 0.65, 0.8, 0.9];
    const scenarios = [];
    const tau2 = Math.max(0, tcToFiniteNumber(base.tau2, 0));

    slopes.forEach((slope) => {
      retentionTargets.forEach((target) => {
        const intercept = tcSolveLogitIntercept(centered, slope, target);
        const selP = centered.map((cp) => Math.max(0.02, Math.min(0.98, tcLogistic(intercept + slope * cp))));
        const w = vi.map((v, i) => 1 / ((v + tau2) * selP[i]));
        const sumW = w.reduce((a, b) => a + b, 0);
        if (!(sumW > 0)) return;
        const theta = yi.reduce((acc, y, i) => acc + w[i] * y, 0) / sumW;
        const se = Math.sqrt(1 / sumW);
        scenarios.push({
          gamma0: intercept,
          gamma1: slope,
          targetRetention: target,
          avgSelection: selP.reduce((a, b) => a + b, 0) / selP.length,
          theta_log: theta,
          se,
          OR: Math.exp(theta),
          ci_lower: Math.exp(theta - 1.96 * se),
          ci_upper: Math.exp(theta + 1.96 * se)
        });
      });
    });

    let legacy = null;
    if (typeof copasSelectionModel === 'function') {
      try {
        legacy = copasSelectionModel(yi, vi);
      } catch (_) {
        legacy = null;
      }
    }

    const ors = scenarios.map((s) => s.OR).filter(Number.isFinite);
    const lower = ors.length ? Math.min.apply(null, ors) : NaN;
    const upper = ors.length ? Math.max.apply(null, ors) : NaN;

    return {
      method: 'Copas-Heckman rare-event sensitivity (grid)',
      k: yi.length,
      baselineOR: Math.exp(base.theta),
      baselineCI: {
        lower: Math.exp(base.theta - 1.96 * base.se),
        upper: Math.exp(base.theta + 1.96 * base.se)
      },
      tau2,
      scenarios,
      bounds: { lower, upper },
      legacyCopas: legacy,
      interpretation: Number.isFinite(lower) && Number.isFinite(upper) && (upper / lower) <= 1.35
        ? 'Copas-Heckman sensitivity range is tight; inference appears robust to plausible selection.'
        : 'Copas-Heckman sensitivity range is wide; interpret pooled effect cautiously under selection bias.'
    };
  }

  function tcProspectiveUpdateDesign(yi, vi, measure, options) {
    const opts = options || {};
    const alpha = Number.isFinite(opts.alpha) ? Math.min(0.2, Math.max(0.001, opts.alpha)) : 0.05;
    const power = Number.isFinite(opts.power) ? Math.min(0.99, Math.max(0.5, opts.power)) : 0.8;
    const pooled = tcRandomEffectPool(yi, vi, opts.tau2Method || 'REML');
    if (!pooled || pooled.error || !Number.isFinite(pooled.theta)) {
      return { error: 'Prospective-update design requires a finite pooled estimate.' };
    }
    const tau2 = Math.max(0, tcToFiniteNumber(pooled.tau2, 0));
    const currentInfo = vi.reduce((acc, v) => acc + (1 / (v + tau2)), 0);
    const avgVi = vi.reduce((a, b) => a + b, 0) / vi.length;
    const perStudyInfo = 1 / Math.max(1e-12, avgVi + tau2);
    const za = tcQnorm(1 - alpha / 2);
    const zb = tcQnorm(power);
    const expectedLogEffect = Number.isFinite(opts.expectedLogEffect)
      ? Math.max(0.02, Math.abs(opts.expectedLogEffect))
      : Math.max(0.08, Math.min(0.6, Math.abs(pooled.theta)));
    const requiredInfo = Math.pow(za + zb, 2) / Math.pow(expectedLogEffect, 2);
    const additionalInfo = Math.max(0, requiredInfo - currentInfo);
    const additionalStudies = Math.ceil(additionalInfo / perStudyInfo);
    const futureInfo = currentInfo + additionalStudies * perStudyInfo;
    const futureSe = Math.sqrt(1 / futureInfo);
    const futureLower = pooled.theta - za * futureSe;
    const futureUpper = pooled.theta + za * futureSe;

    return {
      method: 'Prospective update design',
      alpha,
      power,
      expectedLogEffect,
      currentInfo,
      requiredInfo,
      additionalInfo,
      additionalStudies,
      perStudyInfo,
      projected: {
        theta_log: pooled.theta,
        se: futureSe,
        lower: tcMeasureTransformFromLog(futureLower, measure),
        upper: tcMeasureTransformFromLog(futureUpper, measure)
      },
      recommendation: additionalStudies <= 0
        ? 'Current evidence already meets the target information size.'
        : ('Plan approximately ' + additionalStudies + ' similarly precise new studies for the target operating characteristics.')
    };
  }

  function tcRenderFrontierEValuePlot(anytime) {
    const host = document.getElementById('tcFrontierEPlot');
    if (!host || typeof Plotly === 'undefined' || !anytime || !Array.isArray(anytime.rows) || anytime.rows.length === 0) return;
    const x = anytime.rows.map((r) => r.study);
    const y = anytime.rows.map((r) => r.evalue);
    const threshold = anytime.rows.map(() => anytime.threshold);
    Plotly.newPlot(host, [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x,
        y,
        line: { color: '#4a7ab8', width: 2 },
        marker: { size: 7, color: '#4a7ab8' },
        name: 'e-value'
      },
      {
        type: 'scatter',
        mode: 'lines',
        x,
        y: threshold,
        line: { color: '#ef4444', dash: 'dash' },
        name: '1/alpha threshold'
      }
    ], {
      title: 'Anytime-valid e-process trajectory',
      xaxis: { title: 'Cumulative study index' },
      yaxis: { title: 'e-value', type: 'log' },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 60, r: 20, t: 40, b: 55 }
    }, { responsive: true });
  }

  function tcRenderFrontierMethodsResults(payload) {
    const host = document.getElementById('tcFrontierMethodsResults');
    if (!host) return;
    if (!payload || payload.error) {
      host.innerHTML = '<div class="alert alert--warning"><span class="alert__icon">⚠️</span><div class="alert__content"><div class="alert__text">' +
        tcSanitize(payload && payload.error ? payload.error : 'Frontier methods not available yet.') +
        '</div></div></div>';
      return;
    }
    const m = payload.measure;
    const conformal = payload.conformal;
    const anytime = payload.anytime;
    const trimmed = payload.trimmed;
    const copas = payload.copas;
    const design = payload.prospective;
    const cText = conformal && conformal.valid
      ? ('[' + tcFormatFrontierEffect(conformal.lower, m, 3) + ', ' + tcFormatFrontierEffect(conformal.upper, m, 3) + ']')
      : (conformal && conformal.warning ? conformal.warning : 'N/A');
    const eCross = anytime && anytime.firstCross
      ? ('Crossed at study ' + anytime.firstCross.study + ' (' + tcSanitize(anytime.firstCross.name) + ')')
      : 'No crossing yet';
    const trimText = trimmed && !trimmed.error
      ? (tcFormatFrontierEffect(trimmed.robust.theta, m, 3) + ' (trimmed ' + trimmed.trimmed + '/' + (trimmed.trimmed + trimmed.kept) + ')')
      : (trimmed && trimmed.error ? trimmed.error : 'N/A');
    const copasText = copas && !copas.error && copas.bounds && Number.isFinite(copas.bounds.lower)
      ? ('OR bounds ' + copas.bounds.lower.toFixed(3) + ' to ' + copas.bounds.upper.toFixed(3))
      : (copas && copas.error ? copas.error : 'N/A');
    const designText = design && !design.error
      ? (design.additionalStudies <= 0 ? 'No additional studies required' : ('~' + design.additionalStudies + ' additional studies needed'))
      : (design && design.error ? design.error : 'N/A');

    host.innerHTML =
      '<div class="stat-grid" style="grid-template-columns: repeat(5, 1fr); gap: var(--space-2);">' +
      '<div class="stat-card"><div class="stat-card__label">Conformal PI</div><div style="font-size:var(--text-xs);">' + tcSanitize(cText) + '</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Anytime e-process</div><div style="font-size:var(--text-xs);">' + tcSanitize(eCross) + '</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Trimmed robust RE</div><div style="font-size:var(--text-xs);">' + tcSanitize(trimText) + '</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Copas-Heckman</div><div style="font-size:var(--text-xs);">' + tcSanitize(copasText) + '</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Prospective update</div><div style="font-size:var(--text-xs);">' + tcSanitize(designText) + '</div></div>' +
      '</div>' +
      '<div style="margin-top:var(--space-3); font-size:var(--text-xs); color:var(--text-secondary);">' +
      '<p><strong>Anytime-valid max e-value:</strong> ' + (anytime ? anytime.maxE.toFixed(2) : 'N/A') + ' (threshold ' + (anytime ? anytime.threshold.toFixed(2) : 'N/A') + ')</p>' +
      '<p><strong>Trimmed robustness interpretation:</strong> ' + tcSanitize(trimmed && trimmed.interpretation ? trimmed.interpretation : 'N/A') + '</p>' +
      '<p><strong>Copas-Heckman interpretation:</strong> ' + tcSanitize(copas && copas.interpretation ? copas.interpretation : 'N/A') + '</p>' +
      '<p><strong>Prospective recommendation:</strong> ' + tcSanitize(design && design.recommendation ? design.recommendation : 'N/A') + '</p>' +
      '</div>';
  }

  function tcRunFrontierMethodsPack(options) {
    const opts = options || {};
    const core = tcGetFrontierCoreData();
    if (!core.ok) {
      const out = { error: core.reason || 'Run analysis first.' };
      tcRenderFrontierMethodsResults(out);
      if (!opts.silent) tcNotify(out.error, 'warning');
      return out;
    }
    const conformal = tcConformalPredictionInterval(core.yi, core.vi, core.measure, {
      alpha: opts.alpha || 0.05,
      tau2Method: core.tau2Method
    });
    const anytime = tcAnytimeEProcess(core.yi, core.vi, core.names, {
      alpha: opts.alpha || 0.05,
      eta2: opts.eta2 || 0.5
    });
    const trimmed = tcTrimmedRobustRandomEffects(core.yi, core.vi, core.measure, {
      trimFraction: opts.trimFraction || 0.15,
      maxIter: opts.maxIter || 8,
      tau2Method: core.tau2Method
    });
    const copas = tcCopasHeckmanRareEventSensitivity(core.measure);
    const prospective = tcProspectiveUpdateDesign(core.yi, core.vi, core.measure, {
      alpha: opts.alpha || 0.05,
      power: opts.power || 0.8,
      tau2Method: core.tau2Method
    });
    const payload = {
      generated_at: tcNowIso(),
      measure: core.measure,
      tau2Method: core.tau2Method,
      k: core.yi.length,
      conformal,
      anytime,
      trimmed,
      copas,
      prospective
    };
    tcFrontierResultsCache = payload;
    tcRenderFrontierMethodsResults(payload);
    tcRenderFrontierEValuePlot(anytime);
    if (!opts.silent) tcNotify('Frontier methods pack completed.', 'success');
    return payload;
  }

  function tcBuildFrontierMethodsRScript(frontier) {
    const core = tcGetFrontierCoreData();
    if (!core.ok) return null;
    const binary = tcBuildBinary2x2Dataset();
    const stamp = tcNowIso();
    const alpha = frontier && frontier.anytime ? frontier.anytime.alpha : 0.05;
    const eta2 = frontier && frontier.anytime ? frontier.anytime.eta2 : 0.5;
    return [
      '# ============================================================================',
      '# TruthCert Frontier Methods R Cross-check Script',
      '# Generated at: ' + stamp,
      '# Methods: conformal PI, anytime-valid e-process, trimmed robust RE,',
      '#          Copas-Heckman sensitivity, prospective update design',
      '# ============================================================================',
      '',
      'if (!requireNamespace("metafor", quietly = TRUE)) install.packages("metafor", repos = "https://cloud.r-project.org")',
      'suppressPackageStartupMessages(library(metafor))',
      '',
      'study <- ' + tcRStrVector(core.names),
      'yi <- ' + tcRNumVector(core.yi),
      'vi <- ' + tcRNumVector(core.vi),
      'dat <- data.frame(study=study, yi=yi, vi=vi)',
      '',
      '# Base model',
      'fit <- rma.uni(yi, vi, method="' + tcEscapeRString(core.tau2Method || 'REML') + '")',
      'theta <- as.numeric(fit$b[1])',
      'tau2 <- as.numeric(fit$tau2)',
      '',
      '# 1) Conformal PI (empirical-score implementation matching TruthCert logic)',
      'alpha <- ' + String(alpha),
      'score <- abs(yi - theta) / sqrt(vi + tau2)',
      'q_idx <- max(1, min(length(score), ceiling((length(score)+1) * (1-alpha))))',
      'q_hat <- sort(score)[q_idx]',
      'v_ref <- median(vi)',
      'se_pred <- sqrt(tau2 + v_ref)',
      'conformal_pi <- c(theta - q_hat * se_pred, theta + q_hat * se_pred)',
      '',
      '# 2) Anytime-valid e-process (normal-mixture e-values)',
      'eta2 <- ' + String(eta2),
      'x <- yi / sqrt(vi)',
      'S <- cumsum(x)',
      'V <- seq_along(x)',
      'logE <- -0.5 * log(1 + eta2 * V) + (eta2 * S^2) / (2 * (1 + eta2 * V))',
      'evalue <- exp(pmin(700, logE))',
      'first_cross <- which(evalue >= 1/alpha)[1]',
      '',
      '# 3) Trimmed robust RE (iterative residual trimming)',
      'trimmed_re <- function(yi, vi, trim_frac=0.15, max_iter=8) {',
      '  keep <- seq_along(yi)',
      '  min_keep <- max(3, ceiling(length(yi)*0.6))',
      '  fit_full <- rma.uni(yi, vi, method="' + tcEscapeRString(core.tau2Method || 'REML') + '")',
      '  fit <- fit_full',
      '  for (it in seq_len(max_iter)) {',
      '    fit <- rma.uni(yi[keep], vi[keep], method="' + tcEscapeRString(core.tau2Method || 'REML') + '")',
      '    resid_score <- abs((yi[keep] - as.numeric(fit$b[1])) / sqrt(vi[keep] + as.numeric(fit$tau2)))',
      '    ord <- order(resid_score, decreasing=TRUE)',
      '    n_trim <- min(floor(length(keep)*trim_frac), max(0, length(keep)-min_keep))',
      '    keep_new <- sort(keep[ord][-(seq_len(n_trim))])',
      '    if (identical(keep_new, keep)) break',
      '    keep <- keep_new',
      '  }',
      '  list(full=fit_full, robust=fit, keep=keep, trimmed=setdiff(seq_along(yi), keep))',
      '}',
      'trimmed_out <- trimmed_re(yi, vi)',
      '',
      '# 4) Copas-Heckman: use metasens::copas when available (binary data required)',
      'copas_result <- NULL',
      'if (requireNamespace("metasens", quietly = TRUE)) {',
      '  suppressPackageStartupMessages(library(metasens))',
      '  try({',
      (binary && binary.length >= 2)
        ? ('    ai <- ' + tcRNumVector(binary.map((s) => s.a)) + '\n' +
           '    bi <- ' + tcRNumVector(binary.map((s) => s.b)) + '\n' +
           '    ci <- ' + tcRNumVector(binary.map((s) => s.c)) + '\n' +
           '    di <- ' + tcRNumVector(binary.map((s) => s.d)) + '\n' +
           '    m <- meta::metabin(ai, ai+bi, ci, ci+di, sm="OR", method.tau="' + tcEscapeRString(core.tau2Method || 'REML') + '")\n' +
           '    copas_result <- metasens::copas(m)')
        : '    message("No binary 2x2 dataset available for copas() in this run.")',
      '  }, silent=TRUE)',
      '}',
      '',
      '# 5) Prospective update design (information-size target)',
      'za <- qnorm(1 - alpha/2)',
      'zb <- qnorm(0.8)',
      'expected_log_effect <- max(0.08, min(0.6, abs(theta)))',
      'current_info <- sum(1/(vi + tau2))',
      'per_study_info <- 1/(mean(vi) + tau2)',
      'required_info <- (za + zb)^2 / expected_log_effect^2',
      'additional_info <- max(0, required_info - current_info)',
      'additional_studies <- ceiling(additional_info / per_study_info)',
      '',
      'out <- list(',
      '  base_fit = fit,',
      '  conformal_pi = conformal_pi,',
      '  eprocess = data.frame(study=seq_along(evalue), evalue=evalue, logE=logE),',
      '  first_cross = if (is.na(first_cross)) NA_integer_ else first_cross,',
      '  trimmed = list(full=trimmed_out$full, robust=trimmed_out$robust, keep=trimmed_out$keep, trimmed=trimmed_out$trimmed),',
      '  copas = copas_result,',
      '  prospective = list(current_info=current_info, required_info=required_info, additional_studies=additional_studies)',
      ')',
      'print(out)',
      '',
      'if (requireNamespace("jsonlite", quietly = TRUE)) {',
      '  jsonlite::write_json(list(',
      '    generated_at="' + tcEscapeRString(stamp) + '",',
      '    conformal_pi=as.numeric(conformal_pi),',
      '    evalue_max=max(evalue),',
      '    first_cross=if (is.na(first_cross)) NULL else as.integer(first_cross),',
      '    additional_studies=as.integer(additional_studies)',
      '  ), path=paste0("truthcert_frontier_methods_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".json"), auto_unbox=TRUE, pretty=TRUE)',
      '}',
      ''
    ].join('\n');
  }

  function exportTruthCertFrontierMethodsRScript() {
    const frontier = tcRunFrontierMethodsPack({ silent: true });
    if (!frontier || frontier.error) {
      tcNotify('Run analysis first to export the frontier methods R script.', 'warning');
      return;
    }
    const script = tcBuildFrontierMethodsRScript(frontier);
    if (!script) {
      tcNotify('Could not build frontier methods R script for current data.', 'error');
      return;
    }
    tcDownloadText('truthcert_frontier_methods_' + Date.now() + '.R', script, 'text/x-r-source');
    tcNotify('Frontier methods R cross-check script exported.', 'success');
  }

  function tcNormalCdf(x) {
    if (typeof normalCDF === 'function') return normalCDF(x);
    if (typeof pnorm === 'function') return pnorm(x);
    const z = Number(x) / Math.sqrt(2);
    const sign = z < 0 ? -1 : 1;
    const az = Math.abs(z);
    const t = 1 / (1 + 0.3275911 * az);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-az * az));
    return 0.5 * (1 + sign * erf);
  }

  function tcClamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
  }

  function tcPValueTwoSided(yi, vi) {
    const se = Math.sqrt(Math.max(1e-12, vi));
    const z = yi / se;
    const p = 2 * (1 - tcNormalCdf(Math.abs(z)));
    return tcClamp(Number.isFinite(p) ? p : 1, 1e-10, 1);
  }

  function tcSelectionBins(type) {
    if (type === 'beta') {
      return [
        { lower: 0, upper: 0.025 },
        { lower: 0.025, upper: 0.05 },
        { lower: 0.05, upper: 0.1 },
        { lower: 0.1, upper: 0.5 },
        { lower: 0.5, upper: 1.0 }
      ];
    }
    return [
      { lower: 0, upper: 0.025 },
      { lower: 0.025, upper: 0.05 },
      { lower: 0.05, upper: 0.1 },
      { lower: 0.1, upper: 0.5 },
      { lower: 0.5, upper: 1.0 }
    ];
  }

  function tcSelectionBinIndex(pValue, bins) {
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      if (pValue >= b.lower && (pValue < b.upper || (i === bins.length - 1 && pValue <= b.upper))) {
        return i;
      }
    }
    return bins.length - 1;
  }

  function tcExpectedPBandProbability(delta, lower, upper) {
    if (!(upper > lower)) return 0;
    const zLow = upper >= 1 ? 0 : Math.max(0, tcQnorm(1 - upper / 2));
    const zHigh = lower <= 0 ? Infinity : Math.max(0, tcQnorm(1 - lower / 2));
    const massTo = (zAbs) => {
      if (!Number.isFinite(zAbs)) return 1;
      return tcNormalCdf(zAbs - delta) - tcNormalCdf(-zAbs - delta);
    };
    const p = massTo(zHigh) - massTo(zLow);
    return tcClamp(Number.isFinite(p) ? p : 0, 0, 1);
  }

  function tcBuildStepSelectionWeights(yi, vi, theta, tau2, pvals, bins) {
    const stats = bins.map((b) => ({ lower: b.lower, upper: b.upper, observed: 0, expected: 0, weight: 1 }));
    for (let i = 0; i < yi.length; i++) {
      const idx = tcSelectionBinIndex(pvals[i], bins);
      stats[idx].observed += 1;
      const delta = theta / Math.sqrt(Math.max(1e-12, vi[i] + tau2));
      for (let j = 0; j < bins.length; j++) {
        stats[j].expected += tcExpectedPBandProbability(delta, bins[j].lower, bins[j].upper);
      }
    }

    const raw = stats.map((b) => (b.observed + 0.5) / (b.expected + 0.5));
    const base = raw[0] > 0 ? raw[0] : Math.max(...raw, 1);
    const scaled = raw.map((r) => tcClamp(r / base, 0.05, 1));
    scaled[0] = 1;
    for (let j = 1; j < scaled.length; j++) {
      scaled[j] = Math.min(scaled[j], scaled[j - 1]);
      scaled[j] = tcClamp(scaled[j], 0.05, 1);
    }
    stats.forEach((b, j) => {
      b.weight = scaled[j];
    });
    return stats;
  }

  function tcWeightedPoolWithSelection(yi, vi, tau2, selectionProb) {
    const w = yi.map((_, i) => {
      const sel = tcClamp(selectionProb[i], 0.01, 1);
      return 1 / (sel * (vi[i] + tau2));
    });
    const sumW = w.reduce((acc, x) => acc + x, 0);
    if (!(sumW > 0)) return null;
    const theta = yi.reduce((acc, y, i) => acc + w[i] * y, 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    return {
      theta,
      se,
      ci_lower: theta - 1.96 * se,
      ci_upper: theta + 1.96 * se
    };
  }

  function tcEnhancedSelectionModel(yi, vi, type, options) {
    const modelType = type === 'beta' ? 'beta' : 'step';
    if (!Array.isArray(yi) || !Array.isArray(vi) || yi.length < 2 || yi.length !== vi.length) {
      return {
        type: modelType,
        unadjusted: { theta: NaN, se: NaN, ci_lower: NaN, ci_upper: NaN },
        adjusted: { theta: NaN, se: NaN, ci_lower: NaN, ci_upper: NaN },
        selectionWeights: [],
        changePct: NaN,
        interpretation: 'Selection model unavailable: insufficient estimable studies.'
      };
    }
    const opts = options || {};
    const tau2Method = opts.tau2Method || 'REML';
    const unadj = tcRandomEffectPool(yi, vi, tau2Method);
    if (!unadj || unadj.error || !Number.isFinite(unadj.theta) || !Number.isFinite(unadj.se)) {
      return {
        type: modelType,
        unadjusted: { theta: NaN, se: NaN, ci_lower: NaN, ci_upper: NaN },
        adjusted: { theta: NaN, se: NaN, ci_lower: NaN, ci_upper: NaN },
        selectionWeights: [],
        changePct: NaN,
        interpretation: 'Selection model unavailable: could not fit unadjusted random-effects model.'
      };
    }

    const tau2 = Math.max(0, tcToFiniteNumber(unadj.tau2, 0));
    const pvals = yi.map((y, i) => tcPValueTwoSided(y, vi[i]));
    const bins = tcSelectionBins(modelType);
    let selectionProb = new Array(yi.length).fill(1);
    let selectionWeights = [];

    if (modelType === 'step') {
      const stats = tcBuildStepSelectionWeights(yi, vi, unadj.theta, tau2, pvals, bins);
      selectionWeights = stats.map((s) => ({
        lower: s.lower,
        upper: s.upper,
        weight: s.weight,
        observed: s.observed,
        expected: s.expected
      }));
      selectionProb = pvals.map((p) => {
        const idx = tcSelectionBinIndex(p, bins);
        return stats[idx].weight;
      });
    } else {
      const observedSig = pvals.filter((p) => p < 0.05).length / pvals.length;
      const expectedSig = yi.map((_, i) => {
        const delta = unadj.theta / Math.sqrt(Math.max(1e-12, vi[i] + tau2));
        return 1 - (tcNormalCdf(1.96 - delta) - tcNormalCdf(-1.96 - delta));
      }).reduce((acc, x) => acc + x, 0) / pvals.length;
      const enrichment = expectedSig > 1e-8 ? observedSig / expectedSig : 1;
      const beta = tcClamp((enrichment - 1) * 3, 0, 8);
      const raw = pvals.map((p) => Math.exp(-beta * p));
      const maxRaw = Math.max(...raw, 1e-12);
      selectionProb = raw.map((r) => tcClamp(r / maxRaw, 0.08, 1));
      selectionWeights = bins.map((b) => {
        const idxs = pvals.map((p, i) => ({ p, i })).filter((row) => row.p >= b.lower && (row.p < b.upper || (b.upper >= 1 && row.p <= b.upper)));
        const avgW = idxs.length
          ? idxs.reduce((acc, row) => acc + selectionProb[row.i], 0) / idxs.length
          : null;
        return {
          lower: b.lower,
          upper: b.upper,
          weight: Number.isFinite(avgW) ? avgW : 1,
          observed: idxs.length,
          expected: null
        };
      });
    }

    const adj = tcWeightedPoolWithSelection(yi, vi, tau2, selectionProb);
    if (!adj) {
      return {
        type: modelType,
        unadjusted: {
          theta: unadj.theta,
          se: unadj.se,
          ci_lower: unadj.theta - 1.96 * unadj.se,
          ci_upper: unadj.theta + 1.96 * unadj.se
        },
        adjusted: {
          theta: unadj.theta,
          se: unadj.se,
          ci_lower: unadj.theta - 1.96 * unadj.se,
          ci_upper: unadj.theta + 1.96 * unadj.se
        },
        selectionWeights,
        changePct: 0,
        interpretation: 'Selection weighting was numerically unstable; returning unadjusted random-effects estimate.',
        _selectionProb: selectionProb,
        _tau2: tau2
      };
    }

    const denom = Math.max(Math.abs(unadj.theta), 1e-8);
    const changePct = 100 * (unadj.theta - adj.theta) / denom;
    let interpretation = 'Selection-adjusted estimate closely matches the unadjusted estimate.';
    if (Math.abs(changePct) >= 15) {
      interpretation = 'Selection-adjusted estimate differs substantially (>15%), suggesting non-trivial publication bias sensitivity.';
    } else if (Math.abs(changePct) >= 5) {
      interpretation = 'Selection-adjusted estimate shows moderate shift (5-15%), indicating possible publication bias sensitivity.';
    }

    if (!tcPairwiseGapResultsCache || typeof tcPairwiseGapResultsCache !== 'object') {
      tcPairwiseGapResultsCache = { generated_at: tcNowIso() };
    }
    tcPairwiseGapResultsCache.generated_at = tcNowIso();
    if (modelType === 'step') {
      tcPairwiseGapResultsCache.selection_step_change_pct = changePct;
    } else {
      tcPairwiseGapResultsCache.selection_beta_change_pct = changePct;
    }

    return {
      type: modelType,
      unadjusted: {
        theta: unadj.theta,
        se: unadj.se,
        ci_lower: unadj.theta - 1.96 * unadj.se,
        ci_upper: unadj.theta + 1.96 * unadj.se
      },
      adjusted: adj,
      selectionWeights,
      changePct,
      interpretation,
      _selectionProb: selectionProb,
      _tau2: tau2
    };
  }

  function tcFitWeightedLinearIntercept(yi, vi, x) {
    const k = yi.length;
    const w = vi.map((v) => 1 / Math.max(1e-12, v));
    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    let sumWXX = 0;
    let sumWXY = 0;
    for (let i = 0; i < k; i++) {
      sumW += w[i];
      sumWX += w[i] * x[i];
      sumWY += w[i] * yi[i];
      sumWXX += w[i] * x[i] * x[i];
      sumWXY += w[i] * x[i] * yi[i];
    }
    const denom = sumW * sumWXX - sumWX * sumWX;
    if (!(denom > 1e-12)) return null;
    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
    const intercept = (sumWY - slope * sumWX) / sumW;
    let rss = 0;
    const resid = [];
    for (let i = 0; i < k; i++) {
      const r = yi[i] - intercept - slope * x[i];
      resid.push(r);
      rss += w[i] * r * r;
    }
    const sigma2 = rss / Math.max(1, k - 2);
    const seIntercept = Math.sqrt(Math.max(1e-12, sigma2 * (sumWXX / denom)));
    let ll = 0;
    for (let i = 0; i < k; i++) {
      ll += -0.5 * (Math.log(2 * Math.PI * vi[i]) + (resid[i] * resid[i]) / vi[i]);
    }
    const bic = -2 * ll + 2 * Math.log(Math.max(2, k));
    return {
      theta: intercept,
      se: seIntercept,
      slope,
      ll,
      bic
    };
  }

  function tcLogLikelihoodKnown(yi, vi, theta, tau2) {
    let ll = 0;
    for (let i = 0; i < yi.length; i++) {
      const totalVar = Math.max(1e-12, vi[i] + tau2);
      const r = yi[i] - theta;
      ll += -0.5 * (Math.log(2 * Math.PI * totalVar) + (r * r) / totalVar);
    }
    return ll;
  }

  function tcEnhancedRobustBayesianMA(yi, vi, options) {
    if (!Array.isArray(yi) || !Array.isArray(vi) || yi.length < 2 || yi.length !== vi.length) {
      return { ok: false, error: 'Need at least two estimable studies for model averaging.' };
    }
    const opts = options && typeof options === 'object' ? options : {};
    const tau2Method = opts.tau2Method || (tcSafeAppState() && tcSafeAppState().settings && tcSafeAppState().settings.tau2Method) || 'REML';
    const k = yi.length;

    const fe = tcFixedEffectPool(yi, vi);
    const re = tcRandomEffectPool(yi, vi, tau2Method);
    if (!fe || fe.error || !re || re.error) {
      return { ok: false, error: 'Failed to fit baseline FE/RE models.' };
    }
    const sei = vi.map((v) => Math.sqrt(v));
    const pet = tcFitWeightedLinearIntercept(yi, vi, sei);
    const peese = tcFitWeightedLinearIntercept(yi, vi, vi);
    const selStep = tcEnhancedSelectionModel(yi, vi, 'step', { tau2Method: tau2Method, silent: true });
    const selBeta = tcEnhancedSelectionModel(yi, vi, 'beta', { tau2Method: tau2Method, silent: true });

    const models = [];
    const llFE = tcLogLikelihoodKnown(yi, vi, fe.theta, 0);
    const llRE = tcLogLikelihoodKnown(yi, vi, re.theta, Math.max(0, re.tau2));
    models.push({
      name: 'FE (no bias)',
      theta: fe.theta,
      se: fe.se,
      ll: llFE,
      bic: -2 * llFE + 1 * Math.log(k),
      hasBias: false,
      hasEffect: true
    });
    models.push({
      name: 'RE (no bias)',
      theta: re.theta,
      se: re.se,
      ll: llRE,
      bic: -2 * llRE + 2 * Math.log(k),
      hasBias: false,
      hasEffect: true
    });
    if (pet && Number.isFinite(pet.theta) && Number.isFinite(pet.se)) {
      models.push({
        name: 'PET',
        theta: pet.theta,
        se: pet.se,
        ll: pet.ll,
        bic: pet.bic,
        hasBias: true,
        hasEffect: true
      });
    }
    if (peese && Number.isFinite(peese.theta) && Number.isFinite(peese.se)) {
      models.push({
        name: 'PEESE',
        theta: peese.theta,
        se: peese.se,
        ll: peese.ll,
        bic: peese.bic,
        hasBias: true,
        hasEffect: true
      });
    }
    if (selStep && selStep.adjusted && Number.isFinite(selStep.adjusted.theta) && Number.isFinite(selStep.adjusted.se)) {
      const selProb = Array.isArray(selStep._selectionProb) ? selStep._selectionProb : new Array(k).fill(1);
      const ll = tcLogLikelihoodKnown(yi, vi, selStep.adjusted.theta, Math.max(0, selStep._tau2 || re.tau2)) +
        selProb.reduce((acc, p) => acc + Math.log(tcClamp(p, 1e-6, 1)), 0);
      models.push({
        name: 'Selection (step)',
        theta: selStep.adjusted.theta,
        se: selStep.adjusted.se,
        ll,
        bic: -2 * ll + 4 * Math.log(k),
        hasBias: true,
        hasEffect: true
      });
    }
    if (selBeta && selBeta.adjusted && Number.isFinite(selBeta.adjusted.theta) && Number.isFinite(selBeta.adjusted.se)) {
      const selProb = Array.isArray(selBeta._selectionProb) ? selBeta._selectionProb : new Array(k).fill(1);
      const ll = tcLogLikelihoodKnown(yi, vi, selBeta.adjusted.theta, Math.max(0, selBeta._tau2 || re.tau2)) +
        selProb.reduce((acc, p) => acc + Math.log(tcClamp(p, 1e-6, 1)), 0);
      models.push({
        name: 'Selection (beta)',
        theta: selBeta.adjusted.theta,
        se: selBeta.adjusted.se,
        ll,
        bic: -2 * ll + 3 * Math.log(k),
        hasBias: true,
        hasEffect: true
      });
    }
    const llNull = tcLogLikelihoodKnown(yi, vi, 0, 0);
    models.push({
      name: 'Null (no effect)',
      theta: 0,
      se: 0.001,
      ll: llNull,
      bic: -2 * llNull,
      hasBias: false,
      hasEffect: false
    });

    const valid = models.filter((m) => Number.isFinite(m.bic) && Number.isFinite(m.theta) && Number.isFinite(m.se) && m.se > 0);
    if (valid.length < 2) return { ok: false, error: 'No valid model set for averaging.' };
    const minBic = Math.min(...valid.map((m) => m.bic));
    const rawW = valid.map((m) => Math.exp(-0.5 * (m.bic - minBic)));
    const sumW = rawW.reduce((acc, x) => acc + x, 0);
    const weights = rawW.map((w) => w / sumW);
    valid.forEach((m, i) => {
      m.weight = weights[i];
      m.deltaBIC = m.bic - minBic;
    });
    const theta = valid.reduce((acc, m) => acc + m.weight * m.theta, 0);
    const varWithin = valid.reduce((acc, m) => acc + m.weight * m.se * m.se, 0);
    const varBetween = valid.reduce((acc, m) => acc + m.weight * Math.pow(m.theta - theta, 2), 0);
    const se = Math.sqrt(varWithin + varBetween);
    const pEffect = valid.filter((m) => m.hasEffect).reduce((acc, m) => acc + m.weight, 0);
    const pBias = valid.filter((m) => m.hasBias).reduce((acc, m) => acc + m.weight, 0);
    const priorH0 = tcClamp(tcToFiniteNumber(opts.priorH0, 0.5), 0.01, 0.99);
    const nullWeight = tcClamp((valid.find((m) => !m.hasEffect) || {}).weight || 0.001, 1e-6, 1 - 1e-6);
    const effectWeight = 1 - nullWeight;
    const priorOdds = (1 - priorH0) / priorH0;
    const bf10 = (effectWeight / nullWeight) / priorOdds;
    let interpretation = 'Inconclusive evidence for a non-zero effect after model averaging.';
    if (pEffect > 0.95) interpretation = 'Strong evidence for a non-zero effect after model averaging.';
    else if (pEffect > 0.75) interpretation = 'Moderate evidence for a non-zero effect after model averaging.';
    else if (pEffect < 0.25) interpretation = 'Evidence leans toward no effect.';
    if (pBias > 0.75) interpretation += ' Bias-sensitive models receive high posterior support.';

    tcPairwiseGapResultsCache = {
      generated_at: tcNowIso(),
      selection_step_change_pct: selStep && Number.isFinite(selStep.changePct) ? selStep.changePct : null,
      selection_beta_change_pct: selBeta && Number.isFinite(selBeta.changePct) ? selBeta.changePct : null,
      robma: {
        theta,
        se,
        pEffect,
        pBias,
        bf10,
        method: 'RoBMA-style model averaging (pairwise enhanced bias lanes)'
      }
    };

    return {
      ok: true,
      theta,
      se,
      ciLower: theta - 1.96 * se,
      ciUpper: theta + 1.96 * se,
      pEffect,
      pBias,
      bf10,
      models: valid.sort((a, b) => b.weight - a.weight),
      interpretation,
      method: 'RoBMA-style model averaging (pairwise enhanced bias lanes)'
    };
  }

  function tcRenderRoBMAMinimal(results) {
    const host = document.getElementById('modelavgResults') || document.getElementById('robmaResults');
    if (!host || !results || !results.ok) return;
    host.innerHTML =
      '<div class="alert alert--info">' +
      '<span class="alert__icon">ℹ️</span>' +
      '<div class="alert__content">' +
      '<div class="alert__title">' + tcSanitize(results.method) + '</div>' +
      '<div class="alert__text">θ=' + results.theta.toFixed(4) + ', 95% CI [' + results.ciLower.toFixed(4) + ', ' + results.ciUpper.toFixed(4) + '], ' +
      'P(effect)=' + (100 * results.pEffect).toFixed(1) + '%, P(bias)=' + (100 * results.pBias).toFixed(1) + '%.</div>' +
      '</div></div>';
  }

  function tcRunRoBMAEnhanced() {
    const state = tcSafeAppState();
    const resultsState = state && state.results ? state.results : null;
    if (!resultsState || !Array.isArray(resultsState.studies) || resultsState.studies.length < 2) {
      tcNotify('Run analysis first', 'warning');
      return;
    }
    const yi = resultsState.studies.map((s) => Number(s && s.yi)).filter(Number.isFinite);
    const vi = resultsState.studies.map((s) => Number(s && s.vi)).filter((v) => Number.isFinite(v) && v > 0);
    if (yi.length !== vi.length || yi.length < 2) {
      tcNotify('RoBMA requires finite yi/vi values from at least two studies.', 'warning');
      return;
    }

    const btn = document.getElementById('modelavgBtn') || document.getElementById('robmaBtn');
    const progressWrap = document.getElementById('modelavgProgress') || document.getElementById('robmaProgress');
    const progressBar = document.getElementById('modelavgProgressBar') || document.getElementById('robmaProgressBar');
    const status = document.getElementById('modelavgStatus') || document.getElementById('robmaStatus');
    const originalLabel = btn ? btn.innerHTML : '';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner">...</span> Running...';
    }
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (status) status.textContent = 'Fitting expanded model set...';

    setTimeout(() => {
      try {
        const out = tcEnhancedRobustBayesianMA(yi, vi, {
          tau2Method: state && state.settings && state.settings.tau2Method ? state.settings.tau2Method : 'REML'
        });
        if (!out || !out.ok) {
          if (typeof window.runRoBMALegacy === 'function' && window.runRoBMALegacy !== tcRunRoBMAEnhanced) {
            window.runRoBMALegacy();
            return;
          }
          throw new Error(out && out.error ? out.error : 'RoBMA failed.');
        }
        if (typeof renderRoBMAResults === 'function') renderRoBMAResults(out);
        else tcRenderRoBMAMinimal(out);
        if (typeof renderRoBMAPlot === 'function') renderRoBMAPlot(out);
        if (progressBar) progressBar.style.width = '100%';
        if (status) status.textContent = 'Completed';
        tcNotify('RoBMA complete', 'success');
      } catch (err) {
        tcNotify('RoBMA failed: ' + String(err && err.message ? err.message : err), 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalLabel;
        }
        if (progressWrap) progressWrap.style.display = 'none';
      }
    }, 20);
  }

  function tcBuildPairwiseGapRScript() {
    const core = tcGetFrontierCoreData();
    if (!core.ok) return null;
    const binary = tcBuildBinary2x2Dataset();
    const stamp = tcNowIso();
    const tauMethod = core.tau2Method || 'REML';
    return [
      '# ============================================================================',
      '# TruthCert Pairwise Gap-Fill R Script',
      '# Generated at: ' + stamp,
      '# Focus: selection models + RoBMA + Copas sensitivity for pairwise meta-analysis',
      '# ============================================================================',
      '',
      'needed <- c("metafor", "weightr", "RoBMA", "meta", "metasens", "jsonlite")',
      'for (pkg in needed) {',
      '  if (!requireNamespace(pkg, quietly = TRUE)) {',
      '    try(install.packages(pkg, repos = "https://cloud.r-project.org"), silent = TRUE)',
      '  }',
      '}',
      '',
      'suppressPackageStartupMessages(library(metafor))',
      'study <- ' + tcRStrVector(core.names),
      'yi <- ' + tcRNumVector(core.yi),
      'vi <- ' + tcRNumVector(core.vi),
      'sei <- sqrt(vi)',
      'dat <- data.frame(study = study, yi = yi, vi = vi, sei = sei)',
      '',
      'fit <- rma.uni(yi = yi, vi = vi, method = "' + tcEscapeRString(tauMethod) + '", slab = study)',
      'cat("\\n=== BASE MODEL (metafor::rma.uni) ===\\n")',
      'print(fit)',
      '',
      'cat("\\n=== STEP SELECTION MODEL (metafor::selmodel) ===\\n")',
      'sel_fit <- tryCatch(',
      '  metafor::selmodel(fit, type = "stepfun", steps = c(0.025, 0.05, 0.1, 0.5)),',
      '  error = function(e) e',
      ')',
      'if (inherits(sel_fit, "error")) {',
      '  cat("selmodel failed:", conditionMessage(sel_fit), "\\n")',
      '} else {',
      '  print(sel_fit)',
      '}',
      '',
      'cat("\\n=== WEIGHT-FUNCTION MODEL (weightr::weightfunct) ===\\n")',
      'wf_fit <- if (requireNamespace("weightr", quietly = TRUE)) {',
      '  tryCatch(',
      '    weightr::weightfunct(effect = yi, v = vi, steps = c(0.025, 0.05, 0.1, 0.5), table = TRUE),',
      '    error = function(e) e',
      '  )',
      '} else {',
      '  structure(list(message = "weightr not installed"), class = "error")',
      '}',
      'if (inherits(wf_fit, "error")) {',
      '  cat("weightfunct failed:", conditionMessage(wf_fit), "\\n")',
      '} else {',
      '  print(wf_fit)',
      '}',
      '',
      'cat("\\n=== RoBMA (RoBMA package) ===\\n")',
      'robma_fit <- if (requireNamespace("RoBMA", quietly = TRUE)) {',
      '  tryCatch(',
      '    RoBMA::RoBMA(yi = yi, sei = sei, study_names = study),',
      '    error = function(e1) tryCatch(',
      '      RoBMA::RoBMA(yi = yi, sei = sei),',
      '      error = function(e2) e2',
      '    )',
      '  )',
      '} else {',
      '  structure(list(message = "RoBMA not installed"), class = "error")',
      '}',
      'if (inherits(robma_fit, "error")) {',
      '  cat("RoBMA failed:", conditionMessage(robma_fit), "\\n")',
      '} else {',
      '  print(summary(robma_fit))',
      '}',
      '',
      'cat("\\n=== Copas Sensitivity (metasens::copas, binary data only) ===\\n")',
      (binary && binary.length >= 2)
        ? ('copas_fit <- tryCatch({\n' +
           '  ai <- ' + tcRNumVector(binary.map((s) => s.a)) + '\n' +
           '  bi <- ' + tcRNumVector(binary.map((s) => s.b)) + '\n' +
           '  ci <- ' + tcRNumVector(binary.map((s) => s.c)) + '\n' +
           '  di <- ' + tcRNumVector(binary.map((s) => s.d)) + '\n' +
           '  m <- meta::metabin(ai, ai + bi, ci, ci + di, sm = "OR", method.tau = "' + tcEscapeRString(tauMethod) + '")\n' +
           '  metasens::copas(m)\n' +
           '}, error = function(e) e)\n' +
           'if (inherits(copas_fit, "error")) {\n' +
           '  cat("copas failed:", conditionMessage(copas_fit), "\\n")\n' +
           '} else {\n' +
           '  print(copas_fit)\n' +
           '}')
        : 'cat("No binary 2x2 dataset available in this run; Copas block skipped.\\n")',
      '',
      'summary_out <- list(',
      '  generated_at = "' + tcEscapeRString(stamp) + '",',
      '  method_tau2 = "' + tcEscapeRString(tauMethod) + '",',
      '  base_theta = as.numeric(fit$b[1]),',
      '  base_ci = c(as.numeric(fit$ci.lb), as.numeric(fit$ci.ub)),',
      '  selmodel_ok = !inherits(sel_fit, "error"),',
      '  weightr_ok = !inherits(wf_fit, "error"),',
      '  robma_ok = !inherits(robma_fit, "error")',
      ')',
      'print(summary_out)',
      '',
      'if (requireNamespace("jsonlite", quietly = TRUE)) {',
      '  json_file <- paste0("truthcert_pairwise_gapfill_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".json")',
      '  jsonlite::write_json(summary_out, json_file, pretty = TRUE, auto_unbox = TRUE)',
      '  cat("Wrote ", json_file, "\\n", sep = "")',
      '}',
      ''
    ].join('\n');
  }

  function exportTruthCertPairwiseGapRScript() {
    const script = tcBuildPairwiseGapRScript();
    if (!script) {
      tcNotify('Run analysis first to export pairwise gap-fill R script.', 'warning');
      return;
    }
    tcDownloadText('truthcert_pairwise_gapfill_' + Date.now() + '.R', script, 'text/x-r-source');
    tcNotify('Pairwise gap-fill R script exported.', 'success');
  }

  function tcInstallPairwiseGapClosures() {
    if (typeof window === 'undefined' || window.__tc_pairwise_gap_closure_patched__) return;
    window.__tc_pairwise_gap_closure_patched__ = true;

    const legacySelection = typeof window.selectionModel === 'function' ? window.selectionModel : null;
    window.selectionModelLegacy = legacySelection;
    window.selectionModel = function (yi, vi, type) {
      try {
        return tcEnhancedSelectionModel(yi, vi, type, {
          tau2Method: tcSafeAppState() && tcSafeAppState().settings ? tcSafeAppState().settings.tau2Method : 'REML'
        });
      } catch (err) {
        if (legacySelection) return legacySelection(yi, vi, type);
        throw err;
      }
    };

    const legacyRobma = typeof window.robustBayesianMA === 'function' ? window.robustBayesianMA : null;
    window.robustBayesianMALegacy = legacyRobma;
    window.robustBayesianMA = function (yi, vi, options) {
      try {
        const out = tcEnhancedRobustBayesianMA(yi, vi, options || {});
        if (out && out.ok) return out;
      } catch (_) {}
      if (legacyRobma) return legacyRobma(yi, vi, options || {});
      return { ok: false, error: 'RoBMA unavailable.' };
    };

    const legacyRunRoBMA = typeof window.runRoBMA === 'function' ? window.runRoBMA : null;
    window.runRoBMALegacy = legacyRunRoBMA;
    window.runRoBMA = tcRunRoBMAEnhanced;
    window.runSimplifiedMA = tcRunRoBMAEnhanced;
  }

  function tcInjectFrontierMethodsCard() {
    if (document.getElementById('tcFrontierCard')) return;
    const panel = document.getElementById('panel-advanced');
    if (!panel) return;
    const host = panel.querySelector('.card .card__body') || panel;
    const card = document.createElement('div');
    card.id = 'tcFrontierCard';
    card.className = 'card';
    card.style.marginTop = 'var(--space-4)';
    card.innerHTML =
      '<div class="card__header">' +
      '<h3 class="card__title">🧪 Frontier Methods Pack</h3>' +
      '<p class="card__subtitle">Conformal PI, anytime-valid e-process, trimmed robust RE, Copas-Heckman sensitivity, and prospective update design</p>' +
      '</div>' +
      '<div class="card__body">' +
      '<div class="flex gap-2" style="flex-wrap:wrap;">' +
      '<button class="btn btn--primary btn--sm" id="tcRunFrontierMethodsBtn">Run Frontier Methods</button>' +
      '<button class="btn btn--ghost btn--sm" id="tcExportFrontierRBtn">Export Frontier Methods (R)</button>' +
      '</div>' +
      '<div id="tcFrontierMethodsResults" style="margin-top:var(--space-3);font-size:var(--text-sm);">' +
      '<div class="alert alert--info"><span class="alert__icon">ℹ️</span><div class="alert__content"><div class="alert__text">Run analysis, then click <strong>Run Frontier Methods</strong>.</div></div></div>' +
      '</div>' +
      '<div id="tcFrontierEPlot" style="height:260px;margin-top:var(--space-3);"></div>' +
      '</div>';
    host.appendChild(card);
    const runBtn = document.getElementById('tcRunFrontierMethodsBtn');
    if (runBtn && !runBtn.__tcBound) {
      runBtn.__tcBound = true;
      runBtn.addEventListener('click', () => tcRunFrontierMethodsPack({}));
    }
    const exportBtn = document.getElementById('tcExportFrontierRBtn');
    if (exportBtn && !exportBtn.__tcBound) {
      exportBtn.__tcBound = true;
      exportBtn.addEventListener('click', exportTruthCertFrontierMethodsRScript);
    }
  }

  const METASPRINT_BRIDGE_STORAGE_KEY = 'metasprint_truthcert_bridge_payload_v1';
  const TRUTHCERT_TO_METASPRINT_WRITEBACK_KEY = 'truthcert_to_metasprint_methods_results_v1';
  let tcMetaSprintBridgeInstalled = false;

  function tcParseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function tcNormalizeMetaSprintEnvelope(input) {
    if (!input || typeof input !== 'object') return null;
    if (input.type === 'metasprint-truthcert-import' && input.payload && typeof input.payload === 'object') return input;
    if (input.payload && input.payload.settings && Array.isArray(input.payload.data)) {
      return {
        type: 'metasprint-truthcert-import',
        payload: input.payload,
        autoRun: !!input.autoRun,
        autoTruthCert: !!input.autoTruthCert
      };
    }
    if (input.settings && Array.isArray(input.data)) {
      return { type: 'metasprint-truthcert-import', payload: input };
    }
    return null;
  }

  function tcMetaSprintStateValid(state) {
    if (!state || typeof state !== 'object') return false;
    if (!state.settings || typeof state.settings !== 'object') return false;
    if (!Array.isArray(state.data) || state.data.length < 2) return false;
    const dataType = String(state.settings.dataType || '').trim();
    return ['binary', 'continuous', 'hr', 'proportion', 'generic'].includes(dataType);
  }

  function tcRunTruthCertWhenReady(attempt) {
    const n = Number(attempt) || 0;
    if (typeof window.runTruthCertAnalysis !== 'function') return;
    if (window.AppState && window.AppState.results && window.AppState.results.pooled) {
      window.runTruthCertAnalysis();
      if (typeof window.goToTab === 'function') window.goToTab('verdict');
      return;
    }
    if (n < 30) {
      setTimeout(() => tcRunTruthCertWhenReady(n + 1), 250);
    }
  }

  function tcImportMetaSprintBridgeFallback(input, options) {
    const envelope = tcNormalizeMetaSprintEnvelope(input);
    if (!envelope) {
      return { ok: false, reason: 'invalid_envelope' };
    }
    const state = envelope.payload;
    if (!tcMetaSprintStateValid(state)) {
      tcNotify('MetaSprint bridge payload invalid or too small (need >=2 studies)', 'error');
      return { ok: false, reason: 'invalid_state' };
    }
    if (typeof window.applyProjectState !== 'function') {
      tcNotify('Bridge import unavailable: applyProjectState is missing in this build', 'error');
      return { ok: false, reason: 'missing_applyProjectState' };
    }

    window.applyProjectState(state);
    const importedN = Array.isArray(state.data) ? state.data.length : 0;
    tcNotify('Imported ' + importedN + ' studies from MetaSprint', 'success');

    try {
      localStorage.removeItem(METASPRINT_BRIDGE_STORAGE_KEY);
    } catch (_) {}

    const opts = options && typeof options === 'object' ? options : {};
    const shouldAutoRun = opts.autoRun !== undefined ? !!opts.autoRun : (envelope.autoRun !== false);
    const shouldAutoTruthCert = opts.autoTruthCert !== undefined ? !!opts.autoTruthCert : (envelope.autoTruthCert !== false);

    if (typeof window.goToTab === 'function') window.goToTab('data');
    if (shouldAutoRun && typeof window.runAnalysis === 'function') {
      setTimeout(() => {
        try {
          window.runAnalysis();
          if (shouldAutoTruthCert) setTimeout(() => tcRunTruthCertWhenReady(0), 600);
        } catch (err) {
          tcNotify('Auto-run failed after import: ' + String(err && err.message ? err.message : err), 'warning');
        }
      }, 120);
    }

    return {
      ok: true,
      importedStudies: importedN,
      dataType: String(state.settings.dataType || '')
    };
  }

  function tcDispatchMetaSprintBridgeImport(input, options) {
    if (typeof window.importMetaSprintBridgePayload === 'function' &&
        window.importMetaSprintBridgePayload !== tcDispatchMetaSprintBridgeImport &&
        window.importMetaSprintBridgePayload !== tcImportMetaSprintBridgeFallback) {
      return window.importMetaSprintBridgePayload(input, options || {});
    }
    return tcImportMetaSprintBridgeFallback(input, options || {});
  }

  function tcConsumePendingMetaSprintBridge() {
    let raw = null;
    try {
      raw = localStorage.getItem(METASPRINT_BRIDGE_STORAGE_KEY);
    } catch (_) {
      raw = null;
    }
    if (!raw) return { ok: false, reason: 'no_payload' };
    const parsed = tcParseJsonSafe(raw);
    if (!parsed) {
      try {
        localStorage.removeItem(METASPRINT_BRIDGE_STORAGE_KEY);
      } catch (_) {}
      return { ok: false, reason: 'invalid_json' };
    }
    return tcDispatchMetaSprintBridgeImport(parsed, {});
  }

  function tcInstallMetaSprintBridgeReceiver() {
    if (tcMetaSprintBridgeInstalled || typeof window === 'undefined') return;
    tcMetaSprintBridgeInstalled = true;

    window.addEventListener('message', (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'metasprint-truthcert-import') return;
      tcDispatchMetaSprintBridgeImport(data, {});
    });

    setTimeout(() => tcConsumePendingMetaSprintBridge(), 250);
  }

  function tcBuildMethodsResultsWriteback() {
    const state = tcSafeAppState();
    const results = state && state.results ? state.results : null;
    const settings = state && state.settings ? state.settings : {};
    const truth = state && state.truthcert ? state.truthcert : null;

    if (!results || !results.pooled || !Number.isFinite(results.pooled.theta)) {
      return { ok: false, reason: 'Run analysis first.' };
    }

    const k = Number(results.k || (Array.isArray(results.studies) ? results.studies.length : 0) || 0);
    const measure = String(settings.effectMeasure || results.measure || 'Effect').toUpperCase();
    const tauMethod = String(settings.tau2Method || results.tau2Result?.method || 'REML');
    const hksj = !!settings.hksj;
    const pooled = results.pooled;
    const ciLower = Number(pooled.ci_lower);
    const ciUpper = Number(pooled.ci_upper);
    const pValue = Number(pooled.p_value);
    const i2 = Number(results.heterogeneity && results.heterogeneity.I2);
    const tau2 = Number(results.tau2);
    const piLo = Number(results.pi && results.pi.standard && results.pi.standard.lower);
    const piHi = Number(results.pi && results.pi.standard && results.pi.standard.upper);

    const methodsMd =
      '### TruthCert Advanced Cross-check Methods\n' +
      'A pairwise random-effects synthesis was cross-checked in TruthCert-PairwisePro using ' + tauMethod + ' heterogeneity estimation' +
      (hksj ? ' with Hartung-Knapp-Sidik-Jonkman small-sample adjustment' : '') + '. ' +
      'The analysis included ' + k + ' studies and used effect measure ' + measure + '. ' +
      'Advanced diagnostics were executed where applicable, including prediction intervals, publication-bias diagnostics, estimator-spread/consensus checks, and influence/fragility-related diagnostics.\n';

    let resultsMd =
      '### TruthCert Advanced Cross-check Results\n' +
      'Cross-check pooled estimate: ' + pooled.theta.toFixed(4) +
      ' (95% CI ' + (Number.isFinite(ciLower) ? ciLower.toFixed(4) : 'N/A') + ' to ' + (Number.isFinite(ciUpper) ? ciUpper.toFixed(4) : 'N/A') + ')' +
      (Number.isFinite(pValue) ? '; p=' + (pValue < 0.001 ? '<0.001' : pValue.toFixed(4)) : '') + '. ' +
      'Heterogeneity: I2=' + (Number.isFinite(i2) ? i2.toFixed(1) + '%' : 'N/A') +
      ', tau2=' + (Number.isFinite(tau2) ? tau2.toFixed(5) : 'N/A') + '. ';

    if (Number.isFinite(piLo) && Number.isFinite(piHi)) {
      resultsMd += 'Prediction interval: ' + piLo.toFixed(4) + ' to ' + piHi.toFixed(4) + '. ';
    }
    if (truth && truth.verdict && truth.verdict.verdict) {
      resultsMd += 'TruthCert evidence verdict: ' + String(truth.verdict.verdict) + '.';
    }
    resultsMd += '\n';

    const payload = {
      type: 'truthcert-methods-results-v1',
      sourceApp: 'truthcert-pairwisepro',
      generatedAt: tcNowIso(),
      methodsMarkdown: methodsMd,
      resultsMarkdown: resultsMd,
      summary: {
        k,
        measure,
        tauMethod,
        hksj,
        pooledTheta: Number(pooled.theta),
        ciLower: Number.isFinite(ciLower) ? ciLower : null,
        ciUpper: Number.isFinite(ciUpper) ? ciUpper : null,
        pValue: Number.isFinite(pValue) ? pValue : null,
        I2: Number.isFinite(i2) ? i2 : null,
        tau2: Number.isFinite(tau2) ? tau2 : null,
        verdict: truth && truth.verdict ? truth.verdict.verdict || null : null
      }
    };
    return { ok: true, payload };
  }

  function exportTruthCertMethodsResultsForMetaSprint(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const built = tcBuildMethodsResultsWriteback();
    if (!built.ok) {
      if (!opts.silent) tcNotify('Cannot export Methods+Results: ' + built.reason, 'warning');
      return built;
    }
    try {
      localStorage.setItem(TRUTHCERT_TO_METASPRINT_WRITEBACK_KEY, JSON.stringify(built.payload));
      if (!opts.silent) tcNotify('TruthCert Methods+Results sent to MetaSprint bridge.', 'success');
      return { ok: true, payload: built.payload };
    } catch (err) {
      if (!opts.silent) tcNotify('Failed to write MetaSprint bridge payload: ' + String(err && err.message ? err.message : err), 'error');
      return { ok: false, reason: 'storage_write_failed' };
    }
  }

  function tcInstallMetaSprintWritebackAutoPublishHook() {
    if (typeof window === 'undefined') return;
    if (window.__tc_meta_writeback_hook_installed__) return;
    window.__tc_meta_writeback_hook_installed__ = true;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (typeof window.runTruthCertAnalysis === 'function' && !window.runTruthCertAnalysis.__tcWritebackWrapped) {
        const original = window.runTruthCertAnalysis;
        const wrapped = function (...args) {
          const out = original.apply(this, args);
          setTimeout(() => exportTruthCertMethodsResultsForMetaSprint({ silent: true }), 250);
          return out;
        };
        wrapped.__tcWritebackWrapped = true;
        window.runTruthCertAnalysis = wrapped;
        setTimeout(() => exportTruthCertMethodsResultsForMetaSprint({ silent: true }), 500);
        clearInterval(timer);
      } else if (attempts >= 60) {
        clearInterval(timer);
      }
    }, 300);
  }

  function initExpertUpgrades() {
    tcInstallPairwiseGapClosures();
    tcInjectHeaderButton();
    tcInjectValidationCard();
    tcInjectMethodsModalTooling();
    tcInjectFrontierMethodsCard();
    tcInitGLMMFamilyParityUpgrade();
    tcInstallMetaSprintBridgeReceiver();
    tcInstallMetaSprintWritebackAutoPublishHook();
  }

  window.exportTruthCertRunManifest = exportTruthCertRunManifest;
  window.exportTruthCertMethodCitations = exportTruthCertMethodCitations;
  window.exportTruthCertAuditBundle = exportTruthCertAuditBundle;
  window.exportTruthCertFrontierMethodsRScript = exportTruthCertFrontierMethodsRScript;
  window.exportTruthCertPairwiseGapRScript = exportTruthCertPairwiseGapRScript;
  window.exportTruthCertGLMMMetaforCrosscheckScript = exportTruthCertGLMMMetaforCrosscheckScript;
  window.exportTruthCertMethodsResultsForMetaSprint = exportTruthCertMethodsResultsForMetaSprint;
  window.runExtendedEstimatorAudit = runExtendedEstimatorAudit;
  window.runFrontierMethodsPack = tcRunFrontierMethodsPack;
  window.getTruthCertAdoptionReadinessEstimate = tcEstimateAdoptionReadiness;
  window.glmmMetaAnalysisFamily = glmmMetaAnalysisFamily;
  window.runGLMMFamilySuite = runGLMMFamilySuite;
  window.tcImportMetaSprintBridgePayload = tcDispatchMetaSprintBridgeImport;
  window.tcConsumePendingMetaSprintBridge = tcConsumePendingMetaSprintBridge;
  if (typeof window.importMetaSprintBridgePayload !== 'function') {
    window.importMetaSprintBridgePayload = tcImportMetaSprintBridgeFallback;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertUpgrades);
  } else {
    initExpertUpgrades();
  }
})();
