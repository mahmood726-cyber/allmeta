/* Exact, standalone numerical helpers for AllMeta's effect-size converter.
 * References:
 * - metafor::escalc(measure="SMD", correct=TRUE, vtype="LS")
 * - metafor::cmicalc(df, method="exact") (Hedges, 1981)
 * - Wichura MJ (1988), Algorithm AS 241, Appl Stat 37:477-484 (the normal quantile of R's qnorm).
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

  // Wichura (1988) algorithm AS 241 (PPND16), the algorithm of R's qnorm(): relative error about 1e-16.
  // It replaces Acklam's approximation (relative error about 1e-9), which made SEs recovered from a
  // two-sided Wald p-value differ from metafor::conv.wald by up to about 1e-7 after propagation.
  function qnorm(p) {
    if (!(Number.isFinite(p) && p > 0 && p < 1))
      throw new RangeError("Normal quantile probability must be in (0,1)");
    const q = p - 0.5;
    let r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
        45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
        133.14166789178437745) * r + 3.387132872796366608) /
        (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
    }
    r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
    if (r <= 5) {
      r -= 1.6;
      val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
        1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
        4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
        0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
        0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
        5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -val : val;
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
