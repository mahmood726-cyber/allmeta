/* shared/distributional-mr.js — distributional meta-regression with a skew-normal
 * between-study random-effects distribution (location + log-scale + shape links).
 *
 * Extends shared/location-scale.js (Viechtbauer & López-López 2022, which matches
 * metafor::rma(..., scale=~Z, link="log", method="ML")) by giving the between-study
 * true-effect distribution a THIRD parameter — skewness — that may itself depend on
 * moderators:
 *
 *     true effect      theta_i ~ SkewNormal(xi_i, omega_i, lambda_i)   (Azzalini)
 *     location  link:  xi_i        = x_i^T beta          (identity)
 *     log-scale link:  log omega_i^2 = z_i^T alpha       (log  -> omega_i^2 = exp(z_i^T alpha))
 *     shape     link:  lambda_i     = w_i^T nu           (identity, "slant" parameter)
 *     observed         y_i = theta_i + eps_i,   eps_i ~ N(0, v_i)
 *
 * KEY FACT (exact, no approximation). The skew-normal is closed under convolution
 * with a normal. With the stochastic representation
 *     theta = xi + omega*delta*|U| + omega*sqrt(1-delta^2)*Z,   U,Z ~ N(0,1) iid,
 *     delta = lambda / sqrt(1+lambda^2),
 * adding eps ~ N(0,v) keeps the |U| term and merges the two normal terms, so the
 * MARGINAL of y_i is again skew-normal, SN(xi_i, Omega_i, A_i), with
 *     Omega_i^2 = omega_i^2 + v_i
 *     deltaStar_i = omega_i*delta_i / Omega_i
 *     A_i         = deltaStar_i / sqrt(1 - deltaStar_i^2)
 * giving the closed-form per-study log density
 *     log f(y_i) = log2 - log Omega_i + log phi(t_i) + logPhi(A_i * t_i),  t_i=(y_i-xi_i)/Omega_i.
 * At lambda_i = 0 (delta=0 -> A=0, Phi(0)=1/2) this collapses EXACTLY to the normal
 * location-scale log density -logOmega -0.5*log(2pi) -0.5*t^2, i.e. metafor rma ML.
 *
 * Fit by ML (Nelder-Mead, mirroring location-scale's optimizer). Location/scale/shape
 * SEs from the numeric Hessian of the joint negative log-likelihood at the optimum.
 *
 * IDENTIFICATION (be honest): skewness is only WEAKLY identified from aggregate
 * (yi, vi) — a shape *moderator* especially. fit() therefore REFUSES a shape
 * moderator (a non-intercept column in W) when k < 20. The intercept-only skew term
 * is estimable but wide; treat it as exploratory. When W is omitted the shape is
 * fixed at 0 and fit() delegates to the verified location-scale core so the reduction
 * to the normal model is exact by construction.
 *
 * fit(yi, vi, X, Z, W, opts) — X/Z/W are k x p / k x q / k x r design matrices INCLUDING
 *   an intercept column. Omit W (or pass null) for the normal location-scale model.
 * No external dependency; no network.
 */
(function (global) {
  "use strict";
  var LOG2PI = Math.log(2 * Math.PI);
  var LOG2 = Math.log(2);
  var SQRT2 = Math.SQRT2;

  // location-scale core (for the shape-fixed-at-0 delegation / reduction (a)).
  var LS = (typeof module !== "undefined" && module.exports)
    ? require("./location-scale.js")
    : (global.AlmLocationScale || null);

  // ---- self-contained normal CDF via Numerical-Recipes erfc (as reverse-bayes.js) ----
  var _COF = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6,
    1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9,
    -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
    8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15,
    -9.4e-17, 1.21e-16, -2.8e-17];
  function _erfccheb(z) { // z >= 0
    var d = 0, dd = 0, t = 2 / (2 + z), ty = 4 * t - 2, tmp, j;
    for (j = _COF.length - 1; j > 0; j--) { tmp = d; d = ty * d - dd + _COF[j]; dd = tmp; }
    return t * Math.exp(-z * z + 0.5 * (_COF[0] + ty * d) - dd);
  }
  function _erfc(x) { return x >= 0 ? _erfccheb(x) : 2 - _erfccheb(-x); }

  // log standard-normal CDF, stable in the far-left tail.
  function _logPhi(x) {
    if (x >= -35) {
      var c = 0.5 * _erfc(-x / SQRT2);
      return Math.log(c);
    }
    // asymptotic  Phi(x) ~ phi(x)/(-x) * (1 - 1/x^2 + 3/x^4)  for x -> -inf
    var lx = -x, ix2 = 1 / (lx * lx);
    return -0.5 * x * x - Math.log(lx) - 0.5 * LOG2PI + Math.log(1 - ix2 + 3 * ix2 * ix2);
  }

  // ---- small linear algebra (Gauss-Jordan inverse; matrix*vector) ----
  function _matInv(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(r.map(function (_, j) { return i === j ? 1 : 0; })); }), c, r, j;
    for (c = 0; c < n; c++) {
      var p = c; for (r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var t = A[c]; A[c] = A[p]; A[p] = t; var d = A[c][c]; if (Math.abs(d) < 1e-300) return null;
      for (j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (r = 0; r < n; r++) { if (r === c) continue; var f = A[r][c]; for (j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(function (row) { return row.slice(n); });
  }
  function _matVec(M, v) { return M.map(function (row) { return row.reduce(function (a, x, j) { return a + x * v[j]; }, 0); }); }
  function _dot(a, b) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  // ---- Nelder-Mead (same structure as location-scale.js) ----
  function _nelderMead(f, x0, step, maxit) {
    var n = x0.length, simplex = [x0.slice()], fv = [f(x0)], i, j;
    for (i = 0; i < n; i++) { var pt = x0.slice(); pt[i] += step; simplex.push(pt); fv.push(f(pt)); }
    function order() { var idx = fv.map(function (v, k) { return k; }).sort(function (a, b) { return fv[a] - fv[b]; }); simplex = idx.map(function (k) { return simplex[k]; }); fv = idx.map(function (k) { return fv[k]; }); }
    for (var it = 0; it < (maxit || 800); it++) {
      order();
      var c = new Array(n).fill(0); for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      var xr = c.map(function (cc, k) { return cc + (cc - simplex[n][k]); }), fr = f(xr);
      if (fr < fv[0]) { var xe = c.map(function (cc, k) { return cc + 2 * (xr[k] - cc); }), fe = f(xe); if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { simplex[n] = xr; fv[n] = fr; }
      else { var xc = c.map(function (cc, k) { return cc + 0.5 * (simplex[n][k] - cc); }), fc = f(xc);
        if (fc < fv[n]) { simplex[n] = xc; fv[n] = fc; }
        else { for (var s2 = 1; s2 <= n; s2++) { simplex[s2] = simplex[0].map(function (x0v, k) { return x0v + 0.5 * (simplex[s2][k] - x0v); }); fv[s2] = f(simplex[s2]); } } }
    }
    order(); return { x: simplex[0], f: fv[0] };
  }

  // ---- numeric Hessian (central differences) ----
  function _hessian(f, x, h) {
    var n = x.length, H = [], i, j;
    for (i = 0; i < n; i++) H.push(new Array(n).fill(0));
    var f0 = f(x);
    for (i = 0; i < n; i++) {
      for (j = i; j < n; j++) {
        var hp = (Math.abs(x[i]) + 1) * h, hq = (Math.abs(x[j]) + 1) * h, v;
        if (i === j) {
          var xp = x.slice(); xp[i] += hp; var xm = x.slice(); xm[i] -= hp;
          v = (f(xp) - 2 * f0 + f(xm)) / (hp * hp);
        } else {
          var xpp = x.slice(); xpp[i] += hp; xpp[j] += hq;
          var xpm = x.slice(); xpm[i] += hp; xpm[j] -= hq;
          var xmp = x.slice(); xmp[i] -= hp; xmp[j] += hq;
          var xmm = x.slice(); xmm[i] -= hp; xmm[j] -= hq;
          v = (f(xpp) - f(xpm) - f(xmp) + f(xmm)) / (4 * hp * hq);
        }
        H[i][j] = v; H[j][i] = v;
      }
    }
    return H;
  }

  // ---- per-study skew-normal marginal log density (the closed-form core) ----
  // beta/alpha/nu are ORIGINAL-space coefficients; X/Z/W ORIGINAL design rows.
  function _logDens(yi, vi, X, Z, W, beta, alpha, nu) {
    var k = yi.length, ll = 0, i;
    for (i = 0; i < k; i++) {
      var xi = _dot(X[i], beta);
      var omega2 = Math.exp(_dot(Z[i], alpha));
      var lambda = W ? _dot(W[i], nu) : 0;
      var delta = lambda / Math.sqrt(1 + lambda * lambda);
      var Omega2 = omega2 + vi[i], Omega = Math.sqrt(Omega2);
      var dStar = Math.sqrt(omega2) * delta / Omega;          // in (-1,1)
      var A = dStar / Math.sqrt(1 - dStar * dStar);
      var t = (yi[i] - xi) / Omega;
      ll += LOG2 - Math.log(Omega) - 0.5 * LOG2PI - 0.5 * t * t + _logPhi(A * t);
    }
    return ll;
  }

  // negative joint log-likelihood, params packed [beta(p), alpha(q), nu(r)].
  function _negLL(yi, vi, X, Z, W, p, q, r, par) {
    var beta = par.slice(0, p), alpha = par.slice(p, p + q), nu = W ? par.slice(p + q, p + q + r) : null;
    var ll = _logDens(yi, vi, X, Z, W, beta, alpha, nu);
    return isFinite(ll) ? -ll : 1e12;
  }

  // ---- standardisation of a design matrix (non-intercept cols -> mean0/sd1) ----
  function _stdSpec(D) {
    var k = D.length, p = D[0].length, mean = new Array(p).fill(0), sd = new Array(p).fill(1), isI = new Array(p).fill(false), j;
    for (j = 0; j < p; j++) {
      var col = D.map(function (row) { return row[j]; });
      var mu = col.reduce(function (a, b) { return a + b; }, 0) / k;
      var vr = col.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / k;
      if (vr < 1e-12) { isI[j] = true; mean[j] = 0; sd[j] = 1; }
      else { mean[j] = mu; sd[j] = Math.sqrt(vr); }
    }
    var Ds = D.map(function (row) { return row.map(function (v, jj) { return isI[jj] ? v : (v - mean[jj]) / sd[jj]; }); });
    return { Ds: Ds, mean: mean, sd: sd, isI: isI };
  }
  // Jacobian A (p x p) mapping standardised coeffs -> original coeffs, same as
  // location-scale.js: for an identity/linear predictor eta = coeff . row.
  function _jac(spec) {
    var p = spec.sd.length, A = [], i, j, ii = spec.isI.indexOf(true);
    for (i = 0; i < p; i++) A.push(new Array(p).fill(0));
    for (j = 0; j < p; j++) {
      if (spec.isI[j]) A[j][j] = 1;
      else { A[j][j] = 1 / spec.sd[j]; if (ii >= 0) A[ii][j] += -spec.mean[j] / spec.sd[j]; }
    }
    return A;
  }
  function _nonInterceptCols(spec) { return spec.isI.filter(function (b) { return !b; }).length; }

  function fit(yi, vi, X, Z, W, opts) {
    opts = opts || {};
    var k = yi.length, p = X[0].length, q = Z[0].length, i, j;

    // ---- shape fixed at 0 -> delegate to the verified location-scale core.
    if (!W) {
      if (!LS) return { error: "location-scale core not available" };
      var ls = LS.fit(yi, vi, X, Z);
      return {
        beta: ls.beta, betaSE: ls.betaSE, betaVcov: ls.betaVcov,
        alpha: ls.alpha, alphaSE: ls.alphaSE, alphaVcov: ls.alphaVcov,
        nu: null, nuSE: null,
        omega2: ls.tau2.slice(), lambda: yi.map(function () { return 0; }),
        delta: yi.map(function () { return 0; }), tau2: ls.tau2.slice(),
        logLik: ls.logLik, k: k, p: p, q: q, r: 0, shapeEstimated: false, delegated: true,
      };
    }

    var r = W[0].length;
    var sX = _stdSpec(X), sZ = _stdSpec(Z), sW = _stdSpec(W);

    // ---- identification guard: refuse a shape MODERATOR (non-intercept W col) at k<20.
    if (_nonInterceptCols(sW) > 0 && k < (opts.kMin || 20)) {
      return { error: "shape moderator requires k >= " + (opts.kMin || 20) + " for identification (k=" + k + "); refusing to report a shape-moderator fit", guard: "k<kMin" };
    }

    // ---- warm start (standardised space): normal DL-ish location/scale, nu=0.
    var sw = 0, swy = 0; for (i = 0; i < k; i++) { var w0 = 1 / vi[i]; sw += w0; swy += w0 * yi[i]; }
    var mu0 = swy / sw, Qh = 0; for (i = 0; i < k; i++) Qh += (1 / vi[i]) * (yi[i] - mu0) * (yi[i] - mu0);
    var t0 = Math.max(1e-3, (Qh - (k - 1)) / sw);
    var par0 = new Array(p + q + r).fill(0);
    // location intercept warm-start = weighted mean; scale intercept = log(DL tau2)
    for (j = 0; j < p; j++) if (sX.isI[j]) par0[j] = mu0;
    for (j = 0; j < q; j++) if (sZ.isI[j]) par0[p + j] = Math.log(t0);
    // nu warm-start 0 (normal)

    var Xs = sX.Ds, Zs = sZ.Ds, Ws = sW.Ds;
    var obj = function (par) { return _negLL(yi, vi, Xs, Zs, Ws, p, q, r, par); };
    var opt = _nelderMead(obj, par0, 0.4, 2500);
    opt = _nelderMead(obj, opt.x, 0.05, 1500);
    opt = _nelderMead(obj, opt.x, 0.005, 800);
    // a light multi-start on the shape block to avoid a normal-mode local optimum
    var starts = [opt.x];
    [1.0, -1.0].forEach(function (lam) {
      var st = opt.x.slice(); for (j = 0; j < r; j++) if (sW.isI[j]) st[p + q + j] = lam;
      var o2 = _nelderMead(obj, st, 0.2, 1500); o2 = _nelderMead(obj, o2.x, 0.02, 800); starts.push(o2.x);
    });
    var best = starts.map(function (s) { return { x: s, f: obj(s) }; }).sort(function (a, b) { return a.f - b.f; })[0];
    var o3 = _nelderMead(obj, best.x, 0.002, 500);
    var pStd = o3.x;

    // ---- map coeffs back to original space (block-diagonal Jacobian).
    var Ax = _jac(sX), Az = _jac(sZ), Aw = _jac(sW);
    var betaS = pStd.slice(0, p), alphaS = pStd.slice(p, p + q), nuS = pStd.slice(p + q, p + q + r);
    var beta = _matVec(Ax, betaS), alpha = _matVec(Az, alphaS), nu = _matVec(Aw, nuS);

    // ---- SEs: numeric Hessian in standardised space, mapped by full Jacobian A.
    var m = p + q + r;
    var Afull = []; for (i = 0; i < m; i++) Afull.push(new Array(m).fill(0));
    for (i = 0; i < p; i++) for (j = 0; j < p; j++) Afull[i][j] = Ax[i][j];
    for (i = 0; i < q; i++) for (j = 0; j < q; j++) Afull[p + i][p + j] = Az[i][j];
    for (i = 0; i < r; i++) for (j = 0; j < r; j++) Afull[p + q + i][p + q + j] = Aw[i][j];
    var Hs = _hessian(obj, pStd, 1e-4), HsInv = _matInv(Hs);
    var se = new Array(m).fill(NaN), vcov = null;
    if (HsInv) {
      var AH = Afull.map(function (row) { return _matVec(HsInv, row); });
      vcov = AH.map(function (row) { return Afull.map(function (rowB) { return _dot(row, rowB); }); });
      se = vcov.map(function (row, jj) { return Math.sqrt(Math.max(0, row[jj])); });
    }

    // ---- derived per-study omega^2, lambda, delta and marginal between-study var.
    var omega2 = [], lambda = [], delta = [], tau2 = [];
    for (i = 0; i < k; i++) {
      var o2 = Math.exp(_dot(Z[i], alpha)), lam = _dot(W[i], nu), del = lam / Math.sqrt(1 + lam * lam);
      omega2.push(o2); lambda.push(lam); delta.push(del);
      tau2.push(o2 * (1 - 2 * del * del / Math.PI)); // Var of SN = omega^2 (1 - 2 delta^2/pi)
    }

    return {
      beta: beta, betaSE: se.slice(0, p),
      alpha: alpha, alphaSE: se.slice(p, p + q),
      nu: nu, nuSE: se.slice(p + q, p + q + r),
      omega2: omega2, lambda: lambda, delta: delta, tau2: tau2,
      vcov: vcov, logLik: -o3.f, k: k, p: p, q: q, r: r, shapeEstimated: true, delegated: false,
    };
  }

  var api = {
    fit: fit,
    _logDens: _logDens,   // exposed for the reduction-(a) pointwise density check
    _logPhi: _logPhi,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmDistributionalMR = api;
})(typeof window !== "undefined" ? window : globalThis);
