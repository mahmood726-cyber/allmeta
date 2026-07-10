/*
 * shared/gsdesign.js — Group-sequential trial-design boundaries.
 *
 * Ported from the author's AdaptSim engine into the allmeta shared-module idiom.
 * Computes efficacy (and optional futility) boundaries for a K-look group-
 * sequential design via the canonical joint distribution of the sequential
 * Z-statistics with independent increments (Cov(Z_i,Z_j)=sqrt(t_i/t_j), i<=j),
 * using the recursive-density method (Armitage-McPherson-Rowe) with 32-point
 * Gauss-Legendre quadrature — the EXACT boundary, not the closed-form
 * approximation used by tsa / sequential-ma.
 *
 * Alpha-spending: O'Brien-Fleming (Lan-DeMets), Pocock, Lan-DeMets rho (power),
 * Hwang-Shih-DeCani gamma. Futility via beta-spending (binding/non-binding).
 * Conditional power under a specified or observed trend.
 *
 * Verified vs gsDesign (R) to ~1e-4; see tests/test_gsdesign.py.
 */
(function (global) {
  "use strict";

  // --- high-precision standard normal (erfc via NR erfccheb, ~1e-13) ---
  var _COF = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6,
    1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9,
    -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
    8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15,
    -9.4e-17, 1.21e-16, -2.8e-17];
  function _erfccheb(z) {
    var d = 0, dd = 0, t = 2 / (2 + z), ty = 4 * t - 2, tmp;
    for (var j = _COF.length - 1; j > 0; j--) { tmp = d; d = ty * d - dd + _COF[j]; dd = tmp; }
    return t * Math.exp(-z * z + 0.5 * (_COF[0] + ty * d) - dd);
  }
  function _erfc(x) { return x >= 0 ? _erfccheb(x) : 2 - _erfccheb(-x); }
  function normalCDF(z) { return 1 - 0.5 * _erfc(z / Math.SQRT2); }
  function normalPDF(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
  function _phi(z) { return normalPDF(z); }
  function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, x;
    if (p < pl) { var q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { var q2 = p - 0.5, r = q2 * q2; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q2 / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { var q3 = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q3 + c[1]) * q3 + c[2]) * q3 + c[3]) * q3 + c[4]) * q3 + c[5]) / ((((d[0] * q3 + d[1]) * q3 + d[2]) * q3 + d[3]) * q3 + 1); }
    var e = normalCDF(x) - p, u = e / _phi(x);
    return x - u / (1 + x * u / 2);
  }

  // --- alpha/beta spending functions ---
  function alphaSpendOBF(t, alpha) {
    if (t <= 0) return 0; if (t >= 1) return alpha;
    return 2 - 2 * normalCDF(normalQuantile(1 - alpha / 2) / Math.sqrt(t));
  }
  function alphaSpendPocock(t, alpha) {
    if (t <= 0) return 0; if (t >= 1) return alpha;
    return alpha * Math.log(1 + (Math.E - 1) * t);
  }
  function alphaSpendLanDeMets(t, alpha, rho) {
    if (t <= 0) return 0; if (t >= 1) return alpha;
    return Math.min(alpha, alpha * Math.pow(t, rho));
  }
  function alphaSpendHSD(t, alpha, gamma) {
    if (t <= 0) return 0; if (t >= 1) return alpha;
    if (Math.abs(gamma) < 1e-8) return alpha * t;
    return alpha * (1 - Math.exp(-gamma * t)) / (1 - Math.exp(-gamma));
  }
  function getSpendingFunction(type, param) {
    switch (type) {
      case 'obf': return function (t, a) { return alphaSpendOBF(t, a); };
      case 'pocock': return function (t, a) { return alphaSpendPocock(t, a); };
      case 'landemets': return function (t, a) { return alphaSpendLanDeMets(t, a, param); };
      case 'hsd': return function (t, a) { return alphaSpendHSD(t, a, param); };
      default: return function (t, a) { return alphaSpendOBF(t, a); };
    }
  }

  // --- 32-point Gauss-Legendre quadrature ---
  var GL_N = [0.0483076656877383, 0.1444719615827965, 0.2392873622521371, 0.3318686022821276,
    0.4213512761306353, 0.5068999089322294, 0.5877157572407623, 0.6630442669302152,
    0.7321821187402897, 0.7944837959679424, 0.8493676137325700, 0.8963211557660521,
    0.9349060759377397, 0.9647622555875064, 0.9856115115452684, 0.9972638618494816];
  var GL_W = [0.0965400885147278, 0.0956387200792749, 0.0938443990808046, 0.0911738786957639,
    0.0876520930044038, 0.0833119242269467, 0.0781938957870703, 0.0723457941088485,
    0.0658222227763618, 0.0586840934785355, 0.0509980592623762, 0.0428358980222267,
    0.0342738629130214, 0.0253920653092621, 0.0162743947309057, 0.0070186100094701];
  var GL32_NODES = [], GL32_WEIGHTS = [];
  for (var _i = GL_N.length - 1; _i >= 0; _i--) { GL32_NODES.push(-GL_N[_i]); GL32_WEIGHTS.push(GL_W[_i]); }
  for (var _j = 0; _j < GL_N.length; _j++) { GL32_NODES.push(GL_N[_j]); GL32_WEIGHTS.push(GL_W[_j]); }
  function gaussLegendre(fn, a, b) {
    var mid = (a + b) / 2, half = (b - a) / 2, sum = 0;
    for (var i = 0; i < 32; i++) sum += GL32_WEIGHTS[i] * fn(mid + half * GL32_NODES[i]);
    return sum * half;
  }

  // Recursive density of Z_{k-1} on the continuation region.
  function buildRecursiveDensity(k, boundaries, infoFracs, twoSided) {
    if (k === 1) return function (z) { return normalPDF(z); };
    var prevDensity = buildRecursiveDensity(k - 1, boundaries, infoFracs, twoSided);
    var pb = boundaries[k - 2];
    var prevLo = twoSided ? (pb.z_fut > -10 && pb.z_fut > -pb.z_eff ? pb.z_fut : -pb.z_eff)
                          : (pb.z_fut > -10 ? pb.z_fut : -8);
    var prevHi = pb.z_eff;
    var rho = Math.sqrt(infoFracs[k - 2] / infoFracs[k - 1]);
    var sigma = Math.sqrt(1 - infoFracs[k - 2] / infoFracs[k - 1]);
    return function (z) {
      return gaussLegendre(function (zp) {
        return prevDensity(zp) * normalPDF((z - rho * zp) / sigma) / sigma;
      }, prevLo, prevHi);
    };
  }
  function computeCrossingProb(c, densityFn, prevLo, prevHi, rho, sigma, twoSided) {
    var prob = gaussLegendre(function (z) {
      return densityFn(z) * (1 - normalCDF((c - rho * z) / sigma));
    }, prevLo, prevHi);
    if (twoSided) prob += gaussLegendre(function (z) {
      return densityFn(z) * normalCDF((-c - rho * z) / sigma);
    }, prevLo, prevHi);
    return prob;
  }
  function computeFutilityCrossingProb(c, densityFn, prevLo, prevHi, rho, sigma) {
    return gaussLegendre(function (z) {
      return densityFn(z) * normalCDF((c - rho * z) / sigma);
    }, prevLo, prevHi);
  }

  /**
   * Group-sequential boundaries.
   * opts: { alpha=0.025, infoFracs:[...], spend:'obf'|'pocock'|'landemets'|'hsd',
   *         param (rho/gamma), twoSided=false, futility:'none'|'betaspend',
   *         futSpend (spend type for beta), beta=0.2 }
   * Returns [{ look, infoFrac, z_eff, z_fut, nomP_eff, cumAlpha }, ...].
   */
  function boundaries(opts) {
    opts = opts || {};
    var alpha = opts.alpha != null ? opts.alpha : 0.025;
    var infoFracs = opts.infoFracs || [0.5, 1.0];
    var twoSided = !!opts.twoSided;
    var spendFn = getSpendingFunction(opts.spend || 'obf', opts.param);
    var futType = opts.futility || 'none';
    var hasFut = futType !== 'none';
    var beta = opts.beta != null ? opts.beta : 0.2;
    var futSpendFn = getSpendingFunction(opts.futSpend || 'obf', opts.futParam);

    var K = infoFracs.length, out = [], aPrev = 0, bPrev = 0;
    for (var k = 0; k < K; k++) {
      var t = infoFracs[k];
      var targetAlpha = spendFn(t, alpha);
      var dA = targetAlpha - aPrev; if (dA < 1e-15) dA = 1e-15;
      var dB = 0;
      if (hasFut && k < K - 1) { var tB = futSpendFn(t, beta); dB = tB - bPrev; if (dB < 1e-15) dB = 1e-15; bPrev = tB; }
      var zEff, zFut;
      if (k === 0) {
        zEff = twoSided ? normalQuantile(1 - dA / 2) : normalQuantile(1 - dA);
        zFut = (hasFut && k < K - 1) ? normalQuantile(dB) : -Infinity;
      } else {
        var tPrev = infoFracs[k - 1];
        var rho = Math.sqrt(tPrev / t), sigma = Math.sqrt(1 - tPrev / t);
        var pb = out[k - 1];
        var prevLo = twoSided ? (pb.z_fut > -10 && pb.z_fut > -pb.z_eff ? pb.z_fut : -pb.z_eff)
                              : (pb.z_fut > -10 ? pb.z_fut : -8);
        var prevHi = pb.z_eff;
        var densityFn = buildRecursiveDensity(k, out, infoFracs, twoSided);
        var zLo = 0, zHi = 8, zMid, prob;
        for (var it = 0; it < 80; it++) {
          zMid = (zLo + zHi) / 2;
          prob = computeCrossingProb(zMid, densityFn, prevLo, prevHi, rho, sigma, twoSided);
          if (prob > dA) zLo = zMid; else zHi = zMid;
        }
        zEff = (zLo + zHi) / 2;
        if (hasFut && k < K - 1) {
          var fLo = -8, fHi = zEff - 0.01, fMid, fProb;
          for (var it2 = 0; it2 < 80; it2++) {
            fMid = (fLo + fHi) / 2;
            fProb = computeFutilityCrossingProb(fMid, densityFn, prevLo, prevHi, rho, sigma);
            if (fProb < dB) fLo = fMid; else fHi = fMid;
          }
          zFut = (fLo + fHi) / 2;
        } else if (k === K - 1 && hasFut) zFut = zEff;
        else zFut = -Infinity;
      }
      out.push({
        look: k + 1, infoFrac: t, z_eff: zEff, z_fut: zFut,
        nomP_eff: twoSided ? 2 * (1 - normalCDF(zEff)) : 1 - normalCDF(zEff),
        cumAlpha: targetAlpha
      });
      aPrev = targetAlpha;
    }
    return out;
  }

  /**
   * Conditional power at an interim look. Given observed z_m at info fraction
   * t_m, the final efficacy boundary z_K at t_K=1, and an assumed standardized
   * drift theta (per unit information^0.5); if theta is null uses the current
   * trend (theta_hat = z_m / sqrt(t_m)).
   *   CP = 1 - Phi( (z_K - z_m*sqrt(t_m) - theta*(1 - t_m)) / sqrt(1 - t_m) ).
   */
  function conditionalPower(zObs, tm, zK, theta) {
    if (!(tm > 0 && tm < 1)) return NaN;
    var th = (theta == null) ? zObs / Math.sqrt(tm) : theta;
    var num = zK - zObs * Math.sqrt(tm) - th * (1 - tm);
    return 1 - normalCDF(num / Math.sqrt(1 - tm));
  }

  var api = {
    boundaries: boundaries,
    conditionalPower: conditionalPower,
    spend: { obf: alphaSpendOBF, pocock: alphaSpendPocock, landemets: alphaSpendLanDeMets, hsd: alphaSpendHSD },
    normalCDF: normalCDF, normalQuantile: normalQuantile,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmGSDesign = api;
})(typeof window !== "undefined" ? window : globalThis);
