/* nma-inconsistency/alm-straight.js — paper 16 adapter for F6 Straight path (shared/alm-straight.js + alm-straight-ui.js).
 * ctx() reads the app's own last results (window._almLastInco, index.html:553-564); nothing is recomputed.
 *   inconsistencyTests: every node-split p and the design-by-treatment p (null when not testable, index.html:563).
 *   minPerComparison: fewest contrasts entered for any treatment pair, counted from the app's own parser
 *     (window.parse, index.html:182; one row per independent two-arm study, index.html:213-225) on #src.
 */
(function () {
  'use strict';
  var APP = 'nma-inconsistency';
  function ctx() {
    var c = { app: APP, analysisType: 'network' };
    var r = typeof window._almLastInco === 'function' ? window._almLastInco() : null;
    if (!r || r.status === 'refused' || !Array.isArray(r.nodeSplit)) return c;
    c.model = r.model;
    c.inconsistencyTests = r.nodeSplit.map(function (x) { return { label: 'node-split ' + x.comparison, p: x.p }; });
    if (r.dbt && typeof r.dbt.p === 'number') c.inconsistencyTests.push({ label: 'design-by-treatment test', p: r.dbt.p });
    if (typeof window.parse === 'function') {
      var rows = window.parse(document.getElementById('src').value), per = {};
      rows.forEach(function (x) { var key = [String(x.A), String(x.B)].sort().join('\u0000'); per[key] = (per[key] || 0) + 1; });
      var counts = Object.keys(per).map(function (key) { return per[key]; });
      c.k = rows.length;
      if (counts.length) c.minPerComparison = Math.min.apply(null, counts);
    }
    return c;
  }
  (window.AlmStraightAdapters = window.AlmStraightAdapters || {})[APP] = { ctx: ctx };
  window.AlmStraightUI.attach({ app: APP, ctx: ctx, anchor: 'section.panel[aria-live="polite"] > h2', watch: ['#ns-body', '#dbt'] });
})();
