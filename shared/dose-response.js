/* shared/dose-response.js — dose-response meta-analysis (dosresmeta-equivalent).
 *
 * Greenland & Longnecker (1992) / Orsini et al. (2006, 2012): pool dose-response curves across
 * studies that each report a log-RR (or log-OR) at several dose levels versus a reference level.
 * The non-reference log-RRs within a study share the reference group and are correlated; the GL
 * method reconstructs that covariance from the cell counts (Hamling et al. 2008 is the
 * alternative; "independent" ignores it).
 *
 * fitDR(studies, opts) ports the algorithms of the R packages dosresmeta 2.2.0 and mixmeta, and
 * reproduces dosresmeta on all 16 multi-study binary datasets it ships, across linear,
 * quadratic and restricted-cubic-spline models; GL/Hamling/independent covariance; two-stage
 * (REML/ML/MM/fixed, optional meta-regression) and one-stage (REML/ML/fixed) approaches; Q, Wald
 * and goodness-of-fit tests and predictions (hub/shared/tests/dose-response-dosresmeta-parity).
 * Doses enter relative to each study's reference dose, as in dosresmeta (center = TRUE).
 *
 * fit() (linear trend, per-study GLS slope pooled by shared/ma-core.js, so PM/DL are also
 * available) and fitSpline() (wrapper over fitDR) are kept for existing callers.
 *
 * History: up to allmeta 511aa72 the linear trend used raw rather than reference-relative doses
 * (wrong whenever a study's reference dose was not 0) and the spline pool used a Nelder–Mead
 * search that stopped far from the REML optimum for 4 knots; both are fixed here.
 *
 * References: Greenland S, Longnecker MP (1992) Am J Epidemiol 135:1301; Orsini N, Bellocco R,
 * Greenland S (2006) Stata J 6:40; Hamling J et al. (2008) Stat Med 27:954; Gasparrini A et al.
 * (2012) Stat Med 31:3821; Crippa A, Orsini N (2016) J Stat Softw 72(c01).
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
    var refDose = g.ref.dose, d = nonref.map(function (l) { return l.dose - refDose; }), y = nonref.map(function (l) { return l.y; }); // dose relative to the study's reference (dosresmeta center = TRUE)
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

  // ==========================================================================================
  // fitDR — dosresmeta-equivalent dose-response meta-analysis.
  //
  // Ports the algorithms of the R packages dosresmeta 2.2.0 (Crippa & Orsini) and mixmeta
  // (Gasparrini) so that, given the same data, the app reproduces dosresmeta's estimates:
  //   covariance  "gl" (grl), "h" (hamling: Nelder–Mead on the pseudo-count equations), "indep"
  //   design      dose relative to each study's reference row (dosresmeta center = TRUE)
  //   models      linear, quadratic, restricted cubic spline (rms::rcs basis; any knots)
  //   2stage      per-study GLS, then mixmeta.fit: "reml"/"ml" (10 (R)IGLS iterations from
  //               Ψ = 0.001·I, then BFGS = R's vmmin with the analytic gradient, reltol =
  //               sqrt(eps), maxit 100), "mm" (multivariate method of moments), "fixed";
  //               optional study-level covariate (meta-regression, dosresmeta `mod`)
  //   1stage      dosresmeta.reml/.ml (10 IGLS iterations from Ψ = 1e-4·I, then Nelder–Mead =
  //               R's nmmin, maxit 100) or "fixed"
  //   tests       qtest (Q, df, p; per coefficient), I², Wald (overall; non-linearity),
  //               gof (deviance, R², adjusted R², decorrelated residuals), predict (any xref)
  // ==========================================================================================
  var LOG2PI = Math.log(2 * Math.PI), SQRT_EPS = 1.4901161193847656e-8, Z975 = 1.959963984540054;

  function DRError(msg) { this.message = msg; this.name = "DRError"; }
  DRError.prototype = Object.create(Error.prototype);

  function mz(r, c) { var M = []; for (var i = 0; i < r; i++) M.push(new Array(c).fill(0)); return M; }
  function meye(n) { var M = mz(n, n); for (var i = 0; i < n; i++) M[i][i] = 1; return M; }
  function mt(A) { var r = A.length, c = A[0].length, T = mz(c, r); for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) T[j][i] = A[i][j]; return T; }
  function mmul(A, B) {
    var r = A.length, n = B.length, c = B[0].length, C = mz(r, c);
    for (var i = 0; i < r; i++) { var Ai = A[i], Ci = C[i]; for (var k = 0; k < n; k++) { var a = Ai[k]; if (a === 0) continue; var Bk = B[k]; for (var j = 0; j < c; j++) Ci[j] += a * Bk[j]; } }
    return C;
  }
  function mvec(A, v) { return A.map(function (row) { var s = 0; for (var j = 0; j < v.length; j++) s += row[j] * v[j]; return s; }); }
  function madd(A, B) { return A.map(function (row, i) { return row.map(function (v, j) { return v + B[i][j]; }); }); }
  function mtrace(A) { var s = 0; for (var i = 0; i < A.length; i++) s += A[i][i]; return s; }
  function trProd(A, B) { var s = 0, n = A.length, m = B.length; for (var i = 0; i < n; i++) for (var k = 0; k < m; k++) s += A[i][k] * B[k][i]; return s; }
  function crossp(A) { return mmul(mt(A), A); }
  // R chol(): upper-triangular U with U'U = A; null when A is not positive definite.
  function cholU(A) {
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
  function cholInv(A, what) { // chol2inv(chol(A))
    var U = cholU(A); if (!U) throw new DRError((what || "matrix") + " is not positive definite");
    var Ui = invUpper(U); return mmul(Ui, mt(Ui));
  }
  // Householder least squares (R qr.solve for a full-rank tall matrix): coef and R.
  function qrLS(A, b) {
    var n = A.length, p = A[0].length, Q = A.map(function (r) { return r.slice(); }), y = b.slice(), i, j, c;
    if (n < p) throw new DRError("singular matrix in least squares");
    var cn = []; for (j = 0; j < p; j++) { var s0 = 0; for (i = 0; i < n; i++) s0 += A[i][j] * A[i][j]; cn.push(Math.sqrt(s0)); }
    for (j = 0; j < p; j++) {
      var norm = 0; for (i = j; i < n; i++) norm += Q[i][j] * Q[i][j]; norm = Math.sqrt(norm);
      if (!(norm > 1e-7 * cn[j])) throw new DRError("singular matrix in least squares (rank-deficient design)");
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
  function vcovFromR(R) { var Ri = invUpper(R); return mmul(Ri, mt(Ri)); }
  // Symmetric eigen-decomposition (cyclic Jacobi).
  function symEigen(A) {
    var n = A.length, a = A.map(function (r) { return r.slice(); }), V = meye(n);
    for (var sweep = 0; sweep < 100; sweep++) {
      var off = 0; for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-300) break;
      for (p = 0; p < n; p++) for (q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        var th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (var k = 0; k < n; k++) { var akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (k = 0; k < n; k++) { var apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (k = 0; k < n; k++) { var vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: a.map(function (r, i) { return r[i]; }), vectors: V };
  }
  function fromEigen(e, vals) { var n = vals.length, M = mz(n, n); for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) { var s = 0; for (var k = 0; k < n; k++) s += e.vectors[i][k] * vals[k] * e.vectors[j][k]; M[i][j] = s; } return M; }
  function checkPD(M) { // mixmeta::checkPD(force = TRUE): negative eigenvalues -> sqrt(eps)
    var e = symEigen(M); if (!e.values.some(function (v) { return v < 0; })) return M;
    return fromEigen(e, e.values.map(function (v) { return v < 0 ? SQRT_EPS : v; }));
  }
  // vech (lower triangle, column-major) <-> matrices
  function vechIdx(k) { var r = []; for (var b = 0; b < k; b++) for (var a = b; a < k; a++) r.push([a, b]); return r; }
  function xpnd(v, k) { var M = mz(k, k); vechIdx(k).forEach(function (ab, t) { M[ab[0]][ab[1]] = v[t]; M[ab[1]][ab[0]] = v[t]; }); return M; }
  function parToL(par, k) { var L = mz(k, k); vechIdx(k).forEach(function (ab, t) { L[ab[0]][ab[1]] = par[t]; }); return L; }
  function parToPsi(par, k) { var L = parToL(par, k); return mmul(L, mt(L)); }
  function psiToPar(Psi) { var U = cholU(Psi); if (!U) throw new DRError("between-study covariance is not positive definite"); var L = mt(U); return vechIdx(Psi.length).map(function (ab) { return L[ab[0]][ab[1]]; }); }
  function kron(A, B) { var ra = A.length, ca = A[0].length, rb = B.length, cb = B[0].length, K = mz(ra * rb, ca * cb);
    for (var i = 0; i < ra; i++) for (var j = 0; j < ca; j++) for (var k = 0; k < rb; k++) for (var l = 0; l < cb; l++) K[i * rb + k][j * cb + l] = A[i][j] * B[k][l]; return K; }

  // chi-square upper tail: 1 - P(df/2, x/2) (regularised incomplete gamma)
  function lgam(x) { // Lanczos (g = 7, n = 9)
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgam(1 - x);
    x -= 1; var a = c[0], t = x + 7.5; for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); }
  function pchisqUpper(x, df) {
    if (!(x > 0)) return 1; var a = df / 2, z = x / 2, gln = lgam(a);
    if (z < a + 1) { var ap = a, sum = 1 / a, del = sum; for (var n = 0; n < 1000; n++) { ap++; del *= z / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; } return 1 - sum * Math.exp(-z + a * Math.log(z) - gln); }
    var b = z + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (var i = 1; i < 1000; i++) { var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var dl = d * c; h *= dl; if (Math.abs(dl - 1) < 1e-16) break; }
    return Math.exp(-z + a * Math.log(z) - gln) * h;
  }

  // ---- R optim(method = "Nelder-Mead"): port of nmmin (src/appl/optim.c) ----
  function nmmin(fn, x0, maxit, reltol) {
    var n = x0.length, n1 = n + 1, C = n + 2, big = 1.0e+35, alpha = 1, bet = 0.5, gamm = 2;
    var P = mz(n1, n + 2), Bvec = x0.slice(), f = fn(Bvec), funcount = 1, fail = 0, i, j, L, H, VH, VL, VR, size, oldsize, step, trystep, calcvert, temp;
    if (!isFinite(f)) throw new DRError("function cannot be evaluated at initial parameters");
    var convtol = reltol * (Math.abs(f) + reltol);
    P[n1 - 1][0] = f; for (i = 0; i < n; i++) P[i][0] = Bvec[i];
    L = 1; size = 0; step = 0;
    for (i = 0; i < n; i++) if (0.1 * Math.abs(Bvec[i]) > step) step = 0.1 * Math.abs(Bvec[i]);
    if (step === 0) step = 0.1;
    for (j = 2; j <= n1; j++) {
      for (i = 0; i < n; i++) P[i][j - 1] = Bvec[i];
      trystep = step; while (P[j - 2][j - 1] === Bvec[j - 2]) { P[j - 2][j - 1] = Bvec[j - 2] + trystep; trystep *= 10; }
      size += trystep;
    }
    oldsize = size; calcvert = true;
    do {
      if (calcvert) {
        for (j = 0; j < n1; j++) if (j + 1 !== L) { for (i = 0; i < n; i++) Bvec[i] = P[i][j]; f = fn(Bvec); if (!isFinite(f)) f = big; funcount++; P[n1 - 1][j] = f; }
        calcvert = false;
      }
      VL = P[n1 - 1][L - 1]; VH = VL; H = L;
      for (j = 1; j <= n1; j++) if (j !== L) { f = P[n1 - 1][j - 1]; if (f < VL) { L = j; VL = f; } if (f > VH) { H = j; VH = f; } }
      if (VH <= VL + convtol) break;
      for (i = 0; i < n; i++) { temp = -P[i][H - 1]; for (j = 0; j < n1; j++) temp += P[i][j]; P[i][C - 1] = temp / n; }
      for (i = 0; i < n; i++) Bvec[i] = (1 + alpha) * P[i][C - 1] - alpha * P[i][H - 1];
      f = fn(Bvec); if (!isFinite(f)) f = big; funcount++; VR = f;
      if (VR < VL) {
        P[n1 - 1][C - 1] = f;
        for (i = 0; i < n; i++) { f = gamm * Bvec[i] + (1 - gamm) * P[i][C - 1]; P[i][C - 1] = Bvec[i]; Bvec[i] = f; }
        f = fn(Bvec); if (!isFinite(f)) f = big; funcount++;
        if (f < VR) { for (i = 0; i < n; i++) P[i][H - 1] = Bvec[i]; P[n1 - 1][H - 1] = f; }
        else { for (i = 0; i < n; i++) P[i][H - 1] = P[i][C - 1]; P[n1 - 1][H - 1] = VR; }
      } else {
        if (VR < VH) { for (i = 0; i < n; i++) P[i][H - 1] = Bvec[i]; P[n1 - 1][H - 1] = VR; }
        for (i = 0; i < n; i++) Bvec[i] = (1 - bet) * P[i][H - 1] + bet * P[i][C - 1];
        f = fn(Bvec); if (!isFinite(f)) f = big; funcount++;
        if (f < P[n1 - 1][H - 1]) { for (i = 0; i < n; i++) P[i][H - 1] = Bvec[i]; P[n1 - 1][H - 1] = f; }
        else if (VR >= VH) {
          calcvert = true; size = 0;
          for (j = 0; j < n1; j++) if (j + 1 !== L) for (i = 0; i < n; i++) { P[i][j] = bet * (P[i][j] - P[i][L - 1]) + P[i][L - 1]; size += Math.abs(P[i][j] - P[i][L - 1]); }
          if (size < oldsize) oldsize = size; else { fail = 10; break; }
        }
      }
    } while (funcount <= maxit);
    var x = []; for (i = 0; i < n; i++) x.push(P[i][L - 1]);
    if (funcount > maxit) fail = 1;
    return { x: x, f: P[n1 - 1][L - 1], fail: fail, count: funcount };
  }

  // ---- R optim(method = "BFGS"): port of vmmin (src/appl/optim.c), minimising fn ----
  function vmmin(fn, gr, b0, maxit, reltol) {
    var n = b0.length, b = b0.slice(), stepredn = 0.2, acctol = 0.0001, reltest = 10.0;
    var f = fn(b); if (!isFinite(f)) throw new DRError("initial value in 'vmmin' is not finite");
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

  // ---- generalised least squares (mixmeta/dosresmeta glsfit) ----
  function glsfit(Xl, yl, Sigl) {
    var o = { Ul: [], invUl: [], tUXl: [], tUyl: [], tUX: [], tUy: [] };
    for (var i = 0; i < Xl.length; i++) {
      var U = cholU(Sigl[i]); if (!U) throw new DRError("a covariance matrix is not positive definite");
      var iU = invUpper(U), tiU = mt(iU), tX = mmul(tiU, Xl[i]), ty = mvec(tiU, yl[i]);
      o.Ul.push(U); o.invUl.push(iU); o.tUXl.push(tX); o.tUyl.push(ty);
      Array.prototype.push.apply(o.tUX, tX); Array.prototype.push.apply(o.tUy, ty);
    }
    var qr = qrLS(o.tUX, o.tUy); o.coef = qr.coef; o.R = qr.R;
    return o;
  }
  function glsRSS(g) { var s = 0, fit = mvec(g.tUX, g.coef); for (var i = 0; i < fit.length; i++) { var r = g.tUy[i] - fit[i]; s += r * r; } return s; }
  function sumLogDiag(U) { var s = 0; for (var i = 0; i < U.length; i++) s += Math.log(U[i][i]); return s; }
  function sumCross(l) { var S = null; l.forEach(function (A) { var C = crossp(A); S = S ? madd(S, C) : C; }); return S; }

  // Sigma_i = S_i + Z_i Psi Z_i' (Z_i = null: identity, the two-stage mixmeta case)
  function sigmas(ctx, Psi) { return ctx.S.map(function (S, i) { var Z = ctx.Z ? ctx.Z[i] : null; return madd(S, Z ? mmul(mmul(Z, Psi), mt(Z)) : Psi); }); }
  function loglik(ctx, Psi) {
    var g = glsfit(ctx.X, ctx.y, sigmas(ctx, Psi)), ll = -0.5 * glsRSS(g);
    g.Ul.forEach(function (U) { ll -= sumLogDiag(U); });
    if (ctx.reml) { var U2 = cholU(sumCross(g.tUXl)); if (!U2) throw new DRError("X'WX is not positive definite"); ll -= sumLogDiag(U2); }
    return ll + ctx.const;
  }
  // analytic gradient of the (RE)ML log-likelihood wrt the lower-Cholesky parameters of Psi
  // (mixmeta gradchol.reml / gradchol.ml; two-stage case Z = I)
  function llGrad(ctx, par) {
    var k = ctx.k, Lm = parToL(par, k), Psi = mmul(Lm, mt(Lm)), g = glsfit(ctx.X, ctx.y, sigmas(ctx, Psi));
    var invS = g.invUl.map(function (iU) { return mmul(iU, mt(iU)); });
    var res = ctx.X.map(function (X, i) { var f = mvec(X, g.coef); return ctx.y[i].map(function (v, j) { return v - f[j]; }); });
    var iXWX = ctx.reml ? cholInv(sumCross(g.tUXl), "X'WX") : null;
    return vechIdx(k).map(function (ab) {
      var a = ab[0], bcol = ab[1], D = mz(k, k);
      for (var j = 0; j < k; j++) { D[a][j] += Lm[j][bcol]; D[j][a] += Lm[j][bcol]; }
      var gr = 0;
      for (var i = 0; i < invS.length; i++) {
        var E = mmul(mmul(invS[i], D), invS[i]), r = res[i], F = 0, Er = mvec(E, r);
        for (var u = 0; u < r.length; u++) F += r[u] * Er[u];
        var G = trProd(invS[i], D), Hh = 0;
        if (iXWX) Hh = trProd(iXWX, mmul(mmul(mt(ctx.X[i]), E), ctx.X[i]));
        gr += 0.5 * (F - G + Hh);
      }
      return gr;
    });
  }
  // mixmeta rigls.iter (REML) / igls.iter (ML) for an unstructured Psi, Z = I
  function iglsIterMix(ctx, Psi) {
    var k = ctx.k, g = glsfit(ctx.X, ctx.y, sigmas(ctx, Psi));
    var invS = g.invUl.map(function (iU) { return mmul(iU, mt(iU)); });
    var iXWX = ctx.reml ? cholInv(crossp(g.tUX), "X'WX") : null; // solve(crossprod(invtUX))
    var pos = vechIdx(k), Q = pos.map(function (ab) { var M = mz(k, k); M[ab[0]][ab[1]] = 1; M[ab[1]][ab[0]] = 1; return M; });
    var T = pos.length, XtVX = mz(T, T), XtVy = new Array(T).fill(0);
    for (var i = 0; i < invS.length; i++) {
      var X = ctx.X[i], fit = mvec(X, g.coef), r = ctx.y[i].map(function (v, j) { return v - fit[j]; }), f = mz(k, k);
      for (var a = 0; a < k; a++) for (var b = 0; b < k; b++) f[a][b] = r[a] * r[b] - ctx.S[i][a][b];
      if (iXWX) f = madd(f, mmul(mmul(X, iXWX), mt(X)));
      var A = Q.map(function (Qt) { return mmul(Qt, invS[i]); }), Bm = mmul(f, invS[i]);
      for (var t1 = 0; t1 < T; t1++) { XtVy[t1] += trProd(A[t1], Bm); for (var t2 = 0; t2 < T; t2++) XtVX[t1][t2] += trProd(A[t1], A[t2]); }
    }
    return checkPD(xpnd(mvec(cholInv(XtVX, "IGLS system"), XtVy), k));
  }
  // dosresmeta iter.igls (one-stage initial values), ported verbatim including its basis matrices
  function iglsIterDR(ctx, Psi) {
    var q = ctx.k, npar = q * (q + 1) / 2, Sig = sigmas(ctx, Psi), g = glsfit(ctx.X, ctx.y, Sig);
    var lowPos = [], upPos = [], a, b;
    for (b = 0; b < q; b++) for (a = 0; a < q; a++) { if (a >= b) lowPos.push([a, b]); if (a <= b) upPos.push([a, b]); }
    var h = []; for (var x = 0; x < npar; x++) { var M = mz(q, q); M[lowPos[x][0]][lowPos[x][1]] = 1; M[upPos[x][0]][upPos[x][1]] = 1; h.push(M); }
    var rowsZ = [], rowsF = [];
    for (var i = 0; i < ctx.X.length; i++) {
      var X = ctx.X[i], Z = ctx.Z[i], ni = X.length, fit = mvec(X, g.coef), r = ctx.y[i].map(function (v, j) { return v - fit[j]; });
      var eU = cholU(kron(Sig[i], Sig[i])); if (!eU) throw new DRError("IGLS: covariance is not positive definite");
      var tiE = mt(invUpper(eU)), fvec = [], Zy = [];
      for (b = 0; b < ni; b++) for (a = 0; a < ni; a++) fvec.push(r[a] * r[b] - ctx.S[i][a][b]);
      var ZhZ = h.map(function (hm) { return mmul(mmul(Z, hm), mt(Z)); });
      for (b = 0; b < ni; b++) for (a = 0; a < ni; a++) Zy.push(ZhZ.map(function (m) { return m[a][b]; }));
      Array.prototype.push.apply(rowsZ, mmul(tiE, Zy)); Array.prototype.push.apply(rowsF, mvec(tiE, fvec));
    }
    var th = qrLS(rowsZ, rowsF).coef, e = symEigen(xpnd(th, q));
    return fromEigen(e, e.values.map(function (v) { return Math.max(v, 1e-8); }));
  }
  // multivariate method of moments (mixmeta.mm), two-stage, no missing outcomes
  function mmPsi(ctx) {
    var k = ctx.k, m = ctx.X.length, g = glsfit(ctx.X, ctx.y, ctx.S), N = m * k, P = ctx.X[0][0].length, i, j, a, b;
    var W = mz(N, N); g.invUl.forEach(function (iU, s) { var Wi = mmul(iU, mt(iU)); for (a = 0; a < k; a++) for (b = 0; b < k; b++) W[s * k + a][s * k + b] = Wi[a][b]; });
    var X = [], y = []; ctx.X.forEach(function (Xi, s) { Array.prototype.push.apply(X, Xi); Array.prototype.push.apply(y, ctx.y[s]); });
    var iXWX = cholInv(sumCross(g.tUXl), "X'WX"), H = mmul(mmul(mmul(X, iXWX), mt(X)), W), IH = mz(N, N);
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) IH[i][j] = (i === j ? 1 : 0) - H[i][j];
    var ry = mvec(IH, y), WO = mmul(W, ry.map(function (u) { return ry.map(function (v) { return u * v; }); }));
    var fbtr = function (A) { var Bt = mz(k, k); for (var s = 0; s < m; s++) for (a = 0; a < k; a++) for (b = 0; b < k; b++) Bt[a][b] += A[s * k + a][s * k + b]; return Bt; };
    var Qm = fbtr(WO), A = mmul(mt(IH), W), Bm = mt(IH), btrB = fbtr(Bm), tBA = mz(k * k, k * k);
    for (var s1 = 0; s1 < m; s1++) for (var s2 = 0; s2 < m; s2++) {
      var blk = function (M) { var o = mz(k, k); for (a = 0; a < k; a++) for (b = 0; b < k; b++) o[a][b] = M[s1 * k + a][s2 * k + b]; return o; };
      var K = kron(blk(Bm), blk(A)); for (a = 0; a < k * k; a++) for (b = 0; b < k * k; b++) tBA[a][b] += K[b][a];
    }
    var rhs = []; for (b = 0; b < k; b++) for (a = 0; a < k; a++) rhs.push(Qm[a][b] - btrB[a][b]);
    var v = qrLS(tBA, rhs).coef, P1 = mz(k, k); for (b = 0; b < k; b++) for (a = 0; a < k; a++) P1[a][b] = v[b * k + a];
    var Psi = mz(k, k); for (a = 0; a < k; a++) for (b = 0; b < k; b++) Psi[a][b] = (P1[a][b] + P1[b][a]) / 2;
    return checkPD(Psi);
  }

  // ---- within-study covariance of the non-reference log relative risks ----
  // levels: [{dose, cases, n, y, v}] with exactly one v == 0 row (the reference)
  function grlCounts(L, type) { // dosresmeta::grl (tol 1e-5), ported verbatim
    var ir = type === "ir", tot = 0, ref = -1, i, j;
    L.forEach(function (l, k) { tot += l.cases; if (l.v === 0) ref = k; });
    var Ax = L.map(function (l) { return l.cases; }), Axp = Ax.slice(), nr = [];
    for (i = 0; i < L.length; i++) if (i !== ref) nr.push(i);
    for (var it = 0; it < 1000; it++) {
      var A0 = tot; nr.forEach(function (k) { A0 -= Ax[k]; });
      var cx = L.map(function (l, k) { return ir ? 1 / Ax[k] : 1 / Ax[k] + 1 / (l.n - Ax[k]); });
      var e = nr.map(function (k) { var l = L[k]; return ir ? l.y + Math.log(A0) + Math.log(l.n) - Math.log(Ax[k]) - Math.log(L[ref].n)
        : l.y + Math.log(A0) + Math.log(l.n - Ax[k]) - Math.log(Ax[k]) - Math.log(L[ref].n - A0); });
      var H = nr.map(function (k, a) { return nr.map(function (k2, b) { return a === b ? cx[k] + cx[ref] : cx[ref]; }); });
      var dA = _solve(H, e); if (!dA) throw new DRError("Greenland–Longnecker reconstruction failed");
      Axp = Ax.slice(); Axp[ref] = A0; var delta = 0;
      nr.forEach(function (k, a) { Axp[k] = Ax[k] + dA[a]; delta += dA[a] * dA[a]; });
      if (delta < 1e-5) break;
      Ax = Axp;
    }
    return L.map(function (l, k) { return { A: Axp[k], N: l.n }; });
  }
  function hamlingCounts(L, type) { // dosresmeta::hamling (optim Nelder–Mead, defaults), ported verbatim
    var cc = type === "cc", ref = -1, sNA = 0, sA = 0, sN = 0;
    L.forEach(function (l, k) { if (l.v === 0) ref = k; sNA += l.n - l.cases; sA += l.cases; sN += l.n; });
    var p0 = cc ? (L[ref].n - L[ref].cases) / sNA : L[ref].n / sN, z0 = cc ? sNA / sA : sN / sA;
    function ps(par) {
      var A0 = par[0], N0 = par[1];
      return L.map(function (l, k) {
        if (k === ref) return { A: A0, N: N0 };
        var ey = Math.exp(l.y), A, N;
        if (type === "cc") { var dd = l.v - 1 / A0 - 1 / (N0 - A0); A = (1 + ey * A0 / (N0 - A0)) / dd; N = A + (1 + (N0 - A0) / (A0 * ey)) / dd; }
        else if (type === "ir") { var di = l.v - 1 / A0 + 1 / N0; A = (1 - ey * A0 / N0) / di; N = (N0 / (A0 * ey) - 1) / di; }
        else { var dc = l.v - 1 / A0; A = 1 / dc; N = (N0 / (A0 * ey)) / dc; }
        return { A: A, N: N };
      });
    }
    function fh(par) {
      var P = ps(par), p1, z1, sNA1 = 0, sA1 = 0, sN1 = 0;
      P.forEach(function (o) { sNA1 += o.N - o.A; sA1 += o.A; sN1 += o.N; });
      if (cc) { p1 = (P[ref].N - P[ref].A) / sNA1; z1 = sNA1 / sA1; } else { p1 = P[ref].N / sN1; z1 = sN1 / sA1; }
      return Math.pow((p1 - p0) / p0, 2) + Math.pow((z1 - z0) / z0, 2);
    }
    return ps(nmmin(fh, [L[ref].cases, L[ref].n], 500, SQRT_EPS).x);
  }
  function covarLogRR(L, type, covariance) {
    var nr = L.filter(function (l) { return l.v !== 0; }), m = nr.length, S = mz(m, m), a, b;
    if (covariance === "indep") { nr.forEach(function (l, i) { S[i][i] = l.v; }); return S; }
    var ps = covariance === "h" ? hamlingCounts(L, type) : grlCounts(L, type), ref = 0;
    L.forEach(function (l, k) { if (l.v === 0) ref = k; });
    var A0 = ps[ref].A, N0 = ps[ref].N, s0 = type === "ir" ? 1 / A0 : (type === "ci" ? 1 / A0 - 1 / N0 : 1 / A0 + 1 / (N0 - A0));
    var si = []; L.forEach(function (l, k) { if (k === ref) return; var A = ps[k].A, N = ps[k].N; si.push(s0 + (type === "ir" ? 1 / A : (type === "ci" ? 1 / A - 1 / N : 1 / A + 1 / (N - A)))); });
    for (a = 0; a < m; a++) for (b = 0; b < m; b++) S[a][b] = a === b ? nr[a].v : Math.sqrt(nr[a].v * nr[b].v) * s0 / Math.sqrt(si[a] * si[b]);
    for (a = 0; a < m; a++) if (!isFinite(S[a][a]) || S[a].some(function (v) { return !isFinite(v); })) throw new DRError("covariance reconstruction failed (non-finite values)");
    return S;
  }

  function basisFn(model, knots) {
    if (model === "linear") return function (x) { return [x]; };
    if (model === "quadratic") return function (x) { return [x, x * x]; };
    return function (x) { return rcsBasis(x, knots); };
  }
  function basisNames(model, knots) {
    if (model === "linear") return ["dose"];
    if (model === "quadratic") return ["dose", "dose²"];
    return knots.slice(1).map(function (_, j) { return j === 0 ? "dose" : "dose" + "'".repeat(j); });
  }

  // studies: [{id, rows: [{dose, cases, n, logrr, se, type}], mod?: number}]; the reference
  // row of each study has se null/NaN/0. opts: {model, knots (count or array), covariance,
  // proc, method, mod (bool), maxiter (one-stage; default 100 as in dosresmeta)}.
  function fitDR(studies, opts) {
    opts = opts || {};
    var model = opts.model || "linear", covariance = opts.covariance || "gl", proc = opts.proc || "2stage", method = opts.method || "reml";
    var useMod = !!opts.mod && proc === "2stage", maxiter = opts.maxiter || 100;
    var out = { ok: false, model: model, covariance: covariance, proc: proc, method: method, mod: useMod, excluded: [], warnings: [] };
    try {
      if (["linear", "quadratic", "rcs"].indexOf(model) < 0) throw new DRError("unknown model " + model);
      if (["gl", "h", "indep"].indexOf(covariance) < 0) throw new DRError("unknown covariance " + covariance);
      if (proc === "2stage" ? ["reml", "ml", "mm", "fixed"].indexOf(method) < 0 : ["reml", "ml", "fixed"].indexOf(method) < 0) throw new DRError("method " + method + " is not available for the " + proc + " approach");
      var S = [];
      studies.forEach(function (st) {
        var rows = st.rows, type = (rows[0] && rows[0].type) || opts.type || "cc";
        var L = rows.map(function (r) { var se = (r.se == null || r.se === "") ? NaN : +r.se; var v = isNaN(se) ? 0 : se * se;
          return { dose: +r.dose, cases: +r.cases, n: +r.n, y: (r.logrr == null || r.logrr === "" || isNaN(+r.logrr)) ? 0 : +r.logrr, v: v }; });
        var nref = L.filter(function (l) { return l.v === 0; }).length;
        if (nref !== 1) { out.excluded.push({ id: st.id, reason: nref ? "more than one reference row" : "no reference row (SE blank)" }); return; }
        if (L.length < 2) { out.excluded.push({ id: st.id, reason: "no non-reference dose" }); return; }
        if (covariance !== "indep" && L.some(function (l) { return !(l.cases > 0) || !(l.n > 0); })) { out.excluded.push({ id: st.id, reason: "missing case or total counts" }); return; }
        S.push({ id: st.id, type: type, L: L, mod: st.mod });
      });
      if (S.length < 2) throw new DRError("at least 2 studies are needed (" + S.length + " usable)");
      var allDoses = []; S.forEach(function (s) { s.L.forEach(function (l) { allDoses.push(l.dose); }); });
      var knots = null;
      if (model === "rcs") {
        knots = Array.isArray(opts.knots) ? opts.knots.map(Number).sort(function (a, b) { return a - b; }) : rcsKnots(allDoses, opts.knots || 3);
        if (knots.length < 3 || knots.length > 7) throw new DRError("a restricted cubic spline needs 3 to 7 knots");
        for (var kk = 1; kk < knots.length; kk++) if (!(knots[kk] > knots[kk - 1])) throw new DRError("knots must be distinct");
      }
      var bf = basisFn(model, knots), q = bf(0).length;
      out.knots = knots; out.q = q; out.names = basisNames(model, knots);
      // per-study centred design, response and within-study covariance
      S.forEach(function (s) {
        var ref = s.L.filter(function (l) { return l.v === 0; })[0], b0 = bf(ref.dose);
        s.refDose = ref.dose;
        s.nr = s.L.filter(function (l) { return l.v !== 0; });
        s.Xb = s.nr.map(function (l) { return bf(l.dose).map(function (v, j) { return v - b0[j]; }); });
        s.y = s.nr.map(function (l) { return l.y; });
        s.S = covarLogRR(s.L, s.type, covariance);
      });
      if (useMod && S.some(function (s) { return !isFinite(s.mod); })) throw new DRError("every study needs a numeric covariate value for meta-regression");
      out.k = S.length; out.nobs = S.reduce(function (a, s) { return a + s.nr.length; }, 0);
      out.studies = S.map(function (s) { return { id: s.id, type: s.type, refDose: s.refDose, nNonRef: s.nr.length, mod: s.mod }; });
      var res;
      if (proc === "2stage") res = twoStage(S, q, method, useMod);
      else res = oneStage(S, q, method, maxiter);
      for (var key in res) out[key] = res[key];
      if (out.converged === false) out.warnings.push(proc === "1stage"
        ? "The optimiser stopped at its iteration limit (" + maxiter + " likelihood evaluations, dosresmeta's default) before converging; dosresmeta reports the same warning."
        : "The optimiser stopped at its iteration limit before converging.");
      // Wald tests (dosresmeta::waldtest)
      var pAll = out.coef.length;
      out.wald = waldtest(out.vcov, out.coef, seqTerms(0, pAll));
      if (q > 1 && !useMod) out.waldNonlin = waldtest(out.vcov, out.coef, seqTerms(1, q));
      out.gof = gof(S, q, useMod);
      var coef = out.coef, V = out.vcov;
      out.predict = function (doses, xref, modValue) {
        xref = (xref == null) ? 0 : +xref;
        var bx = bf(xref);
        return doses.map(function (d) {
          var c = bf(+d).map(function (v, j) { return v - bx[j]; }), x = c;
          if (useMod) { var z = (modValue == null) ? 0 : +modValue; x = c.concat(c.map(function (v) { return v * z; })); }
          var pred = 0; for (var j = 0; j < x.length; j++) pred += x[j] * coef[j];
          var se = Math.sqrt(Math.max(0, _quad(V, x)));
          return { dose: +d, logRR: pred, se: se, ciLo: pred - Z975 * se, ciHi: pred + Z975 * se, rr: Math.exp(pred), rrLo: Math.exp(pred - Z975 * se), rrHi: Math.exp(pred + Z975 * se) };
        });
      };
      out.doseRange = [Math.min.apply(null, allDoses), Math.max.apply(null, allDoses)];
      out.ok = true;
    } catch (e) {
      if (!(e instanceof DRError)) throw e;
      out.error = e.message;
    }
    return out;
  }
  function seqTerms(a, b) { var r = []; for (var i = a; i < b; i++) r.push(i); return r; }
  function waldtest(V, b, terms) {
    var w = terms.length, f = terms.map(function (t) { return b[t]; }), Vs = terms.map(function (t) { return terms.map(function (u) { return V[t][u]; }); });
    var M = _matInv(Vs); if (!M) return null;
    var chi2 = _quad(M, f); return { chi2: chi2, df: w, p: pchisqUpper(chi2, w) };
  }

  function twoStage(S, q, method, useMod) {
    var short = S.filter(function (s) { return s.nr.length < q; });
    if (short.length) throw new DRError("A two-stage fit needs at least " + q + " non-reference dose levels in every study; too few in: " +
      short.map(function (s) { return s.id + " (" + s.nr.length + ")"; }).join(", ") + ". Use the one-stage approach, a simpler curve, or remove these studies.");
    var per = S.map(function (s) {
      var g = glsfit([s.Xb], [s.y], [s.S]);
      return { id: s.id, beta: g.coef, cov: vcovFromR(g.R) };
    });
    var pm = useMod ? 2 : 1, I = meye(q);
    var ctx = { k: q, S: per.map(function (p) { return p.cov; }), y: per.map(function (p) { return p.beta; }), Z: null,
      X: S.map(function (s) { return kron([useMod ? [1, s.mod] : [1]], I); }) };
    var nall = q * S.length, Psi = null, logLik, converged = true, niter = 0, g;
    if (method === "fixed") {
      g = glsfit(ctx.X, ctx.y, ctx.S);
      logLik = -0.5 * nall * LOG2PI - ctx.S.reduce(function (a, s, i) { return a + sumLogDiag(g.Ul[i]); }, 0) - 0.5 * glsRSS(g);
    } else if (method === "mm") {
      Psi = mmPsi(ctx); logLik = null;
    } else {
      ctx.reml = method === "reml";
      var U0 = cholU(sumCross(ctx.X));
      ctx.const = ctx.reml ? -0.5 * (nall - ctx.X[0][0].length) * LOG2PI + sumLogDiag(U0) : -0.5 * nall * LOG2PI;
      Psi = mz(q, q); for (var i = 0; i < q; i++) Psi[i][i] = 0.001;
      for (var it = 0; it < 10; it++) {
        var old = Psi; Psi = iglsIterMix(ctx, Psi);
        var conv = true; for (var a = 0; a < q; a++) for (var b = 0; b < q; b++) if (!(Math.abs(Psi[a][b] - old[a][b]) < SQRT_EPS * Math.abs(Psi[a][b] + SQRT_EPS))) conv = false;
        if (conv) break;
      }
      var opt = vmmin(function (p) { return -loglik(ctx, parToPsi(p, q)); }, function (p) { return llGrad(ctx, p).map(function (v) { return -v; }); },
        psiToPar(Psi), 100, SQRT_EPS);
      Psi = parToPsi(opt.x, q); logLik = -opt.f; converged = opt.fail === 0; niter = opt.iter;
    }
    g = glsfit(ctx.X, ctx.y, Psi ? sigmas(ctx, Psi) : ctx.S);
    var vcov = vcovFromR(g.R), coef = g.coef;
    // dosresmeta::qtest — fixed-effect GLS of the study coefficients (Psi = 0)
    var gq = glsfit(ctx.X, ctx.y, ctx.S), Qall = glsRSS(gq), dfAll = nall - q * pm, Q = { Q: [Qall], df: [dfAll] };
    if (q > 1) {
      for (var j = 0; j < q; j++) {
        var sQ = 0; per.forEach(function (p, s) { var f = mvec(ctx.X[s], gq.coef); sQ += Math.pow(p.beta[j] - f[j], 2) / p.cov[j][j]; });
        Q.Q.push(sQ); Q.df.push(S.length - q);
      }
    }
    Q.p = Q.Q.map(function (v, i) { return pchisqUpper(v, Q.df[i]); });
    var I2 = Qall > 0 ? Math.max(0, (Qall - dfAll) / Qall) * 100 : 0;
    var npar = q * pm + (Psi ? q * (q + 1) / 2 : 0);
    return { coef: coef, vcov: vcov, Psi: Psi, logLik: logLik, aic: logLik == null ? null : -2 * logLik + 2 * npar, converged: converged, niter: niter,
      qtest: Q, I2: I2, perStudy: per };
  }

  function oneStage(S, q, method, maxiter) {
    var ctx = { k: q, X: S.map(function (s) { return s.Xb; }), Z: S.map(function (s) { return s.Xb; }), y: S.map(function (s) { return s.y; }), S: S.map(function (s) { return s.S; }) };
    var nall = S.reduce(function (a, s) { return a + s.nr.length; }, 0), Psi = null, logLik, converged = true, niter = 0;
    if (method === "fixed") {
      var gf = glsfit(ctx.X, ctx.y, ctx.S);
      logLik = -0.5 * nall * LOG2PI - gf.Ul.reduce(function (a, U) { return a + sumLogDiag(U); }, 0) - 0.5 * glsRSS(gf);
    } else {
      ctx.reml = method === "reml";
      ctx.const = ctx.reml ? -0.5 * (nall - q) * LOG2PI : -0.5 * nall * LOG2PI; // dosresmeta remlprof.fn / mlprof.fn
      Psi = mz(q, q); for (var i = 0; i < q; i++) Psi[i][i] = 1e-4;
      for (var it = 0; it < 10; it++) Psi = iglsIterDR(ctx, Psi);
      var opt = nmmin(function (p) { return -loglik(ctx, parToPsi(p, q)); }, psiToPar(Psi), maxiter, SQRT_EPS);
      Psi = parToPsi(opt.x, q); logLik = -opt.f; converged = opt.fail === 0; niter = opt.count;
    }
    var g = glsfit(ctx.X, ctx.y, Psi ? sigmas(ctx, Psi) : ctx.S);
    var npar = q + (Psi ? q * (q + 1) / 2 : 0);
    return { coef: g.coef, vcov: vcovFromR(g.R), Psi: Psi, logLik: logLik, aic: -2 * logLik + 2 * npar, converged: converged, niter: niter, qtest: null, I2: null };
  }

  // dosresmeta::gof(fixed = TRUE): decorrelated least squares of all non-reference points
  function gof(S, q, useMod) {
    var Xl = S.map(function (s) { return useMod ? s.Xb.map(function (r) { return r.concat(r.map(function (v) { return v * s.mod; })); }) : s.Xb; });
    var g = glsfit(Xl, S.map(function (s) { return s.y; }), S.map(function (s) { return s.S; }));
    var fit = mvec(g.tUX, g.coef), n = fit.length, p = g.coef.length, rss = 0, mss = 0, resid = [];
    for (var i = 0; i < n; i++) { var r = g.tUy[i] - fit[i]; rss += r * r; mss += fit[i] * fit[i]; resid.push(r); }
    var r2 = mss / (mss + rss), rdf = n - p, pts = [], t = 0;
    S.forEach(function (s) { s.nr.forEach(function (l) { pts.push({ id: s.id, dose: l.dose, resid: resid[t++] }); }); });
    return { D: rss, df: rdf, p: pchisqUpper(rss, rdf), R2: r2, R2adj: 1 - (1 - r2) * (n / rdf), residuals: pts };
  }

  // fitSpline(studies, {type, nk | knots}) — two-stage restricted cubic spline (GL covariance,
  // REML), kept for backward compatibility; a thin wrapper over fitDR. studies: array of level
  // arrays (same row shape as fit()). Returns beta: null and an error message when dosresmeta
  // would refuse the fit (e.g. a study with fewer non-reference doses than spline coefficients).
  function fitSpline(studies, opts) {
    opts = opts || {};
    var r = fitDR(studies.map(function (rows, i) { return { id: (rows[0] && (rows[0].study || rows[0].id)) || String(i + 1), rows: rows }; }),
      { model: "rcs", knots: opts.knots || opts.nk || 3, covariance: "gl", proc: "2stage", method: "reml", type: opts.type });
    if (!r.ok) return { beta: null, knots: r.knots || null, k: r.k || 0, error: r.error, fit: r };
    return { beta: r.coef, cov: r.vcov, Psi: r.Psi, knots: r.knots, k: r.k, perStudy: r.perStudy, fit: r,
      predict: function (dose, refDose) { var p = r.predict([dose], refDose || 0)[0]; return { logRR: p.logRR, se: p.se, ciLo: p.ciLo, ciHi: p.ciHi }; } };
  }

  var api = { fit: fit, fitSpline: fitSpline, fitDR: fitDR, rcsBasis: rcsBasis, rcsKnots: rcsKnots, _grl: _grl, _studySlope: _studySlope, _quantile7: _quantile7,
    _internal: { nmmin: nmmin, vmmin: vmmin, covarLogRR: covarLogRR, pchisqUpper: pchisqUpper, symEigen: symEigen, qrLS: qrLS } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDoseResponse = api;
})(typeof window !== "undefined" ? window : globalThis);
