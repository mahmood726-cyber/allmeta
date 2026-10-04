/* shared/dta-bivariate.js — bivariate random-effects model for diagnostic test accuracy
 * (Reitsma et al. 2005) in PURE JavaScript (no R / no WASM), reproducing mada::reitsma().
 *
 * Per study yᵢ = (logit TPRᵢ, logit FPRᵢ) ~ BVN(Xᵢβ, Ψ + Sᵢ), with Sᵢ = diag(1/TP+1/FN, 1/FP+1/TN)
 * the within-study (binomial-logit) covariance and Ψ the between-study covariance. As in mada
 * 0.5.12 (which calls mvmeta 1.0.3's mvmeta.fit) the model is fitted by
 *   "reml" (default) / "ml"  10 IGLS iterations from Ψ = 0.001·I, then BFGS (a port of R's
 *                            optim/vmmin) on the lower-Cholesky parameters of Ψ with the analytic
 *                            gradient, reltol = sqrt(eps), maxit = 100
 *   "fixed"                  Ψ = 0
 *   "mm"                     multivariate method of moments (Jackson, White & Riley 2013)
 *   "vc"                     iterative variance-components estimator (residuals adjusted)
 * Continuity correction (default 0.5), correction.control as mada: "all" (every cell of every
 * study when any cell is zero; mada's default), "single" (only studies with a zero cell), "none"
 * (refused when a cell is zero, as mada fails). Study-level covariates give a bivariate
 * meta-regression (opts.X: one row of covariates per study, intercept first).
 * Outputs follow mada: coefficients, vcov, Ψ, the Jacobian-adjusted log-likelihood, AIC, BIC,
 * summary sensitivity/FPR with Wald CIs on the logit scale, the Rutter–Gatsonis (HSROC)
 * parameters, the SROC curve (Rutter–Gatsonis or naive), AUC and partial AUC, and the 95%
 * confidence (vcov) and prediction (Ψ + vcov) regions. Parity with mada on all six mada datasets
 * × 5 methods × 3 correction rules (+ meta-regression): dta-bivariate-mada-parity.spec.mjs.
 *
 * Also: LR± with delta-method CIs, the diagnostic odds ratio, the Moses–Littenberg SROC
 * regression (mada::mslSROC), Spearman threshold correlation, Fagan nomogram, Deeks' test.
 *
 * References: Reitsma JB et al. J Clin Epidemiol 2005;58:982-90. Harbord RM et al. Biostatistics
 * 2007;8:239-51. Doebler P, Holling H. mada (R package). Gasparrini A et al. Stat Med
 * 2012;31:3821-39 (mvmeta). Jackson D, White IR, Riley RD. Biom J 2013;55:231-45.
 */
(function (global) {
  "use strict";

  var LOG2PI = Math.log(2 * Math.PI), SQRT_EPS = 1.4901161193847656e-8, Z975 = 1.959963984540054;
  var _R95 = Math.sqrt(5.991464547107979); // sqrt(qchisq(0.95, 2))

  function DTAError(msg) { this.message = msg; this.name = "DTAError"; }
  DTAError.prototype = Object.create(Error.prototype);

  function _logit(p) { return Math.log(p / (1 - p)); }
  function _expit(x) { return 1 / (1 + Math.exp(-x)); }

  // ---- small dense-matrix helpers (same ports as shared/dose-response.js) ----
  function mz(r, c) { var M = []; for (var i = 0; i < r; i++) M.push(new Array(c).fill(0)); return M; }
  function mt(A) { var r = A.length, c = A[0].length, T = mz(c, r); for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) T[j][i] = A[i][j]; return T; }
  function mmul(A, B) {
    var r = A.length, n = B.length, c = B[0].length, C = mz(r, c);
    for (var i = 0; i < r; i++) for (var k = 0; k < n; k++) { var a = A[i][k]; if (a === 0) continue; for (var j = 0; j < c; j++) C[i][j] += a * B[k][j]; }
    return C;
  }
  function mvec(A, v) { return A.map(function (row) { var s = 0; for (var j = 0; j < v.length; j++) s += row[j] * v[j]; return s; }); }
  function madd(A, B) { return A.map(function (row, i) { return row.map(function (v, j) { return v + B[i][j]; }); }); }
  function trProd(A, B) { var s = 0; for (var i = 0; i < A.length; i++) for (var k = 0; k < B.length; k++) s += A[i][k] * B[k][i]; return s; }
  function crossp(A) { return mmul(mt(A), A); }
  function cholU(A) { // R chol(): upper U with U'U = A; null if not positive definite
    var n = A.length, U = mz(n, n);
    for (var j = 0; j < n; j++) {
      var s = A[j][j]; for (var k = 0; k < j; k++) s -= U[k][j] * U[k][j];
      if (!(s > 0)) return null;
      U[j][j] = Math.sqrt(s);
      for (var i = j + 1; i < n; i++) { var t = A[j][i]; for (var k2 = 0; k2 < j; k2++) t -= U[k2][j] * U[k2][i]; U[j][i] = t / U[j][j]; }
    }
    return U;
  }
  function invUpper(U) { // backsolve(U, diag(n))
    var n = U.length, X = mz(n, n);
    for (var c = 0; c < n; c++) for (var i = n - 1; i >= 0; i--) {
      var s = (i === c) ? 1 : 0; for (var k = i + 1; k < n; k++) s -= U[i][k] * X[k][c];
      X[i][c] = s / U[i][i];
    }
    return X;
  }
  function cholInv(A, what) { var U = cholU(A); if (!U) throw new DTAError((what || "matrix") + " is not positive definite"); var Ui = invUpper(U); return mmul(Ui, mt(Ui)); }
  function sumLogDiag(U) { var s = 0; for (var i = 0; i < U.length; i++) s += Math.log(U[i][i]); return s; }
  // Householder least squares (R qr.solve, full-rank tall matrix): coef and R.
  function qrLS(A, b) {
    var n = A.length, p = A[0].length, Q = A.map(function (r) { return r.slice(); }), y = b.slice(), i, j, c;
    if (n < p) throw new DTAError("more coefficients than observations");
    var cn = []; for (j = 0; j < p; j++) { var s0 = 0; for (i = 0; i < n; i++) s0 += A[i][j] * A[i][j]; cn.push(Math.sqrt(s0)); }
    for (j = 0; j < p; j++) {
      var norm = 0; for (i = j; i < n; i++) norm += Q[i][j] * Q[i][j]; norm = Math.sqrt(norm);
      if (!(norm > 1e-7 * cn[j])) throw new DTAError("the design matrix is rank-deficient (a covariate is constant or collinear)");
      var alpha = Q[j][j] > 0 ? -norm : norm, v = [];
      for (i = j; i < n; i++) v.push(Q[i][j]); v[0] -= alpha;
      var vn = 0; for (i = 0; i < v.length; i++) vn += v[i] * v[i];
      if (vn > 0) {
        for (c = j; c < p; c++) { var s = 0; for (i = j; i < n; i++) s += v[i - j] * Q[i][c]; var f = 2 * s / vn; for (i = j; i < n; i++) Q[i][c] -= f * v[i - j]; }
        var sy = 0; for (i = j; i < n; i++) sy += v[i - j] * y[i]; var fy = 2 * sy / vn; for (i = j; i < n; i++) y[i] -= fy * v[i - j];
      }
    }
    var R = mz(p, p); for (i = 0; i < p; i++) for (j = i; j < p; j++) R[i][j] = Q[i][j];
    var coef = new Array(p).fill(0);
    for (i = p - 1; i >= 0; i--) { var t = y[i]; for (j = i + 1; j < p; j++) t -= R[i][j] * coef[j]; coef[i] = t / R[i][i]; }
    return { coef: coef, R: R };
  }
  // 2×2 symmetric eigen-decomposition (closed form) and rebuild with floored eigenvalues
  function eig2(M) {
    var a = M[0][0], b = M[0][1], d = M[1][1], m = (a + d) / 2, r = Math.sqrt((a - d) * (a - d) / 4 + b * b);
    var l1 = m + r, l2 = m - r, v1;
    if (b !== 0) v1 = [l1 - d, b]; else v1 = a >= d ? [1, 0] : [0, 1];
    var nv = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]); v1 = [v1[0] / nv, v1[1] / nv];
    return { values: [l1, l2], vectors: [[v1[0], -v1[1]], [v1[1], v1[0]]] };
  }
  function floorEig(M, fl) { // V diag(pmax(values, fl)) V'  (mvmeta set.negeigen; iter.igls)
    var e = eig2(M), neg = 0, out = mz(2, 2), vals = e.values.map(function (v) { if (v < 0) neg++; return Math.max(v, fl); });
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) out[i][j] = e.vectors[i][0] * vals[0] * e.vectors[j][0] + e.vectors[i][1] * vals[1] * e.vectors[j][1];
    return { M: out, negeigen: neg };
  }

  // ---- R optim(method = "BFGS"): port of vmmin (src/appl/optim.c), minimising fn ----
  function vmmin(fn, gr, b0, maxit, reltol) {
    var n = b0.length, b = b0.slice(), stepredn = 0.2, acctol = 0.0001, reltest = 10.0;
    var f = fn(b); if (!isFinite(f)) throw new DTAError("initial value in 'vmmin' is not finite");
    var Fmin = f, funcount = 1, gradcount = 1, g = gr(b), iter = 1, ilast = gradcount, count, i, j, s;
    var t = new Array(n), X = new Array(n), c = new Array(n), B = mz(n, n), gradproj, steplength, accpoint, enough, D1, D2;
    do {
      if (ilast === gradcount) for (i = 0; i < n; i++) { for (j = 0; j < i; j++) B[i][j] = 0; B[i][i] = 1; }
      for (i = 0; i < n; i++) { X[i] = b[i]; c[i] = g[i]; }
      gradproj = 0;
      for (i = 0; i < n; i++) { s = 0; for (j = 0; j <= i; j++) s -= B[i][j] * g[j]; for (j = i + 1; j < n; j++) s -= B[j][i] * g[j]; t[i] = s; gradproj += s * g[i]; }
      if (gradproj < 0) {
        steplength = 1.0; accpoint = false;
        do {
          count = 0;
          for (i = 0; i < n; i++) { b[i] = X[i] + steplength * t[i]; if (reltest + X[i] === reltest + b[i]) count++; }
          if (count < n) { f = fn(b); funcount++; accpoint = isFinite(f) && (f <= Fmin + gradproj * steplength * acctol); if (!accpoint) steplength *= stepredn; }
        } while (!(count === n || accpoint));
        enough = (f > -Infinity) && Math.abs(f - Fmin) > reltol * (Math.abs(Fmin) + reltol);
        if (!enough) { count = n; Fmin = f; }
        if (count < n) {
          Fmin = f; g = gr(b); gradcount++; iter++; D1 = 0;
          for (i = 0; i < n; i++) { t[i] = steplength * t[i]; c[i] = g[i] - c[i]; D1 += t[i] * c[i]; }
          if (D1 > 0) {
            D2 = 0;
            for (i = 0; i < n; i++) { s = 0; for (j = 0; j <= i; j++) s += B[i][j] * c[j]; for (j = i + 1; j < n; j++) s += B[j][i] * c[j]; X[i] = s; D2 += s * c[i]; }
            D2 = 1.0 + D2 / D1;
            for (i = 0; i < n; i++) for (j = 0; j <= i; j++) B[i][j] += (D2 * t[i] * t[j] - X[i] * t[j] - t[i] * X[j]) / D1;
          } else ilast = gradcount;
        } else if (ilast < gradcount) { count = 0; ilast = gradcount; }
      } else { count = 0; if (ilast === gradcount) count = n; else ilast = gradcount; }
      if (iter >= maxit) break;
      if (gradcount - ilast > 2 * n) ilast = gradcount;
    } while (count !== n || ilast !== gradcount);
    return { x: b, f: Fmin, fail: iter < maxit ? 0 : 1, iter: iter };
  }

  // ---- data preparation (mada::reitsma.default) ----
  function _prep(rows, opts) {
    opts = opts || {};
    var cc = opts.correctionControl || "all", corr = opts.correction == null ? 0.5 : +opts.correction;
    if (["all", "single", "none"].indexOf(cc) < 0) throw new DTAError("correctionControl must be 'all', 'single' or 'none'");
    if (!(corr >= 0)) throw new DTAError("the continuity correction must be >= 0");
    var zero = function (r) { return r.tp === 0 || r.fp === 0 || r.fn === 0 || r.tn === 0; };
    var anyZero = rows.some(zero);
    return rows.map(function (r) {
      [r.tp, r.fp, r.fn, r.tn].forEach(function (v) { if (!(isFinite(v) && v >= 0)) throw new DTAError("cell counts must be non-negative numbers"); });
      var c = cc === "all" ? (anyZero ? corr : 0) : cc === "single" ? (zero(r) ? corr : 0) : 0;
      var tp = r.tp + c, fp = r.fp + c, fn = r.fn + c, tn = r.tn + c;
      var sens = tp / (tp + fn), fpr = fp / (fp + tn);
      if (!(sens > 0 && sens < 1 && fpr > 0 && fpr < 1)) throw new DTAError("a study has a zero cell and no continuity correction applies to it, so its logit sensitivity or false-positive rate is infinite (mada refuses this fit too). Use the correction rule 'all' or 'single'.");
      return {
        y: [_logit(sens), _logit(fpr)],
        S: [[sens * (1 - sens) / (tp + fn) * Math.pow(1 / sens + 1 / (1 - sens), 2), 0], [0, fpr * (1 - fpr) / (fp + tn) * Math.pow(1 / fpr + 1 / (1 - fpr), 2)]],
        logJac: Math.log(1 / sens + 1 / (1 - sens)) + Math.log(1 / fpr + 1 / (1 - fpr)),
        rawFpr: r.fp / (r.fp + r.tn),
      };
    });
  }

  // ---- mvmeta machinery, two outcomes; Xᵢ = I₂ ⊗ xᵢ (2 × 2p) ----
  function glsfit(ctx, Psi) {
    var o = { Ul: [], invUl: [], tUXl: [], tUX: [], tUy: [] };
    for (var i = 0; i < ctx.m; i++) {
      var U = cholU(madd(ctx.S[i], Psi)); if (!U) throw new DTAError("a marginal covariance matrix is not positive definite");
      var iU = invUpper(U), tiU = mt(iU), tX = mmul(tiU, ctx.X[i]), ty = mvec(tiU, ctx.y[i]);
      o.Ul.push(U); o.invUl.push(iU); o.tUXl.push(tX);
      Array.prototype.push.apply(o.tUX, tX); Array.prototype.push.apply(o.tUy, ty);
    }
    var qr = qrLS(o.tUX, o.tUy); o.coef = qr.coef; o.R = qr.R;
    return o;
  }
  function vcovOf(g) { var Ri = invUpper(g.R); return mmul(Ri, mt(Ri)); }
  function rss(g) { var s = 0, f = mvec(g.tUX, g.coef); for (var i = 0; i < f.length; i++) { var r = g.tUy[i] - f[i]; s += r * r; } return s; }
  function sumXWX(g) { var S = null; g.tUXl.forEach(function (A) { var C = crossp(A); S = S ? madd(S, C) : C; }); return S; }
  function loglik(ctx, Psi, reml) { // mvmeta mlprof.fn / remlprof.fn
    var g = glsfit(ctx, Psi), ll = -0.5 * (ctx.nall - (reml ? ctx.P : 0)) * LOG2PI - 0.5 * rss(g);
    g.Ul.forEach(function (U) { ll -= sumLogDiag(U); });
    if (reml) { var U2 = cholU(sumXWX(g)); if (!U2) throw new DTAError("X'WX is not positive definite"); ll -= sumLogDiag(U2); }
    return ll;
  }
  function parToPsi(p) { var L = [[p[0], 0], [p[1], p[2]]]; return mmul(L, mt(L)); }
  function llGrad(ctx, par, reml) { // mvmeta gradchol.reml / gradchol.ml
    var L = [[par[0], 0], [par[1], par[2]]], g = glsfit(ctx, mmul(L, mt(L)));
    var invS = g.invUl.map(function (iU) { return mmul(iU, mt(iU)); });
    var res = ctx.X.map(function (X, i) { var f = mvec(X, g.coef); return [ctx.y[i][0] - f[0], ctx.y[i][1] - f[1]]; });
    var iXWX = reml ? cholInv(sumXWX(g), "X'WX") : null;
    return [[0, 0], [1, 0], [1, 1]].map(function (ab) { // vech order: (1,1), (2,1), (2,2)
      var a = ab[0], bcol = ab[1], D = mz(2, 2);
      for (var j = 0; j < 2; j++) { D[a][j] += L[j][bcol]; D[j][a] += L[j][bcol]; }
      var gr = 0;
      for (var i = 0; i < ctx.m; i++) {
        var E = mmul(mmul(invS[i], D), invS[i]), r = res[i], Er = mvec(E, r);
        var F = r[0] * Er[0] + r[1] * Er[1], G = trProd(invS[i], D), H = 0;
        if (iXWX) H = trProd(iXWX, mmul(mmul(mt(ctx.X[i]), E), ctx.X[i]));
        gr += 0.5 * (F - G + H);
      }
      return gr;
    });
  }
  function iglsIter(ctx, Psi) { // mvmeta iter.igls (two outcomes, none missing)
    var g = glsfit(ctx, Psi), rowsZ = [], rowsF = [];
    var h = [[[1, 0], [0, 0]], [[0, 1], [1, 0]], [[0, 0], [0, 1]]]; // indicator matrices of xpndMat(1:3)
    for (var i = 0; i < ctx.m; i++) {
      var Sig = madd(ctx.S[i], Psi), f = mvec(ctx.X[i], g.coef), r = [ctx.y[i][0] - f[0], ctx.y[i][1] - f[1]];
      var K = mz(4, 4), a, b, c, d; // Sigma %x% Sigma
      for (a = 0; a < 2; a++) for (b = 0; b < 2; b++) for (c = 0; c < 2; c++) for (d = 0; d < 2; d++) K[a * 2 + c][b * 2 + d] = Sig[a][b] * Sig[c][d];
      var eU = cholU(K); if (!eU) throw new DTAError("IGLS: covariance is not positive definite");
      var tiE = mt(invUpper(eU)), fv = [], Z = [];
      for (var col = 0; col < 2; col++) for (var row = 0; row < 2; row++) { // column-major vec()
        fv.push(r[row] * r[col] - ctx.S[i][row][col]);
        Z.push(h.map(function (hm) { return hm[row][col]; }));
      }
      Array.prototype.push.apply(rowsZ, mmul(tiE, Z)); Array.prototype.push.apply(rowsF, mvec(tiE, fv));
    }
    var th = qrLS(rowsZ, rowsF).coef;
    return floorEig([[th[0], th[1]], [th[1], th[2]]], 1e-8).M;
  }
  function mmPsi(ctx) { // mvmeta.mm (two outcomes)
    var k = 2, m = ctx.m, g = glsfit(ctx, mz(2, 2)), N = m * k, a, b, c, d, i, j;
    var W = mz(N, N); g.invUl.forEach(function (iU, s) { var Wi = mmul(iU, mt(iU)); for (a = 0; a < k; a++) for (b = 0; b < k; b++) W[s * k + a][s * k + b] = Wi[a][b]; });
    var X = [], y = []; ctx.X.forEach(function (Xi, s) { Array.prototype.push.apply(X, Xi); Array.prototype.push.apply(y, ctx.y[s]); });
    var iXWX = cholInv(sumXWX(g), "X'WX"), H = mmul(mmul(mmul(X, iXWX), mt(X)), W), IH = mz(N, N);
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) IH[i][j] = (i === j ? 1 : 0) - H[i][j];
    var ry = mvec(IH, y), WO = mmul(W, ry.map(function (u) { return ry.map(function (v) { return u * v; }); }));
    var fbtr = function (A) { var Bt = mz(k, k); for (var s = 0; s < m; s++) for (a = 0; a < k; a++) for (b = 0; b < k; b++) Bt[a][b] += A[s * k + a][s * k + b]; return Bt; };
    var Qm = fbtr(WO), A = mmul(mt(IH), W), Bm = mt(IH), btrB = fbtr(Bm), tBA = mz(k * k, k * k);
    for (var s1 = 0; s1 < m; s1++) for (var s2 = 0; s2 < m; s2++)
      for (a = 0; a < k; a++) for (b = 0; b < k; b++) for (c = 0; c < k; c++) for (d = 0; d < k; d++)
        tBA[b * k + d][a * k + c] += Bm[s1 * k + a][s2 * k + b] * A[s1 * k + c][s2 * k + d]; // sum of t(B_blk %x% A_blk)
    var rhs = []; for (b = 0; b < k; b++) for (a = 0; a < k; a++) rhs.push(Qm[a][b] - btrB[a][b]);
    var v = qrLS(tBA, rhs).coef, off = (v[1] + v[2]) / 2;
    return floorEig([[v[0], off], [off, v[3]]], SQRT_EPS);
  }
  function invSqrt2(M) { // principal inverse square root of a 2×2 matrix with positive real eigenvalues
    var det = M[0][0] * M[1][1] - M[0][1] * M[1][0], sd = Math.sqrt(det), t = Math.sqrt(M[0][0] + M[1][1] + 2 * sd);
    if (!(det > 0 && t > 0)) throw new DTAError("variance components: the residual adjustment is singular");
    var R = [[(M[0][0] + sd) / t, M[0][1] / t], [M[1][0] / t, (M[1][1] + sd) / t]], dr = R[0][0] * R[1][1] - R[0][1] * R[1][0];
    return [[R[1][1] / dr, -R[0][1] / dr], [-R[1][0] / dr, R[0][0] / dr]];
  }
  function vcFit(ctx) { // mvmeta.vc with vc.adj = TRUE, reltol = sqrt(eps), maxiter = 100
    var Psi = mz(2, 2), niter = 0, converged = false, g, negeigen = 0;
    while (!converged && niter < 100) {
      var old = Psi; g = glsfit(ctx, Psi);
      var iXWX = cholInv(sumXWX(g), "X'WX"), M = mz(2, 2), S0 = mz(2, 2);
      for (var i = 0; i < ctx.m; i++) {
        var X = ctx.X[i], f = mvec(X, g.coef), r = [ctx.y[i][0] - f[0], ctx.y[i][1] - f[1]];
        var W = mmul(g.invUl[i], mt(g.invUl[i])), Hh = mmul(mmul(mmul(X, iXWX), mt(X)), W);
        var ra = mvec(invSqrt2([[1 - Hh[0][0], -Hh[0][1]], [-Hh[1][0], 1 - Hh[1][1]]]), r);
        for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) { M[a][b] += ra[a] * ra[b]; S0[a][b] += ctx.S[i][a][b]; }
      }
      var P = [[0, 0], [0, 0]];
      for (var u = 0; u < 2; u++) for (var w = 0; w < 2; w++) P[u][w] = M[u][w] / ctx.m - S0[u][w] / ctx.m;
      var fe = floorEig(P, SQRT_EPS); Psi = fe.M; negeigen = fe.negeigen; niter++;
      converged = true;
      for (u = 0; u < 2; u++) for (w = 0; w < 2; w++) if (!(Math.abs(Psi[u][w] - old[u][w]) < SQRT_EPS * Math.abs(Psi[u][w] + SQRT_EPS))) converged = false;
    }
    return { Psi: Psi, gls: g, converged: converged, niter: niter, negeigen: negeigen }; // coef/vcov from the last GLS step, as mvmeta
  }

  // fit(rows, opts) — rows: [{tp, fp, fn, tn}]; opts: { method: "reml" (default) | "ml" | "fixed" |
  //   "mm" | "vc", correction: 0.5, correctionControl: "all" (default) | "single" | "none",
  //   X: [[1, x1, ...], ...] (optional design, one row per study, intercept first: bivariate
  //   meta-regression), covariateNames: ["(Intercept)", ...] }. Needs k >= 4 studies.
  function fit(rows, opts) {
    opts = opts || {};
    var method = String(opts.method || "reml").toLowerCase();
    if (["reml", "ml", "fixed", "mm", "vc"].indexOf(method) < 0) throw new DTAError("unknown method '" + method + "'");
    var k = rows.length;
    if (k < 4) throw new DTAError("dta-bivariate: the bivariate model needs k >= 4 studies (got k=" + k + "); the between-study covariance is not identifiable below k=4.");
    var st = _prep(rows, opts);
    var Xd = opts.X || rows.map(function () { return [1]; }), p = Xd[0].length;
    if (Xd.length !== k || Xd.some(function (r) { return r.length !== p; })) throw new DTAError("the design matrix must have one row per study");
    if (k <= p + 1) throw new DTAError("too few studies for this many covariates");
    var ctx = { m: k, P: 2 * p, nall: 2 * k, y: st.map(function (s) { return s.y; }), S: st.map(function (s) { return s.S; }),
      X: Xd.map(function (x) { var z = new Array(p).fill(0); return [x.concat(z), z.concat(x)]; }) };
    var Psi, g, ll = NaN, converged = null, niter = null, negeigen = null;
    if (method === "fixed") {
      Psi = mz(2, 2); g = glsfit(ctx, Psi); ll = loglik(ctx, Psi, false);
    } else if (method === "reml" || method === "ml") {
      var reml = method === "reml", P0 = [[0.001, 0], [0, 0.001]];
      for (var it = 0; it < 10; it++) P0 = iglsIter(ctx, P0);
      var U0 = cholU(P0); if (!U0) throw new DTAError("initial between-study covariance is not positive definite");
      var opt = vmmin(function (q) { return -loglik(ctx, parToPsi(q), reml); },
        function (q) { return llGrad(ctx, q, reml).map(function (v) { return -v; }); }, [U0[0][0], U0[0][1], U0[1][1]], 100, SQRT_EPS);
      Psi = parToPsi(opt.x); g = glsfit(ctx, Psi); ll = -opt.f; converged = opt.fail === 0; niter = opt.iter;
    } else if (method === "mm") {
      var mm = mmPsi(ctx); Psi = mm.M; negeigen = mm.negeigen; g = glsfit(ctx, Psi);
    } else {
      var vc = vcFit(ctx); Psi = vc.Psi; g = vc.gls; converged = vc.converged; niter = vc.niter; negeigen = vc.negeigen;
    }
    var coef = g.coef, vcov = vcovOf(g), df = 2 * p + 3, names = opts.covariateNames || [];
    var sumJac = st.reduce(function (a, s) { return a + s.logJac; }, 0);
    var logLik = isFinite(ll) ? ll + sumJac : null; // mada adds the log-Jacobian of the logit transform
    var out = {
      method: method, correctionControl: opts.correctionControl || "all", correction: opts.correction == null ? 0.5 : +opts.correction,
      k: k, p: p, coef: coef, vcov: vcov, Psi: Psi, Sigma: Psi, logLik: logLik, df: df,
      AIC: logLik == null ? null : -2 * logLik + 2 * df, BIC: logLik == null ? null : -2 * logLik + Math.log(2 * k) * df,
      converged: converged, niter: niter, negeigen: negeigen, metaRegression: p > 1,
      coefTable: coef.map(function (b, i) {
        var se = Math.sqrt(vcov[i][i]), z = b / se, j = i % p;
        return { outcome: i < p ? "logit sensitivity" : "logit FPR", term: names[j] || (j === 0 ? "(Intercept)" : "x" + j),
          estimate: b, se: se, z: z, p: 2 * _pnormUpper(Math.abs(z)), ci: [b - Z975 * se, b + Z975 * se] };
      }),
      rawFpr: st.map(function (s) { return s.rawFpr; }),
    };
    if (p === 1) {
      var mu = [coef[0], coef[1]], covMu = vcov;
      var Se = _expit(mu[0]), FPR = _expit(mu[1]), Sp = 1 - FPR;
      var ci = function (m, v) { var s = Math.sqrt(v); return [_expit(m - Z975 * s), _expit(m + Z975 * s)]; };
      var seCI = ci(mu[0], covMu[0][0]), fprCI = ci(mu[1], covMu[1][1]);
      var lrPos = Se / FPR, lrNeg = (1 - Se) / Sp;
      // delta method for log LR± from the logit-scale covariance of the summary point
      var seLogLRpos = Math.sqrt(Math.max(0, (1 - Se) * (1 - Se) * covMu[0][0] + (1 - FPR) * (1 - FPR) * covMu[1][1] - 2 * (1 - Se) * (1 - FPR) * covMu[0][1]));
      var seLogLRneg = Math.sqrt(Math.max(0, Se * Se * covMu[0][0] + FPR * FPR * covMu[1][1] - 2 * Se * FPR * covMu[0][1]));
      Object.assign(out, {
        muLogitSe: mu[0], muLogitFPR: mu[1], covMu: covMu,
        sens: Se, spec: Sp, fpr: FPR, sensCI: seCI, fprCI: fprCI, specCI: [1 - fprCI[1], 1 - fprCI[0]],
        lrPos: lrPos, lrPosCI: [Math.exp(Math.log(lrPos) - Z975 * seLogLRpos), Math.exp(Math.log(lrPos) + Z975 * seLogLRpos)],
        lrNeg: lrNeg, lrNegCI: [Math.exp(Math.log(lrNeg) - Z975 * seLogLRneg), Math.exp(Math.log(lrNeg) + Z975 * seLogLRneg)],
        dor: lrPos / lrNeg,
      });
      var random = method !== "fixed" && Psi[0][0] > 0 && Psi[1][1] > 0;
      out.corRandom = random ? Psi[0][1] / Math.sqrt(Psi[0][0] * Psi[1][1]) : null;
      out.hsroc = random ? hsrocCoef(out) : null;
      if (random) { // Rutter–Gatsonis SROC (mada default): logit Se = Λ·exp(−β/2) + exp(−β)·logit FPR
        out.srocSlope = Math.exp(-out.hsroc.beta); out.srocIntercept = out.hsroc.Lambda * Math.exp(-out.hsroc.beta / 2);
        out.auc = { rg: aucPair(out, "ruttergatsonis"), naive: aucPair(out, "naive") };
      } else { out.srocSlope = null; out.srocIntercept = null; out.auc = null; }
    }
    return out;
  }
  // upper-tail standard normal probability, erfc by continued fraction / series (relative error ~1e-15)
  function _pnormUpper(z) {
    if (z < 0) return 1 - _pnormUpper(-z);
    var x = z / Math.SQRT2;
    if (x < 2) { // erf series
      var sum = x, term = x, n = 0;
      do { n++; term *= -x * x / n; sum += term / (2 * n + 1); } while (Math.abs(term / (2 * n + 1)) > 1e-17 * Math.abs(sum));
      return 0.5 * (1 - 2 / Math.sqrt(Math.PI) * sum);
    }
    var f = 0; for (var k = 60; k >= 1; k--) f = k / 2 / (x + f); // erfc continued fraction
    return 0.5 * Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  // Rutter–Gatsonis HSROC parameters implied by the bivariate fit (mada calc_hsroc_coef; Harbord 2007)
  function hsrocCoef(f) {
    var s1 = Math.sqrt(f.Psi[0][0]), s2 = Math.sqrt(f.Psi[1][1]), c = f.Psi[0][1], m1 = f.muLogitSe, m2 = f.muLogitFPR;
    return { Theta: 0.5 * (Math.sqrt(s2 / s1) * m1 + Math.sqrt(s1 / s2) * m2), Lambda: Math.sqrt(s2 / s1) * m1 - Math.sqrt(s1 / s2) * m2,
      beta: Math.log(s2 / s1), sigma2theta: 0.5 * (s1 * s2 + c), sigma2alpha: 2 * (s1 * s2 - c) };
  }
  // SROC sensitivity at a given FPR: "ruttergatsonis" (mada default) or "naive" (the regression of
  // logit Se on logit FPR implied by Ψ, slope Ψ12/Ψ22; mada calc.sroc).
  function srocAt(f, fpr, type) {
    if (type === "naive") { var th = f.Psi[0][1] / f.Psi[1][1]; return _expit(f.muLogitSe - th * f.muLogitFPR + th * _logit(fpr)); }
    return _expit(f.srocIntercept + f.srocSlope * _logit(fpr));
  }
  function _aucGrid(f, type, grid) { // mada AUC.default: trapezoid sum over the grid divided by its length
    var n = grid.length, sum = srocAt(f, grid[0], type) / 2 + srocAt(f, grid[n - 1], type) / 2;
    for (var i = 1; i < n - 1; i++) sum += srocAt(f, grid[i], type);
    return sum / n;
  }
  function aucPair(f, type) { // [AUC over FPR 0.01..0.99, partial AUC over the observed FPR range] (mada AUC.reitsma)
    var full = [], part = [], i;
    for (i = 1; i <= 99; i++) full.push(i / 100);
    var lo = Math.max(0.01, Math.min.apply(null, f.rawFpr)), hi = Math.min(0.99, Math.max.apply(null, f.rawFpr));
    for (i = 0; i < 99; i++) part.push(lo + (hi - lo) * i / 98);
    return [_aucGrid(f, type, full), _aucGrid(f, type, part)];
  }

  // SROC curve points [{fpr, tpr}] (Rutter–Gatsonis unless type = "naive"); empty without random effects.
  function srocCurve(f, n, type) {
    n = n || 50; var pts = [];
    if (f.srocSlope == null) return pts;
    for (var i = 0; i <= n; i++) { var fpr = 0.001 + 0.998 * i / n; pts.push({ fpr: fpr, tpr: srocAt(f, fpr, type || "ruttergatsonis") }); }
    return pts;
  }

  // 95% regions in ROC space, as mada: confidence region = ellipse of vcov (ROCellipse), prediction
  // region = ellipse of Ψ + vcov (plot.reitsma(predict = TRUE)); centred at the logit summary point,
  // radius √qchisq(.95, 2), back-transformed. kind: "confidence" (default) | "prediction".
  function regionEllipse(f, kind, n) {
    n = n || 100;
    var C = kind === "prediction" ? madd(f.Psi, f.covMu) : f.covMu, c0 = f.muLogitSe, c1 = f.muLogitFPR;
    var L00 = Math.sqrt(C[0][0]), L10 = C[1][0] / L00, L11 = Math.sqrt(Math.max(0, C[1][1] - L10 * L10)), pts = [];
    for (var i = 0; i <= n; i++) {
      var th = 2 * Math.PI * i / n, a = _R95 * Math.cos(th), b = _R95 * Math.sin(th);
      pts.push({ fpr: _expit(c1 + L10 * a + L11 * b), tpr: _expit(c0 + L00 * a) });
    }
    return pts;
  }

  // Moses–Littenberg SROC (mada mslSROC): OLS of D = logit Se − logit FPR on S = logit Se + logit FPR
  // after the chosen continuity correction; SROC line logit Se = A2 + B2·logit FPR.
  function mosesLittenberg(rows, opts) {
    var st = _prep(rows, opts), n = st.length; if (n < 3) return null;
    var D = st.map(function (s) { return s.y[0] - s.y[1]; }), S = st.map(function (s) { return s.y[0] + s.y[1]; });
    var mx = 0, my = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { mx += S[i] / n; my += D[i] / n; }
    for (i = 0; i < n; i++) { sxx += (S[i] - mx) * (S[i] - mx); sxy += (S[i] - mx) * (D[i] - my); }
    if (!(sxx > 0)) return null;
    var B1 = sxy / sxx, A1 = my - B1 * mx;
    return { A1: A1, B1: B1, A2: A1 / (1 - B1), B2: (1 + B1) / (1 - B1) };
  }

  // Spearman threshold-effect correlation between logit(TPR) and logit(FPR).
  function thresholdSpearman(rows, opts) {
    var st = _prep(rows, opts), n = st.length;
    function rank(a) { var idx = a.map(function (v, i) { return { v: v, i: i }; }).sort(function (p, q) { return p.v - q.v; }); var r = new Array(n), j = 0; while (j < n) { var t = j; while (t + 1 < n && idx[t + 1].v === idx[j].v) t++; var rk = (j + t) / 2 + 1; for (var m = j; m <= t; m++) r[idx[m].i] = rk; j = t + 1; } return r; }
    var r1 = rank(st.map(function (s) { return s.y[0]; })), r2 = rank(st.map(function (s) { return s.y[1]; }));
    var mb = (n + 1) / 2, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { var dx = r1[i] - mb, dy = r2[i] - mb; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  // Fagan nomogram: post-test probabilities from a pre-test probability + LR± (exact Bayes).
  function fagan(lrPos, lrNeg, preProb) {
    var preOdds = preProb / (1 - preProb), oPos = preOdds * lrPos, oNeg = preOdds * lrNeg;
    return { preProb: preProb, postPos: oPos / (1 + oPos), postNeg: oNeg / (1 + oNeg) };
  }

  // Deeks' funnel-plot asymmetry test for DTA (Deeks et al. 2005): regress lnDOR on 1/√ESS
  // (ESS = 4·n₁·n₀/(n₁+n₀)), weighted by ESS; t-test on the slope. +0.5 to studies with a zero cell.
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
    var rs = 0; for (var j = 0; j < n; j++) { var e = y[j] - intercept - slope * x[j]; rs += w[j] * e * e; }
    var df = n - 2; if (df <= 0) return null;
    var sigma2 = rs / df, seSlope = Math.sqrt(sigma2 * sw / det);
    var t = slope / seSlope, pv = 2 * (1 - _tcdf(Math.abs(t), df));
    return { slope: slope, intercept: intercept, t: t, df: df, p: pv, x: x, y: y };
  }
  function _lnGamma(x) { var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6]; var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); var s = 1.000000000190015; for (var j = 0; j < 6; j++) { y++; s += c[j] / y; } return -t + Math.log(2.5066282746310005 * s / x); }
  function _betacf(a, b, x) { var F = 1e-300, c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < F) d = F; d = 1 / d; var h = d; for (var m = 1; m <= 300; m++) { var m2 = 2 * m, aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d; h *= d * c; aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2)); d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; } return h; }
  function _betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; var bt = Math.exp(_lnGamma(a + b) - _lnGamma(a) - _lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b; }
  function _tcdf(t, df) { var x = df / (df + t * t), ib = 0.5 * _betai(df / 2, 0.5, x); return t >= 0 ? 1 - ib : ib; }

  var api = { fit: fit, srocCurve: srocCurve, srocAt: srocAt, regionEllipse: regionEllipse, mosesLittenberg: mosesLittenberg,
    thresholdSpearman: thresholdSpearman, fagan: fagan, deeksTest: deeksTest, DTAError: DTAError, _logit: _logit, _expit: _expit,
    _internal: { vmmin: vmmin, eig2: eig2, invSqrt2: invSqrt2, pnormUpper: _pnormUpper } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDTABivariate = api;
})(typeof window !== "undefined" ? window : globalThis);
