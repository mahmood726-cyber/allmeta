/* Shared features for the existing one-moderator PM analysis.
 * Reads the engine's result accessors and stat cards; never fits a model in this adapter.
 * R leaves yi, se, x, f (PM/adhoc rma), f0 (intercept-only PM), and pred available.
 * QM is emitted by R but is NOT compared: the app does not calculate/display QM.
 * The experimental location-scale model is deliberately refused, not certified by a PM check.
 */
(function (global) {
  'use strict';
  var APP = 'meta-regression';
  var fields = ['data', 'title', 'modlabel', 'effectlabel'];
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
    supported();
    if (!global._almLastFitted || !global._almLastFitted()) return null;
    var r = Object.assign({}, global.__almResults());
    var shown = dom(), pi = global._almLastPI(), perm = global._almLastPerm();
    // These two statistics have no full-precision accessor; retain exactly the displayed values.
    r.slope_t_display = Number(shown.slope_t_display.text);
    r.slope_p_display = Number(shown.slope_p_display.text);
    r.qFloored = global._almLastHK().q === 1;
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
        'The prediction interval at the arithmetic mean moderator is the fitted effect plus or minus the same t critical value times the square root of residual variance plus the Knapp–Hartung variance of the fitted mean. ',
        'The plot band is a confidence interval for the fitted mean, not a prediction band. Bubble radii increase linearly with relative inverse sampling variance. ',
        'Residual heterogeneity Q_E uses the fixed-effect weighted regression residuals and a chi-square test. R² is the proportional reduction in Paule–Mandel variance from the intercept-only model, truncated below at zero; it is zero when the null variance is zero. ',
        T.when(T.has('permP'), function () {
          return ['The two-sided slope permutation test refits Paule–Mandel with the same variance floor after permuting the moderator. ',
            r.permExact ? 'All permutations were enumerated. ' : ['Monte Carlo used ', T.int('permutations'), ' permutations with a fixed seed, including the observed ordering. ']];
        }),
        T.cite('handbookPI'), '. ', T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures.verifiedCurrent(APP), function () {
          return [' ', T.verify(), ' This check covers the PM coefficients, intervals and heterogeneity quantities; it does not independently verify the permutation p-value.'];
        })];
    },
    results: function (T, r) {
      return ['The analysis included ', T.int('k'), ' studies. The intercept was ', T.num('intercept', 3), ' (',
        T.rule('ciLevel'), ' CI ', T.ci('intercept_ci_lb', 'intercept_ci_ub', 3), '); the slope was ',
        T.num('slope', 4), ' (', T.rule('ciLevel'), ' CI ', T.ci('slope_ci_lb', 'slope_ci_ub', 4),
        '), t(', T.int('hksj_q_df'), ') = ', T.num('slope_t_display', 2), ', p = ', T.num('slope_p_display', 3), '. ',
        T.when(T.has('permP'), function () { return ['The permutation p-value was ', T.num('permP', 3), '. ']; }),
        'Residual τ² = ', T.num('tau2_pm', 4), '; HKSJ q = ', T.num('hksj_q', 3),
        T.when(r.qFloored, ' (floored)'),
        '; R² = ', T.prop('R2_tau2', 1), '; Q_E = ', T.num('QE', 2), ' (df = ', T.int('QE_df'), '), p = ',
        T.num('QE_p', 3), '. ',
        T.when(T.has('piLo'), function () { return ['The ', T.rule('ciLevel'),
          ' prediction interval for a new study at mean moderator ', T.num('xbar', 2), ' was ', T.ci('piLo', 'piHi', 3), '.']; })];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Few studies: tests for small-study effects would be underpowered; none were performed.'),
        T.when(r.imprecise, 'The slope interval includes no association and associations in either direction; the estimate is imprecise.'),
        'P-values are reproduced at the page’s displayed precision; a displayed zero is rounded, not an exact zero.'];
    }
  };
  function apply(records) {
    if (!Array.isArray(records) || records.length < 3) throw new Error('At least three studies are required.');
    var rows = records.map(function (r) {
      if (typeof r.study !== 'string' || !r.study.trim() || /[\r\n\t]/.test(r.study) || /^\s*#/.test(r.study)) throw new Error('Invalid study label.');
      if (!Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0 ||
          r.moderator === null || r.moderator === undefined || String(r.moderator).trim() === '' ||
          !Number.isFinite(Number(r.moderator))) throw new Error('Each study needs an estimate, positive SE and numeric moderator.');
      return [r.study, r.yi, r.sei, Number(r.moderator)];
    });
    if (new Set(rows.map(function (r) { return r[3]; })).size < 2) throw new Error('The moderator must vary between studies.');
    el('f-data').value = rows.map(function (r) { return r.join(', '); }).join('\n');
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
      'q <- max(1, sum(residuals(f)^2 / (se^2 + f$tau2)) / (length(yi)-2))',
      'z <- c(k=length(yi), intercept=unname(coef(f)[1]), intercept_se=f$se[1], intercept_ci_lb=f$ci.lb[1], intercept_ci_ub=f$ci.ub[1],',
      'slope=unname(coef(f)[2]), slope_se=f$se[2], slope_ci_lb=f$ci.lb[2], slope_ci_ub=f$ci.ub[2],',
      'slope_t_display=round(f$zval[2],2), slope_p_display=round(f$pval[2],3),',
      'tau2_pm=f$tau2, hksj_q=q, hksj_q_df=f$k-f$p, R2_tau2=if(f0$tau2>0)max(0,1-f$tau2/f0$tau2) else 0,',
      'QM=f$QM, QE=f$QE, QE_df=f$k-f$p, QE_p=f$QEp, xbar=mean(x), pred=pred$pred, predSE=pred$se, piLo=pred$pi.lb, piHi=pred$pi.ub)',
      'cat("ALMJSON:{",paste(sprintf(\'"%s":%s\',names(z),ifelse(is.na(z),"null",sprintf("%.17g",z))),collapse=","),"}\\n",sep="")'
    ].join('\n');
  }
  var live = { packages: ['metafor'], currentState: currentState, buildScript: buildScript,
    appValues: function (s) { return keys.map(function (key) { return { key: key, label: key, value: s.result[key] }; }); },
    // The existing app's PM parity contract is relative 1e-6; exact counts and displayed tests stay strict.
    compare: { tolerance: { default: 1e-6, k: 0, hksj_q_df: 0, QE_df: 0, QE: 1e-9, QE_p: 1e-9,
      xbar: 1e-9, slope_t_display: 1e-9, slope_p_display: 1e-9 },
      kind: Object.fromEntries(keys.map(function (k) { return [k, 'rel']; })) } };
  function axisInputs() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }
  var share = {
    get: function () {
      var s = {};
      fields.forEach(function (k) { s[k] = el('f-' + k).value; });
      s.scale = el('f-scale').checked;
      s.axes = axisInputs().map(function (n) { return n.type === 'checkbox' ? n.checked : n.value; });
      return s;
    },
    set: function (s) {
      if (!s || fields.some(function (k) { return typeof s[k] !== 'string' || s[k].length > 200000; }) ||
          typeof s.scale !== 'boolean' || !Array.isArray(s.axes) || s.axes.length !== axisInputs().length) throw new Error('Invalid analysis state.');
      axisInputs().forEach(function (n, i) {
        var v = s.axes[i];
        if (n.type === 'checkbox' ? typeof v !== 'boolean' : typeof v !== 'string' || (v !== '' && !Number.isFinite(Number(v)))) throw new Error('Invalid axis option.');
      });
      fields.forEach(function (k) { el('f-' + k).value = s[k]; });
      el('f-scale').checked = s.scale;
      axisInputs().forEach(function (n, i) {
        if (n.type === 'checkbox') n.checked = s.axes[i]; else n.value = s.axes[i];
        n.dispatchEvent(new Event('change', { bubbles: true }));
      });
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
    // The shared entry/text cores expose mount(), while the host expects render().
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (panel, ctx) {
      return global.AlmEntryUI.mount(panel, ctx.block);
      } });
      global.AlmFeatures.registerModule('text', { render: function (panel, ctx) {
      var ui = global.AlmTextUI.mount(panel, { app: ctx.app, text: ctx.block });
      return { onShow: function () { ui.regenerate(); } };
      } });
    }
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
