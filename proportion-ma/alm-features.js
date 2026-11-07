/* proportion-ma/alm-features.js — paper 9 adapter for the shared feature panel (shared/alm-features.js).
 * verify: reuses the live R adapter registered by validate/adapter.js (AlmValidate.adapters['proportion-ma']).
 *   R objects left in the global environment by its buildScript (documented here for plot code):
 *     x, n      events and totals;  es  metafor::escalc(...) on the analysis scale (PLO / PFT / PR);
 *     f         metafor::rma(es$yi, es$vi, method=<PM|DL|FE>) fit;  back  back-transform to proportions.
 *   optional(state): prediction-interval keys when k < 3 (not applicable; see shared/alm-verify-r.js).
 * share: the #src text plus every option control (#trans, #tau-est); set() validates, restores and re-runs.
 * entry/text blocks are added by their own lanes (AlmFeatures.register merges blocks).
 */
(function () {
  'use strict';
  var TRANS = ['ft', 'logit', 'raw'], TAU = ['PM', 'DL', 'FE'];
  function byId(id) { return document.getElementById(id); }

  // Study labels go into R as JSON string literals (valid R string syntax for the escapes JSON emits).
  function forestCode(state) {
    var labels = state.rows.map(function (r) { return JSON.stringify(String(r.label)); }).join(', ');
    return 'metafor::forest(f, transf = back, slab = c(' + labels + '), refline = NA,\n' +
      '  xlab = "Proportion", header = c("Study", "Proportion [95% CI]"))';
  }

  AlmFeatures.register('proportion-ma', {
    paper: 9,
    title: 'Proportion meta-analysis',
    verify: {
      adapter: function () { return AlmValidate.adapters['proportion-ma']; },
      rObjects: 'x, n, es (escalc), f (rma fit), back (back-transform)',
      inputs: '#src, #trans, #tau-est', // the app's analysis inputs (Verify in R stale check)
      // Prediction-interval quantities do not exist for k < 3 (the app shows none; R gives NA): listed as
      // "not applicable" only when both sides are missing. Keys are read from the adapter's appValues.
      optional: function (state) {
        if (state.rows.length >= 3) return [];
        return AlmValidate.adapters['proportion-ma'].live.appValues(state)
          .map(function (v) { return v.key; })
          .filter(function (k) { return /^(pool)?pi(Lo|Hi)$/i.test(k); });
      },
      plots: [{
        id: 'forest', title: 'Forest plot', r: forestCode, width_in: 8, height_in: 6,
        app: function () { return byId('forest'); },
      }],
    },
    share: {
      get: function () {
        return { src: byId('src').value, trans: byId('trans').value, tau: byId('tau-est').value };
      },
      set: function (s) {
        if (!s || typeof s.src !== 'string' || s.src.length > 200000) throw new Error('data text missing or too long');
        if (TRANS.indexOf(s.trans) < 0) throw new Error('unknown transformation ' + String(s.trans));
        if (TAU.indexOf(s.tau) < 0) throw new Error('unknown estimator ' + String(s.tau));
        byId('src').value = s.src;
        byId('trans').value = s.trans;
        byId('tau-est').value = s.tau;
        byId('btn-run').click();
      },
    },
  });
})();
