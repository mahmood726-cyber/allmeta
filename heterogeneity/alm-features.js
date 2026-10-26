/* heterogeneity/alm-features.js — paper 5 adapter for the shared feature panel (shared/alm-features.js).
 *
 * entry : schema 'generic' {study, yi, sei}. apply(records) writes the rows into the app's OWN input
 *         (#f-data, one "label, estimate, SE" line per study — the format parseStudies() reads), with
 *         numbers written by String() (shortest round-trip form, so no digits are lost), then runs the
 *         app (#btn-run). Rows with a missing/multi-line/comment ('#') label, a non-finite estimate or a
 *         non-positive SE are refused before anything is changed.
 * text  : results() reads ONLY the app's own last results (window._almLastFE(), the object computeAll()
 *         returns and the page renders from); nothing statistical is recomputed. The templates describe
 *         what heterogeneity/index.html runs:
 *           - inverse-variance random-effects model on the scale the effects were entered;
 *           - tau2 estimator chosen in #f-tau2: PM (default), REML, ML, EB (= PM), SJ, HE, HS, DL;
 *             DL is offered only for k >= 10 — below that the app uses PM and says so;
 *           - pooled CI: normal (z) mu +/- qnorm(0.975)*SE, SE = sqrt(1/sum w), w = 1/(v + tau2);
 *             and the modified Hartung-Knapp CI: SE_HK = sqrt(max(1, q*)/sum w), q* = sum w (y - mu)^2/(k-1),
 *             with t_{k-1} (metafor test="adhoc");
 *           - Q = Cochran's Q with common-effect weights; p from chi-squared with k-1 df;
 *           - I2 (Q-based) = 100 (Q - df)/Q truncated at 0; model-based I2 = 100 tau2/(tau2 + s2),
 *             s2 = Higgins-Thompson typical within-study variance;
 *           - Q-profile 95% CI for tau2 (generalised Q against chi-squared_{k-1} quantiles; independent of
 *             the chosen point estimator), mapped to the model-based I2 through s2 (shared/heterogeneity-ci.js);
 *           - 95% PI: mu +/- t_{k-1} sqrt(tau2 + SE^2), SE the unadjusted model SE (metafor test="t");
 *           - leave-one-out with tau2 re-estimated by the same estimator (DL subsets < 10 use PM) and a
 *             Baujat plot (squared Pearson residual vs (mu - mu_(-i))^2 / Var(mu_(-i))).
 *         Display digits (index.html renderStats): Q 2 dp, p 3 dp ("p<0.001" below 0.0005), I2 1 dp,
 *         tau2 4 dp, pooled estimate / CIs / PI 3 dp.
 *         Template rule: no digit literals outside T.* calls (hub/shared/tests/unit/alm-text-lint.test.mjs).
 *         Test-only hook: window.__almTextPerturb = {key, delta} adds delta to that results() key.
 * verify: reuses the live R adapter registered by validate/adapter.js (AlmValidate.adapters['heterogeneity']).
 *         R objects its buildScript (AlmWebR.buildMetaforScript(..., extended=true)) leaves in the global env:
 *           yi, vi    effects and sampling variances;  fit(m, test)  metafor::rma wrapper;
 *           f         rma fit with the app's estimator, test="z";  hk  test="adhoc";  pr  predict(test="t");
 *           dl        DL fit (Q-based I2);  qp  Q-profile confint(PM)$random;  out  the compared values.
 *         Plots: (1) forest = metafor::forest(f) with the study labels — R only, the page draws no forest plot;
 *         (2) baujat = metafor::baujat on a refit of the same yi, vi and method as f (study labels as slab),
 *         beside the page's own Baujat SVG.
 * share : {data: #f-data text, tau2: #f-tau2}; set() validates, restores and re-runs.
 */
(function (global) {
  'use strict';
  var APP = 'heterogeneity';
  var KEYS = ['pm', 'reml', 'ml', 'eb', 'sj', 'he', 'hs', 'dl'];

  function byId(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }

  // ------------------------------------------------------------------ entry (F1)

  function refuse(msg) { return { ok: false, n: 0, error: msg }; }

  function apply(records) {
    if (!Array.isArray(records) || !records.length) return refuse('No rows to use.');
    var lines = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i] || {}, row = 'Row ' + (i + 1) + ': ';
      var label = r.study === undefined || r.study === null ? '' : String(r.study).trim();
      if (!label) return refuse(row + 'a study label is required.');
      if (/[\r\n\t]/.test(label) || label.charAt(0) === '#') return refuse(row + 'the study label must be one line and must not start with #.');
      if (typeof r.yi !== 'number' || !isFinite(r.yi)) return refuse(row + 'a finite effect estimate is required.');
      var se = r.sei;
      if (typeof se !== 'number' || !isFinite(se) || !(se > 0) || !isFinite(se * se) || !isFinite(1 / (se * se)) || !isFinite(r.yi / (se * se))) {
        return refuse(row + 'a positive, numerically representable standard error is required.');
      }
      lines.push(label + ', ' + String(r.yi) + ', ' + String(se));
    }
    var ta = byId('f-data'), run = byId('btn-run');
    if (!ta || !run) return refuse('The app input is not available.');
    try { if (global.alm && global.alm.resetUndo && typeof global.alm.resetUndo.snapshot === 'function') global.alm.resetUndo.snapshot(); } catch (e) { /* undo is a convenience */ }
    ta.value = lines.join('\n');
    run.click();
    var info = typeof global._almLastFE === 'function' ? global._almLastFE() : null;
    var n = typeof global._almLastStudies === 'function' ? global._almLastStudies().length : 0;
    if (!info || n !== records.length) return { ok: false, n: n, error: 'The app did not accept every row.' };
    return { ok: true, n: n };
  }

  // ------------------------------------------------------------------- text (F2)

  function results() {
    var info = typeof global._almLastFE === 'function' ? global._almLastFE() : null;
    if (!info || !info.sum || !info.pi) return null;
    var s = info.sum, q = info.qpci, te = info.tauEstimates || {};
    var r = {
      estimator: info.estimator,
      requested: info.requested,
      dlRefused: !!info.dlRefused,
      k: info.k,
      df: s.df,
      Q: s.Q,
      pQ: s.pQ,
      I2: s.I2,
      I2Model: s.I2Model,
      tau2: info.tau2,
      mu: s.mu,
      se: s.se,
      ciLo: s.ciLo,
      ciHi: s.ciHi,
      hkLo: s.ciLoHKSJ,
      hkHi: s.ciHiHKSJ,
      piLo: info.pi.lo,
      piHi: info.pi.hi,
      tau2PM: te.pm,
      tau2REML: te.reml
    };
    if (typeof te.dl === 'number') r.tau2DL = te.dl;
    if (q) {
      r.tau2Lo = q.tau2Lo;
      r.tau2Hi = q.tau2Hi;
      r.I2Lo = q.I2Lo;
      r.I2Hi = q.I2Hi;
    }
    var pt = global.__almTextPerturb;
    if (pt && typeof pt.key === 'string' && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') {
      r[pt.key] = r[pt.key] + pt.delta;
    }
    return r;
  }

  // What the page DISPLAYS (#stats-wrap cards), with the digits the app uses, for the audit's DOM cross-check.
  function dom() {
    if (typeof document === 'undefined') return null;
    var cards = {};
    document.querySelectorAll('#stats-wrap .stat').forEach(function (c) {
      var k = c.querySelector('.k'), v = c.querySelector('.v');
      if (k && v) cards[k.textContent.trim()] = v.textContent.trim();
    });
    function nums(s) { return String(s || '').match(/-?\d+(?:\.\d+)?/g) || []; }
    var num = function (d) { return { kind: 'num', digits: d }; };
    var out = {};
    function put(key, text, fmt) { if (text !== undefined) out[key] = { text: text, fmt: fmt }; }
    if (cards.k !== undefined) put('k', cards.k, { kind: 'int' });
    Object.keys(cards).forEach(function (label) {
      var m = /^Q \(df=(\d+)\)$/.exec(label);
      if (!m) return;
      put('df', m[1], { kind: 'int' });
      var v = cards[label];
      put('Q', nums(v)[0], num(2));
      var p = /p=(\d+(?:\.\d+)?)/.exec(v);
      if (p) put('pQ', p[1], num(3));
    });
    if (cards['I² (Q-based)'] !== undefined) put('I2', cards['I² (Q-based)'], { kind: 'pct', digits: 1 });
    var im = nums(cards['I² (model-based)']);
    put('I2Model', im[0], num(1));
    if (im.length >= 3) { put('I2Lo', im[1], num(1)); put('I2Hi', im[2], num(1)); }
    var tc = nums(cards['τ² 95% CI (Q-profile)']);
    if (tc.length >= 2) { put('tau2Lo', tc[0], num(4)); put('tau2Hi', tc[1], num(4)); }
    put('tau2PM', nums(cards['τ² (PM)'])[0], num(4));
    put('tau2REML', nums(cards['τ² (REML)'])[0], num(4));
    if (/^-?\d/.test(cards['τ² (DL)'] || '')) put('tau2DL', nums(cards['τ² (DL)'])[0], num(4));
    put('tau2', nums(cards['τ² used'])[0], num(4));
    var z = nums(cards['RE pooled (z)']);
    if (z.length >= 3) { put('mu', z[0], num(3)); put('ciLo', z[1], num(3)); put('ciHi', z[2], num(3)); }
    var hk = nums(cards['RE pooled (modified HK + t)']);
    if (hk.length >= 3) { put('hkLo', hk[1], num(3)); put('hkHi', hk[2], num(3)); }
    var pi = nums(cards['95% PI (model SE + t)']);
    if (pi.length >= 2) { put('piLo', pi[0], num(3)); put('piHi', pi[1], num(3)); }
    return out;
  }

  var NAMES = {
    pm: 'Paule–Mandel', reml: 'restricted maximum likelihood (REML)', ml: 'maximum likelihood (ML)',
    eb: 'empirical Bayes (equivalent to Paule–Mandel)', sj: 'Sidik–Jonkman', he: 'Hedges (HE)',
    hs: 'Hunter–Schmidt', dl: 'DerSimonian–Laird'
  };
  var SHORT = {
    pm: 'Paule–Mandel', reml: 'REML', ml: 'ML', eb: 'empirical Bayes', sj: 'Sidik–Jonkman', he: 'Hedges',
    hs: 'Hunter–Schmidt', dl: 'DerSimonian–Laird'
  };
  // Only references held in the shared citation table (shared/alm-text.js CITES) can be cited.
  var CITE_FOR = {
    pm: 'pauleMandel', eb: 'pauleMandel', dl: 'dersimonianLaird',
    reml: 'viechtbauer', ml: 'viechtbauer', he: 'viechtbauer', hs: 'viechtbauer'
  };
  function cochrane() { return global.AlmText && global.AlmText.cochrane; }

  var templates = {
    plain: function (T, r) {
      var C = cochrane();
      var lo = T.shown('hkLo', 3), hi = T.shown('hkHi', 3);
      var includes = C.ciIncludesNull(lo, hi, T.R.none);
      return [
        'This analysis combined ', T.int('k'), ' studies. ',
        'On the scale on which the study effects were entered, the average effect was estimated at ', T.num('mu', 3),
        '. Allowing for chance, the true average effect is likely to lie in the range ', T.ci('hkLo', 'hkHi', 3),
        ' (', T.rule('ciLevel'), ' confidence interval). ',
        'If zero means no effect on this scale (differences or log ratios), ',
        includes
          ? ['this interval includes no effect, so there is no clear evidence of a difference',
             T.when(C.imprecise(lo, hi, T.R.none), ', and the interval is compatible with effects in either direction'), '. ']
          : 'this interval excludes no effect. ',
        'The amount of variation between the studies’ results beyond what chance would explain ', T.band('I2', 1),
        ' (I² = ', T.pct('I2', 1), '); the estimated variance of the true effects across studies (τ²) was ', T.num('tau2', 4), '. ',
        T.when(r.k >= T.R.piMinK, function () {
          return ['In a new setting similar to these studies, the true effect could plausibly be anywhere from ',
            T.ci('piLo', 'piHi', 3), '. '];
        }),
        T.when(r.k < T.R.fewK, 'Because there are few studies, these estimates of variation are uncertain. '),
        'This summary describes the included studies; it does not show what causes the differences between them or whether the effect matters to patients.'
      ];
    },

    methods: function (T, r) {
      var cite = CITE_FOR[r.estimator];
      return [
        'Study effect estimates and their standard errors were combined, on the scale on which they were entered, in an inverse-variance random-effects model. ',
        'The between-study variance (τ²) was estimated with the ', T.pick('estimator', NAMES), ' estimator',
        T.when(!!cite, function () { return [' (', T.cite(cite), ')']; }),
        T.when(r.dlRefused, ['; DerSimonian–Laird was requested but is offered only with at least ', T.rule('dlMinK'),
          ' studies, so Paule–Mandel was used']),
        '. ',
        'The pooled estimate is reported with two ', T.rule('ciLevel'), ' confidence intervals (CIs): a normal (Wald, z) interval, and a modified Hartung–Knapp interval (',
        T.cite('hartungKnapp'), ') in which the variance of the pooled estimate is multiplied by the weighted residual variance of the studies, truncated below at one, with critical values from a t distribution with the number of studies minus one degrees of freedom. ',
        'Heterogeneity was summarised with Cochran’s Q (common-effect weights; P value from the chi-squared distribution with the number of studies minus one degrees of freedom), with I² computed from Q as (Q − df)/Q, expressed as a percentage and truncated at zero, and with a model-based I² computed as τ²/(τ² + s²), where s² is the typical within-study variance (',
        T.cite('higginsThompson'), '). I² was interpreted with the overlapping bands given in ', T.cite('handbookHet'), '. ',
        'A ', T.rule('ciLevel'), ' CI for τ² was obtained with the Q-profile method (the generalised Q statistic profiled against chi-squared quantiles; it does not depend on the chosen τ² estimator) and transformed into a CI for the model-based I² through s². ',
        'Paule–Mandel and REML estimates of τ² are also reported for comparison',
        T.when(T.has('tau2DL'), function () { return [', together with the DerSimonian–Laird estimate (offered only with at least ', T.rule('dlMinK'), ' studies)']; }),
        '. ',
        'A ', T.rule('ciLevel'),
        ' prediction interval was computed as the pooled estimate ± t × √(τ² + SE²), where SE is the unadjusted standard error of the pooled estimate and t comes from a t distribution with the number of studies minus one degrees of freedom (',
        T.cite('handbookPI'), '; ', T.cite('hts'), '); it is reported when at least ', T.rule('piMinK'), ' studies are available. ',
        'Influence was explored with leave-one-out re-analyses, re-estimating τ² with the same estimator in each subset',
        T.when(r.estimator === 'dl', ['; subsets with fewer than ', T.rule('dlMinK'), ' studies used Paule–Mandel']),
        ', and with a Baujat plot of each study’s squared Pearson residual at the fitted τ² against its influence on the pooled estimate (the squared change in the pooled estimate when the study is omitted, divided by the variance of the leave-one-out estimate). ',
        T.entry(),
        T.when(T.entry(), ' '),
        T.software(),
        T.when(T.verify(), [' ', T.verify()])
      ];
    },

    results: function (T, r) {
      return [
        'The analysis included ', T.int('k'), ' studies. ',
        'The random-effects pooled estimate was ', T.num('mu', 3), ' (', T.rule('ciLevel'), ' CI ', T.ci('hkLo', 'hkHi', 3),
        ' with the modified Hartung–Knapp method; ', T.ci('ciLo', 'ciHi', 3), ' with the normal approximation), using τ² = ',
        T.num('tau2', 4), ' (', T.pick('estimator', SHORT), '). ',
        'Cochran’s Q = ', T.num('Q', 2), ' (df = ', T.int('df'), ', ', T.p('pQ'), '); I² = ', T.pct('I2', 1),
        ' (Q-based; ', T.cite('handbookHet'), ': ', T.band('I2', 1), '); model-based I² = ', T.pct('I2Model', 1),
        T.when(T.has('I2Lo') && T.has('I2Hi'), function () {
          return [' (', T.rule('ciLevel'), ' CI ', T.ci('I2Lo', 'I2Hi', 1, 'pct'), ', Q-profile)'];
        }),
        '. ',
        T.when(T.has('tau2Lo') && T.has('tau2Hi'), function () {
          return ['The ', T.rule('ciLevel'), ' Q-profile CI for τ² was ', T.ci('tau2Lo', 'tau2Hi', 4), '. '];
        }),
        'Other estimates of τ² were Paule–Mandel ', T.num('tau2PM', 4),
        T.has('tau2DL') ? [', REML ', T.num('tau2REML', 4), ' and DerSimonian–Laird ', T.num('tau2DL', 4)] : [' and REML ', T.num('tau2REML', 4)],
        '.',
        T.when(r.k >= T.R.piMinK, function () {
          return [' The ', T.rule('ciLevel'), ' prediction interval for the effect in a new study similar to those included was ',
            T.ci('piLo', 'piHi', 3), '.'];
        })
      ];
    },

    flags: function (T, r) {
      return [
        T.when(r.k < T.R.fewK, ['Few studies (', T.int('k'), ', fewer than ', T.rule('fewK'),
          '): heterogeneity estimates (τ², I² and their intervals) are imprecise.']),
        T.when(T.zero('I2', 1), ['An I² of ', T.pct('I2', 1),
          ' does not show that the studies are homogeneous; with few studies, heterogeneity statistics have low power.']),
        T.when(r.dlRefused, ['DerSimonian–Laird was requested, but it tends to underestimate τ² with fewer than ', T.rule('dlMinK'),
          ' studies and is not offered; Paule–Mandel was used.']),
        'The Q-based I² and the model-based I² are different quantities and can differ; the Q-profile interval refers to the model-based I².',
        T.when(r.k < T.R.piMinK, ['With fewer than ', T.rule('piMinK'),
          ' studies, the prediction interval the app displays is not reported here.'])
      ];
    }
  };

  var textSpec = {
    app: APP,
    verifyPackage: 'metafor',
    results: results,
    templates: templates,
    dom: dom,
    mount: function (el) { return global.AlmTextUI ? global.AlmTextUI.mount(el, { app: APP, text: textSpec }) : null; }
  };

  // ------------------------------------------------------------ verify (F3)

  function baujatCode(state) {
    var labels = (state && state.result && Array.isArray(state.result.baujat) ? state.result.baujat : [])
      .map(function (b) { return JSON.stringify(String(b.label)); }).join(', ');
    return 'fb <- metafor::rma(yi, vi, method = f$method, slab = c(' + labels + '),\n' +
      '  control = list(tol = 1e-15, threshold = 1e-12, maxiter = 10000))\n' +
      'metafor::baujat(fb, symbol = "slab")';
  }

  // Forest plot: R side only — the page draws no forest plot, so there is no app SVG to show beside it.
  function forestCode(state) {
    var labels = (state && state.result && Array.isArray(state.result.baujat) ? state.result.baujat : [])
      .map(function (b) { return JSON.stringify(String(b.label)); }).join(', ');
    return 'metafor::forest(f, slab = c(' + labels + '),\n' +
      '  xlab = "Effect (scale as entered)", header = c("Study", "Estimate [95% CI]"))';
  }

  // The page's Baujat SVG, cloned without aria-labelledby (the panel strips ids from its copy, which would
  // leave that reference dangling); the <title>/<desc> children stay.
  function appBaujat() {
    var svg = typeof document !== 'undefined' ? document.querySelector('#svg-host svg') : null;
    if (!svg) return null;
    var clone = svg.cloneNode(true);
    clone.removeAttribute('aria-labelledby');
    return clone;
  }

  // -------------------------------------------------------------- share (F5)

  function shareGet() {
    return { data: byId('f-data').value, tau2: byId('f-tau2').value };
  }
  function shareSet(s) {
    if (!s || typeof s.data !== 'string' || s.data.length > 200000) throw new Error('data text missing or too long');
    if (KEYS.indexOf(s.tau2) < 0) throw new Error('unknown tau2 estimator ' + String(s.tau2));
    byId('f-data').value = s.data;
    byId('f-tau2').value = s.tau2;
    byId('btn-run').click();
  }

  var spec = {
    paper: 5,
    title: 'Heterogeneity explorer',
    entry: {
      schema: 'generic',
      extras: [],
      usedAs: 'effect size and its standard error on the analysis scale (as entered; ratios are pooled on the log scale)',
      apply: apply
    },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmValidate && global.AlmValidate.adapters ? global.AlmValidate.adapters[APP] : null; },
      rObjects: 'yi, vi; fit(m, test); f (rma fit, app estimator, test="z"); hk (adhoc); pr (predict, test="t"); dl; qp (Q-profile); fb (refit with study labels, plot only)',
      plots: [{ id: 'forest', title: 'Forest plot (R only; the app draws none)', r: forestCode, width_in: 8, height_in: 6, app: function () { return null; } },
        { id: 'baujat', title: 'Baujat plot', r: baujatCode, width_in: 8, height_in: 6, app: appBaujat }]
    },
    share: { get: shareGet, set: shareSet }
  };

  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures && typeof global.AlmFeatures.register === 'function') global.AlmFeatures.register(APP, spec);

  if (typeof module !== 'undefined' && module.exports) module.exports = { app: APP, spec: spec };
})(typeof window !== 'undefined' ? window : globalThis);
