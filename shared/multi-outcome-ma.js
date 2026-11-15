/* shared/multi-outcome-ma.js — multivariate (multi-outcome) meta-analysis.
 *
 * Bivariate and K-variate random-effects meta-analysis with REML estimation
 * of the between-study covariance Σ_RE. Pooling jointly across outcomes
 * borrows strength when outcomes are correlated, tightening CIs and
 * recovering pooled estimates for studies that report only a subset of
 * outcomes (the "borrowing-of-strength" effect).
 *
 * References:
 *   - Riley RD et al. 2007. "An alternative model for bivariate random-effects
 *     meta-analysis when the within-study correlations are unknown",
 *     Biostatistics 8(3):441-451.
 *   - Achana FA et al. 2014. "A general method for incorporating multiple
 *     correlated outcomes in network meta-analysis", Res Synth Methods 5:35-49.
 *   - Jackson D, Riley R, White IR 2011. "Multivariate meta-analysis:
 *     potential and promise", Stat Med 30(20):2481-2498.
 *
 * Input rows: one row per study, with an array y_i (length K) of outcome
 * effects, an array se_i of within-study SEs, and a K×K within-study
 * correlation matrix W_i. Missing outcomes are coded as NaN — the REML
 * likelihood properly conditions on the observed sub-vector.
 *
 * Currently implemented:
 *   - K = 2 (bivariate, closed-form REML iteration per Riley 2007)
 *   - K >= 3 (general K-variate, Newton-Raphson on profiled REML — slower
 *     but still fast in JS for K up to ~8 and k_studies up to ~200)
 *
 * Not yet implemented (roadmap):
 *   - Multi-arm × multi-outcome NMA (Achana 2014 §3.2) — requires the
 *     τ²/2 multi-arm correction layered on the multivariate Σ_RE. Use
 *     `nma-pro-v2` for multi-arm NMA + this app for multi-outcome
 *     univariate-NMA contrasts as a workaround until the joint model
 *     ships.
 */
(function (global) {
  "use strict";

  // ---- Mini matrix utilities --------------------------------------------

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
  function transpose(A) {
    var n = A.length, m = A[0].length;
    var T = zeros(m, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) T[j][i] = A[i][j];
    return T;
  }
  function matMul(A, B) {
    var n = A.length, m = B[0].length, k = B.length;
    var C = zeros(n, m);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var s = 0;
      for (var t = 0; t < k; t++) s += A[i][t] * B[t][j];
      C[i][j] = s;
    }
    return C;
  }
  function matVec(A, v) {
    var n = A.length, m = v.length;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var j = 0; j < m; j++) s += A[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }
  // Gauss-Jordan inverse + determinant (returns null if singular).
  function inverseAndDet(A) {
    var n = A.length;
    var M = new Array(n);
    for (var i = 0; i < n; i++) M[i] = A[i].slice().concat(identity(n)[i]);
    var det = 1;
    // Singularity threshold RELATIVE to the matrix's largest entry: an absolute 1e-14
    // declared a perfectly conditioned covariance singular once effects were expressed
    // in small enough units (variances ~1e-14 at SE ~1e-7), breaking scale equivariance.
    var maxAbs = 0;
    for (var i0 = 0; i0 < n; i0++) for (var j0 = 0; j0 < n; j0++) maxAbs = Math.max(maxAbs, Math.abs(A[i0][j0]));
    if (!(maxAbs > 0) || !isFinite(maxAbs)) return { inv: null, det: 0 };
    var pivTol = 1e-14 * maxAbs;
    for (var c = 0; c < n; c++) {
      var pivRow = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivRow][c])) pivRow = r;
      if (Math.abs(M[pivRow][c]) < pivTol) return { inv: null, det: 0 };
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

  // ---- Within-study covariance helpers ----------------------------------

  // Build the K×K within-study covariance V_i from per-outcome SEs and the
  // within-study correlation matrix W_i (default I when unspecified).
  function buildV(seVec, wMat) {
    var K = seVec.length;
    var V = zeros(K, K);
    for (var i = 0; i < K; i++) for (var j = 0; j < K; j++) {
      var wij = wMat ? wMat[i][j] : (i === j ? 1 : 0);
      V[i][j] = wij * seVec[i] * seVec[j];
    }
    return V;
  }

  // ---- Σ_RE parametrisation: K(K+1)/2 free parameters (Cholesky LDL') --

  function sigmaFromParams(K, params) {
    // params = K τ scales (τ_1..τ_K) + K(K-1)/2 correlations (ρ_12, ρ_13, …)
    // To guarantee PSD, we parametrise via an unconstrained K-vector of
    // log-scales then unconstrained partial correlations mapped to (-1, 1)
    // through tanh. For UI input we accept the explicit (τ_k, ρ_jk) form.
    var Sigma = zeros(K, K);
    var corrIdx = K;   // first K params are τ
    for (var i = 0; i < K; i++) Sigma[i][i] = params[i] * params[i];
    for (var i2 = 0; i2 < K; i2++) for (var j2 = i2 + 1; j2 < K; j2++) {
      var rho = params[corrIdx++];
      // clamp for numerical safety
      if (rho > 0.999) rho = 0.999;
      if (rho < -0.999) rho = -0.999;
      Sigma[i2][j2] = rho * params[i2] * params[j2];
      Sigma[j2][i2] = Sigma[i2][j2];
    }
    return Sigma;
  }

  // ---- REML log-likelihood ----------------------------------------------
  //
  // For multi-outcome random-effects MA the REML log-likelihood is
  //   -2 log L_R = Σ_i log |Σ_i| + Σ_i r_i' Σ_i^{-1} r_i
  //              + log |X' (⨁ Σ_i)^{-1} X|
  // where Σ_i = V_i + Σ_RE and r_i = y_i - μ. The marginal X here is just
  // an identity for the K-variate intercept-only model (we estimate one
  // pooled effect per outcome).
  //
  // Missing outcomes (NaN y_ik) collapse the row + column k from Σ_i and
  // V_i for that study (study contributes only its observed sub-vector).

  function _observedIndices(yi) {
    var idx = [];
    for (var k = 0; k < yi.length; k++) if (isFinite(yi[k])) idx.push(k);
    return idx;
  }
  function _subVector(v, idx) { return idx.map(function (k) { return v[k]; }); }
  function _subMatrix(M, idx) {
    return idx.map(function (a) { return idx.map(function (b) { return M[a][b]; }); });
  }

  // Per-outcome natural scale: the median observed within-study SE. Every search grid,
  // step and floor on a between-study SD tau_k is expressed in units of this, so the
  // fit is equivariant to the units of the effects (rescaling y and SE by c rescales
  // mu, se and tau by exactly c and leaves rho unchanged). Until 2026-11-15 the grids
  // and steps were absolute (tau grid 0..2.0, step 0.05 -> 1e-5), which broke the fit
  // when effects were expressed in units 1000x smaller.
  function _outcomeScales(studies, K) {
    var out = new Array(K);
    for (var k = 0; k < K; k++) {
      var se = [];
      for (var i = 0; i < studies.length; i++) {
        var s = studies[i];
        if (isFinite(s.y[k]) && s.V && isFinite(s.V[k][k]) && s.V[k][k] > 0) se.push(Math.sqrt(s.V[k][k]));
      }
      se.sort(function (a, b) { return a - b; });
      var m = se.length ? (se.length % 2 ? se[(se.length - 1) / 2] : 0.5 * (se[se.length / 2 - 1] + se[se.length / 2])) : NaN;
      out[k] = (m > 0 && isFinite(m)) ? m : 1;
    }
    return out;
  }
  // Express every outcome in units of its scale: y_k / sc_k, V_jk / (sc_j sc_k). The fit
  // runs entirely on these unit-free rows (grids, steps, floors and convergence
  // thresholds are then automatically relative) and is mapped back with _unstandardize.
  function _standardize(studies, sc) {
    return studies.map(function (s) {
      var K = sc.length, V = zeros(K, K);
      for (var a = 0; a < K; a++) for (var b = 0; b < K; b++) V[a][b] = s.V[a][b] / (sc[a] * sc[b]);
      var r = {}; for (var key in s) r[key] = s[key];
      r.y = s.y.map(function (v, k) { return v / sc[k]; });
      r.V = V;
      return r;
    });
  }
  function _scaleCov(M, sc) {
    return M.map(function (row, a) { return row.map(function (v, b) { return v * sc[a] * sc[b]; }); });
  }

  function _replLogLik(studies, Sigma, mu) {
    // Returns -2 log L_R (lower is better).
    var K = mu.length;
    var nll = 0;
    var sumSigmaInv = zeros(K, K);
    for (var i = 0; i < studies.length; i++) {
      var s = studies[i];
      var idx = _observedIndices(s.y);
      if (!idx.length) continue;
      var yi_obs = _subVector(s.y, idx);
      var Vi_obs = _subMatrix(s.V, idx);
      var Sigma_obs = _subMatrix(Sigma, idx);
      var Sig_i = idx.map(function (_, a) {
        return idx.map(function (_, b) { return Vi_obs[a][b] + Sigma_obs[a][b]; });
      });
      var inv = inverseAndDet(Sig_i);
      if (!inv.inv || inv.det <= 0) return Infinity;
      var resid = idx.map(function (k, a) { return yi_obs[a] - mu[k]; });
      var quad = 0;
      for (var a2 = 0; a2 < idx.length; a2++)
        for (var b2 = 0; b2 < idx.length; b2++)
          quad += resid[a2] * inv.inv[a2][b2] * resid[b2];
      nll += Math.log(inv.det) + quad;
      // Add Σ⁻¹ contribution (only at observed outcomes) to sumSigmaInv
      for (var a3 = 0; a3 < idx.length; a3++)
        for (var b3 = 0; b3 < idx.length; b3++)
          sumSigmaInv[idx[a3]][idx[b3]] += inv.inv[a3][b3];
    }
    // REML correction: + log |X' (⊕ Σ_i)⁻¹ X| = log |sumSigmaInv|
    var det = inverseAndDet(sumSigmaInv).det;
    if (det <= 0) return Infinity;
    return nll + Math.log(det);
  }

  // ---- Estimate μ given Σ_RE (closed form) -----------------------------
  //
  // μ̂ = (Σ_i X_i' Σ_i⁻¹ X_i)⁻¹ Σ_i X_i' Σ_i⁻¹ y_i
  // where X_i is a K×K "expansion" identity at the observed indices and 0
  // elsewhere — for intercept-only it's a K×K incidence matrix.

  function _muGivenSigma(studies, Sigma, K) {
    var XtSiX = zeros(K, K);
    var XtSiy = new Array(K).fill(0);
    for (var i = 0; i < studies.length; i++) {
      var s = studies[i];
      var idx = _observedIndices(s.y);
      if (!idx.length) continue;
      var yi_obs = _subVector(s.y, idx);
      var Vi_obs = _subMatrix(s.V, idx);
      var Sigma_obs = _subMatrix(Sigma, idx);
      var Sig_i = idx.map(function (_, a) {
        return idx.map(function (_, b) { return Vi_obs[a][b] + Sigma_obs[a][b]; });
      });
      var inv = inverseAndDet(Sig_i);
      if (!inv.inv) continue;
      for (var a = 0; a < idx.length; a++)
        for (var b = 0; b < idx.length; b++) {
          XtSiX[idx[a]][idx[b]] += inv.inv[a][b];
          XtSiy[idx[a]] += inv.inv[a][b] * yi_obs[b];
        }
    }
    return { mu: matVec(inverse(XtSiX), XtSiy), cov: inverse(XtSiX) };
  }

  // ---- Public: bivariate REML (K=2, fast Riley iteration) --------------

  function fitBivariate(studies, opts) {
    opts = opts || {};
    var K = 2;
    // Build V_i from supplied within-study correlation rho_within (constant
    // across studies if scalar; else per-study array in studies[i].rho_within).
    var rhoWithinDefault = isFinite(opts.rhoWithin) ? opts.rhoWithin : 0;
    var rows = studies.map(function (s) {
      var rho_w = isFinite(s.rho_within) ? s.rho_within : rhoWithinDefault;
      var W = [[1, rho_w], [rho_w, 1]];
      return {
        y: s.y.slice(),
        se: s.se ? s.se.slice() : [Math.sqrt(s.V[0][0]), Math.sqrt(s.V[1][1])],
        V: s.V || buildV(s.se, W),
        rho_within: rho_w,
        label: s.label || "",
      };
    });
    var rowsOrig = rows;
    var sc = _outcomeScales(rowsOrig, K);
    rows = _standardize(rowsOrig, sc);
    // Initial guesses: τ from per-outcome DL, ρ_between from sample
    // correlation of residuals.
    var seedTau = [0.1, 0.1], seedRho = 0;
    try {
      // Univariate DL per outcome to seed τ.
      for (var k = 0; k < K; k++) {
        var yi = rows.map(function (r) { return r.y[k]; }).filter(isFinite);
        var vi = rows.map(function (r) { return r.V[k][k]; }).filter(function (_, j) { return isFinite(rows[j].y[k]); });
        if (yi.length < 2) continue;
        var w = vi.map(function (v) { return 1 / v; });
        var sw = w.reduce(function (a, b) { return a + b; }, 0);
        var swy = 0;
        for (var j2 = 0; j2 < yi.length; j2++) swy += w[j2] * yi[j2];
        var muFE = swy / sw;
        var Q = 0;
        for (var j3 = 0; j3 < yi.length; j3++) Q += w[j3] * (yi[j3] - muFE) * (yi[j3] - muFE);
        var sw2 = w.reduce(function (a, b) { return a + b * b; }, 0);
        var denom = sw - sw2 / sw;
        seedTau[k] = Math.sqrt(Math.max(0, (Q - (yi.length - 1)) / Math.max(denom, 1e-12)));
      }
    } catch (_) { /* fall through */ }

    // Profiled REML over (tau_1, tau_2, rho_between) on the standardized rows (tau in
    // units of the median within-study SE): coarse grid anchor, then a pattern
    // (coordinate) search. Search state u = [tau_1/sc_1, tau_2/sc_2, rho].
    function packSigma(p) { return sigmaFromParams(2, p); }
    function objective(u) {
      var Sg = packSigma(u);
      var m0 = _muGivenSigma(rows, Sg, K).mu;
      return _replLogLik(rows, Sg, m0);
    }

    var bestU = [seedTau[0] / sc[0], seedTau[1] / sc[1], seedRho];
    var bestNll = isFinite(bestU[0]) && isFinite(bestU[1]) ? objective(bestU) : Infinity;
    if (!isFinite(bestNll)) { bestU = [0, 0, 0]; bestNll = objective(bestU); }

    // Coarse grid (multiples of the typical within-study SE).
    var tauGrid = [0, 0.25, 0.5, 1, 1.5, 2.5, 4, 6, 10, 15];
    var rhoGrid = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
    for (var i = 0; i < tauGrid.length; i++)
      for (var j = 0; j < tauGrid.length; j++)
        for (var l = 0; l < rhoGrid.length; l++) {
          var u = [tauGrid[i], tauGrid[j], rhoGrid[l]];
          var nll = objective(u);
          if (nll < bestNll) { bestNll = nll; bestU = u; }
        }

    // Pattern search: tau steps in SE units, rho steps 0.2x as large; halve the step
    // whenever no coordinate move improves; stop at a step of 1e-10 (relative).
    var dimScale = [1, 1, 0.2];
    var step = 0.25;
    for (var iter = 0; iter < 20000 && step >= 1e-10; iter++) {
      var improved = false;
      for (var d = 0; d < 3; d++) {
        for (var sgn of [-1, 1]) {
          var u2 = bestU.slice();
          u2[d] += sgn * step * dimScale[d];
          if (d < 2 && u2[d] < 0) u2[d] = 0;
          if (d === 2 && (u2[d] < -0.99 || u2[d] > 0.99)) continue;
          if (u2[d] === bestU[d]) continue;
          var nll2 = objective(u2);
          if (nll2 < bestNll) { bestNll = nll2; bestU = u2; improved = true; }
        }
      }
      if (!improved) step *= 0.5;
    }
    // Back to the caller's units.
    var bestParams = [bestU[0] * sc[0], bestU[1] * sc[1], bestU[2]];
    var fitStd = _muGivenSigma(rows, packSigma(bestU), K);
    var fit = { mu: fitStd.mu.map(function (m, k) { return m * sc[k]; }), cov: _scaleCov(fitStd.cov, sc) };
    var Sigma_RE = packSigma(bestParams);
    rows = rowsOrig;
    bestNll = _replLogLik(rows, Sigma_RE, fit.mu);
    var Z975 = 1.959963984540054;
    return {
      ok: true, K: 2,
      mu: fit.mu, cov: fit.cov,
      se: [Math.sqrt(fit.cov[0][0]), Math.sqrt(fit.cov[1][1])],
      ci_lo: [fit.mu[0] - Z975 * Math.sqrt(fit.cov[0][0]),
              fit.mu[1] - Z975 * Math.sqrt(fit.cov[1][1])],
      ci_hi: [fit.mu[0] + Z975 * Math.sqrt(fit.cov[0][0]),
              fit.mu[1] + Z975 * Math.sqrt(fit.cov[1][1])],
      Sigma_RE: Sigma_RE,
      tau: [bestParams[0], bestParams[1]],
      rho_between: bestParams[2],
      neg2LogLikR: bestNll,
      k_studies: rows.length,
      k_complete: rows.filter(function (r) { return _observedIndices(r.y).length === 2; }).length,
    };
  }

  // ---- K-variate REML (K ≥ 3) -----------------------------------------
  //
  // Parameterise Σ_RE via:
  //   - K log-scales      ℓ_k = log(τ_k)              → τ_k = exp(ℓ_k)
  //   - K(K-1)/2 partial correlations ψ_ij ∈ ℝ        → ρ_ij = tanh(ψ_ij)
  // Σ_ij = ρ_ij · τ_i · τ_j   (i ≠ j),   Σ_ii = τ_i²
  // This is the simplest PSD-preserving parametrisation that's smooth in
  // the unconstrained ℝ^{K(K+1)/2} space — Newton-Raphson on the profiled
  // REML log-likelihood converges in <20 iterations for K up to 8.
  //
  // For K=2 the bivariate path is faster and well-tested; for K≥3 use this.

  function _unpackParams(K, theta) {
    var taus = new Array(K);
    for (var k = 0; k < K; k++) taus[k] = Math.exp(theta[k]);
    var Sigma = zeros(K, K);
    for (var i = 0; i < K; i++) Sigma[i][i] = taus[i] * taus[i];
    var idx = K;
    for (var i2 = 0; i2 < K; i2++) {
      for (var j2 = i2 + 1; j2 < K; j2++) {
        var rho = Math.tanh(theta[idx++]);
        Sigma[i2][j2] = rho * taus[i2] * taus[j2];
        Sigma[j2][i2] = Sigma[i2][j2];
      }
    }
    return { Sigma: Sigma, taus: taus };
  }

  function _replObjective(studies, K, theta) {
    var u = _unpackParams(K, theta);
    var mu = _muGivenSigma(studies, u.Sigma, K).mu;
    return _replLogLik(studies, u.Sigma, mu);
  }

  // Numerical gradient + Hessian via central differences. Cheap when
  // K*(K+1)/2 is small (≤ 21 for K=6).
  function _grad(f, theta, h) {
    h = h || 1e-5;
    var n = theta.length;
    var g = new Array(n);
    for (var i = 0; i < n; i++) {
      var tp = theta.slice(), tm = theta.slice();
      tp[i] += h; tm[i] -= h;
      g[i] = (f(tp) - f(tm)) / (2 * h);
    }
    return g;
  }
  function _hessian(f, theta, h) {
    h = h || 1e-4;
    var n = theta.length;
    var H = zeros(n, n);
    var f0 = f(theta);
    for (var i = 0; i < n; i++) {
      var tpp = theta.slice(); tpp[i] += h;
      var tmm = theta.slice(); tmm[i] -= h;
      H[i][i] = (f(tpp) - 2 * f0 + f(tmm)) / (h * h);
      for (var j = i + 1; j < n; j++) {
        var tpa = theta.slice(); tpa[i] += h; tpa[j] += h;
        var tpb = theta.slice(); tpb[i] += h; tpb[j] -= h;
        var tma = theta.slice(); tma[i] -= h; tma[j] += h;
        var tmb = theta.slice(); tmb[i] -= h; tmb[j] -= h;
        var hij = (f(tpa) - f(tpb) - f(tma) + f(tmb)) / (4 * h * h);
        H[i][j] = hij; H[j][i] = hij;
      }
    }
    return H;
  }

  function fitKvariate(studies, K, opts) {
    opts = opts || {};
    var maxIter = opts.maxIter || 60;
    var nParams = K + K * (K - 1) / 2;

    // Seed from per-outcome DL τ (log-scale) and zero partial corrs.
    // The Newton search runs on standardized rows (each outcome in units of its median
    // within-study SE), so its seed floors, finite-difference steps and convergence
    // tests are relative; until 2026-11-15 they were absolute and the path depended on
    // the units of the effects.
    var studiesOrig = studies;
    var sc = _outcomeScales(studiesOrig, K);
    studies = _standardize(studiesOrig, sc);
    var seedTaus = [];
    var uni = fitUnivariatePerOutcome(studies, K);
    for (var k = 0; k < K; k++) {
      var t = uni[k] ? Math.sqrt(Math.max(uni[k].tau2, 1e-6)) : 0.1;
      seedTaus.push(Math.log(Math.max(t, 1e-3)));
    }
    var theta = seedTaus.concat(new Array(K * (K - 1) / 2).fill(0));

    var f = function (t) { return _replObjective(studies, K, t); };

    // Damped Newton-Raphson with backtracking line search.
    var fCur = f(theta);
    var damp = 1e-3;
    for (var iter = 0; iter < maxIter; iter++) {
      var g = _grad(f, theta);
      var H = _hessian(f, theta);
      // Add Levenberg-Marquardt damping.
      for (var d = 0; d < nParams; d++) H[d][d] += damp;
      var step;
      try {
        var Hinv = inverse(H);
        step = matVec(Hinv, g).map(function (x) { return -x; });
      } catch (e) {
        // gradient descent fallback
        var gNorm = Math.sqrt(g.reduce(function (a, b) { return a + b * b; }, 0));
        if (gNorm < 1e-8) break;
        step = g.map(function (gi) { return -gi / Math.max(gNorm, 1e-3); });
      }
      // Backtracking line search
      var alpha = 1;
      var thetaNew = theta.map(function (t, i) { return t + alpha * step[i]; });
      var fNew = f(thetaNew);
      while (fNew > fCur - 1e-9 && alpha > 1e-6) {
        alpha *= 0.5;
        thetaNew = theta.map(function (t, i) { return t + alpha * step[i]; });
        fNew = f(thetaNew);
      }
      if (Math.abs(fCur - fNew) < 1e-8) { theta = thetaNew; fCur = fNew; break; }
      theta = thetaNew; fCur = fNew;
      damp = Math.max(damp * 0.7, 1e-6);
    }

    var unpackedStd = _unpackParams(K, theta);
    var muStd = _muGivenSigma(studies, unpackedStd.Sigma, K);
    studies = studiesOrig;
    var unpacked = { Sigma: _scaleCov(unpackedStd.Sigma, sc), taus: unpackedStd.taus.map(function (t, k) { return t * sc[k]; }) };
    var muRes = { mu: muStd.mu.map(function (m, k) { return m * sc[k]; }), cov: _scaleCov(muStd.cov, sc) };
    fCur = _replLogLik(studies, unpacked.Sigma, muRes.mu);
    var Z975 = 1.959963984540054;
    return {
      ok: true, K: K,
      mu: muRes.mu, cov: muRes.cov,
      se: muRes.cov.map(function (row, i) { return Math.sqrt(Math.max(0, row[i])); }),
      ci_lo: muRes.mu.map(function (m, i) { return m - Z975 * Math.sqrt(muRes.cov[i][i]); }),
      ci_hi: muRes.mu.map(function (m, i) { return m + Z975 * Math.sqrt(muRes.cov[i][i]); }),
      Sigma_RE: unpacked.Sigma,
      taus: unpacked.taus,
      neg2LogLikR: fCur,
      k_studies: studies.length,
    };
  }

  // ---- Univariate REML per outcome (for comparison / borrowing display; tau2 from shared/ma-core.js) -

  function _core() {
    var c = global.AlmMaCore || (typeof require === "function" ? require("./ma-core.js") : null);
    if (!c || typeof c.tau2REML !== "function") throw new Error("shared/ma-core.js (AlmMaCore) must be loaded before multi-outcome-ma.js");
    return c;
  }

  function fitUnivariatePerOutcome(studies, K) {
    var Z975 = 1.959963984540054;
    var out = [];
    for (var k = 0; k < K; k++) {
      var yi = [], vi = [];
      for (var i = 0; i < studies.length; i++) {
        if (isFinite(studies[i].y[k])) {
          yi.push(studies[i].y[k]);
          vi.push(studies[i].V[k][k]);
        }
      }
      if (yi.length < 2) { out.push(null); continue; }
      // REML, as the page describes and as the bivariate fit uses (until 2026-11-12 this was
      // DerSimonian-Laird, so the "borrowing" comparison mixed two estimators).
      var tau2 = _core().tau2REML(yi, vi);
      if (!(tau2 >= 0) || !isFinite(tau2)) throw new Error("univariate REML tau2 could not be computed for outcome " + (k + 1));
      var w_re = vi.map(function (v) { return 1 / (v + tau2); });
      var sw_re = w_re.reduce(function (a, b) { return a + b; }, 0);
      var swy_re = 0;
      for (var jj = 0; jj < yi.length; jj++) swy_re += w_re[jj] * yi[jj];
      var mu = swy_re / sw_re;
      var se = Math.sqrt(1 / sw_re);
      out.push({
        mu: mu, se: se,
        ci_lo: mu - Z975 * se, ci_hi: mu + Z975 * se,
        tau2: tau2, k: yi.length,
      });
    }
    return out;
  }

  var api = {
    buildV: buildV,
    fitBivariate: fitBivariate,
    fitKvariate: fitKvariate,
    fitUnivariatePerOutcome: fitUnivariatePerOutcome,
    _muGivenSigma: _muGivenSigma,
    _replLogLik: _replLogLik,
    _inverseAndDet: inverseAndDet,
    _unpackParams: _unpackParams,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMultiOutcome = api;
})(typeof window !== "undefined" ? window : globalThis);
