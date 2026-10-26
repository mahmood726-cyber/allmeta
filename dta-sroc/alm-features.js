/* DTA feature adapter. No statistical calculations: text reads the last fitted
 * objects, with Moses/Spearman/Fagan values read from the rendered page because
 * the app does not expose those last results separately.
 * R objects supplied by the unchanged live adapter: d (counts), f (reitsma fit).
 */
(function (global) {
  'use strict';
  var APP = 'dta-sroc';
  var METHODS = { reml: 'restricted maximum likelihood (REML)', ml: 'maximum likelihood (ML)',
    mm: 'method of moments', vc: 'variance components', fixed: 'fixed effect' };
  var FIELDS = ['data', 'title', 'method', 'cc', 'cov', 'example'];
  var DISPLAY_SOURCED = ['mosesAlpha', 'mosesBeta', 'thresholdRho', 'pretest', 'postPos', 'postNeg'];
  function byId(id) { return document.getElementById(id); }
  function axisInputs() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }

  // AlmShare handles the initial navigation only. A new fragment on this page
  // does not reload its scripts, so handle subsequent share links here using
  // the same decoder and validated setter. Leave native URL-state hashes alone.
  function installShareNavigation() {
    var revision = 0;
    global.addEventListener('hashchange', async function (event) {
      var hash = global.location.hash;
      if (event.newURL && new URL(event.newURL).hash !== hash) return;
      var current = ++revision;
      if (!/^#(?:s|a2)=/.test(hash)) return;
      var status = document.querySelector('#alm-features [data-testid="share-status"]');
      if (!status) return;
      status.textContent = 'Opening share link…';
      global.AlmFeatures.open(APP, 'share');
      function isCurrent() { return current === revision && global.location.hash === hash; }
      try {
        var v2 = hash.indexOf('#a2=') === 0;
        var decoded = v2 ? await global.AlmShare.decodeV2(hash.slice(4), APP) :
          await global.AlmShare.decode(hash.slice(3), APP);
        if (!isCurrent()) return;
        if (!v2 && !decoded.ok) throw new Error(decoded.reason);
        if (v2 && global.AlmShare.versionMismatch(decoded)) {
          // The shared panel owns the version-consent UI on initial navigation.
          // Preserve current inputs until that flow explicitly authorises restore.
          status.textContent = global.AlmShare.versionNotice(decoded) +
            ' Reload this page to review the version difference and choose whether to restore. Nothing was changed.';
          return;
        }
        var restore = function () {
          spec.share.set(decoded.state);
          global.AlmFeaturesState.provenance = decoded.provenance;
        };
        var urlState = global.alm && global.alm.urlState;
        if (urlState && typeof urlState.withoutWrites === 'function') await urlState.withoutWrites(restore);
        else restore();
        if (isCurrent()) status.textContent = 'Analysis restored from the share link.';
      } catch (error) {
        if (isCurrent()) status.textContent = 'This share link could not be opened (' +
          (error && error.message ? error.message : String(error)) + '). Nothing was changed.';
      }
    });
  }

  function apply(records) {
    if (byId('f-cov').value === 'last') throw new Error('Raw count entry has no covariate: turn off meta-regression or use the main input.');
    if (!Array.isArray(records) || records.length < 4) throw new Error('At least four studies are required for the bivariate model.');
    var lines = records.map(function (r, i) {
      var label = r && r.study;
      if (typeof label !== 'string' || !label.trim() || label !== label.trim() ||
          label.startsWith('#') || /[\r\n\t]/.test(label) || label.split(/\s*,\s*/).join(', ') !== label) {
        throw new Error('Row ' + (i + 1) + ': use a single-line study label; separate label commas with one space.');
      }
      var cells = ['tp', 'fp', 'fn', 'tn'].map(function (key) { return r[key]; });
      if (!cells.every(Number.isSafeInteger) || cells.some(function (v) { return v < 0; }) ||
          ![r.tp + r.fn, r.fp + r.tn].every(function (v) { return Number.isSafeInteger(v) && v > 0; })) {
        throw new Error('Row ' + (i + 1) + ': non-negative whole-person counts and positive diseased/non-diseased totals required.');
      }
      if (byId('f-cc').value === 'none' && cells.indexOf(0) >= 0) throw new Error('Zero cells require a continuity correction before fitting.');
      var p = r.provenance;
      if (!p || p.confirmed !== true || p.label !== label ||
          !['label', 'reference', 'location', 'pastedText'].every(function (key) {
            return typeof p[key] === 'string' && p[key].trim();
          }) || !Array.isArray(p.values) || !['tp', 'fp', 'fn', 'tn'].every(function (field) {
            var values = p.values.filter(function (v) { return v && v.field === field; });
            if (values.length !== 1) return false;
            var v = values[0], span = v.span;
            return v.value === r[field] && typeof v.text === 'string' && v.text.length > 0 &&
              Array.isArray(span) && span.length === 2 && span.every(Number.isSafeInteger) &&
              span[0] >= 0 && span[1] > span[0] && span[1] <= p.pastedText.length &&
              p.pastedText.slice(span[0], span[1]) === v.text;
          })) throw new Error('Row ' + (i + 1) + ': confirmed provenance with a matching label, reference, location and source spans is required.');
      return [label].concat(cells).join(', ');
    });
    // Validate every row before touching the input; the native parser reads the
    // final four columns as counts and joins preceding label columns with ", ".
    if (global.alm && global.alm.resetUndo && typeof global.alm.resetUndo.snapshot === 'function') global.alm.resetUndo.snapshot();
    byId('f-data').value = lines.join('\n');
    if (byId('f-title').value === 'Example SROC - diagnostic test') byId('f-title').value = '';
    byId('btn-run').click();
    return { ok: !!global.__almBivariate(), n: records.length };
  }

  // Map rendered numeric tokens to the same keys and precision as results().
  function dom() {
    var out = {};
    function put(keys, text, digits) {
      var nums = String(text).replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) || [];
      keys.forEach(function (key, i) {
        if (nums[i] !== undefined) out[key] = { text: nums[i], fmt: { kind: 'num', digits: digits } };
      });
    }
    document.querySelectorAll('#stats-wrap .stat').forEach(function (card) {
      var label = card.querySelector('.k').textContent, value = card.querySelector('.v').textContent;
      if (label === 'k') put(['k'], value, 0);
      else if (label.indexOf('Summary Se') === 0) put(['sens', 'sensLo', 'sensHi'], value, 3);
      else if (label.indexOf('Summary Sp') === 0) put(['spec', 'specLo', 'specHi'], value, 3);
      else if (label === 'LR+') put(['lrPos', 'lrPosLo', 'lrPosHi'], value, 2);
      else if (label === 'LR−') put(['lrNeg', 'lrNegLo', 'lrNegHi'], value, 2);
      else if (label === 'Diagnostic OR') put(['dor'], value, 1);
      else if (label === 'AUC (partial AUC)') put(['auc', 'pauc'], value, 3);
      else if (label === 'AIC') put(['AIC'], value, 2);
      else if (label === 'Moses α (intercept)') put(['mosesAlpha'], value, 3);
      else if (label === 'Moses β (slope)') put(['mosesBeta'], value, 3);
      else if (label === 'Spearman ρ (threshold)') put(['thresholdRho'], value, 3);
      else if (label === "Deeks' test p") put(['deeksP'], value, 3);
    });
    var hs = document.querySelector('#stats-wrap table.coef caption');
    if (hs && hs.textContent.indexOf('Between-study') === 0) {
      var cells = hs.parentElement.querySelectorAll('td');
      [['tauSe', 4], ['Lambda', 4], ['tauFpr', 4], ['Theta', 4], ['rho', 3], ['beta', 4],
        ['logLik', 2], ['sigma2theta', 4]].forEach(function (pair, i) {
        if (cells[i]) put(i === 7 ? ['sigma2theta', 'sigma2alpha'] : [pair[0]], cells[i].textContent, pair[1]);
      });
    }
    var fagan = document.querySelector('#fagan-host svg text:last-child');
    if (fagan) put(['pretest', 'postPos', 'postNeg'], fagan.textContent, 0);
    return out;
  }

  // These values are read from the display itself; comparing them with the same
  // display is not an independent audit. Keep them in the report, not domChecked.
  function auditDom() {
    var out = dom();
    DISPLAY_SOURCED.forEach(function (key) { delete out[key]; });
    return out;
  }

  function results() {
    var b = typeof global.__almBivariate === 'function' ? global.__almBivariate() : null;
    if (!b || (byId('analysis-stale') && !byId('analysis-stale').hidden)) return null;
    var r = {
      k: b.k, method: b.method, correction: b.correctionControl, ccAdd: b.correction, parameterCount: b.df,
      ciLevel: 95, regionDf: 2, chiSquare: 5.991464547107979, deeksCc: 0.5, correlationBoundary: 1,
      aucMin: 0.01, aucMax: 0.99, aucGrid: 99, pCutoff: 0.0001, thresholdLimit: 0.6,
      sens: b.sens, sensLo: b.sensCI[0], sensHi: b.sensCI[1],
      spec: b.spec, specLo: b.specCI[0], specHi: b.specCI[1],
      lrPos: b.lrPos, lrPosLo: b.lrPosCI[0], lrPosHi: b.lrPosCI[1],
      lrNeg: b.lrNeg, lrNegLo: b.lrNegCI[0], lrNegHi: b.lrNegCI[1],
      dor: b.dor, tauSe: b.Psi[0][0], tauFpr: b.Psi[1][1],
      rho: b.corRandom, logLik: b.logLik, AIC: b.AIC,
      auc: b.auc && b.auc.rg[0], pauc: b.auc && b.auc.rg[1],
      converged: b.converged, truncated: b.negeigen,
      hasCovariate: byId('f-cov').value === 'last', coefficients: []
    };
    if (b.hsroc) Object.assign(r, b.hsroc);
    var d = global.__almDeeks();
    if (d) { r.deeksP = d.p; r.deeksDf = d.df; }
    var displayed = dom();
    DISPLAY_SOURCED.forEach(function (key) {
      if (displayed[key]) r[key] = Number(displayed[key].text);
    });
    var mr = global.__almMetaRegression();
    if (r.hasCovariate && !mr) return null;
    if (r.hasCovariate && mr) mr.coefTable.forEach(function (c, i) {
      var key = 'coef' + i;
      r.coefficients.push({ key: key, outcome: c.outcome });
      r[key + 'order'] = i + 1;
      r[key] = c.estimate; r[key + 'se'] = c.se;
      r[key + 'lo'] = c.ci[0]; r[key + 'hi'] = c.ci[1]; r[key + 'p'] = c.p;
    });
    if (global.AlmText) r.smallK = global.AlmText.cochrane.smallK(r.k);
    var pt = global.__almTextPerturb;
    if (pt && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') r[pt.key] += pt.delta;
    return r;
  }

  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' studies of diagnostic test accuracy. Summary sensitivity was ',
        T.num('sens', 3), ' (', T.pct('ciLevel', 0), ' confidence interval ', T.ci('sensLo', 'sensHi', 3),
        '), and summary specificity was ', T.num('spec', 3), ' (', T.ci('specLo', 'specHi', 3),
        '). Sensitivity describes detection among people with the condition; specificity describes negative tests among people without it. ',
        'The plotted prediction region describes variation expected in a similar new study, whereas the confidence region describes uncertainty in the summary point. ',
        T.when(r.method === 'fixed', 'The fixed-effect analysis assumes no between-study variation. '),
        'These results do not establish clinical usefulness or causation.'];
    },
    methods: function (T, r) {
      var entry = T.entry();
      return ['The Reitsma bivariate model jointly pooled logit sensitivity and logit false-positive rate using ',
        T.pick('method', METHODS), '. Within-study variances were sums of reciprocal cell counts, with zero within-study covariance. ',
        T.when(r.method === 'reml' || r.method === 'ml',
          'Likelihood fits used iterated generalised least-squares initialisation followed by BFGS optimisation of Cholesky covariance parameters. '),
        T.when(r.method === 'fixed', 'The between-study covariance was fixed at zero. '),
        T.pick('correction', {
          all: ['If any cell was zero, ', T.num('ccAdd', 1), ' was added to every cell of every study. '],
          single: ['For studies containing a zero cell, ', T.num('ccAdd', 1), ' was added to every cell of that study only. '],
          none: 'No continuity correction was used; zero cells prevent the bivariate fit. '
        }),
        'Summary ', T.pct('ciLevel', 0), ' confidence limits used normal Wald intervals on the logit scale and inverse-logit back-transformation; specificity was the complement of the false-positive rate with interval endpoints reversed. ',
        'Likelihood ratios were derived from the summary sensitivity and specificity; their log-scale Wald intervals used the delta method with the fitted covariance. The diagnostic odds ratio was the ratio of the positive and negative likelihood ratios. ',
        'The ', T.pct('ciLevel', 0), ' confidence and prediction regions were logit-scale ellipses centred at the summary point, using respectively its covariance V and V + Ψ, then inverse-logit transformed. Their squared radius was the chi-square quantile with ',
        T.int('regionDf'), ' degrees of freedom (', T.num('chiSquare', 6), '); no separate univariate prediction interval was computed. ',
        T.when(T.has('auc'), ['The Rutter–Gatsonis SROC and HSROC parameters were derived from the fitted means and between-study covariance. AUC used the mada grid convention: endpoint half-weights and interior weights summed and divided by ',
          T.int('aucGrid'), ', over false-positive rates ', T.num('aucMin', 2), ' to ', T.num('aucMax', 2),
          '; partial AUC used the same grid size over the observed uncorrected false-positive-rate range clipped to those bounds. ']),
        T.when(T.has('mosesAlpha'), 'The comparison Moses–Littenberg curve used unweighted ordinary least squares of the difference of the logits on their sum, after the selected correction. '),
        T.when(T.has('thresholdRho'), 'The threshold correlation was Spearman correlation between logit sensitivity and logit false-positive rate, with average ranks for ties. '),
        T.when(T.has('deeksP'), function () { return ['Deeks’ test regressed log diagnostic odds ratios on inverse square root effective sample size, weighted by effective sample size. Its slope used a two-sided t test with ',
          T.int('deeksDf'), ' residual degrees of freedom. For this test, ', T.num('deeksCc', 1),
          ' was added to all cells of each study containing a zero cell, independently of the bivariate correction choice. ']; }),
        T.when(T.has('pretest'), ['The Fagan display converted a pre-test probability of ', T.pct('pretest', 0),
          ' to odds, multiplied by each summary likelihood ratio, then converted back to probabilities. ']),
        T.when(r.hasCovariate, 'A separate bivariate meta-regression used the last input column: numeric values entered unchanged, and text categories used treatment coding with the alphabetically first category as reference. Coefficient intervals and two-sided tests were normal Wald; the summary point and plots still show the intercept-only fit. '),
        T.when(T.has('logLik'), ['The reported log-likelihood includes the logit-transformation Jacobian; AIC uses ',
          T.int('parameterCount'), ' parameters under the app’s mada convention, including covariance parameters even for a fixed-effect fit. ']),
        T.software(), T.when(entry, [' ', entry]),
        T.when(T.hasCtx('verify.n'), function () { return [' ', T.verify(),
          ' This verification covers the bivariate quantities in the comparison table; the auxiliary Moses, Spearman, Deeks and Fagan outputs are outside its scope.']; })];
    },
    results: function (T, r) {
      return ['Across ', T.int('k'), ' studies, summary sensitivity was ', T.num('sens', 3), ' (',
        T.pct('ciLevel', 0), ' CI ', T.ci('sensLo', 'sensHi', 3), ') and specificity was ',
        T.num('spec', 3), ' (', T.ci('specLo', 'specHi', 3), '). LR+ was ', T.num('lrPos', 2),
        ' (', T.ci('lrPosLo', 'lrPosHi', 2), '); LR− was ', T.num('lrNeg', 2), ' (',
        T.ci('lrNegLo', 'lrNegHi', 2), '); diagnostic OR was ', T.num('dor', 1), '. Between-study variance was ',
        T.num('tauSe', 4), ' for logit sensitivity and ', T.num('tauFpr', 4), ' for logit false-positive rate.',
        T.when(T.has('rho'), function () { return [' Between-study correlation was ', T.num('rho', 3), '.']; }),
        T.when(T.has('auc'), function () { return [' AUC was ', T.num('auc', 3), ' (partial AUC ', T.num('pauc', 3), ').']; }),
        T.when(T.has('Lambda'), function () { return [' HSROC parameters were Λ = ', T.num('Lambda', 4), ', Θ = ',
          T.num('Theta', 4), ', β = ', T.num('beta', 4), ', σ²θ = ', T.num('sigma2theta', 4), ', and σ²α = ', T.num('sigma2alpha', 4), '.']; }),
        T.when(T.has('logLik'), function () { return [' Log-likelihood was ', T.num('logLik', 2), '; AIC was ', T.num('AIC', 2), '.']; }),
        T.when(T.has('mosesAlpha'), function () { return [' Moses intercept α = ', T.num('mosesAlpha', 3), '; slope β = ', T.num('mosesBeta', 3), '.']; }),
        T.when(T.has('thresholdRho'), function () { return [' Spearman threshold correlation was ', T.num('thresholdRho', 3), '.']; }),
        T.when(T.has('deeksP'), function () { return [' Deeks’ test p = ', T.num('deeksP', 3), '.']; }),
        T.when(T.has('pretest'), function () { return [' At ', T.pct('pretest', 0),
          ' pre-test probability, the Fagan display gave post-test probabilities of ', T.pct('postPos', 0),
          ' after a positive test and ', T.pct('postNeg', 0), ' after a negative test.']; }),
        r.coefficients.map(function (c) {
          return [' Meta-regression coefficient ', T.int(c.key + 'order'), ' (', c.outcome, ', in page table order): ',
            T.num(c.key, 3), ', SE ', T.num(c.key + 'se', 3), ', CI ', T.ci(c.key + 'lo', c.key + 'hi', 3),
            r[c.key + 'p'] < r.pCutoff ? ['; p < ', T.num('pCutoff', 4)] : ['; p = ', T.num(c.key + 'p', 4)], '.'];
        })];
    },
    flags: function (T, r) {
      return [
        T.when(r.smallK && r.smallK.indexOf('fewK') >= T.R.none, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.smallK && r.smallK.indexOf('funnelK') >= T.R.none, 'With few studies, the between-study covariance and prediction region are imprecise, and Deeks’ small-study test is underpowered.'),
        T.when(T.has('thresholdRho') && Math.abs(r.thresholdRho) > r.thresholdLimit,
          ['Absolute threshold correlation exceeds ', T.num('thresholdLimit', 1),
            '; the app flags a possible threshold effect. Interpret the SROC curve alongside the summary point.']),
        T.when(r.converged === false, 'The estimator did not converge; interpret the fit with caution.'),
        T.when(r.truncated === true, 'The between-study covariance estimate was not positive definite and was truncated.'),
        T.when(r.method !== 'fixed' && ((T.has('rho') && Math.abs(T.shown('rho', 3)) === r.correlationBoundary) ||
          (T.has('sigma2theta') && T.zero('sigma2theta', 4)) || (T.has('sigma2alpha') && T.zero('sigma2alpha', 4))),
          'The between-study covariance estimate is at a boundary or degenerate at the displayed precision; the covariance may be poorly identified with these data. Interpret the correlation, HSROC parameters and the prediction region with caution.'),
        T.when(r.hasCovariate, 'Live R verification of meta-regression is unavailable in the existing adapter.'),
        T.when(T.has('deeksP') && T.zero('deeksP', 3), 'A rounded p-value of zero does not mean the probability is exactly zero.')
      ];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'mada', results: results, dom: auditDom, templates: templates };
  var spec = {
    paper: 3, title: 'Diagnostic test accuracy',
    entry: { schema: 'dta', apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmValidate.adapters[APP]; },
      rObjects: 'd (raw counts), f (mada::reitsma fit)',
      plots: [{ id: 'sroc', title: 'SROC', width_in: 7, height_in: 7,
        r: function (s) {
          return 'plot(f, sroclwd=2, predict=TRUE)\n' +
            'dp <- d\n' +
            (s.correction === 'all' ? 'if (any(dp == 0)) dp <- dp + 0.5\n' :
              s.correction === 'single' ? 'zero <- apply(dp == 0, 1, any)\ndp[zero, ] <- dp[zero, ] + 0.5\n' : '') +
            'points(mada::fpr(dp), mada::sens(dp), pch=19)';
        },
        app: function () { return document.querySelector('#svg-host svg'); } }]
    },
    share: {
      get: function () {
        var s = {};
        FIELDS.forEach(function (k) { s[k] = byId('f-' + k).value; });
        s.axes = axisInputs().map(function (el) { return el.type === 'checkbox' ? el.checked : el.value; });
        s.entryLog = (global.AlmFeaturesState && global.AlmFeaturesState.entryLog) || [];
        return s;
      },
      set: function (s) {
        if (!s || typeof s !== 'object' || FIELDS.some(function (k) { return typeof s[k] !== 'string'; }) ||
            s.data.length > 200000 || s.title.length > 10000) throw new Error('Missing or oversized input state');
        if (!Object.prototype.hasOwnProperty.call(METHODS, s.method) ||
            ['all', 'single', 'none'].indexOf(s.cc) < 0 || ['', 'last'].indexOf(s.cov) < 0 ||
            !Array.from(byId('f-example').options).some(function (o) { return o.value === s.example; })) throw new Error('Unknown analysis option');
        var axes = axisInputs();
        if (!Array.isArray(s.axes) || s.axes.length !== axes.length || s.axes.some(function (v, i) {
          return axes[i].type === 'checkbox' ? typeof v !== 'boolean' : typeof v !== 'string' || (v !== '' && !Number.isFinite(Number(v)));
        })) throw new Error('Invalid axis options');
        if (!Array.isArray(s.entryLog) || s.entryLog.some(function (e) { return !e || typeof e !== 'object' || Array.isArray(e); })) throw new Error('Invalid conversion log');
        FIELDS.forEach(function (k) { byId('f-' + k).value = s[k]; });
        axes.forEach(function (el, i) {
          if (el.type === 'checkbox') el.checked = s.axes[i]; else el.value = s.axes[i];
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        global.AlmFeaturesState.entryLog = s.entryLog;
        byId('btn-run').click();
      }
    }
  };
  global.AlmDTAFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures) {
    // This shared UI has no source confirmation workflow. Keep preview available
    // but fail closed until the shared provenance module can replace this host.
    if (global.AlmEntryUI) global.AlmFeatures.registerModule('entry', {
      label: 'Data entry', render: function (panel, ctx) {
        var ui = global.AlmEntryUI.mount(panel, ctx.block);
        var use = Array.from(ui.element.querySelectorAll('button')).find(function (b) { return b.textContent === 'Use these rows'; });
        var gate = document.createElement('fieldset');
        gate.disabled = true;
        var legend = document.createElement('legend');
        legend.textContent = 'Source confirmation required';
        gate.appendChild(legend);
        use.parentNode.insertBefore(gate, use);
        gate.appendChild(use);
        var note = document.createElement('p');
        note.textContent = 'Import is unavailable in this version: source references, locations and confirmation for every study must be recorded first. You can preview conversions here or enter counts in the main input.';
        ui.element.appendChild(note);
        return ui;
      }
    });
    // Like entry, the text UI supplies mount() but does not register a tab.
    if (global.AlmTextUI) global.AlmFeatures.registerModule('text', {
      label: 'Report text', render: function (panel, ctx) {
        return global.AlmTextUI.mount(panel, { app: ctx.app, text: ctx.block });
      }
    });
    global.AlmFeatures.register(APP, spec);
    if (global.AlmShare) installShareNavigation();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
