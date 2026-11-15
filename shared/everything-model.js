/* shared/everything-model.js — joint outcome × time × RoB hierarchical
 * meta-analysis. The "everything model".
 *
 * Decomposes the observed effect y_{i,t,o} (study i, snapshot time t,
 * outcome o) into the additive components:
 *
 *   y_{i,t,o} = μ_o            (outcome-specific overall mean)
 *             + δ_i             (study random effect; shared across t, o)
 *             + γ_t             (time-period fixed effect; baseline 0)
 *             + bias(rob_{i,t}) (RoB-driven shift at snapshot time t)
 *             + ε_{i,t,o}       (residual, variance v_{i,t,o})
 *   δ_i ~ N(0, τ²_δ)
 *
 * Estimation: variational EM (closed-form) — analytic posterior at fixed
 * variance components, then iterative update of τ²_δ + period γ_t means
 * + outcome shifts μ_o. Converges in 50-200 iterations for moderate-size
 * datasets. Browser-tractable; no MCMC needed.
 *
 * Output: per-outcome μ̂_o + posterior SE, per-period γ̂_t, study-level
 * shrinkage estimates δ̂_i (posterior mean), and a credible interval
 * for the OVERALL effect at any chosen (time, RoB-mix).
 *
 * Reference: Higgins, Whitehead 1996 (Stat Med 15:2733-2749) on
 * hierarchical bayes for meta-analysis; Welton, Cooper, Ades 2009 on
 * combined evidence; this is a unifying frame, not a single paper.
 *
 * Input: rows of
 *   { study, time, outcome, yi, vi, rob? }
 *
 * Output:
 *   { mu: { [outcome]: { estimate, se } },
 *     gamma: { [time]: { estimate, se } },
 *     delta: { [study]: { estimate, se } },
 *     tau2_delta, n_iter, converged }
 */
(function (global) {
  "use strict";

  // ---- RoB → bias map (reuse pattern) -----------------------------------

  var DEFAULT_BIAS_MAP = {
    low: 0, "some": 0.0, "some-concerns": 0.0,
    high: 0.0, critical: 0.0,
    unclear: 0.0, "no-info": 0.0,
  };
  // NOTE: the RoB shift bias() is NOT a downweight here — it's a
  // systematic shift on the effect scale (e.g. high-RoB studies tend
  // to overestimate by X log-OR units). Default 0 so the user must
  // opt in to a prior.

  function _biasShift(rob, biasMap, biasScale) {
    if (typeof rob !== "string") return 0;
    var m = biasMap || DEFAULT_BIAS_MAP;
    var b = m[rob.toLowerCase().trim()];
    if (!isFinite(b)) b = 0;
    return b * (isFinite(biasScale) ? biasScale : 1);
  }

  // ---- Marginal (ML) likelihood and GLS covariance ----------------------
  // Integrating delta_i out, study s has y_s ~ N(X_s beta, V_s), V_s = diag(v) + tau2 * J
  // (rows of one study share delta_i). V_s^-1 by Sherman-Morrison. Returns the ML
  // log-likelihood (= metafor::rma.mv(method = "ML") logLik at the same parameters) and,
  // when wanted, (X' V^-1 X)^-1 for beta = (mu_1..mu_O, gamma_t for t != ref).
  function _marginal(rows, rowBias, bySt, col, nPar, beta, tau2, wantCov) {
    var ll = 0, A = null, B = null, i, j, a, b;
    if (wantCov) { A = []; B = new Array(nPar).fill(0); for (a = 0; a < nPar; a++) { A.push(new Array(nPar).fill(0)); } }
    for (var s = 0; s < bySt.length; s++) {
      var idx = bySt[s], sInv = 0, logDet = 0;
      for (i = 0; i < idx.length; i++) { sInv += 1 / rows[idx[i]].vi; logDet += Math.log(rows[idx[i]].vi); }
      var c = tau2 / (1 + tau2 * sInv);
      logDet += Math.log(1 + tau2 * sInv);
      var q = 0, se = 0;
      for (i = 0; i < idx.length; i++) {
        var r = rows[idx[i]], e = r.yi - rowBias[idx[i]];
        for (b = 0; b < col[idx[i]].length; b++) e -= beta[col[idx[i]][b]];
        q += e * e / r.vi; se += e / r.vi;
      }
      q -= c * se * se;
      ll += -0.5 * (idx.length * Math.log(2 * Math.PI) + logDet + q);
      if (wantCov) {
        // X' V^-1 X = X' D^-1 X - c (X' D^-1 1)(X' D^-1 1)'
        var u = new Array(nPar).fill(0), sy = 0;
        for (i = 0; i < idx.length; i++) {
          var ci = col[idx[i]], wi = 1 / rows[idx[i]].vi, y0 = rows[idx[i]].yi - rowBias[idx[i]];
          sy += wi * y0;
          for (a = 0; a < ci.length; a++) { u[ci[a]] += wi; B[ci[a]] += wi * y0; for (b = 0; b < ci.length; b++) A[ci[a]][ci[b]] += wi; }
        }
        for (a = 0; a < nPar; a++) { B[a] -= c * u[a] * sy; for (b = 0; b < nPar; b++) A[a][b] -= c * u[a] * u[b]; }
      }
    }
    var cov = wantCov ? _inv(A) : null, gls = null;
    if (cov) { gls = cov.map(function (r) { var t = 0; for (var q2 = 0; q2 < nPar; q2++) t += r[q2] * B[q2]; return t; }); }
    return { ll: ll, cov: cov, gls: gls };
  }

  // Profile ML: at fixed tau2 the ML beta is the GLS estimate; returns { ll, beta, cov }.
  function _profile(rows, rowBias, bySt, col, nPar, tau2) {
    var m = _marginal(rows, rowBias, bySt, col, nPar, new Array(nPar).fill(0), tau2, true);
    if (!m.gls) return null;
    return { ll: _marginal(rows, rowBias, bySt, col, nPar, m.gls, tau2, false).ll, beta: m.gls, cov: m.cov, tau2: tau2 };
  }

  // Gauss-Jordan inverse with partial pivoting; null if singular.
  function _inv(M) {
    var n = M.length, A = M.map(function (r, i) { var e = new Array(n).fill(0); e[i] = 1; return r.slice().concat(e); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (!(Math.abs(A[piv][c]) > 1e-300)) return null;
      var t = A[c]; A[c] = A[piv]; A[piv] = t;
      var d = A[c][c];
      for (var k = 0; k < 2 * n; k++) A[c][k] /= d;
      for (r = 0; r < n; r++) if (r !== c && A[r][c] !== 0) { var f = A[r][c]; for (k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map(function (r) { return r.slice(n); });
  }

  // ---- The variational EM loop ------------------------------------------

  function fit(rowsIn, opts) {
    opts = opts || {};
    var maxIter = opts.maxIter || 200;
    var tol = opts.tol || 1e-7;
    var biasMap = opts.biasMap || DEFAULT_BIAS_MAP;
    var biasScale = isFinite(opts.biasScale) ? opts.biasScale : 0;
    var refTime = opts.refTime;   // identifiability anchor for γ; defaults to first observed time

    var rows = rowsIn.filter(function (r) {
      return r && isFinite(r.yi) && isFinite(r.vi) && r.vi > 0
          && r.study && r.outcome && r.time;
    });
    if (rows.length < 2) return { ok: false, error: "need ≥ 2 valid rows" };

    // Index dictionaries.
    var studies = [], times = [], outcomes = [];
    var sIdx = Object.create(null), tIdx = Object.create(null), oIdx = Object.create(null);
    rows.forEach(function (r) {
      if (sIdx[r.study] == null) { sIdx[r.study] = studies.length; studies.push(r.study); }
      if (tIdx[r.time] == null)  { tIdx[r.time] = times.length;     times.push(r.time); }
      if (oIdx[r.outcome] == null) { oIdx[r.outcome] = outcomes.length; outcomes.push(r.outcome); }
    });
    if (refTime == null) refTime = times[0];

    // Pre-compute the RoB bias shift per row.
    var rowBias = rows.map(function (r) { return _biasShift(r.rob, biasMap, biasScale); });

    // Design for the marginal likelihood / GLS covariance: columns 0..O-1 = mu_o,
    // then one column per non-reference time.
    var refIdx0 = tIdx[refTime], gCol = [], nPar = outcomes.length;
    for (var tq = 0; tq < times.length; tq++) gCol.push(tq === refIdx0 ? -1 : nPar++);
    var col = rows.map(function (r) {
      var c = [oIdx[r.outcome]], g = gCol[tIdx[r.time]];
      if (g >= 0) c.push(g);
      return c;
    });
    var bySt = studies.map(function () { return []; });
    rows.forEach(function (r, i) { bySt[sIdx[r.study]].push(i); });
    function betaVec() {
      var bv = mu.slice();
      for (var tb = 0; tb < times.length; tb++) if (gCol[tb] >= 0) bv[gCol[tb]] = gamma[tb];
      return bv;
    }

    // Initial estimates: τ²_δ small, γ_t = 0, μ_o = naive per-outcome mean.
    var tau2 = 0.05;
    var mu = new Array(outcomes.length).fill(0);
    var gamma = new Array(times.length).fill(0);
    var delta = new Array(studies.length).fill(0);
    var Vpost = new Array(studies.length).fill(0);

    // Seed μ with per-outcome inverse-variance pool ignoring everything else.
    for (var k = 0; k < outcomes.length; k++) {
      var swM = 0, swyM = 0;
      for (var i = 0; i < rows.length; i++) {
        if (oIdx[rows[i].outcome] === k) {
          var w = 1 / rows[i].vi;
          swM += w; swyM += w * (rows[i].yi - rowBias[i]);
        }
      }
      mu[k] = swM > 0 ? swyM / swM : 0;
    }

    var prevLL = -Infinity;
    var converged = false;
    var iter = 0;
    for (iter = 0; iter < maxIter; iter++) {
      // E-step: posterior mean of δ_i given (μ, γ, τ²).
      for (var s = 0; s < studies.length; s++) {
        var num = 0, denom = 1 / tau2;
        for (var i2 = 0; i2 < rows.length; i2++) {
          if (sIdx[rows[i2].study] !== s) continue;
          var r2 = rows[i2];
          var resid = r2.yi - mu[oIdx[r2.outcome]] - gamma[tIdx[r2.time]] - rowBias[i2];
          num += resid / r2.vi;
          denom += 1 / r2.vi;
        }
        delta[s] = num / denom;
        Vpost[s] = 1 / denom;
      }
      // M-step:
      //   (a) τ² = mean of δ² + posterior variance correction
      var sumD2 = 0;
      for (var s2 = 0; s2 < studies.length; s2++) sumD2 += delta[s2] * delta[s2] + Vpost[s2];
      tau2 = Math.max(1e-8, sumD2 / studies.length);

      //   (b) γ_t for t ≠ refTime: solve the per-time equations holding
      //       μ + δ fixed. γ_refTime ≡ 0 (identifiability).
      var refIdx = tIdx[refTime];
      for (var t = 0; t < times.length; t++) {
        if (t === refIdx) { gamma[t] = 0; continue; }
        var swG = 0, swyG = 0;
        for (var i3 = 0; i3 < rows.length; i3++) {
          if (tIdx[rows[i3].time] !== t) continue;
          var r3 = rows[i3];
          var w3 = 1 / r3.vi;
          var resid3 = r3.yi - mu[oIdx[r3.outcome]] - delta[sIdx[r3.study]] - rowBias[i3];
          swG += w3; swyG += w3 * resid3;
        }
        gamma[t] = swG > 0 ? swyG / swG : 0;
      }

      //   (c) μ_o for each outcome.
      for (var o = 0; o < outcomes.length; o++) {
        var swO = 0, swyO = 0;
        for (var i4 = 0; i4 < rows.length; i4++) {
          if (oIdx[rows[i4].outcome] !== o) continue;
          var r4 = rows[i4];
          var w4 = 1 / r4.vi;
          var rr = r4.yi - gamma[tIdx[r4.time]] - delta[sIdx[r4.study]] - rowBias[i4];
          swO += w4; swyO += w4 * rr;
        }
        mu[o] = swO > 0 ? swyO / swO : 0;
      }

      // Convergence on the marginal (ML) log-likelihood. (The joint density of y and the
      // delta posterior means used before diverges as tau2 -> 0 and never settled.)
      var ll = _marginal(rows, rowBias, bySt, col, nPar, betaVec(), tau2, false).ll;
      if (iter > 0 && Math.abs(ll - prevLL) < tol) {
        converged = true;
        prevLL = ll;
        iter += 1;
        break;
      }
      prevLL = ll;
    }

    // SEs from the GLS covariance (X' V^-1 X)^-1 at the ML tau2 - equal to
    // metafor::rma.mv(method = "ML") SEs. (The former sqrt(1 / sum 1/(v+tau2)) per outcome
    // ignored gamma_t estimation and the delta_i shared by a study's outcomes.)
    // The EM moves tau2 very slowly when the ML optimum is at (or near) tau2 = 0 (default
    // example: tau2 still 3e-5 after 200 iterations). Polish with a golden-section search of
    // the profile ML log-likelihood over [0, U] and take the parameters there; the EM result
    // is kept if it is better (it never is by more than rounding).
    var Z975 = 1.959963984540054;
    var best = _profile(rows, rowBias, bySt, col, nPar, tau2);
    var U = Math.max(10 * tau2, 1e-3), gr = (Math.sqrt(5) - 1) / 2, lo = 0, hi = U;
    var x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
    var f1 = _profile(rows, rowBias, bySt, col, nPar, x1), f2 = _profile(rows, rowBias, bySt, col, nPar, x2);
    for (var gi = 0; gi < 200 && f1 && f2 && hi - lo > 1e-12 * (1 + U); gi++) {
      if (f1.ll >= f2.ll) { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = _profile(rows, rowBias, bySt, col, nPar, x1); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = _profile(rows, rowBias, bySt, col, nPar, x2); }
    }
    [f1, f2, _profile(rows, rowBias, bySt, col, nPar, 0)].forEach(function (f) { if (f && (!best || f.ll > best.ll)) best = f; });
    var polished = false;
    if (best) {
      polished = true;
      tau2 = best.tau2;
      for (var ob = 0; ob < outcomes.length; ob++) mu[ob] = best.beta[ob];
      for (var tb2 = 0; tb2 < times.length; tb2++) gamma[tb2] = gCol[tb2] >= 0 ? best.beta[gCol[tb2]] : 0;
      // delta_i = BLUP at the final parameters
      for (var sb = 0; sb < studies.length; sb++) {
        var sInvB = 0, seB = 0;
        bySt[sb].forEach(function (ri) {
          var rr0 = rows[ri];
          sInvB += 1 / rr0.vi;
          seB += (rr0.yi - rowBias[ri] - mu[oIdx[rr0.outcome]] - gamma[tIdx[rr0.time]]) / rr0.vi;
        });
        delta[sb] = tau2 * seB / (1 + tau2 * sInvB);
      }
    }
    var fin = best || _marginal(rows, rowBias, bySt, col, nPar, betaVec(), tau2, true);
    prevLL = fin.ll;
    var covB = fin.cov;
    function seOf(c) { return covB && covB[c][c] > 0 ? Math.sqrt(covB[c][c]) : NaN; }
    var muSummary = Object.create(null);
    for (var oo = 0; oo < outcomes.length; oo++) {
      var se = seOf(oo);
      muSummary[outcomes[oo]] = {
        estimate: mu[oo], se: se,
        ci_lo: mu[oo] - Z975 * se, ci_hi: mu[oo] + Z975 * se,
      };
    }
    var gammaSummary = Object.create(null);
    for (var tt = 0; tt < times.length; tt++) {
      gammaSummary[times[tt]] = { estimate: gamma[tt], se: gCol[tt] >= 0 ? seOf(gCol[tt]) : 0, is_reference: (tt === tIdx[refTime]) };
    }
    var deltaSummary = Object.create(null);
    for (var ss = 0; ss < studies.length; ss++) {
      deltaSummary[studies[ss]] = { estimate: delta[ss] };
    }

    return {
      ok: true,
      mu: muSummary, gamma: gammaSummary, delta: deltaSummary,
      tau2_delta: tau2, n_iter: iter, converged: converged, polished: polished,
      log_likelihood: prevLL,
      studies: studies, times: times, outcomes: outcomes,
      ref_time: refTime,
      bias_scale: biasScale,
    };
  }

  var api = {
    fit: fit,
    DEFAULT_BIAS_MAP: DEFAULT_BIAS_MAP,
    _biasShift: _biasShift,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmEverythingModel = api;
})(typeof window !== "undefined" ? window : globalThis);
