/* shared/benford-v1.js — Benford first-digit screen for data integrity.
 *
 * Integrated idea from the BenfordMA project (Benford screening of meta-analytic
 * values). Naturally-occurring numbers that span several orders of magnitude
 * have leading digits following Benford's law P(d)=log10(1+1/d). A large
 * deviation can flag fabricated/altered/rounded data — a forensic SCREEN that
 * complements the integrity suite (spec-collapse / INSPECT-SR / reporting-bias).
 *
 * Reports the first-digit distribution, the Nigrini Mean Absolute Deviation
 * with its conformity class, and a χ²(8) goodness-of-fit test. CRITICAL caveat
 * (surfaced by the app): Benford applies only to unbounded, multi-order-of-
 * magnitude quantities (sample sizes, event counts) — NOT to bounded ones
 * (proportions, p-values, standardised effect sizes, percentages), which fail
 * Benford for legitimate reasons. A flag is a prompt to look, never proof.
 *
 * Pure + dual-mode. Browser global: window.AlmBenford.
 */
(function (global) {
  "use strict";

  // expected first-digit proportions
  var E1 = [];
  for (var d = 1; d <= 9; d++) E1.push(Math.log(1 + 1 / d) / Math.LN10);

  function _gammp(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) { var ap = a, s = 1 / a, del = s; for (var n = 0; n < 200; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-12) break; } return s * Math.exp(-x + a * Math.log(x) - _gln(a)); }
    var b = x + 1 - a, c = 1e300, dd = 1 / b, h = dd;
    for (var i = 1; i < 200; i++) { var an = -i * (i - a); b += 2; dd = an * dd + b; if (Math.abs(dd) < 1e-300) dd = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; dd = 1 / dd; var dl = dd * c; h *= dl; if (Math.abs(dl - 1) < 1e-12) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - _gln(a)) * h;
  }
  function _gln(z) { var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; var x = z, tmp = z + 5.5; tmp -= (z + 0.5) * Math.log(tmp); var ser = 1.000000000190015; for (var j = 0; j < 6; j++) { x += 1; ser += g[j] / x; } return -tmp + Math.log(2.5066282746310005 * ser / z); }
  function chi2sf(x, k) { return x <= 0 ? 1 : 1 - _gammp(k / 2, x / 2); }

  function firstDigit(v) {
    v = Math.abs(+v);
    if (!isFinite(v) || v === 0) return null;
    while (v < 1) v *= 10;
    while (v >= 10) v /= 10;
    return Math.floor(v);
  }

  // Nigrini (2012) first-digit MAD conformity classes.
  function madClass(mad) {
    if (mad < 0.006) return "Close conformity";
    if (mad < 0.012) return "Acceptable conformity";
    if (mad < 0.015) return "Marginal conformity";
    return "Nonconformity";
  }

  function analyze(values, opts) {
    opts = opts || {};
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0], n = 0, i;
    (values || []).forEach(function (v) { var d = firstDigit(v); if (d >= 1 && d <= 9) { counts[d - 1]++; n++; } });
    if (n < 1) return { ok: false, error: "no usable numeric values (need finite, non-zero numbers)" };

    var obs = counts.map(function (c) { return c / n; });
    var mad = 0, chi2 = 0;
    for (i = 0; i < 9; i++) {
      mad += Math.abs(obs[i] - E1[i]);
      var ec = E1[i] * n;
      chi2 += (counts[i] - ec) * (counts[i] - ec) / ec;
    }
    mad /= 9;
    var df = 8, chi2p = chi2sf(chi2, df);
    var cls = madClass(mad);

    // largest single-digit excess/deficit (for the narrative)
    var maxDev = 0, maxDigit = 1;
    for (i = 0; i < 9; i++) { if (Math.abs(obs[i] - E1[i]) > maxDev) { maxDev = Math.abs(obs[i] - E1[i]); maxDigit = i + 1; } }

    var anomalous = mad >= 0.015 || chi2p < 0.05;
    var verdict = (n < 30)
      ? "Only " + n + " values — too few for a reliable Benford screen (≥100 recommended; ≥30 minimum). Treat the result as indicative only."
      : anomalous
        ? "First-digit MAD " + mad.toFixed(4) + " (" + cls + "), χ²(8)=" + chi2.toFixed(1) + ", p=" + chi2p.toFixed(4) + " — the leading-digit distribution DEVIATES from Benford (largest at digit " + maxDigit + "). Investigate: is this a fabrication signal, or simply a quantity that shouldn't follow Benford (bounded/narrow-range)?"
        : "First-digit MAD " + mad.toFixed(4) + " (" + cls + "), χ²(8)=" + chi2.toFixed(1) + ", p=" + chi2p.toFixed(4) + " — the leading digits are consistent with Benford. No digit anomaly (this is a screen, not a clean bill of health).";

    return {
      ok: true, n: n, counts: counts, observed: obs, expected: E1.slice(),
      mad: mad, madClass: cls, chi2: chi2, df: df, chi2p: chi2p,
      maxDigit: maxDigit, anomalous: anomalous, verdict: verdict
    };
  }

  var api = { analyze: analyze, firstDigit: firstDigit, madClass: madClass, expectedFirstDigit: E1.slice(), _chi2sf: chi2sf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmBenford = api;
})(typeof window !== "undefined" ? window : globalThis);
