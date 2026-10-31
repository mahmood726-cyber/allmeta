/* shared/variance-ratio.js — non-blocking warning when the sampling variances of an analysis span an extreme range.
 *
 *   AlmVarianceRatio.check(vi)      vi = the sampling variances the analysis pools (not SEs). Returns null, or
 *                                   {ratio, max, min, threshold, message} when max(vi)/min(vi) reaches metafor's limit.
 *   AlmVarianceRatio.checkSE(sei)   the same for standard errors (squares them first).
 *   AlmVarianceRatio.THRESHOLD      the limit (1/evtol = 1e7).
 *   AlmVarianceRatio.MESSAGE_START  the fixed start of every message (tests find the warning by it).
 *
 * The condition is metafor's own, copied exactly (metafor 5.2-1, R 4.6.0, read from the installed namespace):
 *   rma.uni:  vimaxmin <- max(vi)/min(vi)
 *             if (is.finite(vimaxmin) && vimaxmin >= 1/con$evtol)        # con$evtol defaults to 1e-07
 *               warning("Ratio of largest to smallest sampling variance extremely large. May not be able to
 *                        obtain stable results.")
 *   rma.mv:   the same test with the literal 1e7.
 * So: ratio = max/min over ALL the variances, warn when it is finite and >= 1e7 (equality warns). A zero variance gives
 * an infinite ratio and, as in metafor, no warning (the apps refuse or report zero variances elsewhere).
 * Warning only: nothing here changes or blocks a result. Plain IIFE: window.AlmVarianceRatio + module.exports.
 */
(function (global) {
  'use strict';

  var EVTOL = 1e-7;               // metafor rma.uni control default con$evtol
  var THRESHOLD = 1 / EVTOL;      // metafor: vimaxmin >= 1/con$evtol
  var MESSAGE_START = 'Ratio of largest to smallest sampling variance is extremely large';

  function fmt(x) { return Number(x).toExponential(1).replace('e+', 'e'); }

  function check(vi) {
    if (!vi || typeof vi.length !== 'number' || !vi.length) return null;
    var max = -Infinity, min = Infinity;
    for (var i = 0; i < vi.length; i++) {
      var v = Number(vi[i]);
      if (v !== v) return null;   // NaN: R's max()/min() give NaN, is.finite(NaN) is FALSE -> no warning
      if (v > max) max = v;
      if (v < min) min = v;
    }
    var ratio = max / min;
    if (!(isFinite(ratio) && ratio >= THRESHOLD)) return null;
    return {
      ratio: ratio, max: max, min: min, threshold: THRESHOLD,
      message: MESSAGE_START + ' (' + fmt(ratio) + '; smallest variance ' + fmt(min) + ', largest ' + fmt(max) +
        '). The results are shown as computed, but they may not be numerically stable: R’s metafor gives the same ' +
        'warning when the ratio is ' + fmt(THRESHOLD) + ' or more. Check that the most precise study’s standard ' +
        'error or variance was entered correctly.',
    };
  }

  function checkSE(sei) {
    if (!sei || typeof sei.length !== 'number') return null;
    var vi = [];
    for (var i = 0; i < sei.length; i++) { var s = Number(sei[i]); vi.push(s * s); }
    return check(vi);
  }

  var api = { check: check, checkSE: checkSE, THRESHOLD: THRESHOLD, EVTOL: EVTOL, MESSAGE_START: MESSAGE_START };
  global.AlmVarianceRatio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
