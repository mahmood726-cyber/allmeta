/* multivariate-ma/alm-straight.js — paper 18 adapter for F6 Straight path (shared/alm-straight.js + alm-straight-ui.js).
 * ctx() reads the app's own last results (window._almLastMultivariate, index.html:247-250); nothing is re-estimated.
 *   estimates: each pooled outcome mean with the Wald 95% CI exactly as the app displays it, mu ± Z·SE with the
 *     app's Z = qnorm(0.975) (index.html:159, :240-241); no effect = 0; p = the app's two-sided z test.
 *   withinCorrelation: 'assumed' in input mode rhoW (one assumed rho_w for all studies, index.html:70, :187);
 *     'reported' when covariances or per-study r were supplied (modes cov / r).
 */
(function () {
  'use strict';
  var APP = 'multivariate-ma';
  var Z = 1.959963984540054; // the app's own constant, multivariate-ma/index.html:159
  function ctx() {
    var c = { app: APP, analysisType: 'multivariate' };
    var r = typeof window._almLastMultivariate === 'function' ? window._almLastMultivariate() : null;
    if (!r) return c;
    c.k = r.k;
    c.withinCorrelation = r.mode === 'rhoW' ? 'assumed' : 'reported';
    if (r.mode === 'rhoW') c.assumedCorrelation = r.rhoW;
    c.estimates = r.mu.map(function (m, j) {
      return { label: 'pooled ' + r.outcomes[j], lo: m - Z * r.muSE[j], hi: m + Z * r.muSE[j], p: r.p ? r.p[j] : null, nullValue: 0 };
    });
    return c;
  }
  (window.AlmStraightAdapters = window.AlmStraightAdapters || {})[APP] = { ctx: ctx };
  // Keep advisory text and controls outside the analysis landmarks and results layout.
  window.AlmStraightUI.attach({ app: APP, ctx: ctx, anchor: '#alm-features', watch: ['#headline', '#stats'] });
})();
