/* Shared features for the existing one-moderator PM analysis.
 * Reads the engine's result accessors and stat cards; never fits a model in this adapter.
 * R leaves yi, se, x, f (PM/adhoc rma), f0 (intercept-only PM), and pred available.
 * QM is emitted by R but is NOT compared: the app does not calculate/display QM.
 * The experimental location-scale model is deliberately refused, not certified by a PM check.
 */
(function (global) {
  'use strict';
  // Number settings go into type=number inputs. A value must be a complete decimal number: Number() also reads
  // 0x10 / 0b1 / ' ', and the input then silently clears such text to '' (automatic or zero). Valid forms the input
  // itself cannot hold ('+1', ' 0.5', '5.') are written as the same number.
  var DECIMAL_SETTING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function decimalSetting(v) { return typeof v === 'string' && DECIMAL_SETTING.test(v.trim()) && Number.isFinite(Number(v)); }
  function axisBoundOk(v) { return v === '' || decimalSetting(v); }
  function writeNumberSetting(el, v) {
    var t = String(v).trim();
    el.value = t;
    if (el.value === '' && t !== '') el.value = String(Number(t));
  }
  var APP = 'meta-regression';
  var fields = ['data', 'title', 'modlabel', 'effectlabel'];
  var entryData = null;
  var metaMinK = 10;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clearStaleEntry() {
    if (entryData !== null && entryData !== el('f-data').value) {
      global.AlmFeaturesState = global.AlmFeaturesState || {};
      global.AlmFeaturesState.provenance = [];
      global.AlmFeaturesState.entryLog = [];
      entryData = null;
    }
  }
  // App-specific typed tokens use the text core's exported registries, so the
  // number audit checks these bounds and citations just like the shared tokens.
  if (global.AlmText) {
    global.AlmText.RULES.metaUpperP = { value: 0.999, text: '0.999', about: 'Upper bound for p-values rounded to unity' };
    global.AlmText.CITES.metaRegression = {
      short: 'Cochrane Handbook v6.5, §§10.11.4–10.11.6',
      full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, sections 10.11.4–10.11.6 (Meta-regression, selection of study characteristics, and interpretation).'
    };
  }
  function reportP(T, r, key) {
    if (Number(r[key].toFixed(3)) === 1) return ['p > ', T.rule('metaUpperP')];
    return T.p(key, 3);
  }
  function el(id) { return document.getElementById(id); }
  function run() { el('btn-run').click(); }
  function supported() {
    if (el('f-scale').checked) throw new Error('Report text and R verification cover the Paule–Mandel model only. Turn off the experimental location-scale model to use them.');
  }
  function cards() {
    return Array.from(document.querySelectorAll('#stats-wrap .stat')).map(function (c) {
      return { label: c.querySelector('.k').textContent, text: c.querySelector('.v').textContent };
    });
  }
  function numbers(s) { return (s.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []); }
  function card(prefix) { return cards().find(function (c) { return c.label.indexOf(prefix) === 0; }); }
  function dom() {
    var out = {};
    function take(prefix, keys, digits, label) {
      var c = card(prefix);
      if (!c) return;
      var ns = numbers(label ? c.label : c.text);
      keys.forEach(function (key, i) {
        if (ns[i] !== undefined) out[key] = { text: ns[i], fmt: { kind: 'num', digits: digits[i] } };
      });
    }
    take('k', ['k'], [0]);
    take('β₀ (', ['intercept', 'intercept_ci_lb', 'intercept_ci_ub'], [3, 3, 3]);
    take('β₁ (', ['slope', 'slope_ci_lb', 'slope_ci_ub'], [4, 4, 4]);
    take('β₁ test', ['hksj_q_df', 'slope_t_display', 'slope_p_display'], [0, 2, 3]);
    take('β₁ permutation', ['permP'], [3]);
    take('τ² (PM)', ['tau2_pm'], [4]);
    take('HKSJ q', ['hksj_q'], [3]);
    take('95% PI', ['piLo', 'piHi'], [3, 3]);
    var pi = card('95% PI');
    if (pi) out.xbar = { text: pi.label.split('=')[1], fmt: { kind: 'num', digits: 2 } };
    var r2 = card('R²');
    if (r2) out.R2_tau2 = { text: r2.text, fmt: { kind: 'prop', digits: 1 } };
    take('Q_E', ['QE', 'QE_df', 'QE_p'], [2, 0, 3]);
    return out;
  }
  function results() {
    clearStaleEntry();
    supported();
    if (!global._almLastFitted || !global._almLastFitted()) return null;
    var r = Object.assign({}, global.__almResults());
    var shown = dom(), pi = global._almLastPI(), perm = global._almLastPerm();
    // These two statistics have no full-precision accessor; retain exactly the displayed values.
    r.slope_t_display = Number(shown.slope_t_display.text);
    r.slope_p_display = Number(shown.slope_p_display.text);
    r.qFloored = global._almLastHK().q === 1;
    // With zero residual variance, a positive null variance would give R²=1.
    // Thus the engine's exact pair (tau²=0, R²=0) identifies a zero null variance
    // without refitting the intercept-only model in this adapter.
    r.r2Undefined = r.tau2_pm === 0 && r.R2_tau2 === 0;
    r.r2Ambiguous = r.tau2_pm > 0 && r.R2_tau2 === 0;
    if (pi) Object.assign(r, { xbar: pi.xbar, piLo: pi.lo, piHi: pi.hi, pred: pi.pred, predSE: pi.se });
    if (perm) Object.assign(r, { permP: perm.p, permutations: perm.nperm, permExact: perm.exact });
    r.includesNull = global.AlmText.cochrane.ciIncludesNull(r.slope_ci_lb, r.slope_ci_ub, 0);
    r.imprecise = global.AlmText.cochrane.imprecise(r.slope_ci_lb, r.slope_ci_ub, 0);
    var hook = global.__almTextPerturb;
    if (hook && typeof r[hook.key] === 'number') r[hook.key] += Number(hook.delta);
    return r;
  }
  var templates = {
    plain: function (T, r) {
      return ['Across ', T.int('k'), ' studies, the estimated change in effect per unit increase in the moderator was ',
        T.num('slope', 4), ' (', T.rule('ciLevel'), ' confidence interval ', T.ci('slope_ci_lb', 'slope_ci_ub', 4), '). ',
        r.includesNull ? 'There was no clear evidence of an association; the interval includes no change. '
          : 'The interval excludes no change, providing evidence of an association. ',
        'This study-level association does not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['An inverse-variance random-effects meta-regression with an intercept and one numeric moderator was fitted. ',
        'Paule–Mandel residual variance was estimated by bisection. Estimates and standard errors were used on the supplied analysis scale; no transformation or back-transformation was applied. ',
        'Knapp–Hartung coefficient tests and ', T.rule('ciLevel'), ' confidence intervals used a Student t distribution with ',
        T.int('hksj_q_df'), ' degrees of freedom (studies minus two), scaling the covariance by the residual weighted sum of squares divided by these degrees of freedom, floored at unity. ',
        'The prediction interval at the arithmetic mean moderator is the fitted effect plus or minus the same t critical value times the square root of residual variance plus the Knapp–Hartung variance of the fitted mean (', T.cite('handbookPI'), '). ',
        'The plot band is a confidence interval for the fitted mean, not a prediction band. Bubble radii increase linearly with relative inverse sampling variance. ',
        'Residual heterogeneity Q_E uses the fixed-effect weighted regression residuals and a chi-square test. R² is the proportional reduction in Paule–Mandel variance from the intercept-only model, truncated below at zero; the page uses zero when the null variance is zero, in which case the proportion is not estimable. ',
        T.when(T.has('permP'), function () {
          return ['The two-sided slope permutation test refits Paule–Mandel with the same variance floor after permuting the moderator. ',
            r.permExact ? 'All permutations were enumerated. ' : ['Monte Carlo used ', T.int('permutations'), ' permutations with a fixed seed, including the observed ordering. ']];
        }),
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures.verifiedCurrent(APP), function () {
          return [' ', T.verify(), ' This check covers the PM coefficients, intervals and heterogeneity quantities; it does not independently verify the permutation p-value.'];
        })];
    },
    results: function (T, r) {
      return ['The analysis included ', T.int('k'), ' studies. The intercept was ', T.num('intercept', 3), ' (',
        T.rule('ciLevel'), ' CI ', T.ci('intercept_ci_lb', 'intercept_ci_ub', 3), '); the slope was ',
        T.num('slope', 4), ' (', T.rule('ciLevel'), ' CI ', T.ci('slope_ci_lb', 'slope_ci_ub', 4),
        '), t(', T.int('hksj_q_df'), ') = ', T.num('slope_t_display', 2), ', ', reportP(T, r, 'slope_p_display'), '. ',
        T.when(T.has('permP'), function () { return ['The permutation test gave ', reportP(T, r, 'permP'), '. ']; }),
        'Residual τ² = ', T.num('tau2_pm', 4), '; HKSJ q = ', T.num('hksj_q', 3),
        T.when(r.qFloored, ' (floored)'),
        '; ', T.when(r.r2Undefined, 'R² not estimable (no between-study variance in the intercept-only model)'),
        T.when(!r.r2Undefined, function () { return ['R² = ', T.prop('R2_tau2', 1),
          T.when(r.r2Ambiguous, ' by convention (not estimable if the intercept-only variance is zero)')]; }),
        '; Q_E = ', T.num('QE', 2), ' (df = ', T.int('QE_df'), '), ', reportP(T, r, 'QE_p'), '. ',
        T.when(T.has('piLo'), function () { return ['The ', T.rule('ciLevel'),
          ' prediction interval for a new study at mean moderator ', T.num('xbar', 2), ' was ', T.ci('piLo', 'piHi', 3), '.']; })];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < metaMinK, ['Fewer than ten studies: the Cochrane Handbook advises generally at least ten studies per characteristic for meta-regression (', T.cite('metaRegression'), ').']),
        ['Meta-regression findings are observational and prone to aggregation bias (', T.cite('metaRegression'), ').'],
        T.when(r.imprecise, 'The slope interval includes no association and associations in either direction; the estimate is imprecise.'),
        'P-values use the page’s precision; rounded endpoints are reported as bounds.'];
    }
  };
  function apply(records) {
    if (!Array.isArray(records) || records.length < 3) throw new Error('At least three studies are required.');
    var rows = records.map(function (r) {
      if (typeof r.study !== 'string' || !r.study.trim() || /[\r\n\t]/.test(r.study) || /^\s*#/.test(r.study)) throw new Error('Invalid study label.');
      if (!Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0 ||
          (typeof r.moderator !== 'number' && typeof r.moderator !== 'string') || String(r.moderator).trim() === '' ||
          !Number.isFinite(Number(r.moderator))) throw new Error('Each study needs an estimate, positive SE and numeric moderator.');
      return [r.study, r.yi, r.sei, Number(r.moderator)];
    });
    if (new Set(rows.map(function (r) { return r[3]; })).size < 2) throw new Error('The moderator must vary between studies.');
    var provenance = clone(records.map(function (r) { return r.provenance || null; }));
    if (provenance.some(function (p) { return p === null; })) provenance = [];
    el('f-data').value = rows.map(function (r) { return r.join(', '); }).join('\n');
    entryData = el('f-data').value;
    global.AlmFeaturesState = global.AlmFeaturesState || {};
    global.AlmFeaturesState.provenance = provenance;
    global.AlmFeaturesState.entryLog = [];
    run();
    return { ok: !!global._almLastFitted(), n: rows.length };
  }
  function currentState() {
    supported();
    run();
    var r = results();
    if (!r) throw new Error('Run a valid meta-regression with at least three studies and a varying moderator.');
    return { rows: global._almLastStudies().map(function (s) { return { label: s.label, est: s.est, se: s.se, x: s.x }; }), result: r };
  }
  var keys = ['k', 'intercept', 'intercept_se', 'intercept_ci_lb', 'intercept_ci_ub',
    'slope', 'slope_se', 'slope_ci_lb', 'slope_ci_ub', 'slope_t_display', 'slope_p_display',
    'tau2_pm', 'hksj_q', 'hksj_q_df', 'R2_tau2', 'QE', 'QE_df', 'QE_p', 'xbar', 'pred', 'predSE', 'piLo', 'piHi'];
  var scaledKeys = ['slope', 'slope_se', 'slope_ci_lb', 'slope_ci_ub'];
  var extraKeys = scaledKeys.map(function (key) { return key + '_per_range'; }).concat('slope_z');
  function buildScript(s) {
    var vec = function (key) { return 'c(' + s.rows.map(function (r) { return r[key]; }).join(',') + ')'; };
    return [
      '# The app uses PM with the adhoc (floored Knapp-Hartung) test.',
      '# QM is an R-only diagnostic; the page does not expose an app QM to compare.',
      '# The app permutation p-value and experimental location-scale model are not verified here.',
      'yi <- ' + vec('est'), 'se <- ' + vec('se'), 'x <- ' + vec('x'),
      'f <- metafor::rma(yi=yi, sei=se, mods=~x, method="PM", test="adhoc", control=list(threshold=1e-12,tol=1e-18,maxiter=10000))',
      'f0 <- metafor::rma(yi=yi, sei=se, method="PM", test="adhoc", control=list(threshold=1e-12,tol=1e-18,maxiter=10000))',
      'pred <- predict(f, newmods=mean(x))',
      'xrange <- diff(range(x))',
      'q <- max(1, sum(residuals(f)^2 / (se^2 + f$tau2)) / (length(yi)-2))',
      'z <- c(k=length(yi), intercept=unname(coef(f)[1]), intercept_se=f$se[1], intercept_ci_lb=f$ci.lb[1], intercept_ci_ub=f$ci.ub[1],',
      'slope=unname(coef(f)[2]), slope_se=f$se[2], slope_ci_lb=f$ci.lb[2], slope_ci_ub=f$ci.ub[2],',
      'slope_per_range=unname(coef(f)[2])*xrange, slope_se_per_range=f$se[2]*xrange, slope_ci_lb_per_range=f$ci.lb[2]*xrange, slope_ci_ub_per_range=f$ci.ub[2]*xrange, slope_z=f$zval[2],',
      'slope_t_display=round(f$zval[2],2), slope_p_display=round(f$pval[2],3),',
      'tau2_pm=f$tau2, hksj_q=q, hksj_q_df=f$k-f$p, R2_tau2=if(f0$tau2>0)max(0,1-f$tau2/f0$tau2) else 0,',
      'QM=f$QM, QE=f$QE, QE_df=f$k-f$p, QE_p=f$QEp, xbar=mean(x), pred=pred$pred, predSE=pred$se, piLo=pred$pi.lb, piHi=pred$pi.ub)',
      'cat("ALMJSON:{",paste(sprintf(\'"%s":%s\',names(z),ifelse(is.na(z),"null",sprintf("%.17g",z))),collapse=","),"}\\n",sep="")'
    ].join('\n');
  }
  var live = { packages: ['metafor'], currentState: currentState, buildScript: buildScript,
    appValues: function (s) {
      var values = keys.map(function (key) { return { key: key, label: key, value: s.result[key] }; });
      var xs = s.rows.map(function (row) { return row.x; }), range = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      scaledKeys.forEach(function (key) {
        values.push({ key: key + '_per_range', label: key + ' × observed moderator range', value: s.result[key] * range });
      });
      values.push({ key: 'slope_z', label: 'Slope t (full precision)', value: s.result.slope / s.result.slope_se });
      return values;
    },
    // The existing app's PM parity contract is relative 1e-6; exact counts and displayed tests stay strict.
    compare: { tolerance: { default: 1e-6, k: 0, hksj_q_df: 0, QE_df: 0, QE: 1e-9, QE_p: 1e-9,
      xbar: 1e-9, slope_t_display: 1e-9, slope_p_display: 1e-9 },
      kind: Object.fromEntries(keys.concat(extraKeys).map(function (k) { return [k, 'rel']; })) } };
  global.AlmLiveAdapters = global.AlmLiveAdapters || {};
  global.AlmLiveAdapters[APP] = live;
  function axisInputs() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }
  // index.html axisControls mounts x and y, each with minimum, maximum and log inputs: share state carries exactly six.
  // If page setup stopped before the axis controls mounted (e.g. a script failed to load), refuse instead of writing
  // a link a healthy page rejects or skipping the axes on restore.
  var AXIS_INPUTS = 6;
  function shareAxes() {
    var list = axisInputs();
    if (list.length !== AXIS_INPUTS) throw new Error('Axis controls did not load; reload the page.');
    return list;
  }
  var share = {
    get: function () {
      clearStaleEntry();
      var s = {};
      fields.forEach(function (k) { s[k] = el('f-' + k).value; });
      s.scale = el('f-scale').checked;
      s.axes = shareAxes().map(function (n) { return n.type === 'checkbox' ? n.checked : n.value; });
      var state = global.AlmFeaturesState || {}, current = entryData === s.data;
      s.provenance = clone(current && Array.isArray(state.provenance) ? state.provenance : []);
      s.entryLog = clone(current && Array.isArray(state.entryLog) ? state.entryLog : []);
      return s;
    },
    set: function (s) {
      if (!s || fields.some(function (k) { return typeof s[k] !== 'string' || s[k].length > 200000; }) ||
          typeof s.scale !== 'boolean' || !Array.isArray(s.axes) || s.axes.length !== AXIS_INPUTS) throw new Error('Invalid analysis state.');
      var axisList = shareAxes();
      axisList.forEach(function (n, i) {
        var v = s.axes[i];
        if (n.type === 'checkbox' ? typeof v !== 'boolean' : !axisBoundOk(v)) throw new Error('Invalid axis option.');
      });
      var metadata = {};
      ['provenance', 'entryLog'].forEach(function (key) {
        if (s[key] !== undefined && (!Array.isArray(s[key]) || s[key].some(function (v) { return !v || typeof v !== 'object' || Array.isArray(v); }))) throw new Error('Invalid entry metadata.');
        metadata[key] = clone(s[key] || []);
      });
      // The page's own row checker (index.html parseStudies), before anything is changed: a row the page would skip
      // with a note makes the file invalid instead of quietly changing the analysis.
      if (typeof global.__almMetaRegParse !== 'function') throw new Error('The app row checker is not available.');
      var parsed = global.__almMetaRegParse(s.data);
      if (parsed.warnings.length) throw new Error(parsed.warnings[0] + ' cannot be used.');
      fields.forEach(function (k) { el('f-' + k).value = s[k]; });
      el('f-scale').checked = s.scale;
      axisList.forEach(function (n, i) {
        if (n.type === 'checkbox') n.checked = s.axes[i]; else writeNumberSetting(n, s.axes[i]);
        n.dispatchEvent(new Event('change', { bubbles: true }));
      });
      entryData = s.data;
      global.AlmFeaturesState = global.AlmFeaturesState || {};
      global.AlmFeaturesState.provenance = metadata.provenance;
      global.AlmFeaturesState.entryLog = metadata.entryLog;
      run();
    }
  };
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates };
  var spec = { paper: 8, title: 'Meta-regression',
    entry: { schema: 'generic', extras: ['moderator'], apply: apply },
    text: textSpec,
    verify: { adapter: function () { return global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || live; },
      inputs: '#f-data, #f-scale', rObjects: 'yi, se, x, f (PM/adhoc rma), f0, pred',
      plots: [{ id: 'bubble', title: 'Bubble plot', r: 'metafor::regplot(f, mod=2, ci=TRUE, pi=FALSE, xlab="Moderator", ylab="Effect (supplied scale)")',
        app: function () { return document.querySelector('#svg-host svg'); } }] },
    share: share };
  global.AlmMetaRegressionFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures) {
    // Keep the moderator-specific notice, but follow the host's lazy onShow lifecycle.
    // Report text uses the shared built-in module (lazy mount, then regenerate on show).
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (panel, ctx) {
        var ui;
        return { onShow: function () {
          if (ui) return;
          ui = global.AlmEntryUI.mount(panel, ctx.block);
          Array.from(ui.element.querySelectorAll('button')).forEach(function (button) {
            if (button.textContent === 'Extract paper text with source confirmation') button.disabled = true;
          });
          var notice = document.createElement('p');
          notice.textContent = 'Paper-text extraction is unavailable for meta-regression because the source-confirmation workflow cannot capture the required moderator. Table entry does not yet provide per-study source confirmation; check every estimate, SE and moderator against its source before applying rows.';
          panel.appendChild(notice);
        } };
      } });
    }
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
