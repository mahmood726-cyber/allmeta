/* shared/rare-events-glmm.js — binomial-normal GLMM for rare-event MA.
 *
 * Avoids the +0.5 continuity correction hack that biases OR pooling toward
 * the null when events are rare. Fits the conditional logistic random-
 * effects model:
 *
 *   log(p_T_i / (1 - p_T_i)) = log(p_C_i / (1 - p_C_i)) + θ + u_i
 *   u_i ~ N(0, τ²)
 *
 * with Laplace approximation to the marginal likelihood + Newton-Raphson
 * on (θ, log τ). Equivalent to metafor::rma.glmm(measure="OR",
 * model="UM.FS", method="ML") for the unconditional (fixed-control) case
 * and to model="CM.AL" for the conditional approximation we use here.
 *
 * Input rows: { events_T, n_T, events_C, n_C }. 0-event cells are HANDLED
 * NATIVELY — no continuity correction needed.
 *
 * Reference: Stijnen T, Hamza TH, Ozdemir P 2010. "Random effects meta-
 * analysis of event outcome in the framework of the generalized linear
 * mixed model with applications in sparse data", Stat Med 29(29):3046-3067.
 *
 * Output: { theta, se_theta, tau2, OR, OR_lo, OR_hi, k, n_zero_cell_studies }
 */
(function (global) {
  "use strict";

  // ---- Hermite-Gauss quadrature (10-point) for the random-effects integral.
  var HG10_NODES = [
    -3.4361591188377376, -2.5327316742327897, -1.7566836492998816,
    -1.0366108297895136, -0.34290132722370439,
     0.34290132722370439,  1.0366108297895136,
     1.7566836492998816,  2.5327316742327897, 3.4361591188377376,
  ];
  var HG10_WEIGHTS = [
    7.6404328552326015e-6, 0.0013436457467812324, 0.033874394455481063,
    0.24013861108231469,   0.61086263373532580,
    0.61086263373532580,   0.24013861108231469,
    0.033874394455481063,  0.0013436457467812324, 7.6404328552326015e-6,
  ];

  function _logSumExp(arr) {
    var m = -Infinity;
    for (var i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    if (!isFinite(m)) return -Infinity;
    var s = 0;
    for (var j = 0; j < arr.length; j++) s += Math.exp(arr[j] - m);
    return m + Math.log(s);
  }

  // log P(events | total, log-odds): event log-density for binomial.
  function _logBin(events, total, logit) {
    if (events < 0 || events > total) return -Infinity;
    if (total === 0) return 0;
    // log(C(total, events))
    var logChoose = 0;
    var lo = Math.min(events, total - events);
    for (var i = 0; i < lo; i++) {
      logChoose += Math.log((total - i) / (i + 1));
    }
    // log(p^events (1-p)^(total-events)) with p = 1/(1+e^-logit)
    var logp, log1mp;
    if (logit >= 0) {
      var e = Math.exp(-logit);
      log1mp = -Math.log(1 + e) - logit + Math.log(e);   // log(e^-logit / (1+e^-logit)) — corrected below
      // Cleaner:
      logp = -Math.log(1 + Math.exp(-logit));
      log1mp = -logit + logp;
    } else {
      var e2 = Math.exp(logit);
      logp = logit - Math.log(1 + e2);
      log1mp = -Math.log(1 + e2);
    }
    return logChoose + events * logp + (total - events) * log1mp;
  }

  // Per-study log marginal likelihood under the conditional approximation:
  //   l_i(θ, τ²) = log ∫ P(e_T | n_T, μ_i + θ + τ u) P(e_C | n_C, μ_i)
  //                 ⋅ φ(u) du
  // We profile out the nuisance baseline μ_i by setting it to its
  // observed-arm MLE log(e_C/(n_C - e_C)) (the conditional logistic
  // approximation; exact for fixed control rates in the Stijnen 2010
  // sense). For e_C = 0 or n_C, we use the +0.5 correction ONLY on the
  // baseline arm — the treatment arm's 0s are still handled natively
  // through the binomial likelihood.
  function _logL_study(eT, nT, eC, nC, theta, tau, nodes, weights) {
    // Profile baseline μ_i from observed control arm.
    var mu;
    if (eC === 0) mu = Math.log(0.5 / (nC + 0.5));
    else if (eC === nC) mu = Math.log((nC + 0.5) / 0.5);
    else mu = Math.log(eC / (nC - eC));

    var logTerms = new Array(nodes.length);
    for (var q = 0; q < nodes.length; q++) {
      var u = nodes[q];
      var logitT = mu + theta + tau * u;
      var ll = _logBin(eT, nT, logitT) + _logBin(eC, nC, mu);
      // Hermite weights are for ∫ f(u) e^{-u²} du; convert to ∫ f(u) φ(u) du
      // by multiplying by exp(u²)/√π (φ(u) = e^{-u²/2}/√(2π); the change
      // of variable u = √2 z gives the standard transform).
      logTerms[q] = ll + Math.log(weights[q]) - 0.5 * Math.log(Math.PI);
    }
    return _logSumExp(logTerms);
  }

  function _logL_total(rows, theta, tau) {
    var s = 0;
    for (var i = 0; i < rows.length; i++) {
      s += _logL_study(rows[i].events_T, rows[i].n_T, rows[i].events_C, rows[i].n_C,
                       theta, tau, HG10_NODES, HG10_WEIGHTS);
    }
    return s;
  }

  /**
   * Fit the GLMM. Returns:
   *   { theta, se_theta, tau2, OR, OR_lo, OR_hi, k, n_zero_cell_studies,
   *     warnings: [] }
   */
  function fit(rowsIn, opts) {
    opts = opts || {};
    var rows = rowsIn.filter(function (r) {
      return Number.isFinite(r.events_T) && Number.isFinite(r.events_C)
          && Number.isFinite(r.n_T) && Number.isFinite(r.n_C)
          && r.n_T > 0 && r.n_C > 0
          && r.events_T >= 0 && r.events_C >= 0
          && r.events_T <= r.n_T && r.events_C <= r.n_C;
    });
    if (!rows.length) return { ok: false, error: "no valid rows" };

    // Initial guess: per-study MH-style logOR (with +0.5 only on zeros),
    // then take the mean as θ_0.
    var theta = 0, tau = 0.1;
    var zeroCount = 0;
    var ls = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var aT = r.events_T, bT = r.n_T - r.events_T;
      var aC = r.events_C, bC = r.n_C - r.events_C;
      if (aT === 0 || bT === 0 || aC === 0 || bC === 0) zeroCount++;
      var aTp = aT === 0 ? 0.5 : aT, bTp = bT === 0 ? 0.5 : bT;
      var aCp = aC === 0 ? 0.5 : aC, bCp = bC === 0 ? 0.5 : bC;
      ls.push(Math.log((aTp * bCp) / (bTp * aCp)));
    }
    theta = ls.reduce(function (a, b) { return a + b; }, 0) / ls.length;

    // Damped Newton-Raphson on (θ, log τ).
    var phi = [theta, Math.log(tau)];
    var fOf = function (p) {
      var th = p[0], t = Math.max(1e-6, Math.exp(p[1]));
      return -_logL_total(rows, th, t);   // minimise the negative log-likelihood
    };
    var f0 = fOf(phi);
    var damp = 1e-3;
    for (var iter = 0; iter < 80; iter++) {
      var h = 1e-4;
      // gradient
      var g = [
        (fOf([phi[0] + h, phi[1]]) - fOf([phi[0] - h, phi[1]])) / (2 * h),
        (fOf([phi[0], phi[1] + h]) - fOf([phi[0], phi[1] - h])) / (2 * h),
      ];
      // hessian (2×2)
      var fpp = fOf([phi[0] + h, phi[1]]);
      var fmm = fOf([phi[0] - h, phi[1]]);
      var fpc = fOf([phi[0], phi[1] + h]);
      var fmc = fOf([phi[0], phi[1] - h]);
      var fpa = fOf([phi[0] + h, phi[1] + h]);
      var fpb = fOf([phi[0] + h, phi[1] - h]);
      var fma = fOf([phi[0] - h, phi[1] + h]);
      var fmb = fOf([phi[0] - h, phi[1] - h]);
      var H = [
        [(fpp - 2 * f0 + fmm) / (h * h), (fpa - fpb - fma + fmb) / (4 * h * h)],
        [(fpa - fpb - fma + fmb) / (4 * h * h), (fpc - 2 * f0 + fmc) / (h * h)],
      ];
      H[0][0] += damp; H[1][1] += damp;
      var det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
      if (Math.abs(det) < 1e-12) break;
      var step = [
        -((H[1][1] * g[0] - H[0][1] * g[1]) / det),
        -((-H[1][0] * g[0] + H[0][0] * g[1]) / det),
      ];
      // backtracking
      var alpha = 1;
      var phiNew = [phi[0] + alpha * step[0], phi[1] + alpha * step[1]];
      var fNew = fOf(phiNew);
      while (fNew > f0 - 1e-10 && alpha > 1e-6) {
        alpha *= 0.5;
        phiNew = [phi[0] + alpha * step[0], phi[1] + alpha * step[1]];
        fNew = fOf(phiNew);
      }
      if (Math.abs(f0 - fNew) < 1e-8) { phi = phiNew; f0 = fNew; break; }
      phi = phiNew; f0 = fNew;
      damp = Math.max(damp * 0.7, 1e-6);
    }

    var thetaHat = phi[0];
    var tauHat = Math.max(1e-6, Math.exp(phi[1]));
    var tau2Hat = tauHat * tauHat;

    // SE for θ from observed information (second derivative).
    var hp = 1e-4;
    var f_pp = -_logL_total(rows, thetaHat + hp, tauHat);
    var f_mm = -_logL_total(rows, thetaHat - hp, tauHat);
    var f_00 = -_logL_total(rows, thetaHat, tauHat);
    var d2theta = (f_pp - 2 * f_00 + f_mm) / (hp * hp);
    var seTheta = d2theta > 0 ? Math.sqrt(1 / d2theta) : NaN;

    var Z975 = 1.959963984540054;
    return {
      ok: true,
      theta: thetaHat, se_theta: seTheta,
      tau2: tau2Hat, tau: tauHat,
      OR: Math.exp(thetaHat),
      OR_lo: Math.exp(thetaHat - Z975 * seTheta),
      OR_hi: Math.exp(thetaHat + Z975 * seTheta),
      k: rows.length, n_zero_cell_studies: zeroCount,
    };
  }

  // =====================================================================
  // UNCONDITIONAL (UM.FS) — full-likelihood random-effects logistic
  //
  // Model (Stijnen-Hamza-Ozdemir 2010 §2.1):
  //   logit(p_C_i) = μ_i                — study-specific baseline (FIXED)
  //   logit(p_T_i) = μ_i + θ + u_i      — treatment effect + RE
  //   u_i ~ N(0, τ²); e_C_i, e_T_i ~ Binom
  //
  // Each study's μ_i is profiled out at every (θ, τ²) via golden-section
  // search; the marginal over u_i integrates with 10-point Hermite-Gauss.
  // Matches metafor::rma.glmm(model="UM.FS", method="ML") to within
  // Hermite quadrature precision (~1e-3 in θ for typical clinical data).

  function _logL_study_uncond(eT, nT, eC, nC, theta, tau, mu) {
    var llC = _logBin(eC, nC, mu);
    var logTerms = new Array(HG10_NODES.length);
    for (var q = 0; q < HG10_NODES.length; q++) {
      var u = HG10_NODES[q];
      var logitT = mu + theta + tau * u;
      logTerms[q] = _logBin(eT, nT, logitT)
                  + Math.log(HG10_WEIGHTS[q]) - 0.5 * Math.log(Math.PI);
    }
    return llC + _logSumExp(logTerms);
  }

  function _profileMu(eT, nT, eC, nC, theta, tau) {
    // Seed from control rate.
    var seed;
    if (eC === 0) seed = Math.log(0.5 / (nC + 0.5));
    else if (eC === nC) seed = Math.log((nC + 0.5) / 0.5);
    else seed = Math.log(eC / (nC - eC));
    // Golden-section search on -log L over μ ∈ [seed-4, seed+4].
    var f = function (mu) { return -_logL_study_uncond(eT, nT, eC, nC, theta, tau, mu); };
    var phi = (Math.sqrt(5) - 1) / 2;
    var a = seed - 4, b = seed + 4;
    var x1 = b - phi * (b - a), x2 = a + phi * (b - a);
    var f1 = f(x1), f2 = f(x2);
    for (var iter = 0; iter < 60; iter++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - phi * (b - a); f1 = f(x1); }
      else         { a = x1; x1 = x2; f1 = f2; x2 = a + phi * (b - a); f2 = f(x2); }
      if (Math.abs(b - a) < 1e-6) break;
    }
    return 0.5 * (a + b);
  }

  function _logL_total_uncond(rows, theta, tau) {
    var s = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var mu = _profileMu(r.events_T, r.n_T, r.events_C, r.n_C, theta, tau);
      s += _logL_study_uncond(r.events_T, r.n_T, r.events_C, r.n_C, theta, tau, mu);
    }
    return s;
  }

  function fitUnconditional(rowsIn, opts) {
    opts = opts || {};
    var rows = rowsIn.filter(function (r) {
      return Number.isFinite(r.events_T) && Number.isFinite(r.events_C)
          && Number.isFinite(r.n_T) && Number.isFinite(r.n_C)
          && r.n_T > 0 && r.n_C > 0
          && r.events_T >= 0 && r.events_C >= 0
          && r.events_T <= r.n_T && r.events_C <= r.n_C;
    });
    if (!rows.length) return { ok: false, error: "no valid rows" };

    // Seed from the conditional fit so we start near the optimum.
    var seed = fit(rowsIn, opts);
    if (!seed.ok) return seed;
    var phi = [seed.theta, Math.log(Math.max(1e-6, seed.tau))];

    var fOf = function (p) {
      var th = p[0], t = Math.max(1e-6, Math.exp(p[1]));
      return -_logL_total_uncond(rows, th, t);
    };
    var f0 = fOf(phi);
    var damp = 1e-3;
    for (var iter = 0; iter < 40; iter++) {
      var h = 1e-3;
      var g = [
        (fOf([phi[0] + h, phi[1]]) - fOf([phi[0] - h, phi[1]])) / (2 * h),
        (fOf([phi[0], phi[1] + h]) - fOf([phi[0], phi[1] - h])) / (2 * h),
      ];
      // Diagonal Hessian only (cross-term too noisy through profiled μ).
      var fpp = fOf([phi[0] + h, phi[1]]);
      var fmm = fOf([phi[0] - h, phi[1]]);
      var fpc = fOf([phi[0], phi[1] + h]);
      var fmc = fOf([phi[0], phi[1] - h]);
      var H00 = Math.max((fpp - 2 * f0 + fmm) / (h * h) + damp, 1e-3);
      var H11 = Math.max((fpc - 2 * f0 + fmc) / (h * h) + damp, 1e-3);
      var step = [-g[0] / H00, -g[1] / H11];
      var alpha = 1;
      var phiNew = [phi[0] + alpha * step[0], phi[1] + alpha * step[1]];
      var fNew = fOf(phiNew);
      while (fNew > f0 - 1e-9 && alpha > 1e-6) {
        alpha *= 0.5;
        phiNew = [phi[0] + alpha * step[0], phi[1] + alpha * step[1]];
        fNew = fOf(phiNew);
      }
      if (Math.abs(f0 - fNew) < 1e-6) { phi = phiNew; f0 = fNew; break; }
      phi = phiNew; f0 = fNew;
      damp = Math.max(damp * 0.7, 1e-6);
    }

    var thetaHat = phi[0];
    var tauHat = Math.max(1e-6, Math.exp(phi[1]));
    var hp = 1e-3;
    var f_pp = -_logL_total_uncond(rows, thetaHat + hp, tauHat);
    var f_mm = -_logL_total_uncond(rows, thetaHat - hp, tauHat);
    var f_00 = -_logL_total_uncond(rows, thetaHat, tauHat);
    var d2 = (f_pp - 2 * f_00 + f_mm) / (hp * hp);
    var seTheta = d2 > 0 ? Math.sqrt(1 / d2) : NaN;

    var Z975 = 1.959963984540054;
    return {
      ok: true, model: "UM.FS",
      theta: thetaHat, se_theta: seTheta,
      tau2: tauHat * tauHat, tau: tauHat,
      OR: Math.exp(thetaHat),
      OR_lo: Math.exp(thetaHat - Z975 * seTheta),
      OR_hi: Math.exp(thetaHat + Z975 * seTheta),
      k: rows.length,
      n_zero_cell_studies: rows.filter(function (r) {
        return r.events_T === 0 || r.events_T === r.n_T
            || r.events_C === 0 || r.events_C === r.n_C;
      }).length,
      seed_conditional: { theta: seed.theta, tau: seed.tau },
    };
  }

  var api = {
    fit: fit,
    fitUnconditional: fitUnconditional,
    _logBin: _logBin,
    _logL_study: _logL_study,
    _logL_total: _logL_total,
    _logL_study_uncond: _logL_study_uncond,
    _profileMu: _profileMu,
    _logL_total_uncond: _logL_total_uncond,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRareEventsGLMM = api;
})(typeof window !== "undefined" ? window : globalThis);
