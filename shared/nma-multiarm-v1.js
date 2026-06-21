/* shared/nma-multiarm-v1.js — contrast-level NMA with the multi-arm /
 * shared-control correction the simple WLS in nma/ was missing.
 *
 * The pre-existing nma/index.html fitNMA() treated every pairwise contrast as
 * independent. For a multi-arm trial that is a UNIT-OF-ANALYSIS ERROR
 * (Cochrane Handbook §23.3.4): the contrasts of an m-arm study share a common
 * comparator arm, so they are CORRELATED. Ignoring that correlation
 * double-counts the shared arm and understates the variance.
 *
 * This module does the generalised-least-squares (GLS) fit netmeta() does:
 *   - group contrasts by study (a multi-arm study = >2 treatments / >1 row);
 *   - within each multi-arm study, recover the arm variances from the full set
 *     of pairwise contrast SEs, reduce to (m-1) independent baseline contrasts,
 *     and build the within-study covariance block
 *         Var(y_{x,base}) = v_x + v_base ,  Cov(y_{x,base}, y_{x',base}) = v_base;
 *   - assemble a block-diagonal covariance V, GLS d = (XᵀV⁻¹X)⁻¹XᵀV⁻¹y;
 *   - random effects: generalised DerSimonian-Laird τ² (Jackson-White-Riley
 *     2012, the netmeta default), then V_RE = V + τ²·R where R adds τ² on the
 *     diagonal and τ²/2 on the within-multi-arm-study off-diagonals.
 *
 * Verified vs netmeta::netmeta() to ≤1e-6 (FE point/SE; RE τ², point, SE) on a
 * multi-arm fixture — see shared/tests/nma-multiarm-v1.spec.mjs.
 *
 * Pure / dependency-free. Browser (window.AlmNmaMultiarm) and Node.
 *
 * Reference: Rücker 2012 (Res Synth Methods 3:312-324); Jackson, White, Riley
 * 2012 (Stat Med 31:3805-3820); Cochrane Handbook v6.5 §23.3.4.
 */
(function (global) {
  "use strict";

  // ---- small dense linear algebra (networks are small, ≤ ~30 nodes) -------
  function zeros(r, c) { var M = new Array(r); for (var i = 0; i < r; i++) M[i] = new Array(c).fill(0); return M; }
  function matmul(A, B) {
    var m = A.length, n = A[0].length, p = B[0].length, C = zeros(m, p);
    for (var i = 0; i < m; i++) for (var j = 0; j < p; j++) { var s = 0; for (var k = 0; k < n; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
    return C;
  }
  function transpose(A) { var m = A.length, n = A[0].length, B = zeros(n, m); for (var i = 0; i < m; i++) for (var j = 0; j < n; j++) B[j][i] = A[i][j]; return B; }
  function invert(A) {
    var n = A.length, M = zeros(n, 2 * n), i, j, r;
    for (i = 0; i < n; i++) { for (j = 0; j < n; j++) M[i][j] = A[i][j]; M[i][n + i] = 1; }
    for (i = 0; i < n; i++) {
      var pivot = M[i][i], pr = i;
      for (r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(pivot)) { pivot = M[r][i]; pr = r; }
      if (Math.abs(pivot) < 1e-13) return null;
      if (pr !== i) { var tmp = M[i]; M[i] = M[pr]; M[pr] = tmp; }
      var inv = 1 / M[i][i];
      for (j = 0; j < 2 * n; j++) M[i][j] *= inv;
      for (r = 0; r < n; r++) if (r !== i) { var f = M[r][i]; if (f !== 0) for (j = 0; j < 2 * n; j++) M[r][j] -= f * M[i][j]; }
    }
    var Inv = zeros(n, n);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) Inv[i][j] = M[i][n + j];
    return Inv;
  }
  function trace(A) { var s = 0; for (var i = 0; i < A.length; i++) s += A[i][i]; return s; }

  // ---- group rows into studies; build independent baseline contrasts ------
  // rows: [{study, t1, t2, est, se}] where est is (t2 - t1) on the analysis scale.
  // Returns { studies:[{id, arms:[...], contrasts:[{to,from,est,armIdxTo,armIdxFrom}],
  //   v:{arm→var}, multiArm}], errors:[] }.
  function buildStudies(rows) {
    var byStudy = Object.create(null), order = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var id = String(r.study);
      if (!byStudy[id]) { byStudy[id] = []; order.push(id); }
      byStudy[id].push(r);
    }
    var studies = [], errors = [];
    for (var s = 0; s < order.length; s++) {
      var id2 = order[s], rs = byStudy[id2];
      var armSet = {};
      for (var a = 0; a < rs.length; a++) { armSet[rs[a].t1] = true; armSet[rs[a].t2] = true; }
      var arms = Object.keys(armSet).sort();
      var m = arms.length;
      if (m < 2) { errors.push("study " + id2 + ": <2 arms"); continue; }

      if (m === 2) {
        // 2-arm: a single independent contrast (to - from), from = arms[0].
        var row = rs[0];
        var to = row.t2, from = row.t1, est = row.est;
        // orient to (arms[1] - arms[0]) for a stable baseline convention
        if (from !== arms[0]) { var t = to; to = from; from = t; est = -est; }
        studies.push({
          id: id2, arms: arms, multiArm: false,
          contrasts: [{ to: to, from: from, est: est, se: row.se }],
          v: null,
        });
        continue;
      }

      // m>=3: need the FULL pairwise clique to recover arm variances.
      var need = m * (m - 1) / 2;
      var pairKey = {};
      for (var p2 = 0; p2 < rs.length; p2++) {
        var k = [rs[p2].t1, rs[p2].t2].sort().join("|");
        pairKey[k] = rs[p2];
      }
      if (Object.keys(pairKey).length < need) {
        errors.push("study " + id2 + ": multi-arm (" + m + " arms) but only " +
          Object.keys(pairKey).length + "/" + need + " pairwise contrasts present — cannot recover arm covariance");
        continue;
      }
      // s2[i][j] = se^2 of contrast between arms[i], arms[j]
      var s2 = zeros(m, m);
      var T = 0;
      for (var ii = 0; ii < m; ii++) for (var jj = ii + 1; jj < m; jj++) {
        var pr = pairKey[[arms[ii], arms[jj]].sort().join("|")];
        var v = pr.se * pr.se;
        s2[ii][jj] = v; s2[jj][ii] = v; T += v;
      }
      var S = T / (m - 1);                       // Σ arm variances
      var varArm = {};
      for (var x = 0; x < m; x++) {
        var rowsum = 0; for (var y = 0; y < m; y++) if (y !== x) rowsum += s2[x][y];
        varArm[arms[x]] = (rowsum - S) / (m - 2);
      }
      // Reduce to (m-1) baseline contrasts vs arms[0]; recover est from rows.
      var base = arms[0];
      var contrasts = [];
      for (var z = 1; z < m; z++) {
        var toArm = arms[z];
        var prow = pairKey[[base, toArm].sort().join("|")];
        var estVal = prow.est;                   // est = t2 - t1
        // want (toArm - base):
        if (prow.t1 === toArm && prow.t2 === base) estVal = -estVal;       // row is (base - toArm) ⇒ flip
        else if (prow.t1 === base && prow.t2 === toArm) { /* already toArm-base */ }
        else estVal = (prow.t2 === toArm) ? estVal : -estVal;             // generic fallback
        contrasts.push({ to: toArm, from: base, est: estVal });
      }
      studies.push({ id: id2, arms: arms, multiArm: true, contrasts: contrasts, v: varArm, base: base });
    }
    return { studies: studies, errors: errors };
  }

  // Build the stacked design/observation/covariance for the network.
  // nonref = treatments excluding ref (column order). Returns {X,y,V,rowStudy,N,blocks}.
  function assemble(studies, treatments, ref) {
    var nonref = treatments.filter(function (t) { return t !== ref; });
    var idx = {}; nonref.forEach(function (t, k) { idx[t] = k; });
    var K = nonref.length;
    // total independent contrasts
    var N = 0; studies.forEach(function (st) { N += st.contrasts.length; });
    var X = zeros(N, K), y = new Array(N), V = zeros(N, N);
    var rowStudy = new Array(N);
    var blocks = [];          // [{start,len,multiArm}]
    var ri = 0;
    for (var s = 0; s < studies.length; s++) {
      var st = studies[s], start = ri, len = st.contrasts.length;
      for (var c = 0; c < len; c++) {
        var ct = st.contrasts[c];
        y[ri] = ct.est;
        if (ct.to !== ref) X[ri][idx[ct.to]] += 1;
        if (ct.from !== ref) X[ri][idx[ct.from]] -= 1;
        rowStudy[ri] = st.id;
        ri++;
      }
      // covariance block
      if (!st.multiArm) {
        var se = st.contrasts[0].se;
        V[start][start] = se * se;
      } else {
        var vbase = st.v[st.base];
        for (var a = 0; a < len; a++) {
          var toA = st.contrasts[a].to;
          V[start + a][start + a] = st.v[toA] + vbase;
          for (var b = a + 1; b < len; b++) {
            V[start + a][start + b] = vbase;
            V[start + b][start + a] = vbase;
          }
        }
      }
      blocks.push({ start: start, len: len, multiArm: st.multiArm });
    }
    return { X: X, y: y, V: V, nonref: nonref, K: K, N: N, rowStudy: rowStudy, blocks: blocks };
  }

  // GLS solve given covariance V. Returns {d, cov, Vinv}.
  function gls(X, y, V) {
    var Vinv = invert(V);
    if (!Vinv) return null;
    var Xt = transpose(X);
    var XtVi = matmul(Xt, Vinv);              // K×N
    var XtViX = matmul(XtVi, X);              // K×K
    var inv = invert(XtViX);
    if (!inv) return null;
    var yCol = y.map(function (v) { return [v]; });
    var XtViy = matmul(XtVi, yCol);           // K×1
    var dCol = matmul(inv, XtViy);            // K×1
    var d = dCol.map(function (r) { return r[0]; });
    return { d: d, cov: inv, Vinv: Vinv, XtViX: XtViX };
  }

  // Generalised DerSimonian-Laird τ² for a variance component with a known
  // within-study correlation structure R (Jackson-White-Riley 2012). This is
  // exactly what netmeta delegates to metafor::rma.mv(method="DL",
  // random=~factor(comparison)|studlab, rho=0.5): a single τ² added with the
  // multi-arm compound-symmetric correlation (1 on the diagonal, ρ=0.5 within
  // a multi-arm study's contrasts).
  //   Q  = (y-Xβ_FE)ᵀ W (y-Xβ_FE),  W = V_FE⁻¹
  //   P  = W − W X (XᵀWX)⁻¹ Xᵀ W       (the residual/projection weight)
  //   E[Q] = df + τ²·tr(P R)  ⇒  τ² = max(0, (Q − df)/tr(P R))
  // R = I for a network with no multi-arm trials, so tr(P R)=tr(P) and this
  // reduces to the ordinary generalised DL.
  function generalisedDL(X, y, V, feFit, blocks) {
    var W = feFit.Vinv;                        // N×N
    var N = X.length, K = X[0].length, i, j;
    // residual
    var resid = new Array(N);
    for (i = 0; i < N; i++) {
      var yhat = 0; for (var k = 0; k < K; k++) yhat += X[i][k] * feFit.d[k];
      resid[i] = y[i] - yhat;
    }
    // Q = residᵀ W resid
    var Q = 0;
    for (var a = 0; a < N; a++) { var wr = 0; for (var b = 0; b < N; b++) wr += W[a][b] * resid[b]; Q += resid[a] * wr; }
    var df = N - K;
    // P = W − W X (XᵀWX)⁻¹ Xᵀ W
    var Xt = transpose(X);
    var WX = matmul(W, X);                     // N×K
    var XtWX = matmul(Xt, WX);                 // K×K
    var XtWXinv = invert(XtWX);
    var WXinv = matmul(WX, XtWXinv);           // N×K
    var P = zeros(N, N);
    // P = W - WXinv * (WX)ᵀ
    var WXt = transpose(WX);                   // K×N
    var corr = matmul(WXinv, WXt);             // N×N
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) P[i][j] = W[i][j] - corr[i][j];
    // R: 1 on diagonal, 0.5 on within-multi-arm-study off-diagonals.
    var R = zeros(N, N);
    for (i = 0; i < N; i++) R[i][i] = 1;
    if (Array.isArray(blocks)) {
      for (var bl = 0; bl < blocks.length; bl++) {
        var bk = blocks[bl];
        if (!bk.multiArm) continue;
        for (var p = 0; p < bk.len; p++) for (var q = 0; q < bk.len; q++) {
          if (p !== q) R[bk.start + p][bk.start + q] = 0.5;
        }
      }
    }
    // C = tr(P R) = Σ_ij P[i][j] R[i][j]   (R symmetric)
    var C = 0;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) C += P[i][j] * R[i][j];
    var tau2 = C > 0 ? Math.max(0, (Q - df) / C) : 0;
    return { tau2: tau2, Q: Q, df: df, C: C };
  }

  // Build the RE covariance: V + τ²·R, R = within-study correlation
  // (1 on diagonal, 0.5 on within-multi-arm-study off-diagonals; netmeta).
  function reCovariance(asm, tau2) {
    var N = asm.N, V = asm.V;
    var Vr = zeros(N, N);
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) Vr[i][j] = V[i][j];
    for (var b = 0; b < asm.blocks.length; b++) {
      var bl = asm.blocks[b];
      for (var a = 0; a < bl.len; a++) {
        Vr[bl.start + a][bl.start + a] += tau2;
        if (bl.multiArm) {
          for (var c = a + 1; c < bl.len; c++) {
            Vr[bl.start + a][bl.start + c] += tau2 / 2;
            Vr[bl.start + c][bl.start + a] += tau2 / 2;
          }
        }
      }
    }
    return Vr;
  }

  /**
   * fit(rows, opts) — contrast-level NMA with multi-arm correction.
   *   rows: [{study, t1, t2, est, se}]   (est = t2 - t1, analysis scale)
   *   opts: { ref, model: "fe"|"re" }
   * Returns { ok, nonref, refTreat, d, cov, tau2, Q, df, multiArmStudies, error }.
   * d[k]/cov are relative to refTreat (ref implicit zero), in nonref order.
   */
  function fit(rows, opts) {
    opts = opts || {};
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "no contrasts" };
    var built = buildStudies(rows);
    if (built.errors.length && built.studies.length === 0) {
      return { ok: false, error: built.errors.join("; ") };
    }
    var treatSet = {};
    rows.forEach(function (r) { treatSet[r.t1] = true; treatSet[r.t2] = true; });
    var treatments = Object.keys(treatSet).sort();
    var ref = opts.ref && treatSet[opts.ref] ? opts.ref : treatments[0];
    var asm = assemble(built.studies, treatments, ref);
    if (asm.N < asm.K) return { ok: false, error: "insufficient contrasts (N=" + asm.N + " < K=" + asm.K + ")" };

    var feFit = gls(asm.X, asm.y, asm.V);
    if (!feFit) return { ok: false, error: "singular design (disconnected network?)", warnings: built.errors };

    var model = (opts.model || "fe").toLowerCase();
    var tau2 = 0, Qinfo = null;
    var fitUse = feFit;
    if (model === "re" || model === "random") {
      Qinfo = generalisedDL(asm.X, asm.y, asm.V, feFit, asm.blocks);
      tau2 = Qinfo.tau2;
      if (tau2 > 0) {
        var Vr = reCovariance(asm, tau2);
        var reFit = gls(asm.X, asm.y, Vr);
        if (reFit) fitUse = reFit;
      }
    } else {
      // still expose Q/df for reporting
      Qinfo = generalisedDL(asm.X, asm.y, asm.V, feFit, asm.blocks);
    }

    var multiArmStudies = built.studies.filter(function (s) { return s.multiArm; }).map(function (s) { return s.id; });
    return {
      ok: true,
      nonref: asm.nonref,
      refTreat: ref,
      treatments: treatments,
      d: fitUse.d,
      cov: fitUse.cov,
      tau2: tau2,
      Q: Qinfo ? Qinfo.Q : null,
      df: Qinfo ? Qinfo.df : null,
      multiArmStudies: multiArmStudies,
      warnings: built.errors,
    };
  }

  var api = {
    fit: fit,
    buildStudies: buildStudies,
    assemble: assemble,
    gls: gls,
    generalisedDL: generalisedDL,
    _invert: invert,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNmaMultiarm = api;
})(typeof window !== "undefined" ? window : globalThis);
