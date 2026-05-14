/**
 * allmeta stats helpers — single source of truth for numerical constants and
 * cross-app statistical primitives.  Attaches to `window.alm.stats`.
 *
 * Why this module exists:
 *   - 24+ apps were declaring `var Z975 = 1.959963984540054;` inline after
 *     Cycle 7.1 — one source of truth is easier to keep accurate
 *   - 8 apps had identical 5-line Abramowitz & Stegun `pnorm` implementations
 *     copy-pasted — drift risk if anyone "fixes" one without the others
 *   - When a numerical accuracy improvement lands (e.g. a more accurate
 *     normal-CDF algorithm), this is the only place that needs the change
 *
 * Not in scope:
 *   - Pooling formulas (those belong in each app's engine — they vary)
 *   - Random number generation (use the app's own seeded PRNG)
 *
 * Backwards compatibility:
 *   Apps that still declare their own `var Z975 = ...;` inline continue to
 *   work — that local declaration just shadows the shared one.  Migration
 *   is opt-in per app.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Z-quantile constants — exact values to 15 digits (full double precision).
  // Computed in R: qnorm(p) for the canonical CI / hypothesis-test levels.
  // ---------------------------------------------------------------------------
  var Z = Object.freeze({
    // Two-sided CI critical values (half-alpha in each tail)
    Z90:  1.6448536269514722,  // qnorm(0.95)   — 90% CI / one-sided 5%
    Z95:  1.6448536269514722,  // alias: some apps use Z95 for 90% CI bound
    Z975: 1.959963984540054,   // qnorm(0.975)  — 95% CI (the common case)
    Z99:  2.3263478740408408,  // qnorm(0.99)   — 98% CI / one-sided 1%
    Z995: 2.5758293035489004,  // qnorm(0.995)  — 99% CI

    // One-sided 80/90 — used in design effect / power calcs
    Z80:  0.8416212335729143,  // qnorm(0.80)
    Z90_1: 1.2815515655446004, // qnorm(0.90)   — one-sided 10% / 80% CI bound
  });

  // Math constants worth keeping exact (avoid Math.sqrt(N)/Math.PI churn).
  var K = Object.freeze({
    SQRT3_OVER_PI: Math.sqrt(3) / Math.PI,  // Cox's logOR->SMD factor
    LN10:          Math.LN10,
    INV_SQRT_2PI:  1 / Math.sqrt(2 * Math.PI),
  });

  // ---------------------------------------------------------------------------
  // Standard normal CDF — Abramowitz & Stegun 7.1.26 approximation.
  // Max abs error ~7.5e-8, plenty for everything in the portfolio.
  // ---------------------------------------------------------------------------
  function pnorm(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  // ---------------------------------------------------------------------------
  // Two-sided normal p-value: 2 * (1 - pnorm(|z|)).
  // ---------------------------------------------------------------------------
  function pTwoSided(z) {
    return 2 * (1 - pnorm(Math.abs(z)));
  }

  // ---------------------------------------------------------------------------
  // qnorm(p) — Beasley-Springer-Moro algorithm.  Inverse of pnorm.
  // Used when an app needs an arbitrary critical value (not just Z975/Z995).
  // ---------------------------------------------------------------------------
  function qnorm(p) {
    if (p <= 0 || p >= 1 || !isFinite(p)) return NaN;
    // Beasley-Springer-Moro coefficients
    var a = [-3.969683028665376e+01,  2.209460984245205e+02,
             -2.759285104469687e+02,  1.383577518672690e+02,
             -3.066479806614716e+01,  2.506628277459239e+00];
    var b = [-5.447609879822406e+01,  1.615858368580409e+02,
             -1.556989798598866e+02,  6.680131188771972e+01,
             -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
              4.374664141464968e+00,  2.938163982698783e+00];
    var d = [ 7.784695709041462e-03,  3.224671290700398e-01,
              2.445134137142996e+00,  3.754408661907416e+00];
    var plow = 0.02425, phigh = 1 - plow;
    var q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
             ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
    }
    if (p <= phigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
             (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }

  // ---------------------------------------------------------------------------
  // Expose on window.alm.stats.  Idempotent — safe to load twice.
  // ---------------------------------------------------------------------------
  var ns = (window.alm = window.alm || {});
  ns.stats = ns.stats || {
    Z: Z,
    K: K,
    pnorm: pnorm,
    qnorm: qnorm,
    pTwoSided: pTwoSided,
  };
})();
