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

  var api = { fit: fit, _grl: _grl, _studySlope: _studySlope };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDoseResponse = api;
})(typeof window !== "undefined" ? window : globalThis);
