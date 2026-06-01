/* shared/dose-response.js — two-stage linear dose-response meta-analysis.
 *
 * Greenland & Longnecker (1992) / Orsini et al. (2006): pool the dose-response trend
 * across studies that each report a log-RR (or log-OR) at several dose levels versus a
 * common reference. The non-reference log-RRs WITHIN a study are correlated (shared
 * reference group); the GL method reconstructs that covariance from the cell counts.
 *
 * Pipeline (matches dosresmeta(..., method="reml"), linear, covariance="gl"):
 *  1. grl(): Newton reconstruction of adjusted case counts that reproduce the published
 *     log-RRs/variances (shared-reference Hessian).
 *  2. Per-study GL covariance, per the study's DESIGN TYPE:
 *       cc (case-control): s₀=1/A₀+1/(N₀−A₀),  sⱼ=s₀+1/Aⱼ+1/(Nⱼ−Aⱼ)
 *       ir (incidence-rate): s₀=1/A₀,          sⱼ=s₀+1/Aⱼ
 *       ci (cumulative-inc): s₀=1/A₀−1/N₀,     sⱼ=s₀+1/Aⱼ−1/Nⱼ
 *     Sⱼₖ = √(vⱼvₖ)·s₀/√(sⱼsₖ) off-diagonal, Sⱼⱼ = vⱼ (published).
 *  3. Within-study GLS slope (no intercept): β̂ⱼ = (dᵀS⁻¹y)/(dᵀS⁻¹d), Var = 1/(dᵀS⁻¹d).
 *  4. Stage 2: random-effects (REML) pool of the β̂ⱼ via shared/ma-core.js.
 *
 * IMPORTANT: the design type is PER-STUDY (a mixed dataset may contain cc/ir/ci studies).
 * Verified vs dosresmeta on alcohol_cvd (4 cc + 2 ci studies): pooled linear slope =
 * −0.00436541, se = 0.00588923, τ² = 0.00010057 → ~1e-6.
 *
 * Reference: Greenland S, Longnecker MP (1992), Am J Epidemiol 135:1301-1309;
 * Orsini N, Bellocco R, Greenland S (2006), Stata Journal 6:40-57.
 */
(function (global) {
  "use strict";

  function _solve(S, b) {
    var n = b.length, M = S.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      var d = M[c][c]; if (Math.abs(d) < 1e-300) return null;
      for (var j = c; j <= n; j++) M[c][j] /= d;
      for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = M[r2][c]; for (var j2 = c; j2 <= n; j2++) M[r2][j2] -= f * M[c][j2]; }
    }
    return M.map(function (r) { return r[n]; });
  }

  // GL Newton reconstruction of adjusted case counts. levels: {dose, cases, n, y, v, ref}.
  function _grl(levels, type) {
    var ir = (type === "ir");
    var totCases = levels.reduce(function (a, l) { return a + l.cases; }, 0);
    var nonref = [], refL = null;
    levels.forEach(function (l) { if (l.ref) refL = l; else nonref.push(l); });
    var Ax = nonref.map(function (l) { return l.cases; });
    for (var iter = 0; iter < 100; iter++) {
      var A0 = totCases - Ax.reduce(function (a, b) { return a + b; }, 0);
      var cx0 = ir ? 1 / A0 : 1 / A0 + 1 / (refL.n - A0);
      var e = nonref.map(function (l, j) {
        return ir
          ? l.y + Math.log(A0) + Math.log(l.n) - Math.log(Ax[j]) - Math.log(refL.n)
          : l.y + Math.log(A0) + Math.log(l.n - Ax[j]) - Math.log(Ax[j]) - Math.log(refL.n - A0);
      });
      var m = nonref.length, H = [];
      for (var i = 0; i < m; i++) H.push(new Array(m).fill(cx0));
      for (var i2 = 0; i2 < m; i2++) { var cxj = ir ? 1 / Ax[i2] : 1 / Ax[i2] + 1 / (nonref[i2].n - Ax[i2]); H[i2][i2] = cxj + cx0; }
      var dA = _solve(H, e); if (!dA) break;
      var maxd = 0; for (var k = 0; k < m; k++) { Ax[k] += dA[k]; maxd += dA[k] * dA[k]; }
      if (maxd < 1e-10) break;
    }
    var A0f = totCases - Ax.reduce(function (a, b) { return a + b; }, 0);
    return { Ax: Ax, A0: A0f, nonref: nonref, ref: refL };
  }

  function _studySlope(levels, type) {
    var g = _grl(levels, type), nonref = g.nonref, A0 = g.A0, N0 = g.ref.n, ir = (type === "ir"), ci = (type === "ci");
    // reference contribution s0 per design type
    var s0 = ir ? 1 / A0 : (ci ? 1 / A0 - 1 / N0 : 1 / A0 + 1 / (N0 - A0));
    var m = nonref.length;
    var si = nonref.map(function (l, j) {
      return s0 + (ir ? 1 / g.Ax[j] : (ci ? 1 / g.Ax[j] - 1 / l.n : 1 / g.Ax[j] + 1 / (l.n - g.Ax[j])));
    });
    var S = [];
    for (var a = 0; a < m; a++) {
      S.push(new Array(m));
      for (var b = 0; b < m; b++) S[a][b] = (a === b) ? nonref[a].v
        : Math.sqrt(nonref[a].v * nonref[b].v) * (s0 / Math.sqrt(si[a] * si[b]));
    }
    var d = nonref.map(function (l) { return l.dose; }), y = nonref.map(function (l) { return l.y; });
    var Sinv_d = _solve(S, d), Sinv_y = _solve(S, y);
    if (!Sinv_d || !Sinv_y) return null;
    var dSd = 0, dSy = 0;
    for (var i = 0; i < m; i++) { dSd += d[i] * Sinv_d[i]; dSy += d[i] * Sinv_y[i]; }
    if (!(dSd > 0)) return null;
    return { beta: dSy / dSd, varBeta: 1 / dSd };
  }

  // fit(studies, {type, method}) — studies: array of level arrays; each level
  // {dose, cases, n, logrr, se, type?}. Per-study type is read from the level's `type`
  // (default opts.type || 'cc'). Reference level has se null/NaN (v=0).
  function fit(studies, opts) {
    opts = opts || {};
    var defType = opts.type || "cc", method = opts.method || "REML";
    var per = [];
    studies.forEach(function (rows) {
      var type = (rows[0] && rows[0].type) || defType;
      var levels = rows.map(function (r) {
        var v = (r.se == null || isNaN(r.se)) ? 0 : r.se * r.se;
        return { dose: +r.dose, cases: +r.cases, n: +r.n, y: +r.logrr || 0, v: v, ref: v === 0 };
      });
      if (!levels.some(function (l) { return l.ref; })) return;
      var s = _studySlope(levels, type);
      if (s && isFinite(s.beta) && s.varBeta > 0) per.push(s);
    });
    if (per.length < 2) return { slope: per.length ? per[0].beta : NaN, se: NaN, tau2: 0, perStudy: per, k: per.length };
    var yi = per.map(function (p) { return p.beta; }), vi = per.map(function (p) { return p.varBeta; });
    var pooled = global.AlmMaCore.pool(yi, vi, { method: method });
    return { slope: pooled.mu, se: pooled.se, tau2: pooled.tau2, ciLo: pooled.ciLo, ciHi: pooled.ciHi, perStudy: per, k: per.length };
  }

  // ---- Restricted cubic spline (non-linear) dose-response ----
  // Generalises the two-stage GL pipeline to a coefficient VECTOR: per study a
  // multivariate GLS fit of the RCS basis, then a multivariate (mvmeta) REML pool.
  // Matches dosresmeta(formula = logrr ~ rcs(dose, k), method="reml").

  // R type-7 quantile on a sorted ascending array.
  function _quantile7(sorted, p) {
    var n = sorted.length; if (n === 1) return sorted[0];
    var h = (n - 1) * p, lo = Math.floor(h), frac = h - lo;
    return sorted[lo] + frac * (sorted[Math.min(lo + 1, n - 1)] - sorted[lo]);
  }
  // Harrell knot percentiles for k = 3,4,5 knots.
  var _KNOT_PCT = { 3: [0.10, 0.50, 0.90], 4: [0.05, 0.35, 0.65, 0.95], 5: [0.05, 0.275, 0.50, 0.725, 0.95] };
  function rcsKnots(doses, nk) {
    var s = doses.slice().sort(function (a, b) { return a - b; });
    return (_KNOT_PCT[nk] || _KNOT_PCT[3]).map(function (p) { return _quantile7(s, p); });
  }
  // Harrell restricted-cubic-spline basis: returns (nk-1) terms. First term is x; the
  // remaining are the truncated-power spline functions (Harrell, rms::rcspline.eval).
  function rcsBasis(x, kn) {
    var nk = kn.length, t1 = kn[0], tk = kn[nk - 1], tkm1 = kn[nk - 2], sc = (tk - t1) * (tk - t1);
    function pp(u) { return u > 0 ? u * u * u : 0; }
    var out = [x];
    for (var j = 0; j < nk - 2; j++) {
      var tj = kn[j];
      out.push((pp(x - tj) - pp(x - tkm1) * (tk - tj) / (tk - tkm1) + pp(x - tk) * (tkm1 - tj) / (tk - tkm1)) / sc);
    }
    return out;
  }

  // --- small dense-matrix helpers (p ≤ 5) ---
  function _matInv(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(r.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var t = A[c]; A[c] = A[p]; A[p] = t; var d = A[c][c]; if (Math.abs(d) < 1e-300) return null;
      for (var j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (var r2 = 0; r2 < n; r2++) { if (r2 === c) continue; var f = A[r2][c]; for (var j2 = 0; j2 < 2 * n; j2++) A[r2][j2] -= f * A[c][j2]; }
    }
    return A.map(function (r) { return r.slice(n); });
  }
  function _logdet(M) { // via LU with partial pivoting
    var n = M.length, A = M.map(function (r) { return r.slice(); }), ld = 0;
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (p !== c) { var t = A[c]; A[c] = A[p]; A[p] = t; }
      var d = A[c][c]; if (Math.abs(d) < 1e-300) return -Infinity; ld += Math.log(Math.abs(d));
      for (var r2 = c + 1; r2 < n; r2++) { var f = A[r2][c] / d; for (var j = c; j < n; j++) A[r2][j] -= f * A[c][j]; }
    }
    return ld;
  }
  function _matVec(M, v) { return M.map(function (row) { return row.reduce(function (a, x, j) { return a + x * v[j]; }, 0); }); }
  function _quad(W, v) { var Wv = _matVec(W, v), s = 0; for (var i = 0; i < v.length; i++) s += v[i] * Wv[i]; return s; }

  // Per-study multivariate GLS of the RCS basis (design rows = basis(dose)-basis(ref)).
  function _studyBetaMV(levels, type, knots) {
    var g = _grl(levels, type), nonref = g.nonref, A0 = g.A0, N0 = g.ref.n;
    var ir = (type === "ir"), ci = (type === "ci"), refDose = g.ref.dose, m = nonref.length, p = knots.length - 1;
    var s0 = ir ? 1 / A0 : (ci ? 1 / A0 - 1 / N0 : 1 / A0 + 1 / (N0 - A0));
    var si = nonref.map(function (l, j) { return s0 + (ir ? 1 / g.Ax[j] : (ci ? 1 / g.Ax[j] - 1 / l.n : 1 / g.Ax[j] + 1 / (l.n - g.Ax[j]))); });
    var S = [], a, b;
    for (a = 0; a < m; a++) { S.push(new Array(m)); for (b = 0; b < m; b++) S[a][b] = (a === b) ? nonref[a].v : Math.sqrt(nonref[a].v * nonref[b].v) * (s0 / Math.sqrt(si[a] * si[b])); }
    var refB = rcsBasis(refDose, knots);
    var D = nonref.map(function (l) { var bb = rcsBasis(l.dose, knots); return bb.map(function (v, i) { return v - refB[i]; }); }); // m×p
    var y = nonref.map(function (l) { return l.y; });
    var Sinv = _matInv(S); if (!Sinv) return null;
    // A = Dᵀ S⁻¹ D (p×p), gvec = Dᵀ S⁻¹ y
    var A = [], gv = new Array(p).fill(0), i, j, r;
    for (i = 0; i < p; i++) { A.push(new Array(p).fill(0)); }
    var SinvD = D.map(function () { return null; }); // compute S⁻¹D as m×p
    var SD = [];
    for (r = 0; r < m; r++) { SD.push(new Array(p).fill(0)); for (var c2 = 0; c2 < p; c2++) { var acc = 0; for (var rr = 0; rr < m; rr++) acc += Sinv[r][rr] * D[rr][c2]; SD[r][c2] = acc; } }
    var Sy = _matVec(Sinv, y);
    for (i = 0; i < p; i++) { for (r = 0; r < m; r++) { gv[i] += D[r][i] * Sy[r]; for (j = 0; j < p; j++) A[i][j] += D[r][i] * SD[r][j]; } }
    var Ainv = _matInv(A); if (!Ainv) return null;
    return { beta: _matVec(Ainv, gv), cov: Ainv };
  }

  function _nelderMead(f, x0, step, maxit) {
    var n = x0.length, simplex = [x0.slice()], fv = [f(x0)], i, j;
    for (i = 0; i < n; i++) { var pt = x0.slice(); pt[i] += step; simplex.push(pt); fv.push(f(pt)); }
    function order() { var idx = fv.map(function (v, k) { return k; }).sort(function (a, b) { return fv[a] - fv[b]; }); simplex = idx.map(function (k) { return simplex[k]; }); fv = idx.map(function (k) { return fv[k]; }); }
    for (var it = 0; it < (maxit || 400); it++) {
      order();
      var c = new Array(n).fill(0); for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      var xr = c.map(function (cc, k) { return cc + (cc - simplex[n][k]); }), fr = f(xr);
      if (fr < fv[0]) { var xe = c.map(function (cc, k) { return cc + 2 * (xr[k] - cc); }), fe = f(xe); if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { simplex[n] = xr; fv[n] = fr; }
      else { var xc = c.map(function (cc, k) { return cc + 0.5 * (simplex[n][k] - cc); }), fc = f(xc);
        if (fc < fv[n]) { simplex[n] = xc; fv[n] = fc; }
        else { for (var s2 = 1; s2 <= n; s2++) { simplex[s2] = simplex[0].map(function (x0v, k) { return x0v + 0.5 * (simplex[s2][k] - x0v); }); fv[s2] = f(simplex[s2]); } } }
    }
    order(); return { x: simplex[0], f: fv[0] };
  }

  // Multivariate (mvmeta) REML pool of per-study {beta (p), cov (p×p)} with a full p×p Ψ.
  function _poolMV(per, p) {
    // warm start Ψ: max(0, between-study cov of β̂ − mean within cov), diagonal.
    var k = per.length, i, j, d;
    var mb = new Array(p).fill(0); per.forEach(function (s) { for (i = 0; i < p; i++) mb[i] += s.beta[i] / k; });
    var Psi0 = []; for (i = 0; i < p; i++) { Psi0.push(new Array(p).fill(0)); }
    per.forEach(function (s) { for (i = 0; i < p; i++) for (j = 0; j < p; j++) Psi0[i][j] += (s.beta[i] - mb[i]) * (s.beta[j] - mb[j]) / (k - 1) - s.cov[i][j] / k; });
    for (i = 0; i < p; i++) if (!(Psi0[i][i] > 0)) Psi0[i][i] = 1e-4;
    // Cholesky params of Ψ (lower-tri, length p(p+1)/2). Init from chol(Psi0 diag-fixed).
    function cholOf(M) { var L = []; for (i = 0; i < p; i++) { L.push(new Array(p).fill(0)); for (j = 0; j <= i; j++) { var s = M[i][j]; for (d = 0; d < j; d++) s -= L[i][d] * L[j][d]; L[i][j] = (i === j) ? Math.sqrt(Math.max(1e-8, s)) : s / L[j][j]; } } return L; }
    var L0 = cholOf(Psi0), x0 = []; for (i = 0; i < p; i++) for (j = 0; j <= i; j++) x0.push(L0[i][j]);
    function PsiOf(x) { var L = [], t = 0; for (i = 0; i < p; i++) { L.push(new Array(p).fill(0)); for (j = 0; j <= i; j++) L[i][j] = x[t++]; }
      var P = []; for (i = 0; i < p; i++) { P.push(new Array(p).fill(0)); for (j = 0; j < p; j++) { var s = 0; for (d = 0; d <= Math.min(i, j); d++) s += L[i][d] * L[j][d]; P[i][j] = s; } } return P; }
    function negLL(x) {
      var Psi = PsiOf(x), sumW = [], i2, j2; for (i2 = 0; i2 < p; i2++) sumW.push(new Array(p).fill(0));
      var sumWb = new Array(p).fill(0), ll = 0, Ws = [];
      for (var t = 0; t < k; t++) {
        var V = per[t].cov.map(function (row, ii) { return row.map(function (v, jj) { return v + Psi[ii][jj]; }); });
        var ldV = _logdet(V); var W = _matInv(V); if (!W || ldV === -Infinity) return 1e12;
        Ws.push(W); ll += ldV;
        for (i2 = 0; i2 < p; i2++) { for (j2 = 0; j2 < p; j2++) sumW[i2][j2] += W[i2][j2]; }
      }
      var sumWinv = _matInv(sumW); if (!sumWinv) return 1e12;
      for (var t2 = 0; t2 < k; t2++) { var Wb = _matVec(Ws[t2], per[t2].beta); for (i2 = 0; i2 < p; i2++) sumWb[i2] += Wb[i2]; }
      var bhat = _matVec(sumWinv, sumWb);
      for (var t3 = 0; t3 < k; t3++) { var dvec = per[t3].beta.map(function (v, ii) { return v - bhat[ii]; }); ll += _quad(Ws[t3], dvec); }
      ll += _logdet(sumW);
      return 0.5 * ll;
    }
    var opt = _nelderMead(negLL, x0, 0.01, 600);
    // recover β̂ and Cov(β̂) at the optimum
    var Psi = PsiOf(opt.x), sumW = [], i3, j3; for (i3 = 0; i3 < p; i3++) sumW.push(new Array(p).fill(0));
    var sumWb = new Array(p).fill(0), Ws = [];
    for (var t = 0; t < k; t++) { var V = per[t].cov.map(function (row, ii) { return row.map(function (v, jj) { return v + Psi[ii][jj]; }); }); var W = _matInv(V); Ws.push(W); for (i3 = 0; i3 < p; i3++) for (j3 = 0; j3 < p; j3++) sumW[i3][j3] += W[i3][j3]; }
    var covBeta = _matInv(sumW);
    for (var t2 = 0; t2 < k; t2++) { var Wb = _matVec(Ws[t2], per[t2].beta); for (i3 = 0; i3 < p; i3++) sumWb[i3] += Wb[i3]; }
    var bhat = _matVec(covBeta, sumWb);
    return { beta: bhat, cov: covBeta, Psi: Psi, negLL: opt.f };
  }

  // fitSpline(studies, {type, nk}) — non-linear RCS dose-response. studies: array of
  // level arrays (same row shape as fit()). Returns pooled basis coefficients + a
  // predict(dose, refDose) → {logRR, se} and the knot locations.
  function fitSpline(studies, opts) {
    opts = opts || {};
    var defType = opts.type || "cc", nk = opts.nk || 3;
    var allDoses = [];
    studies.forEach(function (rows) { rows.forEach(function (r) { allDoses.push(+r.dose); }); });
    var knots = rcsKnots(allDoses, nk), p = nk - 1, per = [];
    studies.forEach(function (rows) {
      var type = (rows[0] && rows[0].type) || defType;
      var levels = rows.map(function (r) { var v = (r.se == null || isNaN(r.se)) ? 0 : r.se * r.se; return { dose: +r.dose, cases: +r.cases, n: +r.n, y: +r.logrr || 0, v: v, ref: v === 0 }; });
      if (!levels.some(function (l) { return l.ref; })) return;
      var s = _studyBetaMV(levels, type, knots);
      if (s && s.beta.every(isFinite)) per.push(s);
    });
    if (per.length < 2) return { beta: null, knots: knots, k: per.length, perStudy: per };
    var pooled = _poolMV(per, p);
    function predict(dose, refDose) {
      refDose = refDose || 0;
      var c = rcsBasis(dose, knots).map(function (v, i) { return v - rcsBasis(refDose, knots)[i]; });
      var logRR = c.reduce(function (a, v, i) { return a + v * pooled.beta[i]; }, 0);
      var se = Math.sqrt(Math.max(0, _quad(pooled.cov, c)));
      return { logRR: logRR, se: se, ciLo: logRR - 1.959963984540054 * se, ciHi: logRR + 1.959963984540054 * se };
    }
    return { beta: pooled.beta, cov: pooled.cov, Psi: pooled.Psi, knots: knots, k: per.length, perStudy: per, predict: predict };
  }

  var api = { fit: fit, fitSpline: fitSpline, rcsBasis: rcsBasis, rcsKnots: rcsKnots, _grl: _grl, _studySlope: _studySlope, _quantile7: _quantile7 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDoseResponse = api;
})(typeof window !== "undefined" ? window : globalThis);
