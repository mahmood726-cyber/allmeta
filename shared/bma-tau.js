/* shared/bma-tau.js — Bayesian Model Averaging across τ² priors.
 *
 * The choice of τ² prior is a known driver of posterior sensitivity in
 * small-k random-effects meta-analysis (Friede et al. 2017; Röver 2020).
 * Rather than commit to one prior, this module integrates the posterior
 * for the pooled effect μ over a model space M_1..M_K where each M_k
 * differs only in its τ² prior. The averaged posterior is
 *
 *     p(μ | data) = Σ_k w_k · p(μ | data, M_k)
 *
 * with weights w_k ∝ π(M_k) · p(data | M_k) and uniform model priors
 * π(M_k) = 1/K.
 *
 * Model: y_i ~ N(μ, v_i + τ²) with a flat prior on μ. For each τ the
 * likelihood with μ integrated out is exact (Gaussian integral):
 *     L(τ) = ∏ N(y_i; μ̂(τ), v_i + τ²) · √(2π / Σ w_i(τ)),  w_i = 1/(v_i + τ²),
 * and μ | τ, y ~ N(μ̂(τ), 1/Σ w_i(τ)).
 *
 * Integration over τ (2026-11 correction): the integrals over τ are
 * evaluated on the τ scale (where every built-in prior density is finite
 * at τ = 0) by a composite 20-point Gauss–Legendre rule in u = log τ
 * (panels of width 0.25, u from −30 to 340, or to log(upper) for a
 * bounded prior). The previous rule (Simpson on a τ² grid from 0 to
 * 25·var(y) + 0.5) dropped the integrable 1/(2τ) singularity of the τ²-scale
 * density at τ² = 0 and truncated the prior support (e.g. uniform(0, 5) on τ),
 * which biased the marginal likelihoods, the per-prior moments and the
 * model weights. The posterior mode of τ² is now the mode of the τ²-scale
 * density (0 whenever the prior density of τ is positive at 0), the posterior
 * SD is reported as non-finite when it does not exist (flat μ prior, heavy-
 * tailed τ prior and k = 2; see posteriorVarianceFinite), and the 95 % CrI
 * of the averaged posterior is its exact 2.5 % / 97.5 % quantiles (it was
 * mean ± 1.96·SD of the mixture, which is not a quantile interval).
 *
 * Reference: Friede T, Röver C, Wandel S, Neuenschwander B (2017),
 * "Meta-analysis of two studies in the presence of heterogeneity with
 * applications in rare diseases", Biom J 59(4):658-671.
 */
(function (global) {
  "use strict";

  // ----- τ² priors --------------------------------------------------------
  //
  // Each prior is a function p(τ²) returning the prior density on the τ²
  // scale (as before). It also carries:
  //   .tauDensity(τ)  density on the τ scale (finite at τ = 0),
  //   .tail           a with p(τ) ~ τ^-a as τ → ∞ (Infinity: lighter than any power),
  //   .upper          upper end of the support of τ (Infinity if unbounded).

  function withMeta(f, tauDensity, tail, upper) {
    f.tauDensity = tauDensity; f.tail = tail; f.upper = upper;
    return f;
  }
  function halfNormal(sd) {
    var td = function (tau) {
      if (tau < 0) return 0;
      return Math.sqrt(2 / Math.PI) / sd * Math.exp(-tau * tau / (2 * sd * sd));
    };
    return withMeta(function (tau2) {
      if (tau2 < 0) return 0;
      var tau = Math.sqrt(tau2);
      if (tau === 0) return 0;
      return td(tau) / (2 * tau);
    }, td, Infinity, Infinity);
  }
  function halfCauchy(scale) {
    var td = function (tau) {
      if (tau < 0) return 0;
      return (2 / Math.PI / scale) / (1 + (tau / scale) * (tau / scale));
    };
    return withMeta(function (tau2) {
      if (tau2 < 0) return 0;
      var tau = Math.sqrt(tau2);
      if (tau === 0) return 0;
      return td(tau) / (2 * tau);
    }, td, 2, Infinity);
  }
  function invGamma(shape, scale) {
    // Inverse-gamma on τ², density at x = (β^α / Γ(α)) x^{-α-1} e^{-β/x}.
    var logBetaTerm = shape * Math.log(scale) - _lgamma(shape);
    var f = function (tau2) {
      if (tau2 <= 0) return 0;
      var logD = logBetaTerm + (-shape - 1) * Math.log(tau2) - scale / tau2;
      return Math.exp(logD);
    };
    var td = function (tau) { return tau > 0 ? 2 * tau * f(tau * tau) : 0; };
    return withMeta(f, td, 2 * shape + 1, Infinity);
  }
  function uniform(upper) {
    var td = function (tau) { return (tau >= 0 && tau <= upper) ? 1 / upper : 0; };
    return withMeta(function (tau2) {
      if (tau2 < 0) return 0;
      var tau = Math.sqrt(tau2);
      // τ²-scale density 1/(2τ·upper) is unbounded at τ = 0; the value at the
      // single point τ² = 0 is returned as 0 (it is not used for integration).
      if (tau === 0) return 0;
      if (tau > upper) return 0;
      return (1 / upper) / (2 * tau);
    }, td, Infinity, upper);
  }
  function _lgamma(x) {
    // Lanczos approximation (g = 7, n = 9), relative accuracy ~1e-15 for x > 0.
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
             771.32342877765313, -176.61502916214059, 12.507343278686905,
             -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - _lgamma(1 - x);
    x -= 1;
    var a = c[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function _tauDensity(prior) {
    if (typeof prior.tauDensity === "function") return prior.tauDensity;
    return function (tau) { return tau > 0 ? prior(tau * tau) * 2 * tau : 0; };
  }

  // Standard normal CDF — West (2009), absolute accuracy ~1e-15.
  function _pnorm(x) {
    var z = Math.abs(x), p;
    if (z > 37) p = 0;
    else {
      var e = Math.exp(-z * z / 2);
      if (z < 7.07106781186547) {
        var b = 3.52624965998911e-2 * z + 0.700383064443688;
        b = b * z + 6.37396220353165; b = b * z + 33.912866078383;
        b = b * z + 112.079291497871; b = b * z + 221.213596169931;
        b = b * z + 220.206867912376;
        var d = 8.83883476483184e-2 * z + 1.75566716318264;
        d = d * z + 16.064177579207; d = d * z + 86.7807322029461;
        d = d * z + 296.564248779674; d = d * z + 637.333633378831;
        d = d * z + 793.826512519948; d = d * z + 440.413735824752;
        p = e * b / d;
      } else {
        var f = z + 1 / (z + 2 / (z + 3 / (z + 4 / (z + 13 / 20))));
        p = e / (2.506628274631 * f);
      }
    }
    return x > 0 ? 1 - p : p;
  }

  // ----- Conditional posterior for μ given τ² ---------------------------
  function muCondPosterior(yi, vi, tau2) {
    var k = yi.length;
    var sw = 0, swy = 0;
    for (var i = 0; i < k; i++) {
      var w = 1 / (vi[i] + tau2);
      sw += w; swy += w * yi[i];
    }
    return { muHat: swy / sw, sePost: Math.sqrt(1 / sw), sw: sw };
  }

  // log L(τ²): likelihood with μ integrated out under a flat prior (exact).
  function _logMarginal(yi, vi, tau2) {
    var k = yi.length;
    var sw = 0, swy = 0;
    for (var i = 0; i < k; i++) {
      var w = 1 / (vi[i] + tau2);
      sw += w; swy += w * yi[i];
    }
    var muHat = swy / sw;
    var ll = 0;
    for (var j = 0; j < k; j++) {
      var v = vi[j] + tau2;
      var resid = yi[j] - muHat;
      ll += -0.5 * Math.log(2 * Math.PI * v) - 0.5 * resid * resid / v;
    }
    ll += 0.5 * Math.log(2 * Math.PI / sw);
    return ll;
  }

  // ----- Integration over τ (composite Gauss–Legendre in u = log τ) -----
  var GL20 = (function () {
    // nodes / weights of the 20-point Gauss–Legendre rule on [-1, 1] (Newton on P_20)
    var n = 20, x = [], w = [];
    for (var i = 1; i <= n; i++) {
      var z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 0;
      for (var it = 0; it < 100; it++) {
        var p1 = 1, p2 = 0;
        for (var j = 1; j <= n; j++) { var p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = n * (z * p1 - p2) / (z * z - 1);
        var z1 = z; z = z1 - p1 / pp;
        if (Math.abs(z - z1) < 1e-16) break;
      }
      x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
    }
    return { x: x, w: w };
  })();
  var U_MIN = -30, U_MAX = 340, PANEL = 0.25;

  // Posterior of τ under one prior, on the quadrature nodes. Nodes whose
  // weight is negligible (< 1e-18 of the largest) are dropped.
  function _tauPosterior(yi, vi, prior) {
    var td = _tauDensity(prior);
    var upper = (prior.upper != null && isFinite(prior.upper)) ? prior.upper : Infinity;
    var uHi = isFinite(upper) ? Math.log(upper) : U_MAX;
    var nP = Math.max(1, Math.ceil((uHi - U_MIN) / PANEL)), h = (uHi - U_MIN) / nP;
    var tau = [], lw = [], mu = [], s2 = [];
    var maxLw = -Infinity;
    for (var p = 0; p < nP; p++) {
      var mid = U_MIN + (p + 0.5) * h;
      for (var g = 0; g < 20; g++) {
        var u = mid + 0.5 * h * GL20.x[g], t = Math.exp(u);
        var pr = td(t);
        if (!(pr > 0)) continue;
        var t2 = t * t, cond = muCondPosterior(yi, vi, t2);
        var l = Math.log(0.5 * h * GL20.w[g]) + u + Math.log(pr) + _logMarginal(yi, vi, t2);
        if (!isFinite(l)) continue;
        tau.push(t); lw.push(l); mu.push(cond.muHat); s2.push(1 / cond.sw);
        if (l > maxLw) maxLw = l;
      }
    }
    var wt = [], Z = 0, keep = { tau: [], mu: [], s2: [], wt: [] };
    for (var i = 0; i < lw.length; i++) {
      var e = Math.exp(lw[i] - maxLw);
      if (e < 1e-18) continue;
      keep.tau.push(tau[i]); keep.mu.push(mu[i]); keep.s2.push(s2[i]); keep.wt.push(e); Z += e;
    }
    keep.Z = Z; keep.logZ = maxLw + Math.log(Z);
    return keep;
  }

  // Does the posterior variance of μ exist? With a flat μ prior L(τ) ~ τ^-(k-1)
  // and E[τ²] < ∞ iff 2 − (k − 1) − tail < −1 (bounded or light-tailed priors: always).
  function posteriorVarianceFinite(k, prior) {
    var tail = (prior && prior.tail != null) ? prior.tail : Infinity;
    if (prior && prior.upper != null && isFinite(prior.upper)) return true;
    return (2 - (k - 1) - tail) < -1;
  }

  // Posterior mode of τ² (density on the τ² scale).
  function _tau2Mode(yi, vi, prior) {
    var td = _tauDensity(prior);
    if (td(0) > 0) return 0;                  // τ²-scale density unbounded at 0
    var lg = function (lx) {                  // log density of τ² at x = e^lx (up to a constant)
      var x = Math.exp(lx), t = Math.sqrt(x), pr = td(t);
      if (!(pr > 0)) return -Infinity;
      return _logMarginal(yi, vi, x) + Math.log(pr) - Math.log(2 * t);
    };
    var best = -Infinity, bi = 0, grid = [];
    for (var i = 0; i <= 4000; i++) {
      var lx = Math.log(1e-8) + i * (Math.log(100) - Math.log(1e-8)) / 4000;
      grid.push(lx); var v = lg(lx); if (v > best) { best = v; bi = i; }
    }
    var a = grid[Math.max(0, bi - 1)], b = grid[Math.min(4000, bi + 1)];
    var gr = (Math.sqrt(5) - 1) / 2, c = b - gr * (b - a), d = a + gr * (b - a), fc = lg(c), fd = lg(d);
    for (var it = 0; it < 200 && (b - a) > 1e-15; it++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = lg(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = lg(d); }
    }
    return Math.exp((a + b) / 2);
  }

  /**
   * Fit a single τ²-prior model: posterior mean and SD of μ, posterior mode
   * of τ² and the log marginal likelihood (for cross-model weights).
   */
  function fitModel(yi, vi, prior, opts) {
    var P = _tauPosterior(yi, vi, prior);
    if (!isFinite(P.Z) || P.Z <= 0) return { ok: false, error: "degenerate integrand" };
    var m1 = 0, m2 = 0;
    for (var i = 0; i < P.wt.length; i++) {
      m1 += P.wt[i] * P.mu[i];
      m2 += P.wt[i] * (P.s2[i] + P.mu[i] * P.mu[i]);
    }
    var muHat = m1 / P.Z;
    var seHat = posteriorVarianceFinite(yi.length, prior)
      ? Math.sqrt(Math.max(0, m2 / P.Z - muHat * muHat)) : Infinity;
    return {
      ok: true,
      muHat: muHat, sePost: seHat,
      tau2_post_mode: _tau2Mode(yi, vi, prior),
      logMarginalLik: P.logZ,
      grid: P.tau, integrand: P.wt, normaliser: P.Z, _post: P,
    };
  }

  function _mixtureQuantile(fits, weights, p, centre, scale) {
    var F = function (x) {
      var s = 0;
      for (var k = 0; k < fits.length; k++) {
        var P = fits[k].fit._post, a = 0;
        for (var i = 0; i < P.wt.length; i++) a += P.wt[i] * _pnorm((x - P.mu[i]) / Math.sqrt(P.s2[i]));
        s += weights[k] * a / P.Z;
      }
      return s;
    };
    var wl = scale, wh = scale;
    for (var g = 0; g < 200 && F(centre - wl) > p; g++) wl *= 2;
    for (var g2 = 0; g2 < 200 && F(centre + wh) < p; g2++) wh *= 2;
    var lo = centre - wl, hi = centre + wh;
    for (var it = 0; it < 200; it++) {
      var m = 0.5 * (lo + hi);
      if (m <= lo || m >= hi) break;
      if (F(m) < p) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
  }

  /**
   * Average over a list of prior models with equal model prior weights.
   * Returns the BMA mean and SD of μ, the exact 95 % CrI of the averaged
   * posterior and per-model weights.
   */
  function fit(yi, vi, models, opts) {
    opts = opts || {};
    var fits = models.map(function (m) {
      var f = fitModel(yi, vi, m.prior, opts);
      return { name: m.name, fit: f };
    }).filter(function (f) { return f.fit.ok; });
    if (!fits.length) return { ok: false, error: "all models failed" };
    var maxLM = -Infinity;
    for (var i = 0; i < fits.length; i++)
      if (fits[i].fit.logMarginalLik > maxLM) maxLM = fits[i].fit.logMarginalLik;
    var unnorm = fits.map(function (f) { return Math.exp(f.fit.logMarginalLik - maxLM); });
    var sumW = unnorm.reduce(function (a, b) { return a + b; }, 0);
    var weights = unnorm.map(function (u) { return u / sumW; });
    var muBMA = 0;
    for (var k = 0; k < fits.length; k++) muBMA += weights[k] * fits[k].fit.muHat;
    var varBMA = 0, finite = true;
    for (var k2 = 0; k2 < fits.length; k2++) {
      var f2 = fits[k2].fit;
      if (!isFinite(f2.sePost) && weights[k2] > 0) finite = false;
      varBMA += weights[k2] * (f2.sePost * f2.sePost + f2.muHat * f2.muHat);
    }
    var seBMA = finite ? Math.sqrt(Math.max(0, varBMA - muBMA * muBMA)) : Infinity;
    var scale = 0;
    for (var k3 = 0; k3 < fits.length; k3++) {
      var P = fits[k3].fit._post;
      scale = Math.max(scale, Math.sqrt(P.s2[0]));
    }
    scale = Math.max(scale, 1e-6) * 10;
    return {
      ok: true,
      muHat: muBMA, sePost: seBMA,
      ci_lo: _mixtureQuantile(fits, weights, 0.025, muBMA, scale),
      ci_hi: _mixtureQuantile(fits, weights, 0.975, muBMA, scale),
      perModel: fits.map(function (f, j) {
        return { name: f.name, weight: weights[j],
                 muHat: f.fit.muHat, sePost: f.fit.sePost,
                 tau2_mode: f.fit.tau2_post_mode };
      }),
    };
  }

  function defaultModels() {
    return [
      { name: "halfNormal(0.5)",  prior: halfNormal(0.5) },
      { name: "halfNormal(1.0)",  prior: halfNormal(1.0) },
      { name: "halfCauchy(0.5)",  prior: halfCauchy(0.5) },
      { name: "halfCauchy(1.0)",  prior: halfCauchy(1.0) },
      { name: "invGamma(0.1, 0.1)", prior: invGamma(0.1, 0.1) },
      { name: "uniform(5)",       prior: uniform(5) },
    ];
  }

  var api = {
    halfNormal: halfNormal, halfCauchy: halfCauchy,
    invGamma: invGamma, uniform: uniform,
    fitModel: fitModel, fit: fit,
    defaultModels: defaultModels,
    posteriorVarianceFinite: posteriorVarianceFinite,
    _muCondPosterior: muCondPosterior,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmBMA = api;
})(typeof window !== "undefined" ? window : globalThis);
