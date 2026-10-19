/* shared/multivariate-ma.js — multivariate / multiple-outcome meta-analysis (mvmeta),
 * matching metafor::rma.mv(yi, V, mods=~outcome-1, random=~outcome|study, struct="UN").
 *
 * Each study reports an m-vector of effect sizes y_i (one per outcome) with a KNOWN m×m
 * within-study covariance S_i. The model is
 *     y_i ~ N(μ, S_i + G),   G = unstructured m×m between-study covariance,
 * so the m outcome means μ are estimated jointly, borrowing strength across the
 * correlated outcomes. Fit by REML: μ is GLS given G; G is found by Nelder-Mead on its
 * Cholesky factor (guaranteeing positive-definiteness). μ SEs from (Σ W_i)⁻¹.
 *
 * fit(studies) — studies: [{ y:[m], S:[[m×m]] }, …] (balanced: every study has all m
 *   outcomes). Returns { mu, muSE, muVcov, G, rho, logLik, m, k }.
 * Verified vs metafor::rma.mv on dat.berkey1998 (multivariate-ma-parity.spec.mjs).
 * No external dependency; no network.
 */
(function (global) {
  "use strict";

  function _matInv(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(r.map(function (_, j) { return i === j ? 1 : 0; })); }), c, r, j;
    for (c = 0; c < n; c++) {
      var p = c; for (r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var t = A[c]; A[c] = A[p]; A[p] = t; var d = A[c][c]; if (Math.abs(d) < 1e-300) return null;
      for (j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (r = 0; r < n; r++) { if (r === c) continue; var f = A[r][c]; for (j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(function (row) { return row.slice(n); });
  }
  function _logdet(M) {
    var n = M.length, A = M.map(function (r) { return r.slice(); }), ld = 0, c, r, j;
    for (c = 0; c < n; c++) {
      var p = c; for (r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (p !== c) { var t = A[c]; A[c] = A[p]; A[p] = t; }
      var d = A[c][c]; if (Math.abs(d) < 1e-300) return -Infinity; ld += Math.log(Math.abs(d));
      for (r = c + 1; r < n; r++) { var f = A[r][c] / d; for (j = c; j < n; j++) A[r][j] -= f * A[c][j]; }
    }
    return ld;
  }
  function _matVec(M, v) { return M.map(function (row) { return row.reduce(function (a, x, j) { return a + x * v[j]; }, 0); }); }
  function _add(A, B) { return A.map(function (row, i) { return row.map(function (v, j) { return v + B[i][j]; }); }); }

  function _nelderMead(f, x0, step, maxit) {
    var n = x0.length, simplex = [x0.slice()], fv = [f(x0)], i, j;
    for (i = 0; i < n; i++) { var pt = x0.slice(); pt[i] += step; simplex.push(pt); fv.push(f(pt)); }
    function order() { var idx = fv.map(function (v, k) { return k; }).sort(function (a, b) { return fv[a] - fv[b]; }); simplex = idx.map(function (k) { return simplex[k]; }); fv = idx.map(function (k) { return fv[k]; }); }
    for (var it = 0; it < (maxit || 1000); it++) {
      order();
      var spread = 0;
      for (i = 1; i <= n; i++) for (j = 0; j < n; j++) spread = Math.max(spread, Math.abs(simplex[i][j] - simplex[0][j]) / Math.max(1, Math.abs(simplex[0][j])));
      if (spread < 1e-10 && Math.abs(fv[n] - fv[0]) < 1e-12 * Math.max(1, Math.abs(fv[0]))) break;
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

  // Build a symmetric PD m×m matrix from its lower-Cholesky params (length m(m+1)/2).
  function _fromChol(x, m) {
    var L = [], t = 0, i, j, d;
    for (i = 0; i < m; i++) { L.push(new Array(m).fill(0)); for (j = 0; j <= i; j++) L[i][j] = x[t++]; }
    var P = [];
    for (i = 0; i < m; i++) { P.push(new Array(m).fill(0)); for (j = 0; j < m; j++) { var s = 0; for (d = 0; d <= Math.min(i, j); d++) s += L[i][d] * L[j][d]; P[i][j] = s; } }
    return P;
  }

  // GLS μ and Σ W_i given G; also returns the REML pieces.
  function _profile(studies, G) {
    var m = G.length, k = studies.length, sumW = [], sumWy = new Array(m).fill(0), i, a, b, Ws = [], lpieces = 0;
    for (a = 0; a < m; a++) sumW.push(new Array(m).fill(0));
    for (i = 0; i < k; i++) {
      var V = _add(studies[i].S, G), ld = _logdet(V), W = _matInv(V);
      if (!W || ld === -Infinity) return null;
      Ws.push(W); lpieces += ld;
      var Wy = _matVec(W, studies[i].y);
      for (a = 0; a < m; a++) { sumWy[a] += Wy[a]; for (b = 0; b < m; b++) sumW[a][b] += W[a][b]; }
    }
    var sumWinv = _matInv(sumW); if (!sumWinv) return null;
    var mu = _matVec(sumWinv, sumWy);
    return { mu: mu, sumW: sumW, sumWinv: sumWinv, Ws: Ws, logdetV: lpieces };
  }

  function fit(studies, opts) {
    opts = opts || {};
    // Fail closed: with k<2 the between-study covariance G is unidentifiable
    // (ybar≡y, so the warm-start divides by k-1=0 → NaN that silently
    // propagates to mu=[null,null]). Throw rather than return a degenerate
    // but schema-valid result a caller can't distinguish from a real fit.
    if (!Array.isArray(studies) || studies.length < 2) {
      throw new Error("multivariate MA requires k>=2 studies (between-study covariance G is unidentifiable with k<2)");
    }
    var k = studies.length, m = studies[0].y && studies[0].y.length, i, a, b;
    if (!m) throw new Error("Outcomes must be finite and covariance matrices conformable.");
    studies.forEach(function (s) {
      if (!Array.isArray(s.y) || s.y.length !== m || !s.y.every(Number.isFinite) || !Array.isArray(s.S) || s.S.length !== m || !s.S.every(function (r) { return Array.isArray(r) && r.length === m && r.every(Number.isFinite); })) throw new Error("Outcomes must be finite and covariance matrices conformable.");
      var L = s.S.map(function (r) { return r.slice(); });
      for (var a = 0; a < m; a++) for (var b = 0; b <= a; b++) {
        if (s.S[a][b] !== s.S[b][a]) throw new Error("Within-study covariance must be symmetric.");
        var v = s.S[a][b];
        for (var d = 0; d < b; d++) v -= L[a][d] * L[b][d];
        if (a === b) { if (!(v > 0)) throw new Error("Within-study covariance must be positive definite."); L[a][b] = Math.sqrt(v); }
        else L[a][b] = v / L[b][b];
      }
    });
    // warm-start G: diag = max(0, between-study var − mean within var), off-diag 0.
    var ybar = new Array(m).fill(0); studies.forEach(function (s) { for (a = 0; a < m; a++) ybar[a] += s.y[a] / k; });
    var G0 = []; for (a = 0; a < m; a++) G0.push(new Array(m).fill(0));
    studies.forEach(function (s) { for (a = 0; a < m; a++) for (b = 0; b < m; b++) G0[a][b] += (s.y[a] - ybar[a]) * (s.y[b] - ybar[b]) / (k - 1) - s.S[a][b] / k; });
    for (a = 0; a < m; a++) if (!(G0[a][a] > 0)) G0[a][a] = 0.01;
    // chol of G0 (diag floored)
    var L0 = []; for (a = 0; a < m; a++) { L0.push(new Array(m).fill(0)); for (b = 0; b <= a; b++) { var s = G0[a][b]; for (var d = 0; d < b; d++) s -= L0[a][d] * L0[b][d]; L0[a][b] = (a === b) ? Math.sqrt(Math.max(1e-6, s)) : s / L0[b][b]; } }
    var x0 = []; for (a = 0; a < m; a++) for (b = 0; b <= a; b++) x0.push(L0[a][b]);

    var obj = function (x) {
      var G = _fromChol(x, m), pr = _profile(studies, G);
      if (!pr) return 1e12;
      var ll = pr.logdetV + _logdet(pr.sumW);
      for (var ii = 0; ii < k; ii++) { var dv = studies[ii].y.map(function (v, j) { return v - pr.mu[j]; }); ll += dv.reduce(function (acc, dj, j) { return acc + dj * _matVec(pr.Ws[ii], dv)[j]; }, 0); }
      return 0.5 * ll;
    };
    var opt, G, pr;
    if (k === 2) {
      // REML is the likelihood of the single difference d, with variance S1+S2+2G.
      // Whiten by S1+S2: the constrained optimum is rank one (or exactly zero).
      var delta = studies[0].y.map(function (v, j) { return v - studies[1].y[j]; });
      var wd = _matVec(_matInv(_add(studies[0].S, studies[1].S)), delta);
      var q = delta.reduce(function (s, v, j) { return s + v * wd[j]; }, 0);
      var factor = q > 1 ? 0.5 * (1 - 1 / q) : 0;
      G = delta.map(function (v) { return delta.map(function (w) { return factor * v * w; }); });
      pr = _profile(studies, G);
      var value = pr.logdetV + _logdet(pr.sumW);
      studies.forEach(function (s, i) { var dv = s.y.map(function (v, j) { return v - pr.mu[j]; }), w = _matVec(pr.Ws[i], dv); value += dv.reduce(function (t, v, j) { return t + v * w[j]; }, 0); });
      opt = { f: 0.5 * value };
    } else {
      opt = _nelderMead(obj, x0, 0.05, 2000);
      opt = _nelderMead(obj, opt.x, 0.005, 1000);
      G = _fromChol(opt.x, m);
      // At a rank-one boundary, the redundant Cholesky direction can collapse
      // the simplex before the two identifiable directions are stationary.
      if (m === 2 && G[0][0] > 0 && G[1][1] > 0 && G[0][0] * G[1][1] - G[0][1] * G[0][1] < 1e-8 * G[0][0] * G[1][1]) {
        var v = [Math.sqrt(G[0][0]), G[0][1] / Math.sqrt(G[0][0])];
        function rankGradient(v) {
          var g = v.map(function (a) { return v.map(function (b) { return a * b; }); }), p = _profile(studies, g), sc = [[0, 0], [0, 0]];
          studies.forEach(function (s, i) {
            var w = p.Ws[i], dr = s.y.map(function (y, j) { return y - p.mu[j]; }), wr = _matVec(w, dr);
            for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) {
              var t = 0;
              for (var u = 0; u < 2; u++) for (var z = 0; z < 2; z++) t += w[a][u] * p.sumWinv[u][z] * w[z][b];
              sc[a][b] += w[a][b] - t - wr[a] * wr[b];
            }
          });
          return _matVec(sc, v);
        }
        for (var iter = 0; iter < 12; iter++) {
          var grad = rankGradient(v), h = [[], []];
          if (Math.max(Math.abs(grad[0]), Math.abs(grad[1])) < 1e-10) break;
          for (var j = 0; j < 2; j++) {
            var left = v.slice(), right = v.slice(), step = 1e-4 * Math.max(1, Math.abs(v[j]));
            left[j] -= step; right[j] += step;
            var gl = rankGradient(left), gr = rankGradient(right);
            for (var i = 0; i < 2; i++) h[i][j] = (gr[i] - gl[i]) / (2 * step);
          }
          if (!(h[0][0] > 0 && h[1][1] > 0 && h[0][0] * h[1][1] > h[0][1] * h[1][0])) break;
          var delta = _matVec(_matInv(h), grad), accepted = false;
          for (var rate = 1; rate >= 1 / 1024; rate /= 2) {
            var next = v.map(function (x, j) { return x - rate * delta[j]; }), val = obj([next[0], next[1], 0]), ng = rankGradient(next);
            if (val <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f)) && Math.hypot(ng[0], ng[1]) < Math.hypot(grad[0], grad[1])) { v = next; opt.f = val; accepted = true; break; }
          }
          if (!accepted) break;
        }
        var rankValue = obj([v[0], v[1], 0]);
        if (rankValue <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f))) { G = _fromChol([v[0], v[1], 0], 2); opt.f = rankValue; }
      }
      // Confirm the exact zero boundary by its covariance score, not an arbitrary rho.
      var zero = G.map(function (row) { return row.map(function () { return 0; }); });
      var zp = _profile(studies, zero), score = zero.map(function (row) { return row.slice(); });
      studies.forEach(function (s, i) {
        var W = zp.Ws[i], dv = s.y.map(function (v, j) { return v - zp.mu[j]; }), wr = _matVec(W, dv);
        for (var a = 0; a < m; a++) for (var b = 0; b < m; b++) {
          var correction = 0;
          for (var u = 0; u < m; u++) for (var v = 0; v < m; v++) correction += W[a][u] * zp.sumWinv[u][v] * W[v][b];
          score[a][b] += W[a][b] - correction - wr[a] * wr[b];
        }
      });
      var zeroValue = obj(new Array(x0.length).fill(0));
      if (m === 2 && score[0][0] >= 0 && score[1][1] >= 0 && score[0][0] * score[1][1] >= score[0][1] * score[1][0] && zeroValue <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f))) { G = zero; opt.f = zeroValue; }
      pr = _profile(studies, G);
    }
    if (!pr || !Number.isFinite(opt.f)) throw new Error("REML fit did not produce finite results.");
    var muSE = pr.sumWinv.map(function (row, j) { return Math.sqrt(Math.max(0, row[j])); });
    // REML constant: -((k-m)/2)·m? metafor's logLik includes the full constant; we report
    // the comparable value: ll = -0.5(Σ logdetV + (y−μ)'W(y−μ) + logdet ΣW) − ((N−p)/2)log(2π)
    // REML logLik: −½[(N−p)log2π + log|V| + quad + log|X'V⁻¹X|] + ½log|X'X|.
    // X is the outcome-indicator design ⇒ X'X = diag(study-count per outcome) = diag(k)
    // for balanced data, so ½log|X'X| = (m/2)·log(k).
    var N = k * m, p = m;
    var logLik = -opt.f - 0.5 * (N - p) * Math.log(2 * Math.PI) + 0.5 * m * Math.log(k);
    var rho = (m === 2 && G[0][0] > 0 && G[1][1] > 0) ? Math.max(-1, Math.min(1, G[0][1] / Math.sqrt(G[0][0] * G[1][1]))) : null;
    return { mu: pr.mu, muSE: muSE, muVcov: pr.sumWinv, G: G, rho: rho, logLik: logLik, m: m, k: k };
  }

  var api = { fit: fit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMultivariate = api;
})(typeof window !== "undefined" ? window : globalThis);
