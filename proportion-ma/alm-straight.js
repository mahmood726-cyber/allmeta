/* proportion-ma/alm-straight.js — paper 9 adapter for F6 Straight path (shared/alm-straight.js + alm-straight-ui.js).
 * ctx() reads the app's own last results (window._almLastPropMA, index.html:409-425) and the data-entry provenance
 * (AlmFeaturesState.provenance); nothing is recomputed.
 *   estimator: #tau-est (PM | DL | FE); FE = fixed effect.  hksj: false — the pooled CI is a normal (Wald) interval,
 *   mu ± qnorm(0.975)·SE (index.html:384-385); the app has no Hartung–Knapp option.
 *   nullValue: null — a single-group proportion has no "no effect" value, so SP-UNC-WIDEPI is not applicable here.
 */
(function () {
  'use strict';
  var APP = 'proportion-ma';
  function ctx() {
    var st = window.AlmFeaturesState;
    var c = { app: APP, analysisType: 'pairwise', provenance: st && Array.isArray(st.provenance) ? st.provenance : null };
    var r = typeof window._almLastPropMA === 'function' ? window._almLastPropMA() : null;
    if (!r) return c;
    c.k = r.k;
    c.estimator = r.tauEstimator;
    c.randomEffects = r.tauEstimator !== 'FE';
    c.hksj = false;
    c.i2 = r.i2;
    c.estimates = [{ label: 'pooled proportion', lo: r.poolLo, hi: r.poolHi, piLo: r.poolPiLo, piHi: r.poolPiHi, nullValue: null }];
    return c;
  }
  (window.AlmStraightAdapters = window.AlmStraightAdapters || {})[APP] = { ctx: ctx };
  window.AlmStraightUI.attach({ app: APP, ctx: ctx, anchor: '#k-warn', watch: ['#res-body', '#het'] });
})();
