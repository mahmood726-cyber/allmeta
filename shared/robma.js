/* shared/robma.js — RoBMA-style robust Bayesian meta-analysis (effect × heterogeneity).
 *
 * Bayesian model-averaging over the four models defined by the presence/absence of an
 * EFFECT (μ) and of HETEROGENEITY (τ), reporting inclusion Bayes factors and a
 * model-averaged estimate. This is the in-browser, deterministic, VERIFIABLE core of the
 * RoBMA framework (Maier, Bartoš & Wagenmakers 2023) — no MCMC.
 *
 * Models (equal prior weight 1/4 by default), default priors μ ~ N(0, 1), τ ~ Half-N(0,1):
 *   H0·FE : μ=0, τ=0          → L = Πφ(yᵢ;0,sᵢ²)
 *   H1·FE : ∫ Πφ(yᵢ;μ,sᵢ²)·N(μ;0,1) dμ                       (closed form, normal-normal)
 *   H0·RE : ∫ Πφ(yᵢ;0,sᵢ²+τ²)·2φ(τ;0,1) dτ                    (quadrature over τ)
 *   H1·RE : ∫∫ Πφ(yᵢ;μ,sᵢ²+τ²)·N(μ;0,1)·2φ(τ;0,1) dμ dτ       (μ in closed form, quadrature over τ)
 * BF₁₀(effect) = Σ(H1 models)/Σ(H0 models);  BF(heterogeneity) = Σ(RE)/Σ(FE).
 *
 * Everything is computed on the LOG scale (log marginal likelihoods are returned as
 * logMarginal; the natural-scale `marginal` under/overflows for large k or precise studies).
 * τ integrals: the log integrand is located at its mode, shifted so the peak is 1, and
 * integrated by adaptive Simpson on [0, mode] and [mode, 10·τ-scale], so the quadrature
 * tolerance is relative to the peak and the peak is always a quadrature node.
 *
 * NOTE: this is RoBMA's effect/heterogeneity sub-model averaging, NOT the full RoBMA
 * package (which adds publication-bias weight-function/PET-PEESE models and uses MCMC).
 * For the full analysis use the RoBMA R package (see buildRCode()).
 *
 * Reference: Maier M, Bartoš F, Wagenmakers EJ (2023), Psychol Methods 28(1):107-122.
 */
(function (global) {
  "use strict";

  // Adaptive Simpson (absolute tolerance). The interval is first split into `panels` equal
  // panels (default 256) so that a narrow peak away from the midpoint is not missed by the
  // initial 5-point rule; each panel is refined adaptively with tolerance tol/panels.
  function _adaptiveSimpson(f, a, b, tol, panels) {
    tol = tol || 1e-10; panels = panels || 256;
    function simpson(fa, fb, fm, a, b) { return (b - a) / 6 * (fa + 4 * fm + fb); }
    function rec(a, b, fa, fb, fm, whole, tol, depth) {
      var m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2;
      var flm = f(lm), frm = f(rm);
      var left = simpson(fa, fm, flm, a, m), right = simpson(fm, fb, frm, m, b);
      if (depth <= 0 || Math.abs(left + right - whole) <= 15 * tol)
        return left + right + (left + right - whole) / 15;
      return rec(a, m, fa, fm, flm, left, tol / 2, depth - 1) + rec(m, b, fm, fb, frm, right, tol / 2, depth - 1);
    }
    var h = (b - a) / panels, total = 0, x0 = a, f0 = f(a);
    for (var p = 0; p < panels; p++) {
      var x1 = (p === panels - 1) ? b : a + (p + 1) * h, f1 = f(x1), xm = (x0 + x1) / 2, fm = f(xm);
      total += rec(x0, x1, f0, f1, fm, simpson(f0, f1, fm, x0, x1), tol / panels, 50);
      x0 = x1; f0 = f1;
    }
    return total;
  }

  function _normPdf(x, m, s) { var z = (x - m) / s; return Math.exp(-0.5 * z * z) / (s * Math.SQRT2 * Math.sqrt(Math.PI)); }
  function _logNormPdf(x, m, s) { var z = (x - m) / s; return -0.5 * z * z - Math.log(s) - 0.5 * Math.log(2 * Math.PI); }
  function _lse(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; if (!isFinite(m)) return m;
    var s = 0; for (var j = 0; j < a.length; j++) s += Math.exp(a[j] - m); return m + Math.log(s); }

  // log ∫_0^upper exp(g(t)) dt, and optionally ∫ h(t) exp(g(t)) dt / ∫ exp(g(t)) dt.
  // The mode of g is located (grid dense near 0, then golden-section), the integrand is
  // shifted by g(mode) and integrated on [0, mode] and [mode, upper].
  function _logIntTau(g, upper, h) {
    var N = 400, best = -Infinity, jb = 0, ts = [];
    for (var j = 0; j <= N; j++) { var t = upper * (j / N) * (j / N); ts.push(t); var v = g(t); if (v > best) { best = v; jb = j; } }
    var lo = ts[Math.max(0, jb - 1)], hi = ts[Math.min(N, jb + 1)], mode = ts[jb];
    if (hi > lo) {                                   // golden-section refinement of the mode
      var gr = (Math.sqrt(5) - 1) / 2, c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), gc = g(c), gd = g(d);
      for (var it = 0; it < 100 && (hi - lo) > 1e-12 * (1 + hi); it++) {
        if (gc > gd) { hi = d; d = c; gd = gc; c = hi - gr * (hi - lo); gc = g(c); }
        else { lo = c; c = d; gc = gd; d = lo + gr * (hi - lo); gd = g(d); }
      }
      var tm = (lo + hi) / 2, gm = g(tm); if (gm > best) { best = gm; mode = tm; }
    }
    var M = best;
    var f = function (t) { return Math.exp(g(t) - M); };
    var I = (mode > 0 ? _adaptiveSimpson(f, 0, mode) : 0) + (mode < upper ? _adaptiveSimpson(f, mode, upper) : 0);
    var out = { log: M + Math.log(I) };
    if (h) {
      var fh = function (t) { return h(t) * Math.exp(g(t) - M); };
      var J = (mode > 0 ? _adaptiveSimpson(fh, 0, mode) : 0) + (mode < upper ? _adaptiveSimpson(fh, mode, upper) : 0);
      out.mean = J / I;
    }
    return out;
  }

  // analysis(yi, sei, opts) → marginal likelihoods (and their logs), inclusion BFs, posterior
  // model probs, model-averaged effect estimate. opts: { muSD:1, tauSD:1, priors:[w00,w0R,wH0,...] }.
  function analysis(yi, sei, opts) {
    opts = opts || {};
    var k = yi.length, muSD = opts.muSD || 1, tauSD = opts.tauSD || 1;
    var vi = sei.map(function (s) { return s * s; });
    // log Πφ(yᵢ; 0, vᵢ+τ²)
    function logLik0(tau2) { var s = 0; for (var i = 0; i < k; i++) s += _logNormPdf(yi[i], 0, Math.sqrt(vi[i] + tau2)); return s; }
    // log ∫ Πφ(yᵢ; μ, vᵢ+τ²) N(μ; 0, muSD²) dμ (closed form) and E[μ | τ]
    function logLikMu(tau2) {
      var A = 1 / (muSD * muSD), B = 0;
      for (var i = 0; i < k; i++) { var w = 1 / (vi[i] + tau2); A += w; B += w * yi[i]; }
      return { l: logLik0(tau2) - 0.5 * Math.log(muSD * muSD * A) + B * B / (2 * A), m: B / A };
    }
    function logPriorTau(t) { return Math.LN2 + _logNormPdf(t, 0, tauSD); }
    var TAU = 10 * tauSD;

    var lH0FE = logLik0(0);
    var fe = logLikMu(0), lH1FE = fe.l, emuH1FE = fe.m;
    var lH0RE = _logIntTau(function (t) { return logLik0(t * t) + logPriorTau(t); }, TAU).log;
    var re = _logIntTau(function (t) { return logLikMu(t * t).l + logPriorTau(t); }, TAU, function (t) { return logLikMu(t * t).m; });
    var lH1RE = re.log, emuH1RE = re.mean;

    var pri = opts.priors || [0.25, 0.25, 0.25, 0.25]; // [H0FE, H1FE, H0RE, H1RE]
    var lmarg = [lH0FE, lH1FE, lH0RE, lH1RE];
    var lp = lmarg.map(function (l, i) { return l + Math.log(pri[i]); });
    var lZ = _lse(lp);
    var post = lp.map(function (v) { return Math.exp(v - lZ); });

    var logBfEffect = _lse([lp[1], lp[3]]) - _lse([lp[0], lp[2]]);
    var logBfHetero = _lse([lp[2], lp[3]]) - _lse([lp[0], lp[1]]);
    // model-averaged effect = Σ post_m · E[μ|m]; E[μ]=0 for H0 models, posterior mean for H1.
    var muMA = post[1] * emuH1FE + post[3] * emuH1RE;

    return {
      marginal: { H0FE: Math.exp(lH0FE), H1FE: Math.exp(lH1FE), H0RE: Math.exp(lH0RE), H1RE: Math.exp(lH1RE) },
      logMarginal: { H0FE: lH0FE, H1FE: lH1FE, H0RE: lH0RE, H1RE: lH1RE },
      postProb: { H0FE: post[0], H1FE: post[1], H0RE: post[2], H1RE: post[3] },
      bfEffect: Math.exp(logBfEffect), bfHetero: Math.exp(logBfHetero),
      logBfEffect: logBfEffect, logBfHetero: logBfHetero,
      pInclEffect: (post[1] + post[3]), pInclHetero: (post[2] + post[3]),
      muMA: muMA, muH1FE: emuH1FE, muH1RE: emuH1RE, k: k,
    };
  }

  // Generate runnable R for the FULL RoBMA package (incl. publication-bias models + MCMC).
  // Written for RoBMA >= 4 (arguments yi, sei, measure); effect and heterogeneity priors as in the page.
  function buildRCode(yi, sei) {
    return [
      "# Full robust Bayesian meta-analysis (effect × heterogeneity × publication bias).",
      "# The in-app result covers the effect/heterogeneity model-averaging; RoBMA adds",
      "# weight-function & PET-PEESE bias models via MCMC. RoBMA needs JAGS (mcmc-jags.sourceforge.io).",
      "install.packages('RoBMA')  # once",
      "library(RoBMA)",
      "y  <- c(" + yi.join(", ") + ")",
      "se <- c(" + sei.join(", ") + ")",
      "# measure: the scale of y (\"SMD\", \"OR\", \"RR\", \"HR\", \"ZCOR\", ...); it sets RoBMA's default bias priors.",
      "fit <- RoBMA(yi = y, sei = se, measure = \"SMD\", prior_effect = prior(\"normal\", list(0, 1)), prior_heterogeneity = prior(\"normal\", list(0, 1), truncation = list(0, Inf)), seed = 1)",
      "summary(fit)                              # inclusion BFs for effect, heterogeneity, bias",
    ].join("\n");
  }

  var api = { analysis: analysis, buildRCode: buildRCode, _adaptiveSimpson: _adaptiveSimpson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRoBMA = api;
})(typeof window !== "undefined" ? window : globalThis);
