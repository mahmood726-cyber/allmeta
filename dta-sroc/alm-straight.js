/* dta-sroc/alm-straight.js — paper 3 adapter for F6 Straight path (shared/alm-straight.js + alm-straight-ui.js).
 * ctx() reads the app's own last results; nothing is recomputed (window.__almResults is NOT called: it re-runs the fit).
 *   k, Spearman rho: the stat cards the app rendered in #stats-wrap (index.html:578, :596). thresholdVaries = the
 *     app's own flag on that card (" ⚠" when |rho| > 0.6, index.html:596 / :608).
 *   poolingModel: 'bivariate' when the Reitsma fit exists (window.__almBivariate(), index.html:226/598); 'separate'
 *     when the app shows separately averaged "Mean Se" / "Mean Sp" instead (no bivariate fit, index.html:588-590).
 *     The Moses–Littenberg SROC is always drawn for comparison only (not chosen), so it does not count as chosen.
 *   smallStudyTest: Deeks' test, shown when window.__almDeeks() is non-null (index.html:597, :605).
 *   analysisType 'multivariate': the bivariate model pools two correlated outcomes (logit Se, logit FPR), so
 *     SP-UNC-SMALLK uses the multivariate limit (the app itself warns below about 10 studies, index.html:616).
 */
(function () {
  'use strict';
  var APP = 'dta-sroc';
  function card(name) {
    var cards = document.querySelectorAll('#stats-wrap .stat');
    for (var i = 0; i < cards.length; i++) {
      var k = cards[i].querySelector('.k'), v = cards[i].querySelector('.v');
      if (k && v && k.textContent === name) return v.textContent;
    }
    return null;
  }
  function ctx() {
    var c = { app: APP, analysisType: 'multivariate' };
    var kText = card('k');
    if (kText === null) return c;
    c.k = Number(kText);
    if (!(c.k > 0)) { delete c.k; return c; }
    var b = typeof window.__almBivariate === 'function' ? window.__almBivariate() : null;
    if (b) c.poolingModel = 'bivariate';
    else if (card('Mean Se') !== null) c.poolingModel = 'separate';
    var rho = card('Spearman ρ (threshold)');
    if (rho !== null) {
      c.thresholdRho = parseFloat(rho);
      c.thresholdVaries = rho.indexOf('⚠') >= 0;
    }
    var d = typeof window.__almDeeks === 'function' ? window.__almDeeks() : null;
    c.smallStudyTest = { name: "Deeks' test", shown: !!d, p: d ? d.p : null };
    return c;
  }
  (window.AlmStraightAdapters = window.AlmStraightAdapters || {})[APP] = { ctx: ctx };
  // Keep advice outside the results layout, after the measured plots and extras.
  window.AlmStraightUI.attach({ app: APP, ctx: ctx, anchor: '#alm-features', watch: ['#stats-wrap', '#deeks-host'] });
})();
