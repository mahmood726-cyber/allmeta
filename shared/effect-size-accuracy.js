/* Exact, standalone numerical helpers for AllMeta's effect-size converter.
 * References:
 * - metafor::escalc(measure="SMD", correct=TRUE, vtype="LS")
 * - metafor::cmicalc(df, method="exact") (Hedges, 1981)
 * - Peter J. Acklam, inverse normal CDF rational approximation.
 * No network calls, external dependencies or UI access. */
(function (root) {
  "use strict";

  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  function logGammaPositive(z) {
    if (!(Number.isFinite(z) && z >= 0.5)) throw new RangeError("gamma argument must be >= 0.5");
    const a = z - 1;
    let x = LANCZOS[0];
    for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (a + i);
    const t = a + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (a + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function hedgesJ(df) {
    if (!Number.isInteger(df) || df < 2) throw new RangeError("SMD degrees of freedom must be an integer >= 2");
    // Avoid subtracting near-equal large log-gamma values unnecessarily.
    if (df > 100000) return 1 - 3 / (4 * df - 1);
    return Math.exp(logGammaPositive(df / 2) -
      logGammaPositive((df - 1) / 2) - 0.5 * Math.log(df / 2));
  }

  function validGroupSizes(n1, n2) {
    if (!Number.isSafeInteger(n1) || !Number.isSafeInteger(n2) || n1 < 2 || n2 < 2)
      throw new RangeError("Both independent group sizes must be integers >= 2");
  }

  function smdSummary(d, n1, n2, pooledSd) {
    validGroupSizes(n1, n2);
    if (!Number.isFinite(d)) throw new RangeError("SMD must be finite");
    const df = n1 + n2 - 2;
    const J = hedgesJ(df);
    const g = J * d;
    // metafor::escalc(..., measure="SMD", vtype="LS") large-sample variance.
    const vi = 1 / n1 + 1 / n2 + g * g / (2 * (n1 + n2));
    if (!(Number.isFinite(g) && Number.isFinite(vi) && vi > 0))
      throw new RangeError("SMD or variance overflow");
    return { d, g, J, df, vi, se: Math.sqrt(vi), pooledSd: pooledSd ?? null };
  }

  function fromMeans(m1, sd1, n1, m2, sd2, n2) {
    validGroupSizes(n1, n2);
    if (![m1, sd1, m2, sd2].every(Number.isFinite) || sd1 <= 0 || sd2 <= 0)
      throw new RangeError("Means must be finite and standard deviations strictly positive");
    const pooledSd = Math.sqrt(((n1 - 1) * sd1 ** 2 + (n2 - 1) * sd2 ** 2) /
      (n1 + n2 - 2));
    if (!(Number.isFinite(pooledSd) && pooledSd > 0))
      throw new RangeError("Invalid or overflowing pooled standard deviation");
    return smdSummary((m1 - m2) / pooledSd, n1, n2, pooledSd);
  }

  function fromT(t, n1, n2) {
    validGroupSizes(n1, n2);
    if (!Number.isFinite(t)) throw new RangeError("t must be finite");
    // Only for an independent two-sample pooled-variance t test (df=n1+n2-2).
    const d = t * Math.sqrt(1 / n1 + 1 / n2);
    return smdSummary(d, n1, n2, null);
  }

  function fromF(f, n1, n2, sign) {
    validGroupSizes(n1, n2);
    if (!Number.isFinite(f) || f < 0) throw new RangeError("F must be nonnegative");
    if (sign !== 1 && sign !== -1)
      throw new RangeError("An F statistic has no direction: select + or -");
    // Valid only when the numerator has 1 df and F=t^2, same two-sample design.
    return fromT(sign * Math.sqrt(f), n1, n2);
  }

  // Acklam's rational approximation: absolute error approximately < 2e-9.
  // Used for Wald p-value -> log-ratio/raw-effect SE, not for small-sample t tests.
  function qnorm(p) {
    if (!(Number.isFinite(p) && p > 0 && p < 1))
      throw new RangeError("Normal quantile probability must be in (0,1)");
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
      138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
      66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
      3.754408661907416];
    if (p < 0.02425 || p > 0.97575) {
      const q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      const v = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      return p < 0.5 ? v : -v;
    }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function seFromTwoSidedWaldP(p, absoluteEffect) {
    if (!(Number.isFinite(p) && p > 0 && p < 1))
      throw new RangeError("Two-sided p must be between 0 and 1");
    if (!(Number.isFinite(absoluteEffect) && absoluteEffect > 0))
      throw new RangeError("Supply the absolute Wald effect on the analysis scale");
    const z = Math.abs(qnorm(p / 2));
    if (!(z > 0)) throw new RangeError("p too close to 1 to recover an SE");
    return absoluteEffect / z;
  }

  const api = Object.freeze({ hedgesJ, fromMeans, fromT, fromF, qnorm, seFromTwoSidedWaldP });
  root.AlmEffectAccuracy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
