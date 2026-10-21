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
    order(); return { x: simplex[0], f: fv[0], converged: it < (maxit || 1000), iterations: it };
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

  // ---- REML objective, score and Fisher information on the entries of G ----
  // obj(G) = ½[Σ log|V_i| + log|Σ W_i| + Σ r_i'W_i r_i]  (= −REML logLik + const).
  function _mm(A, B) { return A.map(function (row) { return B[0].map(function (_, j) { return row.reduce(function (s, x, l) { return s + x * B[l][j]; }, 0); }); }); }
  function _tr(A) { var t = 0; for (var i = 0; i < A.length; i++) t += A[i][i]; return t; }
  function _isPD(M) {
    var n = M.length, L = [], i, j, d;
    for (i = 0; i < n; i++) { L.push(new Array(n).fill(0)); for (j = 0; j <= i; j++) { var v = M[i][j]; for (d = 0; d < j; d++) v -= L[i][d] * L[j][d]; if (i === j) { if (!(v > 0)) return false; L[i][j] = Math.sqrt(v); } else L[i][j] = v / L[j][j]; } }
    return true;
  }
  function _objG(studies, G) {
    var pr = _profile(studies, G); if (!pr) return Infinity;
    var val = pr.logdetV + _logdet(pr.sumW);
    studies.forEach(function (s, i) { var r = s.y.map(function (v, j) { return v - pr.mu[j]; }), w = _matVec(pr.Ws[i], r); val += r.reduce(function (t, v, j) { return t + v * w[j]; }, 0); });
    return 0.5 * val;
  }
  function _params(m) { var P = []; for (var a = 0; a < m; a++) for (var b = a; b < m; b++) P.push([a, b]); return P; }
  function _E(m, a, b) { var E = []; for (var i = 0; i < m; i++) E.push(new Array(m).fill(0)); E[a][b] = 1; E[b][a] = 1; return E; }
  // Gradient of the REML log-likelihood with respect to the free entries of G and the
  // expected (Fisher) information ½tr(P D_a P D_b), computed per study without forming
  // the (km)x(km) REML projection P:
  //   tr(P D_a P D_b) = Σ_i [tr(W E_a W E_b) − tr(W E_a WCW E_b) − tr(WCW E_a W E_b)] + tr(C B_a C B_b),
  //   C = (Σ W_i)⁻¹, B_a = Σ_i W_i E_a W_i.
  function _scoreInfo(studies, G) {
    var m = G.length, pr = _profile(studies, G); if (!pr) return null;
    var C = pr.sumWinv, P = _params(m), Es = P.map(function (ab) { return _E(m, ab[0], ab[1]); });
    var grad = P.map(function () { return 0; }), T = P.map(function () { return P.map(function () { return 0; }); });
    var B = Es.map(function () { var Z = []; for (var i = 0; i < m; i++) Z.push(new Array(m).fill(0)); return Z; });
    studies.forEach(function (s, i) {
      var W = pr.Ws[i], r = s.y.map(function (v, j) { return v - pr.mu[j]; }), u = _matVec(W, r), WCW = _mm(_mm(W, C), W);
      var Pii = W.map(function (row, x) { return row.map(function (v, y) { return v - WCW[x][y]; }); });
      var WE = Es.map(function (E) { return _mm(W, E); });
      Es.forEach(function (E, a) {
        var quad = 0, x, y; for (x = 0; x < m; x++) for (y = 0; y < m; y++) quad += u[x] * E[x][y] * u[y];
        grad[a] += -0.5 * _tr(_mm(Pii, E)) + 0.5 * quad;
        var WEW = _mm(WE[a], W); for (x = 0; x < m; x++) for (y = 0; y < m; y++) B[a][x][y] += WEW[x][y];
        Es.forEach(function (E2, b) {
          T[a][b] += _tr(_mm(WE[a], WE[b])) - _tr(_mm(_mm(WE[a], WCW), E2)) - _tr(_mm(_mm(WCW, E), WE[b]));
        });
      });
    });
    var info = T.map(function (row, a) { return row.map(function (t, b) { return 0.5 * (t + _tr(_mm(_mm(C, B[a]), _mm(C, B[b])))); }); });
    return { grad: grad, info: info, params: P };
  }
  // Fisher-scoring polish of an interior (positive-definite) G. Step-halving keeps G
  // positive definite and never accepts a worse REML objective (tolerance 1e-14 relative).
  // Convergence criterion: largest accepted change in any entry of G < 1e-12 (absolute);
  // otherwise the reason it stopped is reported. maxAbsScore = max |∂ℓ_REML/∂G_ab| at exit.
  function _fisherPolish(studies, G, maxit) {
    var f = _objG(studies, G), it, stop = "max-iterations";
    for (it = 0; it < (maxit || 100); it++) {
      var si = _scoreInfo(studies, G); if (!si) { stop = "profile-failed"; break; }
      var inv = _matInv(si.info); if (!inv) { stop = "singular-information"; break; }
      var delta = _matVec(inv, si.grad), step = 1, accepted = null;
      for (var h = 0; h < 40; h++, step /= 2) {
        var Gn = G.map(function (row) { return row.slice(); });
        si.params.forEach(function (ab, j) { Gn[ab[0]][ab[1]] += step * delta[j]; if (ab[0] !== ab[1]) Gn[ab[1]][ab[0]] = Gn[ab[0]][ab[1]]; });
        if (!_isPD(Gn)) continue;
        var fn = _objG(studies, Gn);
        if (fn <= f + 1e-14 * Math.max(1, Math.abs(f))) { accepted = { G: Gn, f: fn, d: step * Math.max.apply(null, delta.map(Math.abs)) }; break; }
      }
      if (!accepted) { stop = "no-acceptable-step"; break; }
      G = accepted.G; f = accepted.f;
      if (accepted.d < 1e-12) { stop = "converged"; it++; break; }
    }
    var fin = _scoreInfo(studies, G);
    return { G: G, f: f, iterations: it, stop: stop, maxAbsScore: fin ? Math.max.apply(null, fin.grad.map(Math.abs)) : NaN };
  }

  // Allocation-free REML objective for two outcomes (same value as _objG up to rounding).
  // Returns Infinity when some S_i + G or the summed weight matrix is not positive definite.
  function _obj2(studies, g00, g01, g11) {
    var k = studies.length, i, ld = 0, s00 = 0, s01 = 0, s11 = 0, t0 = 0, t1 = 0, W = new Float64Array(3 * k);
    for (i = 0; i < k; i++) {
      var S = studies[i].S, a = S[0][0] + g00, b = S[0][1] + g01, d = S[1][1] + g11, det = a * d - b * b;
      if (!(a > 0) || !(det > 0)) return Infinity;
      var w00 = d / det, w01 = -b / det, w11 = a / det, y = studies[i].y;
      W[3 * i] = w00; W[3 * i + 1] = w01; W[3 * i + 2] = w11; ld += Math.log(det);
      s00 += w00; s01 += w01; s11 += w11; t0 += w00 * y[0] + w01 * y[1]; t1 += w01 * y[0] + w11 * y[1];
    }
    var sd = s00 * s11 - s01 * s01; if (!(s00 > 0) || !(sd > 0)) return Infinity;
    var m0 = (s11 * t0 - s01 * t1) / sd, m1 = (s00 * t1 - s01 * t0) / sd, q = 0;
    for (i = 0; i < k; i++) { var r0 = studies[i].y[0] - m0, r1 = studies[i].y[1] - m1; q += W[3 * i] * r0 * r0 + 2 * W[3 * i + 1] * r0 * r1 + W[3 * i + 2] * r1 * r1; }
    return 0.5 * (ld + Math.log(sd) + q);
  }

  // Observational only: these searches never change the selected fitted G.
  function _diagnostic(studies, G, bestF, candidates, defaultF, startsRun) {
    var m = G.length, llTol = 1e-8, estimateTol = 1e-6, flatTol = 1e-6;
    var objective = function (g) { return m === 2 ? _obj2(studies, g[0][0], g[0][1], g[1][1]) : _objG(studies, g); };
    var base = objective(G), constant = -0.5 * m * (studies.length - 1) * Math.log(2 * Math.PI) + 0.5 * m * Math.log(studies.length);
    var near = [{ G: G, f: bestF }].concat(candidates).filter(function (c) { return Number.isFinite(c.f) && Math.abs(c.f - bestF) <= llTol; });
    var clusters = [];
    near.forEach(function (c) {
      if (!clusters.some(function (d) {
        return c.G.every(function (row, i) { return row.every(function (v, j) { return Math.abs(v - d.G[i][j]) <= estimateTol * Math.max(1, Math.abs(G[i][j])); }); });
      })) clusters.push(c);
    });
    var zero = [], correlations = [];
    for (var i = 0; i < m; i++) {
      var threshold = 1e-10 * Math.max(1, studies.reduce(function (s, st) { return s + st.S[i][i] / studies.length; }, 0));
      if (G[i][i] <= threshold) zero.push({ component: i, variance: G[i][i], threshold: threshold });
      for (var j = i + 1; j < m; j++) if (G[i][i] > 0 && G[j][j] > 0) {
        var r = Math.max(-1, Math.min(1, G[i][j] / Math.sqrt(G[i][i] * G[j][j])));
        if (Math.abs(r) >= 1 - 1e-6) correlations.push({ components: [i, j], rho: r });
      }
    }
    var profiles = G.map(function (row, component) {
      var v = row[component], h = 1e-4 * Math.max(1, v);
      var points = [Math.max(0, v - h), v + h].filter(function (x) { return x !== v; }).map(function (fixed) {
        var result;
        if (m === 1) result = { f: objective([[fixed]]), converged: true };
        else if (m === 2) {
          var other = 1 - component, sd = Math.sqrt(G[other][other]);
          var rho = v > 0 && sd > 0 ? G[0][1] / Math.sqrt(v * G[other][other]) : 0;
          var at = function (x) {
            var rr = Math.max(-1, Math.min(1, x[1])), cross = Math.sqrt(fixed) * Math.abs(x[0]) * rr;
            return component === 0 ? _obj2(studies, fixed, cross, x[0] * x[0]) : _obj2(studies, x[0] * x[0], cross, fixed);
          };
          [rho, -1, 1].forEach(function (r) {
            var o = _nelderMead(at, [sd, r], 0.01 * Math.max(1, sd), 400);
            if (!result || o.f < result.f) result = o;
          });
        } else {
          // Normalizing one Cholesky row fixes its variance and preserves PSD.
          var L = [], x = [], rowStart = component * (component + 1) / 2;
          for (var a = 0; a < m; a++) {
            L.push(new Array(m).fill(0));
            for (var b = 0; b <= a; b++) {
              var t = G[a][b];
              for (var d = 0; d < b; d++) t -= L[a][d] * L[b][d];
              L[a][b] = a === b ? Math.sqrt(Math.max(0, t)) : (L[b][b] > 0 ? t / L[b][b] : 0);
              x.push(L[a][b]);
            }
          }
          var atM = function (z) {
            var p = z.slice(), norm = 0;
            for (var j = 0; j <= component; j++) norm += p[rowStart + j] * p[rowStart + j];
            if (norm === 0) p[rowStart + component] = Math.sqrt(fixed);
            else for (var j = 0; j <= component; j++) p[rowStart + j] *= Math.sqrt(fixed / norm);
            return objective(_fromChol(p, m));
          };
          result = _nelderMead(atM, x, 0.01, 600);
        }
        return { variance: fixed, logLik: Number.isFinite(result.f) ? constant - result.f : null,
          deltaLogLik: Number.isFinite(result.f) ? base - result.f : null,
          converged: result.converged, status: Number.isFinite(result.f) ? 'finite-search' : 'failed' };
      });
      var flat = points.length === 2 && points.every(function (p) { return p.deltaLogLik !== null && Math.abs(p.deltaLogLik) < flatTol; });
      var curvature = v >= h && points.every(function (p) { return p.deltaLogLik !== null; }) ? -(points[0].deltaLogLik + points[1].deltaLogLik) / (h * h) : null;
      return { component: component, variance: v, offset: h, points: points, flat: flat, curvature: curvature };
    });
    var boundary = zero.length > 0 || correlations.length > 0;
    var flat = clusters.length > 1 || profiles.some(function (p) { return p.flat; });
    return { schema: 'multivariate-ma-diagnostic-v1', startsRun: startsRun,
      distinctOptimaWithinTolerance: clusters.length, nearBestCandidates: near.length,
      bestVsDefaultStartLogLikGap: defaultF === null ? null : defaultF - bestF,
      defaultStart: startsRun ? 'moment start, 600-iteration screen' : 'not applicable: exact two-study solution',
      boundary: { zeroVariances: zero, correlations: correlations },
      profiles: profiles, flat: flat,
      tolerances: { logLik: llTol, distinctEstimates: estimateTol, flatLogLik: flatTol, correlation: 1e-6, offset: 1e-4 },
      verdict: boundary ? 'boundary maximum' : flat ? 'flat likelihood: estimates not unique' : 'unique interior maximum',
      interpretation: 'Finite searches and local offsets give numerical evidence, not proof of global uniqueness; flatness depends on outcome units and tolerances.' };
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
      if (m === 2) { var v2 = _obj2(studies, x[0] * x[0], x[0] * x[1], x[1] * x[1] + x[2] * x[2]); return Number.isFinite(v2) ? v2 : 1e12; }
      var G = _fromChol(x, m), pr = _profile(studies, G);
      if (!pr) return 1e12;
      var ll = pr.logdetV + _logdet(pr.sumW);
      for (var ii = 0; ii < k; ii++) { var dv = studies[ii].y.map(function (v, j) { return v - pr.mu[j]; }); ll += dv.reduce(function (acc, dj, j) { return acc + dj * _matVec(pr.Ws[ii], dv)[j]; }, 0); }
      return 0.5 * ll;
    };
    var opt, G, pr, boundary = "two-study-exact", polish = null;
    var diagnosticCandidates = [], defaultF = null, startsRun = 0;
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
      // Several starts (the REML surface can have a local maximum at G = 0 or an
      // interior point while the global one is elsewhere, e.g. rank one at rho = -1):
      // moment start, x0.1, x10 and, for two outcomes, correlations +-0.9.
      var cholVec = function (M) {
        var Lc = [], out = [], aa, bb, dd;
        for (aa = 0; aa < m; aa++) { Lc.push(new Array(m).fill(0)); for (bb = 0; bb <= aa; bb++) { var sv = M[aa][bb]; for (dd = 0; dd < bb; dd++) sv -= Lc[aa][dd] * Lc[bb][dd]; Lc[aa][bb] = (aa === bb) ? Math.sqrt(Math.max(1e-6, sv)) : sv / Lc[bb][bb]; } }
        for (aa = 0; aa < m; aa++) for (bb = 0; bb <= aa; bb++) out.push(Lc[aa][bb]);
        return out;
      };
      var D0 = G0.map(function (row, aa) { return row.map(function (v, bb) { return aa === bb ? v : 0; }); });
      var startMats = [D0, D0.map(function (row) { return row.map(function (v) { return v * 0.1; }); }), D0.map(function (row) { return row.map(function (v) { return v * 10; }); })];
      if (m === 2) [0.9, -0.9].forEach(function (rr) { var c = rr * Math.sqrt(D0[0][0] * D0[1][1]); startMats.push([[D0[0][0], c], [c, D0[1][1]]]); });
      var starts = [x0].concat(startMats.slice(1).map(cholVec));
      // Screen every start with 600 simplex iterations, then run the full two-stage
      // search (2000 + 1000 iterations) from the best two screened points.
      var screened = starts.map(function (st) { return _nelderMead(obj, st, 0.05, 600); });
      startsRun = starts.length; defaultF = screened[0].f;
      diagnosticCandidates = screened.map(function (o) { return { G: _fromChol(o.x, m), f: o.f }; });
      screened.sort(function (u, w) { return u.f - w.f; });
      opt = null;
      screened.slice(0, 2).forEach(function (sc) {
        var o1 = _nelderMead(obj, sc.x, 0.05, 2000); o1 = _nelderMead(obj, o1.x, 0.005, 1000);
        diagnosticCandidates.push({ G: _fromChol(o1.x, m), f: o1.f });
        if (!opt || o1.f < opt.f) opt = o1;
      });
      G = _fromChol(opt.x, m);
      boundary = "interior";
      // Interior optimum: polish the simplex result by Fisher scoring.
      var detRel = m === 2 ? (G[0][0] * G[1][1] - G[0][1] * G[0][1]) / (G[0][0] * G[1][1]) : 1;
      if (_isPD(G) && detRel > 1e-8 && opts.polish !== false) {
        var pol = _fisherPolish(studies, G, 100);
        polish = { iterations: pol.iterations, stop: pol.stop, maxAbsScore: pol.maxAbsScore };
        if (pol.f <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f))) { G = pol.G; opt.f = pol.f; }
      }
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
        if (rankValue <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f))) { G = _fromChol([v[0], v[1], 0], 2); opt.f = rankValue; boundary = "rank-one"; }
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
      if (((m === 1 && score[0][0] >= 0) || (m === 2 && score[0][0] >= 0 && score[1][1] >= 0 && score[0][0] * score[1][1] >= score[0][1] * score[1][0])) && zeroValue <= opt.f + 1e-12 * Math.max(1, Math.abs(opt.f))) { G = zero; opt.f = zeroValue; boundary = "zero"; }
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
    if (boundary === "two-study-exact" && G.every(function (row) { return row.every(function (v) { return v === 0; }); })) boundary = "two-study-exact-zero";
    return { mu: pr.mu, muSE: muSE, muVcov: pr.sumWinv, G: G, rho: rho, logLik: logLik, m: m, k: k, optimizer: { boundary: boundary, polish: polish },
      diagnostic: _diagnostic(studies, G, opt.f, diagnosticCandidates, defaultF, startsRun) };
  }

  // ---- normal-theory z test (two-sided) via the regularized upper incomplete gamma ----
  function _lgamma(z) {
    var c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - _lgamma(1 - z);
    z--; var x = .99999999999980993; for (var i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
    var t = z + 7.5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  // P(chi-square_df > x): series for small x, Lentz continued fraction otherwise.
  function chisqSF(x, df) {
    if (!Number.isFinite(x) || x < 0 || !(df > 0)) throw new Error("invalid chi-square argument");
    if (x === 0) return 1;
    var a = df / 2, z = x / 2, scale = Math.exp(-z + a * Math.log(z) - _lgamma(a)), n;
    if (z < a + 1) { var term = 1 / a, sum = term; for (n = 1; n < 10000; n++) { term *= z / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 2e-16) return Math.max(0, 1 - sum * scale); } }
    else { var b = z + 1 - a, cc = 1e300, d = 1 / b, h = d; for (n = 1; n < 10000; n++) { var an = -n * (n - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; cc = b + an / cc; if (Math.abs(cc) < 1e-300) cc = 1e-300; d = 1 / d; var del = d * cc; h *= del; if (Math.abs(del - 1) < 2e-16) return scale * h; } }
    throw new Error("incomplete gamma did not converge");
  }
  // Two-sided Wald test of mu = 0 using the normal distribution (as mvmeta and rma.mv with test="z").
  function zTest(mu, se) {
    if (!Number.isFinite(mu) || !Number.isFinite(se) || !(se > 0)) return { status: "refused", reason: "SE must be positive and finite" };
    var z = mu / se; return { status: "ok", z: z, p: chisqSF(z * z, 1) };
  }

  // ---- univariate REML (m = 1) on the same rows: y_i ~ N(mu, v_i + tau2) ----
  function fitUnivariate(y, v, opts) {
    if (!Array.isArray(y) || !Array.isArray(v) || y.length !== v.length) throw new Error("y and v must be arrays of equal length");
    var f = fit(y.map(function (yi, i) { return { y: [yi], S: [[v[i]]] }; }), opts);
    return { k: f.k, mu: f.mu[0], se: f.muSE[0], tau2: f.G[0][0], logLik: f.logLik, optimizer: f.optimizer, diagnostic: f.diagnostic };
  }

  // ---- within-study correlation helpers ----
  function covFromR(v1, v2, r) { return r * Math.sqrt(v1 * v2); }
  // rows: [{ y:[y1,y2], v:[v1,v2] }]; grid: within-study correlations, each |rho_w| < 1.
  // Every study receives the SAME assumed within-study correlation rho_w (supplied
  // covariances, if any, are replaced). Pure: no DOM, no state.
  function sweepRho(rows, grid, opts) {
    if (!Array.isArray(rows) || !Array.isArray(grid)) throw new Error("rows and grid must be arrays");
    return grid.map(function (rw) {
      if (typeof rw !== "number" || !Number.isFinite(rw) || !(Math.abs(rw) < 1)) return { rhoW: rw, status: "refused", reason: "within-study correlation must satisfy |rho| < 1" };
      try {
        var f = fit(rows.map(function (r) { var c = covFromR(r.v[0], r.v[1], rw); return { y: r.y.slice(), S: [[r.v[0], c], [c, r.v[1]]] }; }), opts);
        return { rhoW: rw, status: "ok", fit: f };
      } catch (e) { return { rhoW: rw, status: "refused", reason: e.message }; }
    });
  }

  var api = { fit: fit, fitUnivariate: fitUnivariate, sweepRho: sweepRho, zTest: zTest, chisqSF: chisqSF, covFromR: covFromR, _objG: _objG, _obj2: _obj2, _scoreInfo: _scoreInfo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMultivariate = api;
})(typeof window !== "undefined" ? window : globalThis);
