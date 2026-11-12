/* shared/trimfill.js — Duval & Tweedie (2000) trim-and-fill.
 *
 * Estimates the number of studies k0 suppressed by publication bias on one side of
 * the funnel, imputes their mirror images about the trimmed pooled mean, and re-pools.
 * A SENSITIVITY analysis only (per advanced-stats.md) — never the primary estimate.
 *
 * Algorithm (matches metafor::trimfill.rma.uni, default estimator L0):
 *  1. Side: sign of the slope of yi on √vi from a regression fitted with the same tau2
 *     method (metafor's rule) — slope < 0 → "right", else "left".
 *  2. Work in z = s·yi (s = +1 left / −1 right), sorted ascending, so we always trim
 *     the top and impute the bottom. Iterate: pool the trimmed set (drop top k0) → βz;
 *     centred ranks rᵢ = sign(zᵢ−βz)·rank(|zᵢ−βz|); Sr = Σ rᵢ over positive residuals;
 *     L0 = (4·Sr − k(k+1)) / (2k−1); k0 = max(0, round(L0)); repeat to convergence.
 *  3. Impute k0 reflections of the most-extreme studies: yi_imp = 2·μ_trim − yi_extreme
 *     (variance carried over), then re-pool original ∪ imputed with the SAME method.
 *
 * Verified vs metafor::trimfill (estimator="L0") to ~1e-7 on k0, adjusted μ/SE/τ² for
 * FE and RE(DL), left- and right-side. Pooling delegates to shared/ma-core.js.
 *
 * Reference: Duval S, Tweedie R (2000), Biometrics 56(2):455-463; Biometrics 56:276-284.
 */
(function (global) {
  "use strict";

  function _pool(yi, vi, method) {
    if (global.AlmMaCore) {
      var r = global.AlmMaCore.pool(yi, vi, { method: method });
      return { mu: r.mu, se: r.se, ciLo: r.ciLo, ciHi: r.ciHi, tau2: r.tau2 };
    }
    // Minimal FE fallback (ma-core should be present).
    var sw = 0, swy = 0;
    for (var i = 0; i < yi.length; i++) { var w = 1 / vi[i]; sw += w; swy += w * yi[i]; }
    var mu = swy / sw, se = Math.sqrt(1 / sw);
    return { mu: mu, se: se, ciLo: mu - 1.96 * se, ciHi: mu + 1.96 * se, tau2: 0 };
  }
  function _poolMu(yi, vi, method) { return _pool(yi, vi, method).mu; }

  // WLS slope of yi on √vi (FE weights 1/vi) — only its SIGN is used for the side.
  function _eggerSlope(yi, vi) {
    var n = yi.length, sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (var i = 0; i < n; i++) {
      var w = 1 / vi[i], x = Math.sqrt(vi[i]);
      sw += w; swx += w * x; swy += w * yi[i]; swxx += w * x * x; swxy += w * x * yi[i];
    }
    var denom = sw * swxx - swx * swx;
    return denom === 0 ? 0 : (sw * swxy - swx * swy) / denom;
  }

  // Slope of the mixed-effects regression of yi on sqrt(vi) with tau2 estimated by the SAME
  // method as the fit, which is metafor::trimfill's side rule when side is not given
  // (the fixed-effect slope above can have the opposite sign when tau2 > 0).
  function _regFit(y, x, v, t2) {
    var k = y.length, S0 = 0, S1 = 0, S2 = 0, Sy = 0, Sxy = 0, T0 = 0, T1 = 0, T2 = 0, i;
    var w = new Array(k), e = new Array(k);
    for (i = 0; i < k; i++) {
      var wi = 1 / (v[i] + t2); w[i] = wi;
      S0 += wi; S1 += wi * x[i]; S2 += wi * x[i] * x[i]; Sy += wi * y[i]; Sxy += wi * x[i] * y[i];
      T0 += wi * wi; T1 += wi * wi * x[i]; T2 += wi * wi * x[i] * x[i];
    }
    var D = S0 * S2 - S1 * S1;
    if (!(D > 1e-12 * S0 * S2)) return null;              // sqrt(vi) has no spread
    var b1 = (S0 * Sxy - S1 * Sy) / D, b0 = (Sy - b1 * S1) / S0, Q = 0, Q2 = 0;
    for (i = 0; i < k; i++) { e[i] = y[i] - b0 - b1 * x[i]; Q += w[i] * e[i] * e[i]; Q2 += w[i] * w[i] * e[i] * e[i]; }
    return { b1: b1, Q: Q, Q2: Q2, w: w, S0: S0, S1: S1, S2: S2, D: D,
      trP: S0 - (S2 * T0 - 2 * S1 * T1 + S0 * T2) / D };
  }
  function _trPP(f, x) {
    var k = x.length, s = 0;
    for (var i = 0; i < k; i++) for (var j = 0; j < k; j++) {
      var h = (f.S2 - f.S1 * (x[i] + x[j]) + f.S0 * x[i] * x[j]) / f.D;
      var p = (i === j ? f.w[i] : 0) - f.w[i] * f.w[j] * h;
      s += p * p;
    }
    return s;
  }
  function _regSlope(yi, vi, method) {
    var k = yi.length, df = k - 2, x = vi.map(Math.sqrt), f = _regFit(yi, x, vi, 0), t2 = 0, i;
    if (!f) return 0;
    if (method === "DL") {
      t2 = df > 0 ? Math.max(0, (f.Q - df) / f.trP) : 0;
    } else if (method === "PM") {
      if (f.Q > df) {
        var lo = 0, hi = 1, g = _regFit(yi, x, vi, hi);
        for (i = 0; i < 200 && g.Q > df; i++) { hi *= 2; g = _regFit(yi, x, vi, hi); }
        for (i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (_regFit(yi, x, vi, m).Q > df) lo = m; else hi = m; }
        t2 = (lo + hi) / 2;
      }
    } else if (method === "REML") {
      t2 = df > 0 ? Math.max(0, (f.Q - df) / f.trP) : 0;
      for (i = 0; i < 1000; i++) {
        var c = _regFit(yi, x, vi, t2);
        var nw = Math.max(0, t2 + (c.Q2 - c.trP) / _trPP(c, x));
        if (Math.abs(nw - t2) < 1e-11) { t2 = nw; break; }
        t2 = nw;
      }
    } else {
      return _eggerSlope(yi, vi);                         // FE and methods without a regression form
    }
    return _regFit(yi, x, vi, t2).b1;
  }

  // rank(|c|) with ties broken by order of appearance ("first").
  function _rankAbsFirst(c, average) {
    var idx = c.map(function (v, i) { return { a: Math.abs(v), i: i }; });
    idx.sort(function (p, q) { return p.a - q.a || p.i - q.i; });
    var r = new Array(c.length);
    for (var j = 0; j < idx.length; j++) r[idx[j].i] = j + 1;
    if(average) {
      for(var start=0;start<idx.length;){var end=start+1;while(end<idx.length&&idx[end].a===idx[start].a)end++;
        for(var q=start;q<end;q++)r[idx[q].i]=(start+1+end)/2;start=end;}
    }
    return r;
  }

  // trimAndFill(yi, vi, {method:'FE'|'DL'|'PM'|'REML', side:'left'|'right', maxiter})
  // → { k0, side, mu, se, ciLo, ciHi, tau2, kOrig, imputed:[{yi,vi}], slopeSign }
  function trimAndFill(yi, vi, opts) {
    opts = opts || {};
    var method = opts.method || "DL";
    // meta::trimfill(ma.common=TRUE) trims about the common-effect mean,
    // then pools the filled studies with the requested random-effects method.
    var trimMethod = opts.maCommon === true ? "FE" : method;
    var k = yi.length;
    if (k < 3) return { k0: 0, side: opts.side || "left", kOrig: k, imputed: [],
      _pooled: _pool(yi, vi, method) };

    var slope = opts.maCommon === true ? _eggerSlope(yi, vi) : _regSlope(yi, vi, method);
    var side = opts.side || (opts.maCommon === true ? (slope > 0 ? "left" : "right") : (slope < 0 ? "right" : "left"));
    var s = (side === "left") ? 1 : -1;

    // z = s·yi sorted ascending (carry vi).
    var order = yi.map(function (_, i) { return i; })
      .sort(function (a, b) { return (s * yi[a]) - (s * yi[b]); });
    var z = order.map(function (i) { return s * yi[i]; });
    var vz = order.map(function (i) { return vi[i]; });

    var k0 = 0, k0sav = -1, iter = 0, betaZ = 0, maxiter = opts.maxiter || (opts.maCommon === true ? 50 : 100);
    while (Math.abs(k0 - k0sav) > 0 && k0 < k && iter < maxiter) {
      k0sav = k0; iter++;
      var nt = k - k0;
      betaZ = _poolMu(z.slice(0, nt), vz.slice(0, nt), trimMethod);
      var ranks = _rankAbsFirst(z.map(function (v) { return v - betaZ; }), opts.maCommon === true);
      var Sr = 0;
      for (var i = 0; i < k; i++) if (z[i] - betaZ > 0) Sr += ranks[i];
      var L0 = (4 * Sr - k * (k + 1)) / (2 * k - 1);
      k0 = Math.max(0, Math.round(L0));
    }

    k0 = Math.min(k0, k - 1);
    // Impute k0 reflections of the most-extreme studies about the trimmed mean.
    var imputed = [];
    var fillY = yi.slice(), fillV = vi.slice();
    if (k0 > 0) {
      for (var t = k - k0; t < k; t++) {
        var zImp = 2 * betaZ - z[t];
        var yImp = s * zImp;            // back to original scale
        imputed.push({ yi: yImp, vi: vz[t] });
        fillY.push(yImp); fillV.push(vz[t]);
      }
    }
    var adj = _pool(fillY, fillV, method);
    return {
      k0: k0, side: side, kOrig: k, slopeSign: slope < 0 ? -1 : 1,
      mu: adj.mu, se: adj.se, ciLo: adj.ciLo, ciHi: adj.ciHi, tau2: adj.tau2,
      imputed: imputed, _pooled: adj,
    };
  }

  var api = { trimAndFill: trimAndFill, _eggerSlope: _eggerSlope, _regSlope: _regSlope, _rankAbsFirst: _rankAbsFirst };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTrimFill = api;
})(typeof window !== "undefined" ? window : globalThis);
