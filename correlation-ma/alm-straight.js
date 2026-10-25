/* correlation-ma/alm-straight.js — paper 17 adapter for F6 Straight path (shared/alm-straight.js + alm-straight-ui.js).
 * ctx() reads the app's own last results (window._almLastCorrMA, index.html:148-153); nothing is recomputed.
 *   estimator: #f-method (REML | PM | DL | FE).  hksj: false — the headline CI comes from AlmMaCore.pool without
 *   knha (index.html:136; shared/ma-core.js default knha:false), i.e. a normal (Wald) interval. The HKSJ cells of
 *   the sensitivity table (plus-ui.js) are not the main result.
 *   estimates: pooled r with its CI and t_{k-1} prediction interval on the r scale; no effect = 0.
 */
(function () {
  'use strict';
  var APP = 'correlation-ma';
  function ctx() {
    var c = { app: APP, analysisType: 'pairwise' };
    var r = typeof window._almLastCorrMA === 'function' ? window._almLastCorrMA() : null;
    if (!r) return c;
    c.k = r.k;
    c.estimator = r.method;
    c.randomEffects = r.method !== 'FE';
    c.hksj = false;
    c.i2 = r.I2;
    c.estimates = [{ label: 'pooled correlation r', lo: r.r_lo, hi: r.r_hi, piLo: r.r_pi_lo, piHi: r.r_pi_hi, nullValue: 0 }];
    return c;
  }
  (window.AlmStraightAdapters = window.AlmStraightAdapters || {})[APP] = { ctx: ctx };
  // The archived page-text contract includes main; advice belongs beside the feature panel.
  window.AlmStraightUI.attach({ app: APP, ctx: ctx, anchor: '#alm-features', watch: ['#headline', '#res-body'] });
})();
