/* proportion-ma/alm-features-text.js — F2 "Report text" block for app 9 (proportion meta-analysis).
 *
 * results() reads ONLY the app's own last results (window._almLastPropMA() and the read-only
 * __almPropValidation.snapshot() of the per-study rows the app parsed); nothing statistical is
 * recomputed. Totals (participants, events, boundary studies) are sums/counts of the app's parsed
 * rows. Templates describe exactly what proportion-ma/index.html runs:
 *   - transformation: logit (default), Freeman-Tukey double arcsine, or raw;
 *   - logit/raw: 0.5 continuity correction ONLY for boundary studies (x = 0 or x = n), cn = n + 1;
 *     FT: no correction; back-transformed with Miller's inversion at the harmonic mean of n;
 *   - tau2: Paule-Mandel (default) or DerSimonian-Laird via shared/ma-core.js, or fixed-effect (tau2 = 0);
 *   - pooled CI: Wald, estimate +/- qnorm(0.975) * SE on the transformed scale, back-transformed
 *     (raw: truncated to [0, 1]); no Hartung-Knapp adjustment;
 *   - I2: Q-based Higgins-Thompson 100 * (Q - df) / Q, truncated at 0 (app convention);
 *   - PI (k >= 3): mu +/- t_{k-1} * sqrt(tau2 + SE^2) on the transformed scale (AlmMaCore.predictionInterval),
 *     back-transformed like the CI;
 *   - study CIs: Clopper-Pearson; no p-value for Q is computed by the app, so none is reported.
 * Display digits (index.html render()): proportions fmtPct 1 dp, tau2 4 dp, Q 2 dp, I2 1 dp, df integer.
 *
 * Conditional parts that read possibly-missing keys are passed to T.when as functions (lazy).
 * Template rule: no digit literals outside T.* calls (enforced by hub/shared/tests/unit/alm-text-lint.test.mjs).
 * Test-only hook: window.__almTextPerturb = {key, delta} adds delta to that results() key (changes nothing unless set).
 */
(function (global) {
  'use strict';
  var APP = 'proportion-ma';

  function results() {
    var o = typeof global._almLastPropMA === 'function' ? global._almLastPropMA() : null;
    if (!o) return null;
    var r = {
      transform: o.transform,
      tauEstimator: o.tauEstimator,
      k: o.k,
      mu_re: o.mu_re,
      seRE: o.seRE,
      tau2: o.tau2,
      Q: o.Q,
      df: o.df,
      i2: o.i2,
      poolP: o.poolP,
      poolLo: o.poolLo,
      poolHi: o.poolHi,
      poolPiLo: o.poolPiLo,
      poolPiHi: o.poolPiHi
    };
    var snap = global.__almPropValidation && typeof global.__almPropValidation.snapshot === 'function'
      ? global.__almPropValidation.snapshot() : null;
    var studies = snap && Array.isArray(snap.studies) ? snap.studies : null;
    if (studies && studies.length === o.k) {
      var n = 0, x = 0, b = 0;
      studies.forEach(function (s) { n += s.n; x += s.x; if (s.x === 0 || s.x === s.n) b += 1; });
      r.totalN = n;
      r.totalEvents = x;
      r.nBoundary = b;
    }
    var pt = global.__almTextPerturb;
    if (pt && typeof pt.key === 'string' && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') {
      r[pt.key] = r[pt.key] + pt.delta;
    }
    return r;
  }

  // What the page DISPLAYS, with the digits the app uses (for the audit's DOM cross-check).
  function dom() {
    if (typeof document === 'undefined') return null;
    var out = {};
    var prop1 = { kind: 'prop', digits: 1 };
    var pooled = document.querySelector('#res-body tr.pooled-row');
    if (pooled && pooled.cells.length >= 4) {
      out.poolP = { text: pooled.cells[2].textContent, fmt: prop1 };
      var ci = pooled.cells[3].textContent.split('–');
      if (ci.length === 2) {
        out.poolLo = { text: ci[0], fmt: prop1 };
        out.poolHi = { text: ci[1], fmt: prop1 };
      }
    }
    var codes = document.querySelectorAll('#het code');
    if (codes.length >= 3) {
      out.tau2 = { text: codes[0].textContent, fmt: { kind: 'num', digits: 4 } };
      out.Q = { text: codes[1].textContent, fmt: { kind: 'num', digits: 2 } };
      out.i2 = { text: codes[2].textContent, fmt: { kind: 'pct', digits: 1 } };
    }
    if (codes.length >= 4) {
      var pi = codes[3].textContent.split('–');
      if (pi.length === 2) {
        out.poolPiLo = { text: pi[0], fmt: prop1 };
        out.poolPiHi = { text: pi[1], fmt: prop1 };
      }
    }
    var het = document.getElementById('het');
    var m = het ? /df=(\d+)/.exec(het.textContent) : null;
    if (m) out.df = { text: m[1], fmt: { kind: 'int' } };
    return out;
  }

  var templates = {
    plain: function (T, r) {
      var fe = r.tauEstimator === 'FE';
      return [
        'This analysis combined ', T.int('k'), ' studies',
        T.when(T.has('totalN'), function () { return [' with ', T.int('totalN'), ' participants in total']; }),
        '. Across these studies, the average proportion of participants with the outcome was estimated at ', T.prop('poolP', 1),
        '. Allowing for chance, the true average is likely to be in the range ', T.ci('poolLo', 'poolHi', 1, 'prop'),
        ' (', T.rule('ciLevel'), ' confidence interval). ',
        fe
          ? 'The analysis assumed that all studies share one common proportion, so differences between settings were not modelled. '
          : ['The amount of variation between the studies’ results beyond what chance would explain ', T.band('i2', 1),
             ' (I² = ', T.pct('i2', 1), '). '],
        T.when(!fe && r.k >= T.R.piMinK && T.has('poolPiLo') && T.has('poolPiHi'), function () {
          return ['In a new setting similar to these studies, the proportion could plausibly be anywhere from ',
            T.ci('poolPiLo', 'poolPiHi', 1, 'prop'), '. '];
        }),
        T.when(r.k < T.R.fewK, 'Because there are few studies, these estimates are uncertain. '),
        'This summary describes how common the outcome was in the included studies; it does not show why the outcome occurs or how much it matters to patients.'
      ];
    },

    methods: function (T, r) {
      var fe = r.tauEstimator === 'FE';
      var tr = r.transform;
      return [
        'Proportions (events divided by participants in each study) were pooled with ',
        fe
          ? 'a fixed-effect (common-effect) inverse-variance model, with the between-study variance fixed at zero. '
          : ['an inverse-variance random-effects model; the between-study variance (τ²) was estimated with the ',
             T.pick('tauEstimator', { PM: 'Paule–Mandel', DL: 'DerSimonian–Laird' }), ' method (',
             T.cite(r.tauEstimator === 'PM' ? 'pauleMandel' : 'dersimonianLaird'), '). '],
        T.when(tr === 'logit', [
          'Analyses used the logit transformation (log odds of the proportion) with within-study variances computed from the event and non-event counts. ',
          'For studies with no events or with all participants having the event, ', T.rule('ccAdd'),
          ' was added to both the event and the non-event counts (boundary-only continuity correction; ', T.cite('sweeting'),
          '); no correction was applied to any other study',
          T.when(T.has('nBoundary') && r.nBoundary > T.R.none, function () {
            return ['; ', T.int('nBoundary'), T.plural('nBoundary', ' study needed', ' studies needed'), ' this correction'];
          }),
          T.when(T.has('nBoundary') && r.nBoundary === T.R.none, '; no included study needed this correction'),
          '. The pooled estimate and its limits were back-transformed with the inverse logit. '
        ]),
        T.when(tr === 'ft', [
          'Analyses used the Freeman–Tukey double-arcsine transformation (', T.cite('freemanTukey'),
          ') without continuity correction. The pooled estimate and its limits were back-transformed with Miller’s inversion (',
          T.cite('miller'), ') evaluated at the harmonic mean of the study sizes; this back-transformation depends on the study size chosen and can give misleading results (',
          T.cite('schwarzer'), '). '
        ]),
        T.when(tr === 'raw', [
          'Analyses used untransformed proportions with binomial within-study variances; for studies with no events or with all participants having the event, ',
          T.rule('ccAdd'), ' was added to both the event and the non-event counts (', T.cite('sweeting'),
          '). Confidence and prediction limits were truncated at zero and one hundred per cent. '
        ]),
        'The ', T.rule('ciLevel'),
        ' confidence interval (CI) for the pooled estimate used a normal (Wald) approximation on the analysis scale, without the Hartung–Knapp adjustment. ',
        'Study-level ', T.rule('ciLevel'), ' CIs are exact Clopper–Pearson intervals (', T.cite('clopperPearson'), '). ',
        'Heterogeneity was summarised with Cochran’s Q, τ² and I², where I² was computed from Q as (Q − df)/Q, expressed as a percentage and truncated at zero (',
        T.cite('higginsThompson'), ')',
        T.when(r.tauEstimator === 'PM', '; with the Paule–Mandel estimator this Q-based I² can differ from the τ²-based I² reported by some software'),
        '. I² was interpreted with the overlapping bands given in ', T.cite('handbookHet'), '. ',
        fe
          ? 'No prediction interval is reported for the fixed-effect model. '
          : ['A ', T.rule('ciLevel'),
             ' prediction interval was computed on the analysis scale as the pooled estimate ± t × √(τ² + SE²), with t from a t distribution with degrees of freedom equal to the number of studies minus one (',
             T.cite('handbookPI'), '; ', T.cite('hts'), '), back-transformed in the same way, and reported when at least ',
             T.rule('piMinK'), ' studies were available. '],
        T.entry(),
        T.when(T.entry(), ' '),
        T.software(),
        T.when(T.verify(), [' ', T.verify()])
      ];
    },

    results: function (T, r) {
      var fe = r.tauEstimator === 'FE';
      return [
        'The analysis included ', T.int('k'), ' studies',
        T.when(T.has('totalN') && T.has('totalEvents'), function () {
          return [' with ', T.int('totalN'), ' participants and ', T.int('totalEvents'), T.plural('totalEvents', ' event', ' events')];
        }),
        '. The pooled proportion was ', T.prop('poolP', 1), ' (', T.rule('ciLevel'), ' CI ', T.ci('poolLo', 'poolHi', 1, 'prop'), ') from ',
        fe ? 'a fixed-effect inverse-variance model'
          : ['a random-effects model (', T.pick('tauEstimator', { PM: 'Paule–Mandel', DL: 'DerSimonian–Laird' }), ' τ²)'],
        ' on the ', T.pick('transform', { logit: 'logit', ft: 'Freeman–Tukey double-arcsine', raw: 'untransformed proportion' }), ' scale. ',
        'Between-study variance τ² = ', T.num('tau2', 4),
        T.when(fe, ' (fixed at zero by the fixed-effect model)'),
        '; Q = ', T.num('Q', 2), ' (df = ', T.int('df'), '); I² = ', T.pct('i2', 1),
        ' (', T.cite('handbookHet'), ': ', T.band('i2', 1), ').',
        T.when(!fe && r.k >= T.R.piMinK && T.has('poolPiLo') && T.has('poolPiHi'), function () {
          return [' The ', T.rule('ciLevel'), ' prediction interval for the proportion in a new study similar to those included was ',
            T.ci('poolPiLo', 'poolPiHi', 1, 'prop'), '.'];
        })
      ];
    },

    flags: function (T, r) {
      var fe = r.tauEstimator === 'FE';
      return [
        T.when(r.k < T.R.fewK, ['Few studies (', T.int('k'), ', fewer than ', T.rule('fewK'),
          '): heterogeneity estimates (τ² and I²) are imprecise.']),
        T.when(r.k < T.R.funnelK, ['Fewer than ', T.rule('funnelK'),
          ' studies: tests for small-study effects (funnel plot asymmetry) would be underpowered, and none were performed.']),
        T.when(T.zero('i2', 1), ['An I² of ', T.pct('i2', 1), ' does not show that the studies are homogeneous; ',
          T.when(r.k < T.R.funnelK, 'with few studies, heterogeneity statistics have low power.'),
          T.when(!(r.k < T.R.funnelK), 'heterogeneity statistics can have low power.')]),
        T.when(r.tauEstimator === 'DL' && r.k < T.R.dlMinK, ['The DerSimonian–Laird estimator tends to underestimate τ² with fewer than ',
          T.rule('dlMinK'), ' studies; the app recommends Paule–Mandel for inference.']),
        T.when(r.transform === 'ft', ['Freeman–Tukey back-transformed results can be seriously misleading (', T.cite('schwarzer'),
          '); a logit analysis is preferred for rare or extreme proportions.']),
        T.when(fe && T.has('poolPiLo'), 'The app also displays a prediction interval for the fixed-effect model; it assumes no between-study variance and is not reported here.'),
        T.when(r.k < T.R.piMinK, ['With fewer than ', T.rule('piMinK'), ' studies, no prediction interval was computed.'])
      ];
    }
  };

  var textSpec = {
    app: APP,
    verifyPackage: 'metafor',
    results: results,
    templates: templates,
    dom: dom,
    // The audit FAILS if fewer page-displayed values than this are cross-checked (pooled proportion, CI, tau2, Q, I2...).
    domMin: 3,
    // The app's own out-of-date indicator (hub/shared/analysis-lifecycle.js): inputs edited since the last run.
    stale: function () {
      if (typeof document === 'undefined') return false;
      var s = document.getElementById('analysis-stale');
      return !!(s && !s.hidden);
    },
    mount: function (el) { return global.AlmTextUI ? global.AlmTextUI.mount(el, { app: APP, text: textSpec }) : null; }
  };

  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;

  // Register with the feature-panel host (shared/alm-features.js) when present; register() merges
  // blocks per app. If the host is not loaded, no feature tab appears.
  var registered = false;
  function tryRegister() {
    if (registered) return;
    if (global.AlmFeatures && typeof global.AlmFeatures.register === 'function') {
      global.AlmFeatures.register(APP, { text: textSpec });
      registered = true;
    }
  }
  tryRegister();
  if (!registered && typeof document !== 'undefined' && document.readyState === 'loading' &&
      typeof global.addEventListener === 'function') {
    global.addEventListener('DOMContentLoaded', tryRegister);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { app: APP, text: textSpec };
})(typeof window !== 'undefined' ? window : globalThis);
