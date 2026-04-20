/**
 * NMA Dose Response Studio - Statistical Distributions Module
 * Core probability distributions and statistical functions
 * References:
 * - Abramowitz & Stegun (1964) Handbook of Mathematical Functions
 * - Press et al. (2007) Numerical Recipes
 */

/**
 * Standard normal CDF - Abramowitz & Stegun approximation
 * Maximum error ~1.5e-7
 * @param {number} x - Standard normal value
 * @returns {number} CDF value P(Z <= x)
 */
export function normalCDF(x) {
  if (Number.isNaN(x)) return NaN;
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/**
 * Standard normal PDF
 * @param {number} x - Standard normal value
 * @returns {number} PDF value
 */
export function normalPDF(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse normal CDF (Acklam's algorithm)
 * @param {number} p - Probability (0, 1)
 * @returns {number} Quantile value
 */
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * t-distribution CDF
 * @param {number} t - t statistic
 * @param {number} df - degrees of freedom
 * @returns {number} CDF value
 */
export function tCDF(t, df) {
  if (df <= 0) return 0.5;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  return t >= 0 ? 1 - 0.5 * betaInc(df / 2, 0.5, x) :
                  0.5 * betaInc(df / 2, 0.5, x);
}

/**
 * t-distribution quantile with Newton-Raphson refinement
 * @param {number} p - Probability (0, 1)
 * @param {number} df - degrees of freedom
 * @returns {number} Quantile value
 */
export function tQuantile(p, df) {
  if (df <= 0) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (df >= 300) return normalQuantile(p);

  // Initial guess from normal
  let t = normalQuantile(p);

  // Newton-Raphson refinement
  for (let i = 0; i < 10; i++) {
    const cdf = tCDF(t, df);
    const pdf = Math.pow(1 + t*t/df, -(df+1)/2) / (Math.sqrt(df) * beta(df/2, 0.5));
    if (Math.abs(pdf) < 1e-15) break;
    const delta = (cdf - p) / pdf;
    t -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  return t;
}

/**
 * Chi-square CDF
 * @param {number} x - Chi-square statistic
 * @param {number} df - degrees of freedom
 * @returns {number} CDF value
 */
export function chiSquareCDF(x, df) {
  if (x <= 0 || df <= 0) return 0;
  return gammaCDF(x, df / 2, 2);
}

/**
 * Chi-square quantile using Wilson-Hilferty + refinement
 * @param {number} p - Probability (0, 1)
 * @param {number} df - degrees of freedom
 * @returns {number} Quantile value
 */
export function chiSquareQuantile(p, df) {
  if (df <= 0 || p <= 0) return 0;
  if (p >= 1) return Infinity;

  // Wilson-Hilferty approximation
  const z = normalQuantile(p);
  const h = 2 / (9 * df);
  let x = df * Math.pow(Math.max(0, 1 - h + z * Math.sqrt(h)), 3);

  // Newton-Raphson refinement
  for (let i = 0; i < 5; i++) {
    const cdf = chiSquareCDF(x, df);
    const pdf = Math.pow(x, df/2 - 1) * Math.exp(-x/2) / (Math.pow(2, df/2) * gamma(df/2));
    if (Math.abs(pdf) < 1e-15) break;
    const delta = (cdf - p) / pdf;
    x = Math.max(0.001, x - delta);
    if (Math.abs(delta) < 1e-8) break;
  }
  return x;
}

/**
 * Log-gamma function (Lanczos approximation)
 * @param {number} z - Value
 * @returns {number} log(gamma(z))
 */
export function logGamma(z) {
  if (z <= 0) return Infinity;
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Gamma function
 * @param {number} z - Value
 * @returns {number} gamma(z)
 */
export function gamma(z) {
  return Math.exp(logGamma(z));
}

/**
 * Beta function
 * @param {number} a - First parameter
 * @param {number} b - Second parameter
 * @returns {number} B(a, b)
 */
export function beta(a, b) {
  return Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));
}

/**
 * Incomplete beta function (continued fraction)
 * @param {number} a - First shape parameter
 * @param {number} b - Second shape parameter
 * @param {number} x - Value (0, 1)
 * @returns {number} B_x(a, b) / B(a, b)
 */
export function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) return NaN;

  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  }
  return 1 - bt * betaCF(b, a, 1 - x) / b;
}

/**
 * Continued fraction for incomplete beta
 * @param {number} a - First shape parameter
 * @param {number} b - Second shape parameter
 * @param {number} x - Value
 * @returns {number} Continued fraction result
 */
function betaCF(a, b, x) {
  const maxIter = 200;
  const eps = 1e-14;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

/**
 * Gamma CDF (regularized incomplete gamma)
 * @param {number} x - Value
 * @param {number} shape - Shape parameter
 * @param {number} scale - Scale parameter
 * @returns {number} CDF value
 */
export function gammaCDF(x, shape, scale) {
  if (x <= 0) return 0;
  const y = x / scale;
  return gammaIncLower(shape, y);
}

/**
 * Lower incomplete gamma (series expansion)
 * @param {number} a - Shape parameter
 * @param {number} x - Value
 * @returns {number} Lower incomplete gamma ratio
 */
function gammaIncLower(a, x) {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;

  const gln = logGamma(a);
  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  } else {
    // Continued fraction
    return 1 - gammaIncUpperCF(a, x) * Math.exp(-x + a * Math.log(x) - gln);
  }
}

/**
 * Upper incomplete gamma continued fraction
 * @param {number} a - Shape parameter
 * @param {number} x - Value
 * @returns {number} Continued fraction result
 */
function gammaIncUpperCF(a, x) {
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

// Default export
export default {
  normalCDF,
  normalPDF,
  normalQuantile,
  tCDF,
  tQuantile,
  chiSquareCDF,
  chiSquareQuantile,
  logGamma,
  gamma,
  beta,
  betaInc
};
