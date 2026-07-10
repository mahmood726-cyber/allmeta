/* shared/nmi.js — Network Meta-Interpolation (NMI).
 *
 * Harari, Soltanifar, Cappelleri, Chen, Coello, Cro, Marion, Simms, van Elteren,
 * Wei, Cope & Kaddar (2023), "Network meta-interpolation: effect modification
 * adjustment in network meta-analysis using subgroup analyses", Research
 * Synthesis Methods 14(2):211-233. Reference implementation (no CRAN package):
 * github.com/oharari/Network-Meta-Interpolation (NMI_Functions.R).
 *
 * PROBLEM. An anchored indirect comparison (Bucher / NMA) is only valid when the
 * effect modifiers (EMs) are balanced across the studies being combined. MAIC and
 * ML-NMR fix this but MAIC discards the connected network (it reduces to a single
 * unanchored/anchored pair) and ML-NMR needs individual-patient data (IPD) plus a
 * Bayesian outcome model. NMI needs only PUBLISHED SUBGROUP SUMMARIES: each study
 * reporting its treatment effect at >=2 EM levels (e.g. the A-vs-B effect in the
 * biomarker-positive and biomarker-negative subgroups, each with an SE).
 *
 * METHOD (three steps; this module implements all three).
 *  (1) INTERPOLATION. Within each study fit the linear EM -> treatment-effect
 *      surface by OLS,  TE = beta0 + sum_j beta_j x_j , over the study's design
 *      points (its overall row and its subgroup rows). Evaluate (interpolate or
 *      extrapolate) that surface at a COMMON target EM vector x*  ->  TE*(study).
 *      With >1 EM the subgroup rows report only one EM at a time, so the other
 *      EMs are imputed by the Best Linear Unbiased Predictor (BLUP) using the
 *      overall means, the within-study Bernoulli SDs and the EM-EM correlation
 *      rho (from IPD, or supplied / varied as a sensitivity analysis).
 *  (2) COVARIANCE RECONSTRUCTION. Turn the per-point SEs into a covariance for
 *      beta so the interpolated SE* = sqrt(x*' C x*) is available. Two modes:
 *        - "independent" (default): the subgroup estimates are DISJOINT patient
 *          sets, hence independent, so C = (Z'Z)^-1 Z' diag(se^2) Z (Z'Z)^-1
 *          (the exact OLS-with-known-variances sandwich). In the saturated
 *          two-subgroup single-EM case this is exact and REDUCES to ordinary
 *          subgroup meta-regression (see (a) below).
 *        - "minnorm": the published reference reconstruction — solve the
 *          under-determined  M2 vech(C) = se^2  by minimum norm (pseudo-inverse)
 *          then repair non-positive-definiteness by an eigen shift. Faithful to
 *          NMI_Functions.R; used when the overall row is included and points are
 *          not all independent. (This does NOT reproduce the independent-case SE
 *          -- min norm ignores the independence structure; see LIMITATIONS.)
 *  (3) ANCHORED NMA. Every study now contributes ONE contrast evaluated at the
 *      SAME x*, so the network is balanced and a plain anchored fixed/random NMA
 *      on the interpolated (TE*, SE*) contrasts yields the population-adjusted
 *      indirect estimates -- WITHOUT breaking the connected network. Delegated to
 *      shared/nma-multiarm-v1.js (multi-arm-correct GLS), which is verified vs
 *      netmeta to 1e-6.
 *
 * VERIFIED REDUCTIONS (see tests/test_nmi.py, anchors computed live with metafor
 * / netmeta 4.6.0):
 *  (a) single EM, two subgroup points (levels x_a, x_b), cov="independent":
 *      interpolateStudy TE* and SE* equal metafor::rma(yi, vi, mods=~EM)
 *      predicted at x* to <1e-9 (point) / <1e-9 (SE) -- ordinary subgroup
 *      meta-regression.
 *  (b) no EM variation (every study's subgroup effects equal its overall effect):
 *      fit() reduces to the plain anchored FE NMA / Bucher indirect estimate,
 *      matching shared/nma-multiarm-v1.js and netmeta to <1e-9.
 *  (c) faithfulness: interpolateStudy with the reference BLUP design and
 *      cov="minnorm" reproduces the reference NMI_Functions.R interpolated
 *      TE* and SE* on the paper's own 2-EM example to <1e-6.
 *
 * LIMITATIONS. The "minnorm" covariance is a heuristic reconstruction; it is
 * anticonservative/inconsistent relative to the exact independent SE and is NOT
 * a meta-regression SE. Random-effects heterogeneity across the interpolated
 * contrasts is delegated to the DL estimator in the NMA engine. No between-study
 * EM interaction shrinkage; the within-study surface is linear (as in the paper).
 *
 * Pure / dependency-free numerics; browser (window.AlmNMI) and Node.
 */
(function (global) {
  "use strict";

  // shared engines: NMA (multi-arm GLS) and normal quantile.
  var NMA = (typeof global !== "undefined" && global.AlmNmaMultiarm) ? global.AlmNmaMultiarm
    : (typeof require === "function" ? require("./nma-multiarm-v1.js") : null);
  var MC = (typeof global !== "undefined" && global.AlmMaCore) ? global.AlmMaCore
    : (typeof require === "function" ? (function () { try { return require("./ma-core.js"); } catch (e) { return null; } })() : null);
  function _qnorm(p) { return MC && MC._qnorm ? MC._qnorm(p) : _qnormLocal(p); }
  function _qnormLocal(p) { // Acklam fallback (used only if ma-core absent)
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239],
      b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1],
      c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416], pl = 0.02425, x, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    return x;
  }

  // ---------- tiny dense linear algebra (designs are small) ----------------
  function zeros(r, c) { var M = new Array(r), i; for (i = 0; i < r; i++) M[i] = new Array(c).fill(0); return M; }
  function transpose(A) { var m = A.length, n = A[0].length, B = zeros(n, m), i, j; for (i = 0; i < m; i++) for (j = 0; j < n; j++) B[j][i] = A[i][j]; return B; }
  function matmul(A, B) {
    var m = A.length, n = A[0].length, p = B[0].length, C = zeros(m, p), i, j, k, s;
    for (i = 0; i < m; i++) for (j = 0; j < p; j++) { s = 0; for (k = 0; k < n; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
    return C;
  }
  function matvec(A, v) { return A.map(function (row) { var s = 0, j; for (j = 0; j < v.length; j++) s += row[j] * v[j]; return s; }); }
  function quad(v, M) { // v' M v
    var s = 0, i, j; for (i = 0; i < v.length; i++) for (j = 0; j < v.length; j++) s += v[i] * M[i][j] * v[j]; return s;
  }
  function invert(A) {
    var n = A.length, M = zeros(n, 2 * n), i, j, r;
    for (i = 0; i < n; i++) { for (j = 0; j < n; j++) M[i][j] = A[i][j]; M[i][n + i] = 1; }
    for (i = 0; i < n; i++) {
      var pivot = M[i][i], pr = i;
      for (r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(pivot)) { pivot = M[r][i]; pr = r; }
      if (Math.abs(pivot) < 1e-300) return null;
      if (pr !== i) { var tmp = M[i]; M[i] = M[pr]; M[pr] = tmp; }
      var inv = 1 / M[i][i];
      for (j = 0; j < 2 * n; j++) M[i][j] *= inv;
      for (r = 0; r < n; r++) if (r !== i) { var f = M[r][i]; if (f !== 0) for (j = 0; j < 2 * n; j++) M[r][j] -= f * M[i][j]; }
    }
    var Inv = zeros(n, n);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) Inv[i][j] = M[i][n + j];
    return Inv;
  }
  // symmetric eigenvalues via Jacobi (small matrices) -> min eigenvalue only.
  function minEig(A) {
    var n = A.length, S = A.map(function (r) { return r.slice(); }), it, p, q, i, j;
    for (it = 0; it < 100; it++) {
      var off = 0, mp = 0, mq = 1, mx = 0;
      for (p = 0; p < n; p++) for (q = p + 1; q < n; q++) { var a = Math.abs(S[p][q]); off += a * a; if (a > mx) { mx = a; mp = p; mq = q; } }
      if (off < 1e-24) break;
      p = mp; q = mq;
      var app = S[p][p], aqq = S[q][q], apq = S[p][q];
      if (Math.abs(apq) < 1e-300) break;
      var phi = 0.5 * Math.atan2(2 * apq, aqq - app), c = Math.cos(phi), s = Math.sin(phi);
      for (i = 0; i < n; i++) { var sip = S[i][p], siq = S[i][q]; S[i][p] = c * sip - s * siq; S[i][q] = s * sip + c * siq; }
      for (i = 0; i < n; i++) { var spi = S[p][i], sqi = S[q][i]; S[p][i] = c * spi - s * sqi; S[q][i] = s * spi + c * sqi; }
    }
    var m = Infinity; for (i = 0; i < n; i++) if (S[i][i] < m) m = S[i][i]; return m;
  }

  // ---------- effect-modifier correlation from IPD ----------
  function pearson(rows, cols) {
    var n = rows.length, p = cols.length, means = new Array(p).fill(0), i, j, k;
    for (i = 0; i < n; i++) for (j = 0; j < p; j++) means[j] += (+rows[i][cols[j]]) / n;
    var R = zeros(p, p), sd = new Array(p).fill(0);
    for (j = 0; j < p; j++) { var s = 0; for (i = 0; i < n; i++) { var d = (+rows[i][cols[j]]) - means[j]; s += d * d; } sd[j] = Math.sqrt(s / (n - 1)); }
    for (j = 0; j < p; j++) for (k = 0; k < p; k++) {
      var cov = 0; for (i = 0; i < n; i++) cov += ((+rows[i][cols[j]]) - means[j]) * ((+rows[i][cols[k]]) - means[k]);
      R[j][k] = (cov / (n - 1)) / (sd[j] * sd[k]);
    }
    return R;
  }

  // ---------- BLUP design: reference row order (overall; EM1=1;EM1=0;EM2=1;EM2=0;...) ----------
  // xbar: length-p overall EM means; n: study size; rho: p x p EM correlation.
  // Returns the (2p+1) x p design matrix with subgroup rows BLUP-imputed exactly
  // as NMI_Functions.R::BLUP_impute (Sbar_j/Sbar_ind * rho * (level - xbar_ind) + xbar_j).
  function blupDesign(xbar, n, rho) {
    var p = xbar.length, i, j, ind, level;
    var Sbar = xbar.map(function (x) { return Math.sqrt(x * (1 - x) / n); });
    var X = [xbar.slice()]; // row 0 = overall
    for (i = 0; i < p; i++) {
      for (level = 1; level >= 0; level--) {
        var row = new Array(p);
        ind = i;
        for (j = 0; j < p; j++) {
          var temp;
          if (xbar[j] === 1) temp = 1;
          else if (xbar[j] === 0) temp = 0;
          else if (j === ind) temp = level;
          else temp = Sbar[j] / Sbar[ind] * rho[ind][j] * (level - xbar[ind]) + xbar[j];
          row[j] = Math.max(0, Math.min(1, temp));
        }
        X.push(row);
      }
    }
    return X;
  }

  // ---------- reference vech(C) <-> matrix (diagonal first, then upper rows) ----------
  function sigmaVecToMat(sigma) {
    var M = sigma.length, K = Math.round((Math.sqrt(1 + 8 * M) - 1) / 2), C = zeros(K, K), i, j, t = K;
    for (i = 0; i < K; i++) C[i][i] = sigma[i];
    for (i = 0; i < K - 1; i++) for (j = i + 1; j < K; j++) { C[i][j] = sigma[t]; C[j][i] = sigma[t]; t++; }
    return C;
  }
  // M2 columns matching sigmaVecToMat order: [1, x_j^2 (j), 2 x_j (j), 2 x_j x_k (j<k)].
  function designM2(X) {
    var np = X.length, p = X[0].length, i, j, k;
    var rows = [];
    for (i = 0; i < np; i++) {
      var xi = X[i], r = [1];
      for (j = 0; j < p; j++) r.push(xi[j] * xi[j]);          // diagonal slope vars
      for (j = 0; j < p; j++) r.push(2 * xi[j]);              // intercept-slope covs (row 0)
      for (j = 0; j < p; j++) for (k = j + 1; k < p; k++) r.push(2 * xi[j] * xi[k]); // slope-slope
      rows.push(r);
    }
    return rows;
  }

  // OLS beta for TE ~ 1 + X ; returns { beta (len p+1), Zt, ZtZinv, Z }.
  function olsBeta(X, TE) {
    var np = X.length, p = X[0].length, i, j;
    var Z = []; for (i = 0; i < np; i++) { var r = [1]; for (j = 0; j < p; j++) r.push(X[i][j]); Z.push(r); }
    var Zt = transpose(Z), ZtZ = matmul(Zt, Z), ZtZinv = invert(ZtZ);
    if (!ZtZinv) return null;
    var ZtY = matvec(Zt, TE), beta = matvec(ZtZinv, ZtY);
    return { beta: beta, Z: Z, Zt: Zt, ZtZinv: ZtZinv };
  }

  // rank of EM columns: number of distinct design rows must span a line (>=2 distinct, full col rank).
  function emFullRank(X) {
    var p = X[0].length, ols = olsBeta(X, X.map(function () { return 0; }));
    return !!ols; // ZtZ invertible <=> [1|X] full column rank
  }

  /**
   * interpolateStudy({X, TE, se}, xTarget, opts) -> { TE, se, beta, cov, degenerate }.
   *   X: n x p design (rows = the study's design points; already BLUP-imputed / full).
   *   TE, se: length-n effect estimates and SEs at those points.
   *   xTarget: length-p target EM vector.
   *   opts.cov: "independent" (default, exact for disjoint subgroups) | "minnorm" (reference).
   * If the EM design is rank-deficient (no EM variation) the study is a passthrough:
   * returns its first row's TE/se unchanged (degenerate:true).
   */
  function interpolateStudy(study, xTarget, opts) {
    opts = opts || {};
    var X = study.X.map(function (r) { return r.slice(); }), TE = study.TE.slice(), se = study.se.slice();
    var p = X[0].length, xs = [1].concat(xTarget), i;
    if (!emFullRank(X)) {
      return { TE: TE[0], se: se[0], beta: null, cov: null, degenerate: true };
    }
    var ols = olsBeta(X, TE);
    var point = 0; for (i = 0; i <= p; i++) point += ols.beta[i] * xs[i];
    var mode = (opts.cov || "independent");
    var seOut, C;
    if (mode === "minnorm") {
      // min-norm solve of M2 vech(C) = se^2 : vech = M2'(M2 M2')^-1 se^2
      var M2 = designM2(X), M2t = transpose(M2), MMt = matmul(M2, M2t), MMti = invert(MMt);
      var s2 = se.map(function (s) { return s * s; });
      var vech = matvec(M2t, matvec(MMti, s2));
      C = sigmaVecToMat(vech);
      var lmin = minEig(C);
      if (lmin <= 0) for (i = 0; i < C.length; i++) C[i][i] += (-lmin + 1e-6);
      seOut = Math.sqrt(quad(xs, C));
    } else {
      // independent sandwich: C = ZtZinv Z' diag(se^2) Z ZtZinv  (exact for independent points)
      var Z = ols.Z, ZtZinv = ols.ZtZinv, k = p + 1, a, b;
      var mid = zeros(k, k);
      for (a = 0; a < k; a++) for (b = 0; b < k; b++) {
        var s = 0; for (i = 0; i < Z.length; i++) s += Z[i][a] * (se[i] * se[i]) * Z[i][b];
        mid[a][b] = s;
      }
      C = matmul(matmul(ZtZinv, mid), ZtZinv);
      seOut = Math.sqrt(quad(xs, C));
    }
    return { TE: point, se: seOut, beta: ols.beta, cov: C, degenerate: false };
  }

  // Build a full design (X, TE, se) for a study from overall + subgroup summaries.
  // study = { overall:{x:[...], TE, se}, subgroups:[{em, level, TE, se}...], n, rho }
  // subgroup rows have only EM `em` observed; the rest are BLUP-imputed from overall.
  function _studyToDesign(study, rho) {
    if (study.X) return study; // already a full design
    var xbar = study.overall.x, n = study.n, p = xbar.length;
    var Sbar = xbar.map(function (x) { return Math.sqrt(x * (1 - x) / n); });
    var X = [xbar.slice()], TE = [study.overall.TE], se = [study.overall.se];
    study.subgroups.forEach(function (sg) {
      var ind = sg.em, row = new Array(p), j;
      for (j = 0; j < p; j++) {
        var t;
        if (xbar[j] === 1) t = 1; else if (xbar[j] === 0) t = 0;
        else if (j === ind) t = sg.level;
        else t = Sbar[j] / Sbar[ind] * rho[ind][j] * (sg.level - xbar[ind]) + xbar[j];
        row[j] = Math.max(0, Math.min(1, t));
      }
      X.push(row); TE.push(sg.TE); se.push(sg.se);
    });
    return { X: X, TE: TE, se: se };
  }

  /**
   * fit(studies, xTarget, opts) — full NMI.
   *   studies: [{ study, t1, t2, overall:{x,TE,se}, subgroups:[{em,level,TE,se}], n }]
   *            (or supply a full design per study via {X,TE,se}). t1->t2 is the
   *            reported contrast (est = effect of t2 vs t1 at the study population).
   *   xTarget: length-p common EM vector to evaluate the network at.
   *   opts: { ref, model:"fe"|"re", cov:"independent"|"minnorm", rho, alpha }.
   * Returns { ok, refTreat, treatments, nonref, d, cov, tau2, contrasts:[...],
   *           interpolated:[{study,t1,t2,est,se}], xTarget }.
   */
  function fit(studies, xTarget, opts) {
    opts = opts || {};
    if (!NMA) return { ok: false, error: "shared/nma-multiarm-v1.js not available" };
    var rho = opts.rho || null, alpha = opts.alpha != null ? opts.alpha : 0.05;
    var interp = [], rows = [];
    for (var i = 0; i < studies.length; i++) {
      var st = studies[i];
      var design = _studyToDesign(st, rho);
      var r = interpolateStudy(design, xTarget, { cov: opts.cov || "independent" });
      interp.push({ study: st.study, t1: st.t1, t2: st.t2, est: r.TE, se: r.se,
        degenerate: r.degenerate, beta: r.beta, slope: r.beta ? r.beta[1] : null });
      rows.push({ study: st.study, t1: st.t1, t2: st.t2, est: r.TE, se: r.se });
    }
    var nmaFit = NMA.fit(rows, { ref: opts.ref, model: opts.model || "fe" });
    if (!nmaFit.ok) return { ok: false, error: nmaFit.error, interpolated: interp };

    // all pairwise contrasts with z-based CIs
    var z = _qnorm(1 - alpha / 2);
    var treats = nmaFit.treatments, ref = nmaFit.refTreat, nonref = nmaFit.nonref, d = nmaFit.d, cov = nmaFit.cov;
    function dOf(t) { if (t === ref) return 0; return d[nonref.indexOf(t)]; }
    function varOf(a, b) { // Var(d_a - d_b) with ref implicit 0
        var ia = a === ref ? -1 : nonref.indexOf(a), ib = b === ref ? -1 : nonref.indexOf(b);
        var va = ia < 0 ? 0 : cov[ia][ia], vb = ib < 0 ? 0 : cov[ib][ib], cab = (ia < 0 || ib < 0) ? 0 : cov[ia][ib];
        return va + vb - 2 * cab;
    }
    var contrasts = [];
    for (i = 0; i < treats.length; i++) for (var j = i + 1; j < treats.length; j++) {
      var a = treats[i], b = treats[j], est = dOf(b) - dOf(a), v = varOf(b, a), se = Math.sqrt(Math.max(0, v));
      contrasts.push({ from: a, to: b, est: est, se: se, lo: est - z * se, hi: est + z * se, z: se > 0 ? est / se : null });
    }
    return {
      ok: true, refTreat: ref, treatments: treats, nonref: nonref, d: d, cov: cov,
      tau2: nmaFit.tau2, Q: nmaFit.Q, df: nmaFit.df, model: (opts.model || "fe"),
      contrasts: contrasts, interpolated: interp, xTarget: xTarget, alpha: alpha,
      warnings: nmaFit.warnings,
    };
  }

  var api = {
    fit: fit,
    interpolateStudy: interpolateStudy,
    blupDesign: blupDesign,
    pearson: pearson,
    sigmaVecToMat: sigmaVecToMat,
    designM2: designM2,
    _olsBeta: olsBeta, _invert: invert, _minEig: minEig, _qnorm: _qnorm,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNMI = api;
})(typeof window !== "undefined" ? window : globalThis);
