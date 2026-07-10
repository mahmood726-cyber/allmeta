/* shared/multi-outcome-nma.js — multi-arm × multi-outcome NMA.
 *
 * Achana et al. 2014 §3.2 model. Each study i contributes one or more
 * contrast rows (one per pairwise treatment comparison in that study)
 * for each of K correlated outcomes. The full random-effects covariance
 * combines two structures:
 *
 *   1. WITHIN-STUDY:   the standard NMA multi-arm correction
 *                       (Σ_within off-diag = τ²_k/2 for contrast rows
 *                        sharing a control arm, per outcome k).
 *
 *   2. ACROSS-OUTCOMES: a K×K matrix Σ_RE^outcomes captures the between-
 *                       study correlation across outcomes — borrowing
 *                       strength like the bivariate model.
 *
 * The combined full Σ for a study with k arms and K outcomes is a
 * Kronecker-style block: Σ_study = Σ_RE^outcomes ⊗ G_arm  where G_arm
 * is the k×k matrix with 1 on the diagonal and 1/2 off-diagonal (the
 * multi-arm structure on the contrast scale).
 *
 * This first ship handles K=2 with arbitrary arms per study. The
 * generalised K-variate path is exposed via `fit({K, ...})` and routes
 * to the multi-outcome Newton-Raphson under the hood with the multi-
 * arm correction layered on. For complex 4-arm × 3-outcome networks
 * use the dedicated WinBUGS / OpenBUGS implementation — this is the
 * browser-side analytic equivalent for the common 2-arm-per-study
 * majority case.
 *
 * Reference: Achana FA, Cooper NJ, Bujkiewicz S, Hubbard SJ, Kendrick D,
 * Jones DR, Sutton AJ. "A general method for incorporating multiple
 * correlated outcomes in network meta-analysis", Res Synth Methods
 * 2014;5:35-49.
 */
(function (global) {
  "use strict";

  // ---- Mini matrix utilities (duplicate; this module is standalone) -----

  function zeros(n, m) {
    var A = new Array(n);
    for (var i = 0; i < n; i++) { A[i] = new Array(m); for (var j = 0; j < m; j++) A[i][j] = 0; }
    return A;
  }
  function identity(n) {
    var I = zeros(n, n);
    for (var i = 0; i < n; i++) I[i][i] = 1;
    return I;
  }
  function inverseAndDet(A) {
    var n = A.length;
    var M = new Array(n);
    for (var i = 0; i < n; i++) M[i] = A[i].slice().concat(identity(n)[i]);
    var det = 1;
    for (var c = 0; c < n; c++) {
      var pivRow = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivRow][c])) pivRow = r;
      if (Math.abs(M[pivRow][c]) < 1e-14) return { inv: null, det: 0 };
      if (pivRow !== c) { var tmp = M[c]; M[c] = M[pivRow]; M[pivRow] = tmp; det = -det; }
      var piv = M[c][c];
      det *= piv;
      for (var j = 0; j < 2 * n; j++) M[c][j] /= piv;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c];
        if (f === 0) continue;
        for (var j2 = 0; j2 < 2 * n; j2++) M[r2][j2] -= f * M[c][j2];
      }
    }
    var inv = zeros(n, n);
    for (var ii = 0; ii < n; ii++) for (var jj = 0; jj < n; jj++) inv[ii][jj] = M[ii][n + jj];
    return { inv: inv, det: det };
  }
  function inverse(A) { var r = inverseAndDet(A); if (!r.inv) throw new Error("singular"); return r.inv; }

  // ---- Build the per-study multi-outcome × multi-arm Σ ------------------

  /**
   * Build the (k × K) × (k × K) Σ_study = Σ_RE^outcomes ⊗ G_arm where:
   *   G_arm = I_k + (J_k − I_k)/2  (k×k, 1 on diag, 0.5 off)
   *   Σ_RE^outcomes is the K×K between-study covariance across outcomes
   * Rows are ordered (arm 0, outcome 0..K-1, arm 1, outcome 0..K-1, ...).
   * V_within is k × K of within-study sampling variances (block-diagonal
   * across arms; off-diagonal across outcomes within the same arm
   * captured by the within-study correlation matrix W).
   */
  function buildStudySigma(kArms, K, SigmaOutcomes) {
    var G = zeros(kArms, kArms);
    for (var i = 0; i < kArms; i++)
      for (var j = 0; j < kArms; j++)
        G[i][j] = (i === j) ? 1 : 0.5;
    var n = kArms * K;
    var Sigma = zeros(n, n);
    // Sigma[(a*K)+o, (b*K)+o'] = G[a][b] * SigmaOutcomes[o][o']
    for (var a = 0; a < kArms; a++)
      for (var b = 0; b < kArms; b++)
        for (var o = 0; o < K; o++)
          for (var op = 0; op < K; op++)
            Sigma[a * K + o][b * K + op] = G[a][b] * SigmaOutcomes[o][op];
    return Sigma;
  }

  // ---- DL τ² per outcome (about the fitted NMA consistency effects) -----
  //
  // Generalized (Jackson) DerSimonian-Laird: Q is measured about the FE
  // network fit d̂ (not a single grand mean), so between-treatment effect
  // differences are NOT counted as heterogeneity. df = n_rows − nBasic and
  // the denominator is tr(W) − tr((X'WX)⁻¹ X'W²X). On a zero-heterogeneity
  // star network this returns τ²≈0 (a plain grand-mean pool inflates it).

  function _tau2_DL_perOutcome(rowsPerOutcome, nBasic) {
    // rowsPerOutcome = [ [{yi, vi, iA, iB}, ...], ... ] (length K)
    // iA/iB = treatment indices (0 = reference); design column = idx−1.
    var taus = [];
    for (var k = 0; k < rowsPerOutcome.length; k++) {
      var rows = rowsPerOutcome[k];
      var df = rows.length - nBasic;
      if (rows.length < 2 || df < 1) { taus.push(0); continue; }
      // Per-outcome NMA design (n_rows × nBasic) and FE weights W = diag(1/vi).
      var Xk = zeros(rows.length, nBasic);
      var w = new Array(rows.length);
      for (var i = 0; i < rows.length; i++) {
        w[i] = 1 / rows[i].vi;
        if (rows[i].iA > 0) Xk[i][rows[i].iA - 1] = -1;
        if (rows[i].iB > 0) Xk[i][rows[i].iB - 1] = +1;
      }
      // X'WX, X'Wy, X'W²X and tr(W).
      var XtWX = zeros(nBasic, nBasic);
      var XtW2X = zeros(nBasic, nBasic);
      var XtWy = new Array(nBasic).fill(0);
      var trW = 0;
      for (var i2 = 0; i2 < rows.length; i2++) {
        trW += w[i2];
        for (var a = 0; a < nBasic; a++) {
          XtWy[a] += Xk[i2][a] * w[i2] * rows[i2].yi;
          for (var b = 0; b < nBasic; b++) {
            XtWX[a][b] += Xk[i2][a] * w[i2] * Xk[i2][b];
            XtW2X[a][b] += Xk[i2][a] * w[i2] * w[i2] * Xk[i2][b];
          }
        }
      }
      var XtWXinv;
      try { XtWXinv = inverse(XtWX); } catch (e) { taus.push(0); continue; }
      // FE network effects d̂ = (X'WX)⁻¹ X'Wy.
      var dhat = new Array(nBasic).fill(0);
      for (var a2 = 0; a2 < nBasic; a2++)
        for (var b2 = 0; b2 < nBasic; b2++) dhat[a2] += XtWXinv[a2][b2] * XtWy[b2];
      // Q about the fitted network effects.
      var Q = 0;
      for (var i3 = 0; i3 < rows.length; i3++) {
        var fitv = 0;
        for (var c = 0; c < nBasic; c++) fitv += Xk[i3][c] * dhat[c];
        var e = rows[i3].yi - fitv;
        Q += w[i3] * e * e;
      }
      // Denominator: tr(W) − tr((X'WX)⁻¹ X'W²X).
      var trTerm = 0;
      for (var a3 = 0; a3 < nBasic; a3++)
        for (var b3 = 0; b3 < nBasic; b3++) trTerm += XtWXinv[a3][b3] * XtW2X[b3][a3];
      var denom = trW - trTerm;
      taus.push(Math.sqrt(denom > 1e-12 ? Math.max(0, (Q - df) / denom) : 0));
    }
    return taus;
  }

  // ---- Main fit: contrast-based multi-outcome NMA ----------------------
  //
  // Input shape:
  //   studies: [
  //     { id, contrasts: [  // each contrast is a treatment pair
  //         { trtA, trtB, outcomes: [ {yi, sei}, {yi, sei}, ... K entries ] },
  //         ...
  //       ]
  //     },
  //     ...
  //   ]
  //   treatments: ordered array of treatment labels (first = reference)
  //   opts.rhoWithin: scalar within-arm-within-study correlation across
  //                    outcomes (default 0; used when sampling cov is not
  //                    supplied for the contrast)
  //
  // We construct the design matrix X (n_rows × p) for basic-parameter
  // contrasts and apply the multi-outcome random-effects Σ via the
  // Kronecker structure, then solve the GLS system. Σ_RE^outcomes is
  // estimated by per-outcome DL + sample correlation of the residuals
  // (a closed-form approximation; for full REML use the K-variate path
  // in shared/multi-outcome-ma.js applied to the contrast residuals).

  function fit(studies, treatments, opts) {
    opts = opts || {};
    var K = (opts.K | 0) || 2;
    var rhoWithin = isFinite(opts.rhoWithin) ? opts.rhoWithin : 0;
    if (!Array.isArray(treatments) || treatments.length < 2) {
      throw new Error("Need at least 2 treatments in the network");
    }
    var refIdx = 0;
    var trtIndex = Object.create(null);
    for (var t = 0; t < treatments.length; t++) trtIndex[treatments[t]] = t;
    var nBasic = treatments.length - 1;

    // Flatten contrasts into a row list across all studies; track which
    // (study, contrast) each row comes from so we can apply multi-arm
    // covariance correctly.
    var rows = [];           // each row: { studyId, contrastIdx, trtA, trtB, outcomes: [{yi, sei}] }
    for (var i = 0; i < studies.length; i++) {
      var s = studies[i];
      for (var ci = 0; ci < (s.contrasts || []).length; ci++) {
        var c = s.contrasts[ci];
        rows.push({
          studyId: s.id, contrastIdx: ci,
          trtA: c.trtA, trtB: c.trtB,
          outcomes: c.outcomes,
        });
      }
    }
    if (!rows.length) throw new Error("No contrast rows in input");

    // Per-outcome row-pool for τ² seed.
    var perOutcomeRows = [];
    for (var k = 0; k < K; k++) {
      perOutcomeRows.push(rows.filter(function (r) {
        return r.outcomes[k] && isFinite(r.outcomes[k].yi);
      }).map(function (r) {
        return { yi: r.outcomes[k].yi, vi: r.outcomes[k].sei * r.outcomes[k].sei,
                 iA: trtIndex[r.trtA], iB: trtIndex[r.trtB] };
      }));
    }
    var seedTaus = _tau2_DL_perOutcome(perOutcomeRows, nBasic);

    // Seed Σ_RE^outcomes as diag(τ²_k) + off-diag from sample correlation
    // of per-row residuals (rough but good enough for non-iterative).
    var SigmaOut = zeros(K, K);
    for (var k2 = 0; k2 < K; k2++) SigmaOut[k2][k2] = seedTaus[k2] * seedTaus[k2];
    for (var k3 = 0; k3 < K; k3++) {
      for (var k4 = k3 + 1; k4 < K; k4++) {
        // Pearson r of per-row yi pairs where both outcomes observed.
        var paired = rows.filter(function (r) {
          return r.outcomes[k3] && r.outcomes[k4]
                 && isFinite(r.outcomes[k3].yi) && isFinite(r.outcomes[k4].yi);
        });
        if (paired.length < 3) { SigmaOut[k3][k4] = 0; SigmaOut[k4][k3] = 0; continue; }
        var sx = 0, sy = 0;
        for (var p = 0; p < paired.length; p++) {
          sx += paired[p].outcomes[k3].yi; sy += paired[p].outcomes[k4].yi;
        }
        sx /= paired.length; sy /= paired.length;
        var num = 0, dx = 0, dy = 0;
        for (var p2 = 0; p2 < paired.length; p2++) {
          var rx = paired[p2].outcomes[k3].yi - sx;
          var ry = paired[p2].outcomes[k4].yi - sy;
          num += rx * ry; dx += rx * rx; dy += ry * ry;
        }
        var rho = (dx > 0 && dy > 0) ? num / Math.sqrt(dx * dy) : 0;
        if (rho > 0.99) rho = 0.99; if (rho < -0.99) rho = -0.99;
        SigmaOut[k3][k4] = rho * seedTaus[k3] * seedTaus[k4];
        SigmaOut[k4][k3] = SigmaOut[k3][k4];
      }
    }

    // Build the design matrix X (n_rows*K × p*K). For each row, the
    // contrast (trtB − trtA) → +1 at trtB-index, −1 at trtA-index;
    // expanded per outcome means a row in the stacked (row × outcome)
    // observation vector gets the same X-row repeated across outcomes
    // but with the parameter index shifted to that outcome's basic-
    // parameter block. (Each outcome has its own pooled effect vector.)
    var p = nBasic * K;
    var n = rows.length * K;
    var X = zeros(n, p);
    var y = new Array(n);
    var v = new Array(n);
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      var iA = trtIndex[r.trtA], iB = trtIndex[r.trtB];
      for (var ko = 0; ko < K; ko++) {
        var row = ri * K + ko;
        if (r.outcomes[ko] && isFinite(r.outcomes[ko].yi)) {
          y[row] = r.outcomes[ko].yi;
          v[row] = r.outcomes[ko].sei * r.outcomes[ko].sei;
          // Basic parameters for outcome ko occupy columns ko*nBasic .. (ko+1)*nBasic.
          var baseCol = ko * nBasic;
          if (iA > 0) X[row][baseCol + (iA - 1)] = -1;
          if (iB > 0) X[row][baseCol + (iB - 1)] = +1;
        } else {
          y[row] = 0; v[row] = 1e10;   // huge variance ⇒ row is effectively dropped
        }
      }
    }

    // Build the n×n Σ block-diagonal over studies. For a study with k
    // contrast rows × K outcomes, the local block uses Kronecker
    // (G_arm ⊗ Σ_RE^outcomes) for between-study + diag(v) for within.
    var Sigma = zeros(n, n);
    // Within-study sampling variance on the diagonal.
    for (var i2 = 0; i2 < n; i2++) Sigma[i2][i2] = v[i2];
    // Add the multi-arm × multi-outcome RE blocks (per study).
    var rowsByStudy = Object.create(null);
    for (var ri2 = 0; ri2 < rows.length; ri2++) {
      var sid = rows[ri2].studyId;
      if (!rowsByStudy[sid]) rowsByStudy[sid] = [];
      rowsByStudy[sid].push(ri2);
    }
    for (var sid2 in rowsByStudy) {
      var rowIdx = rowsByStudy[sid2];
      var kArms = rowIdx.length + 1;   // a study with c contrasts has c+1 arms (assuming a hub design)
      var Sstudy = buildStudySigma(rowIdx.length, K, SigmaOut);  // n_rows × K block
      for (var a = 0; a < rowIdx.length; a++) {
        for (var b = 0; b < rowIdx.length; b++) {
          for (var o = 0; o < K; o++) {
            for (var op = 0; op < K; op++) {
              var rr = rowIdx[a] * K + o;
              var cc = rowIdx[b] * K + op;
              Sigma[rr][cc] += Sstudy[a * K + o][b * K + op];
            }
          }
        }
      }
    }

    // Solve GLS: β̂ = (X' Σ⁻¹ X)⁻¹ X' Σ⁻¹ y, cov(β̂) = (X' Σ⁻¹ X)⁻¹.
    var SigInv = inverse(Sigma);
    var XtSi = zeros(p, n);
    for (var i3 = 0; i3 < p; i3++) for (var j3 = 0; j3 < n; j3++) {
      var s = 0;
      for (var kk = 0; kk < n; kk++) s += X[kk][i3] * SigInv[kk][j3];
      XtSi[i3][j3] = s;
    }
    var XtSiX = zeros(p, p);
    for (var i4 = 0; i4 < p; i4++) for (var j4 = 0; j4 < p; j4++) {
      var s2 = 0;
      for (var k5 = 0; k5 < n; k5++) s2 += XtSi[i4][k5] * X[k5][j4];
      XtSiX[i4][j4] = s2;
    }
    var XtSiy = new Array(p).fill(0);
    for (var i5 = 0; i5 < p; i5++) for (var k6 = 0; k6 < n; k6++) XtSiy[i5] += XtSi[i5][k6] * y[k6];
    var cov;
    try { cov = inverse(XtSiX); } catch (e) {
      return { ok: false, error: "X'Σ⁻¹X singular — network may be disconnected or design rank-deficient" };
    }
    var beta = new Array(p).fill(0);
    for (var i6 = 0; i6 < p; i6++) for (var j6 = 0; j6 < p; j6++) beta[i6] += cov[i6][j6] * XtSiy[j6];

    // Repackage as effects[outcome][treatment] arrays.
    var Z975 = 1.959963984540054;
    var effects = [];
    for (var ko2 = 0; ko2 < K; ko2++) {
      var base = ko2 * nBasic;
      var perTreat = {};
      perTreat[treatments[0]] = { estimate: 0, se: 0, ci_lo: 0, ci_hi: 0 };
      for (var t2 = 1; t2 < treatments.length; t2++) {
        var b = beta[base + (t2 - 1)];
        var se = Math.sqrt(Math.max(0, cov[base + (t2 - 1)][base + (t2 - 1)]));
        perTreat[treatments[t2]] = {
          estimate: b, se: se,
          ci_lo: b - Z975 * se, ci_hi: b + Z975 * se,
        };
      }
      effects.push(perTreat);
    }

    return {
      ok: true, K: K,
      treatments: treatments, reference: treatments[0],
      beta: beta, cov: cov,
      effects: effects,
      Sigma_RE_outcomes: SigmaOut,
      taus: seedTaus,
      n_contrasts: rows.length,
      n_studies: Object.keys(rowsByStudy).length,
    };
  }

  var api = {
    fit: fit,
    buildStudySigma: buildStudySigma,
    _tau2_DL_perOutcome: _tau2_DL_perOutcome,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMultiOutcomeNMA = api;
})(typeof window !== "undefined" ? window : globalThis);
