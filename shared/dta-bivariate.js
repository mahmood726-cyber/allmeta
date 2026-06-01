/* shared/dta-bivariate.js — genuine bivariate random-effects MLE for diagnostic test
 * accuracy (Reitsma et al. 2005), in PURE JavaScript (no R / no WASM).
 *
 * Models logit(sensitivity) and logit(false-positive-rate) jointly: per study
 *   yᵢ = (logit TPRᵢ, logit FPRᵢ) ~ BVN(μ, Σ + Sᵢ),
 * with Sᵢ = diag(1/TP+1/FN, 1/FP+1/TN) the within-study (binomial-logit) covariance and
 * Σ the between-study covariance (the heterogeneity the Moses-Littenberg SROC ignores).
 * Fitted by MAXIMUM LIKELIHOOD: Σ is parameterised by its Cholesky factor (guaranteeing
 * positive-definiteness), μ is profiled out by GLS at each step, and the 3-parameter
 * profile log-likelihood is maximised by Nelder-Mead. Continuity correction +0.5 is added
 * to all cells of any study with a zero cell.
 *
 * Verified vs mada::reitsma(method="ml") on the AuditC data:
 *   μ_logitSe = 2.07625908, μ_logitFPR = −1.26244709,
 *   Σ = [[1.22384177, 0.58323292], [0.58323292, 0.37488242]] → ~1e-4.
 *
 * Also returns the summary point (Se, Sp), likelihood ratios LR± with delta-method CIs,
 * the diagnostic odds ratio, and SROC-curve coefficients. No external dependency.
 *
 * Reference: Reitsma JB et al. (2005), J Clin Epidemiol 58:982-990; Harbord et al. (2007).
 */
(function (global) {
  "use strict";

  function _logit(p) { return Math.log(p / (1 - p)); }
  function _expit(x) { return 1 / (1 + Math.exp(-x)); }
  function _inv2(M) { var det = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return { det: det, inv: [[M[1][1] / det, -M[0][1] / det], [-M[1][0] / det, M[0][0] / det]] }; }

  function _prep(rows) {
    // rows: {tp, fp, fn, tn}. y=(logitTPR, logitFPR), within-study S diag.
    // Continuity correction (mada correction.control="all"): if ANY study has a zero cell,
    // add 0.5 to ALL studies' cells.
    var anyZero = rows.some(function (r) { return r.tp === 0 || r.fp === 0 || r.fn === 0 || r.tn === 0; });
    return rows.map(function (r) {
      var c = anyZero ? 0.5 : 0;
      var tp = r.tp + c, fp = r.fp + c, fn = r.fn + c, tn = r.tn + c;
      return {
        y: [Math.log(tp / fn), Math.log(fp / tn)],
        S: [1 / tp + 1 / fn, 1 / fp + 1 / tn],
      };
    });
  }

  // Profile ML: GLS μ for a given Σ, returning {mu, negLL}.
  function _profile(studies, Sigma) {
    var A = [[0, 0], [0, 0]], bvec = [0, 0], k = studies.length, Vinvs = [], dets = [];
    for (var i = 0; i < k; i++) {
      var s = studies[i];
      var V = [[Sigma[0][0] + s.S[0], Sigma[0][1]], [Sigma[1][0], Sigma[1][1] + s.S[1]]];
      var iv = _inv2(V); if (!(iv.det > 0)) return { negLL: 1e12 };
      Vinvs.push(iv.inv); dets.push(iv.det);
      A[0][0] += iv.inv[0][0]; A[0][1] += iv.inv[0][1]; A[1][0] += iv.inv[1][0]; A[1][1] += iv.inv[1][1];
      bvec[0] += iv.inv[0][0] * s.y[0] + iv.inv[0][1] * s.y[1];
      bvec[1] += iv.inv[1][0] * s.y[0] + iv.inv[1][1] * s.y[1];
    }
    var iA = _inv2(A); if (!(iA.det > 0)) return { negLL: 1e12 };
    var mu = [iA.inv[0][0] * bvec[0] + iA.inv[0][1] * bvec[1], iA.inv[1][0] * bvec[0] + iA.inv[1][1] * bvec[1]];
    var ll = 0;
    for (var j = 0; j < k; j++) {
      var d0 = studies[j].y[0] - mu[0], d1 = studies[j].y[1] - mu[1], iv2 = Vinvs[j];
      var quad = d0 * (iv2[0][0] * d0 + iv2[0][1] * d1) + d1 * (iv2[1][0] * d0 + iv2[1][1] * d1);
      ll += -Math.log(2 * Math.PI) - 0.5 * Math.log(dets[j]) - 0.5 * quad;
    }
    return { mu: mu, negLL: -ll, Vinvs: Vinvs };
  }

  function _nelderMead(f, x0, step, maxit) {
    var n = x0.length, simplex = [x0.slice()], i, j;
    for (i = 0; i < n; i++) { var p = x0.slice(); p[i] += step; simplex.push(p); }
    var fv = simplex.map(f);
    function order() { var idx = fv.map(function (v, i2) { return i2; }).sort(function (a, b) { return fv[a] - fv[b]; }); simplex = idx.map(function (i2) { return simplex[i2]; }); fv = idx.map(function (i2) { return fv[i2]; }); }
    for (var it = 0; it < (maxit || 4000); it++) {
      order(); if (Math.abs(fv[n] - fv[0]) < 1e-12) break;
      var c = new Array(n).fill(0); for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      var xr = c.map(function (cc, j2) { return cc + (cc - simplex[n][j2]); }), fr = f(xr);
      if (fr < fv[0]) { var xe = c.map(function (cc, j2) { return cc + 2 * (xr[j2] - cc); }), fe = f(xe); if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { simplex[n] = xr; fv[n] = fr; }
      else { var xc = c.map(function (cc, j2) { return cc + 0.5 * (simplex[n][j2] - cc); }), fc = f(xc);
        if (fc < fv[n]) { simplex[n] = xc; fv[n] = fc; }
        else { for (var s2 = 1; s2 <= n; s2++) { simplex[s2] = simplex[0].map(function (x0v, j2) { return x0v + 0.5 * (simplex[s2][j2] - x0v); }); fv[s2] = f(simplex[s2]); } } }
    }
    order(); return { x: simplex[0], f: fv[0] };
  }

  // fit(rows) — rows:[{tp,fp,fn,tn}]. Returns the bivariate ML fit + DTA summaries.
  function fit(rows) {
    var studies = _prep(rows), k = studies.length;
    // Cholesky params [log l11, l21, log l22] → Σ = L Lᵀ (PD). Warm start from moments.
    var v1 = [], v2 = []; studies.forEach(function (s) { v1.push(s.y[0]); v2.push(s.y[1]); });
    function vr(a) { var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length; return a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (a.length - 1); }
    var s1 = Math.sqrt(Math.max(0.1, vr(v1) * 0.5)), s2 = Math.sqrt(Math.max(0.1, vr(v2) * 0.5));
    var obj = function (p) {
      var l11 = Math.exp(p[0]), l21 = p[1], l22 = Math.exp(p[2]);
      var Sigma = [[l11 * l11, l11 * l21], [l11 * l21, l21 * l21 + l22 * l22]];
      return _profile(studies, Sigma).negLL;
    };
    var start = [Math.log(s1), 0, Math.log(s2)];
    var opt = _nelderMead(obj, start, 0.4, 6000);
    opt = _nelderMead(obj, opt.x, 0.05, 6000);
    var l11 = Math.exp(opt.x[0]), l21 = opt.x[1], l22 = Math.exp(opt.x[2]);
    var Sigma = [[l11 * l11, l11 * l21], [l11 * l21, l21 * l21 + l22 * l22]];
    var pr = _profile(studies, Sigma), mu = pr.mu;

    // Summary point + delta-method SEs for the means (from the GLS covariance of μ).
    var A = [[0, 0], [0, 0]];
    studies.forEach(function (s, i) { var iv = pr.Vinvs[i]; A[0][0] += iv[0][0]; A[0][1] += iv[0][1]; A[1][0] += iv[1][0]; A[1][1] += iv[1][1]; });
    var covMu = _inv2(A).inv; // var(μ_logitSe)=covMu[0][0], var(μ_logitFPR)=covMu[1][1]
    var Se = _expit(mu[0]), FPR = _expit(mu[1]), Sp = 1 - FPR;
    var z = 1.959963984540054;
    function ciLogit(m, v) { var s = Math.sqrt(v); return [_expit(m - z * s), _expit(m + z * s)]; }
    var seCI = ciLogit(mu[0], covMu[0][0]), fprCI = ciLogit(mu[1], covMu[1][1]);
    // LR+ = Se/FPR, LR- = (1-Se)/Sp ; delta-method on log scale.
    var lrPos = Se / FPR, lrNeg = (1 - Se) / Sp;
    // var(log LR+) ≈ (1-Se)/(Se·nSe-ish)… use the means' variances via delta on logit:
    // log LR+ = log(Se) - log(FPR). d log Se / d muSe = (1-Se); d log FPR / d muFPR = (1-FPR).
    var seLogLRpos = Math.sqrt((1 - Se) * (1 - Se) * covMu[0][0] + (1 - FPR) * (1 - FPR) * covMu[1][1]);
    // log LR- = log(1-Se) - log(Sp); d log(1-Se)/dmuSe = -Se ; d log(Sp)/dmuFPR = -(? Sp=1-FPR) = FPR
    var seLogLRneg = Math.sqrt(Se * Se * covMu[0][0] + FPR * FPR * covMu[1][1]);
    var DOR = lrPos / lrNeg;

    // SROC (Reitsma): logit(TPR) as a function of logit(FPR): slope = Σ12/Σ22·… use the
    // "mu" + the random-effects regression. Standard SROC line through μ with slope
    // b = Σ[1][2]/Σ[2][2] (regression of logit-TPR on logit-FPR).
    var srocSlope = Sigma[0][1] / Sigma[1][1];
    var srocIntercept = mu[0] - srocSlope * mu[1];

    return {
      k: k, muLogitSe: mu[0], muLogitFPR: mu[1], Sigma: Sigma, negLL: pr.negLL,
      sens: Se, spec: Sp, sensCI: seCI, specCI: [1 - fprCI[1], 1 - fprCI[0]],
      lrPos: lrPos, lrPosCI: [Math.exp(Math.log(lrPos) - z * seLogLRpos), Math.exp(Math.log(lrPos) + z * seLogLRpos)],
      lrNeg: lrNeg, lrNegCI: [Math.exp(Math.log(lrNeg) - z * seLogLRneg), Math.exp(Math.log(lrNeg) + z * seLogLRneg)],
      dor: DOR, srocSlope: srocSlope, srocIntercept: srocIntercept, covMu: covMu,
    };
  }

  // SROC curve points: TPR as a function of FPR over a grid (logit-linear regression line).
  function srocCurve(f, n) {
    n = n || 50; var pts = [];
    for (var i = 0; i <= n; i++) { var fpr = 0.001 + (0.998) * i / n; var lt = f.srocIntercept + f.srocSlope * _logit(fpr); pts.push({ fpr: fpr, tpr: _expit(lt) }); }
    return pts;
  }

  // 95% region ellipse in ROC space, matching mada's plot.reitsma exactly:
  //   confidence region → ellipse of covMu (vcov of the summary logit means),
  //   prediction region → ellipse of Σ (between-study covariance),
  // both centred at (μ_logitSe, μ_logitFPR) in logit space at radius
  // r=√qchisq(.95,2)≈2.4477, then back-transformed by expit. kind: "confidence"
  // (default) | "prediction". Ordering of C is [Se, FPR] (as covMu/Σ). See
  // dta-region-parity.spec.mjs (bounding box matches mada to ~1e-4).
  var _R95 = 2.4477468306808277; // Math.sqrt(qchisq(0.95, 2)) = sqrt(5.99146454...)
  function regionEllipse(f, kind, n) {
    n = n || 100;
    var C = (kind === "prediction") ? f.Sigma : f.covMu;
    var c0 = f.muLogitSe, c1 = f.muLogitFPR;
    // Lower-Cholesky L of C (ordering [Se, FPR]): L L' = C.
    var L00 = Math.sqrt(C[0][0]);
    var L10 = C[1][0] / L00;
    var L11 = Math.sqrt(Math.max(0, C[1][1] - L10 * L10));
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var th = 2 * Math.PI * i / n, a = _R95 * Math.cos(th), b = _R95 * Math.sin(th);
      var lSe = c0 + L00 * a;            // logit-Se coordinate
      var lFPR = c1 + L10 * a + L11 * b; // logit-FPR coordinate
      pts.push({ fpr: _expit(lFPR), tpr: _expit(lSe) });
    }
    return pts;
  }

  // Spearman threshold-effect correlation between logit(TPR) and logit(FPR).
  function thresholdSpearman(rows) {
    var st = _prep(rows), n = st.length;
    function rank(a) { var idx = a.map(function (v, i) { return { v: v, i: i }; }).sort(function (p, q) { return p.v - q.v; }); var r = new Array(n), j = 0; while (j < n) { var t = j; while (t + 1 < n && idx[t + 1].v === idx[j].v) t++; var rk = (j + t) / 2 + 1; for (var m = j; m <= t; m++) r[idx[m].i] = rk; j = t + 1; } return r; }
    var r1 = rank(st.map(function (s) { return s.y[0]; })), r2 = rank(st.map(function (s) { return s.y[1]; }));
    var mb = (n + 1) / 2, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { var dx = r1[i] - mb, dy = r2[i] - mb; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  // Fagan nomogram: post-test probabilities from a pre-test probability + LR± (exact Bayes).
  function fagan(lrPos, lrNeg, preProb) {
    var preOdds = preProb / (1 - preProb);
    var oPos = preOdds * lrPos, oNeg = preOdds * lrNeg;
    return { preProb: preProb, postPos: oPos / (1 + oPos), postNeg: oNeg / (1 + oNeg) };
  }

  // Deeks' funnel-plot asymmetry test for DTA (Deeks et al. 2005): regress lnDOR on
  // 1/√ESS (ESS = effective sample size = 4·n₁·n₀/(n₁+n₀)), weighted by ESS; the slope's
  // t-test p-value flags small-study/publication bias. Pure weighted least squares.
  function deeksTest(rows) {
    var x = [], y = [], w = [], n = rows.length;
    rows.forEach(function (r) {
      var tp = r.tp, fp = r.fp, fn = r.fn, tn = r.tn;
      if (tp === 0 || fp === 0 || fn === 0 || tn === 0) { tp += 0.5; fp += 0.5; fn += 0.5; tn += 0.5; }
      var n1 = tp + fn, n0 = fp + tn, ess = 4 * n1 * n0 / (n1 + n0);
      x.push(1 / Math.sqrt(ess)); y.push(Math.log((tp * tn) / (fp * fn))); w.push(ess);
    });
    var sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (var i = 0; i < n; i++) { sw += w[i]; swx += w[i] * x[i]; swy += w[i] * y[i]; swxx += w[i] * x[i] * x[i]; swxy += w[i] * x[i] * y[i]; }
    var det = sw * swxx - swx * swx; if (det === 0) return null;
    var slope = (sw * swxy - swx * swy) / det, intercept = (swxx * swy - swx * swxy) / det;
    var rss = 0; for (var j = 0; j < n; j++) { var e = y[j] - intercept - slope * x[j]; rss += w[j] * e * e; }
    var df = n - 2; if (df <= 0) return null;
    var sigma2 = rss / df, seSlope = Math.sqrt(sigma2 * sw / det);
    var t = slope / seSlope, p = 2 * (1 - _tcdf(Math.abs(t), df));
    return { slope: slope, intercept: intercept, t: t, df: df, p: p, x: x, y: y };
  }
  // Student-t CDF (regularised incomplete beta) for Deeks' p-value.
  function _lnGamma(x) { var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6]; var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); var s = 1.000000000190015; for (var j = 0; j < 6; j++) { y++; s += c[j] / y; } return -t + Math.log(2.5066282746310005 * s / x); }
  function _betacf(a, b, x) { var F = 1e-300, c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < F) d = F; d = 1 / d; var h = d; for (var m = 1; m <= 300; m++) { var m2 = 2 * m, aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d; h *= d * c; aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2)); d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; } return h; }
  function _betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; var bt = Math.exp(_lnGamma(a + b) - _lnGamma(a) - _lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b; }
  function _tcdf(t, df) { var x = df / (df + t * t), ib = 0.5 * _betai(df / 2, 0.5, x); return t >= 0 ? 1 - ib : ib; }

  var api = { fit: fit, srocCurve: srocCurve, regionEllipse: regionEllipse, thresholdSpearman: thresholdSpearman, fagan: fagan, deeksTest: deeksTest, _logit: _logit, _expit: _expit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDTABivariate = api;
})(typeof window !== "undefined" ? window : globalThis);
