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
    // Refuse, as netmeta's chkmultiarm() does, rather than fitting a network with a study left out
    // or mis-specified: every study must supply each of its m(m-1)/2 comparisons exactly once, a
    // multi-arm study's estimates must be internally consistent (A-C = (A-B) + (B-C), tolerance 0.001,
    // netmeta's tol.multiarm), and the arm variances implied by its standard errors must be >= 0.
    var problems = checkStudies(rows);
    if (problems.length) return { ok: false, error: "Problem" + (problems.length > 1 ? "s" : "") + " in multi-arm or duplicated studies (netmeta refuses these too): " + problems.join("; ") };
    var built = buildStudies(rows);
    if (built.errors.length) {
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

  // ---- netmeta chkmultiarm(): incomplete / duplicated / inconsistent studies ----
  function checkStudies(rows) {
    var byStudy = Object.create(null), order = [], problems = [];
    rows.forEach(function (r) { var id = String(r.study); if (!byStudy[id]) { byStudy[id] = []; order.push(id); } byStudy[id].push(r); });
    order.forEach(function (id) {
      var rs = byStudy[id], armSet = {};
      rs.forEach(function (r) { armSet[r.t1] = true; armSet[r.t2] = true; });
      var arms = Object.keys(armSet).sort(), m = arms.length, seen = {}, dup = false;
      rs.forEach(function (r) { var k = [r.t1, r.t2].sort().join("|"); if (seen[k]) dup = true; seen[k] = r; });
      if (dup) { problems.push("study '" + id + "' has a duplicated comparison"); return; }
      if (rs.length !== m * (m - 1) / 2) { problems.push("study '" + id + "' has an incomplete set of comparisons (" + rs.length + " of " + (m * (m - 1) / 2) + " for " + m + " arms)"); return; }
      if (m < 3) return;
      // least-squares arm means (sum zero) from the observed differences d[x][y] = arm x - arm y
      var d = zeros(m, m), s2 = zeros(m, m), ix = {};
      arms.forEach(function (a, i) { ix[a] = i; });
      rs.forEach(function (r) { var i = ix[r.t2], j = ix[r.t1]; d[i][j] = r.est; d[j][i] = -r.est; s2[i][j] = s2[j][i] = r.se * r.se; });
      var mu = arms.map(function (_, i) { var s = 0; for (var j = 0; j < m; j++) s += d[i][j]; return s / m; }), worst = 0;
      for (var i = 0; i < m; i++) for (var j = i + 1; j < m; j++) worst = Math.max(worst, Math.abs(d[i][j] - (mu[i] - mu[j])));
      if (worst > 0.001) { problems.push("study '" + id + "' has inconsistent treatment effects (A-C differs from (A-B) + (B-C) by " + worst.toPrecision(3) + ")"); return; }
      var T = 0; for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) T += s2[i][j];
      for (i = 0; i < m; i++) { var rsum = 0; for (j = 0; j < m; j++) rsum += s2[i][j]; if ((rsum - T / (m - 1)) / (m - 2) < 0) { problems.push("study '" + id + "': its standard errors imply a negative variance for arm '" + arms[i] + "'"); return; } }
    });
    return problems;
  }

  // ---- distribution functions (double precision) ----
  function lgam(x) { // Lanczos (g = 7, n = 9)
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgam(1 - x);
    x -= 1; var a = c[0], t = x + 7.5; for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function pnormUpper(z) { // upper tail of N(0,1): erf series below 2*sqrt(2), erfc continued fraction above
    if (z < 0) return 1 - pnormUpper(-z);
    var x = z / Math.SQRT2;
    if (x < 2) { var sum = x, term = x, n = 0; do { n++; term *= -x * x / n; sum += term / (2 * n + 1); } while (Math.abs(term / (2 * n + 1)) > 1e-17 * Math.abs(sum)); return 0.5 * (1 - 2 / Math.sqrt(Math.PI) * sum); }
    var f = 0; for (var k = 80; k >= 1; k--) f = k / 2 / (x + f);
    return 0.5 * Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  function betacf(a, b, x) { // regularised incomplete beta continued fraction (modified Lentz)
    var TINY = 1e-300, c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < TINY) d = TINY; d = 1 / d; var h = d;
    for (var m = 1; m <= 1000; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
      var del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function ptUpper(t, df) { // P(T > t)
    var tail = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
    return t >= 0 ? tail : 1 - tail;
  }
  function qtUpper(p, df) { // t with P(T > t) = p, 0 < p < 0.5 (Newton on the density, bisection-safeguarded)
    var lo = 0, hi = 1, t;
    while (ptUpper(hi, df) > p) { lo = hi; hi *= 2; }
    t = (lo + hi) / 2;
    for (var it = 0; it < 200; it++) {
      var f = ptUpper(t, df) - p;
      if (f > 0) lo = t; else hi = t;
      var dens = Math.exp(lgam((df + 1) / 2) - lgam(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log(1 + t * t / df));
      var tn = t + f / dens;
      if (!(tn > lo && tn < hi)) tn = (lo + hi) / 2;
      if (Math.abs(tn - t) < 1e-15 * Math.max(1, t)) { t = tn; break; }
      t = tn;
    }
    return t;
  }
  function pchisqUpper(x, df) { // regularised upper incomplete gamma Q(df/2, x/2)
    if (!(x > 0)) return 1;
    var a = df / 2, z = x / 2, gln = lgam(a), n, del, sum;
    if (z < a + 1) { var ap = a; sum = 1 / a; del = sum; for (n = 0; n < 10000; n++) { ap++; del *= z / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; } return 1 - sum * Math.exp(-z + a * Math.log(z) - gln); }
    var b = z + 1 - a, c = 1 / 1e-300, dd = 1 / b, h = dd;
    for (var i = 1; i < 10000; i++) { var an = -i * (i - a); b += 2; dd = an * dd + b; if (Math.abs(dd) < 1e-300) dd = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; dd = 1 / dd; var dl = dd * c; h *= dl; if (Math.abs(dl - 1) < 1e-17) break; }
    return Math.exp(-z + a * Math.log(z) - gln) * h;
  }
  var Z975 = 1.959963984540054;

  // I² with the Higgins–Thompson CI through H (meta::calcH / isquared), as netmeta
  function isquared(Q, df) {
    if (!(df > 0)) return { I2: null, lower: null, upper: null };
    var k = df + 1, H = Math.sqrt(Q / df), se;
    if (Q > k) se = 0.5 * (Math.log(Q) - Math.log(k - 1)) / (Math.sqrt(2 * Q) - Math.sqrt(2 * k - 3));
    else se = k > 2 ? Math.sqrt(1 / (2 * (k - 2)) * (1 - 1 / (3 * (k - 2) * (k - 2)))) : NaN;
    var lh = Math.log(Math.max(H, 1)), f = function (h) { return (h * h - 1) / (h * h); };
    return { I2: f(Math.exp(lh)), lower: isFinite(se) ? f(Math.max(Math.exp(lh - Z975 * se), 1)) : null, upper: isFinite(se) ? f(Math.max(Math.exp(lh + Z975 * se), 1)) : null };
  }

  // Design-based decomposition of Q (netmeta decomp.design): within designs = common-effect Q of the studies
  // of each design about that design's own (multivariate) estimate; between designs = total - within.
  function decompDesign(built, Q, df, nTreat) {
    if (nTreat <= 2) return null;
    var designs = {}, keys = [];
    built.studies.forEach(function (st) { var k = st.arms.join(":"); if (!designs[k]) { designs[k] = []; keys.push(k); } designs[k].push(st); });
    var Qw = 0, dfw = 0;
    keys.forEach(function (k) {
      var sts = designs[k], p = sts[0].arms.length - 1;
      var blocks = sts.map(function (st) {
        var V = zeros(p, p);
        if (!st.multiArm) V[0][0] = st.contrasts[0].se * st.contrasts[0].se;
        else for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) V[a][b] = st.v[st.base] + (a === b ? st.v[st.contrasts[a].to] : 0);
        return { W: invert(V), y: st.contrasts.map(function (c) { return c.est; }) };
      });
      var SW = zeros(p, p), Sy = new Array(p).fill(0);
      blocks.forEach(function (bk) { for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) { SW[a][b] += bk.W[a][b]; Sy[a] += bk.W[a][b] * bk.y[b]; } });
      var iSW = invert(SW), th = iSW.map(function (row) { return row.reduce(function (s, v, b) { return s + v * Sy[b]; }, 0); });
      blocks.forEach(function (bk) { var r = bk.y.map(function (v, a) { return v - th[a]; }); for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) Qw += r[a] * bk.W[a][b] * r[b]; });
      dfw += (sts.length - 1) * p;
    });
    var Qb = Q - Qw, dfb = df - dfw, pv = function (q, d) { return d > 0 ? pchisqUpper(q, d) : null; };
    return { Q: [Q, Qw, Qb], df: [df, dfw, dfb], pval: [pv(Q, df), pv(Qw, dfw), pv(Qb, dfb)] };
  }

  /**
   * analyse(rows, opts) — everything netmeta::netmeta() reports for a contrast-level network (its default
   * DerSimonian–Laird τ²), as matrices indexed [i][j] = treatment i versus treatment j (i minus j), over
   * the alphabetically sorted treatments:
   *   common / random: {TE, seTE, lower, upper, pval}; predict: {lower, upper} (random effects; t with
   *   df = Q's degrees of freedom; only when df >= 2); Q, df, pvalQ, tau2, tau, I2 with CI (null when df = 0);
   *   decomp: design-based Q (total, within designs, between designs); pscore: {common, random}
   *   (netrank P-scores).
   *   opts: { randomCi: "classic" (normal, default) | "t-dist" (t with df), smallValues: "desirable" |
   *   "undesirable" (direction of benefit for P-scores; netmeta's default is "desirable") }.
   */
  function analyse(rows, opts) {
    opts = opts || {};
    var fe = fit(rows, { model: "fe" });
    if (!fe.ok) return fe;
    var re = fit(rows, { model: "re", ref: fe.refTreat }), df = fe.df, Q = fe.Q, tr = fe.treatments, n = tr.length;
    var tDist = opts.randomCi === "t-dist" && df > 0, desirable = opts.smallValues !== "undesirable";
    var tq = tDist ? qtUpper(0.025, df) : Z975, tau2 = df > 0 ? re.tau2 : null;
    function league(f, isRandom) {
      var ix = {}; f.nonref.forEach(function (t, k) { ix[t] = k; });
      var M = function () { return tr.map(function () { return new Array(n).fill(null); }); };
      var o = { TE: M(), seTE: M(), lower: M(), upper: M(), pval: M() };
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var a = ix[tr[i]], b = ix[tr[j]], di = a === undefined ? 0 : f.d[a], dj = b === undefined ? 0 : f.d[b], v = 0;
        if (a !== undefined) v += f.cov[a][a]; if (b !== undefined) v += f.cov[b][b]; if (a !== undefined && b !== undefined) v -= 2 * f.cov[a][b];
        var te = di - dj, se = Math.sqrt(Math.max(0, v)), crit = isRandom && tDist ? tq : Z975;
        o.TE[i][j] = te; o.seTE[i][j] = se;
        if (i === j) continue;
        o.lower[i][j] = te - crit * se; o.upper[i][j] = te + crit * se;
        o.pval[i][j] = isRandom && tDist ? 2 * ptUpper(Math.abs(te / se), df) : 2 * pnormUpper(Math.abs(te / se));
      }
      return o;
    }
    var common = league(fe, false), random = league(df > 0 ? re : fe, true), predict = null;
    if (df >= 2) {
      var tp = qtUpper(0.025, df);
      predict = { lower: random.TE.map(function (row) { return row.slice(); }), upper: random.TE.map(function (row) { return row.slice(); }) };
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        if (i === j) { predict.lower[i][j] = predict.upper[i][j] = null; continue; }
        var sp = Math.sqrt(random.seTE[i][j] * random.seTE[i][j] + tau2);
        predict.lower[i][j] = random.TE[i][j] - tp * sp; predict.upper[i][j] = random.TE[i][j] + tp * sp;
      }
    }
    function pscores(L) { // netrank: mean over j != i of P(i better than j), from the two-sided p-values
      return tr.map(function (_, i) {
        var s = 0, c = 0;
        for (var j = 0; j < n; j++) {
          if (i === j || L.pval[i][j] === null || !isFinite(L.pval[i][j])) continue;
          var w = (1 + Math.sign(L.TE[i][j])) / 2, p = L.pval[i][j];
          s += desirable ? w * p / 2 + (1 - w) * (1 - p / 2) : w * (1 - p / 2) + (1 - w) * p / 2; c++;
        }
        return c ? s / c : null;
      });
    }
    var I = isquared(Q, df), built = buildStudies(rows);
    return {
      ok: true, treatments: tr, k: built.studies.length, m: rows.length, n: n, df: df, Q: Q,
      pvalQ: df > 0 ? pchisqUpper(Q, df) : null, tau2: tau2, tau: tau2 === null ? null : Math.sqrt(tau2),
      I2: I.I2, lowerI2: I.lower, upperI2: I.upper, randomCi: tDist ? "t-dist" : "classic", smallValues: desirable ? "desirable" : "undesirable",
      common: common, random: random, predict: predict, decomp: decompDesign(built, Q, df, n),
      pscore: { common: pscores(common), random: pscores(random) }, multiArmStudies: fe.multiArmStudies,
    };
  }

  var api = {
    fit: fit,
    analyse: analyse,
    checkStudies: checkStudies,
    buildStudies: buildStudies,
    assemble: assemble,
    gls: gls,
    generalisedDL: generalisedDL,
    _invert: invert,
    _dist: { pnormUpper: pnormUpper, ptUpper: ptUpper, qtUpper: qtUpper, pchisqUpper: pchisqUpper, isquared: isquared },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNmaMultiarm = api;
})(typeof window !== "undefined" ? window : globalThis);
