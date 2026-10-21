/* shared/rare-events-glmm.js — binomial-normal GLMMs for rare-event meta-analysis of odds ratios.
 *
 * Reproduces metafor::rma.glmm(measure = "OR", method = "ML") with its default settings for four models
 * (Stijnen, Hamza & Ozdemir 2010; metafor 5.2-1 / lme4 2.0-6 conventions):
 *
 *   UM.FS  unconditional, fixed study intercepts, random treatment effect:
 *          glmer(cbind(x, n - x) ~ 0 + trt + study + (0 + group | study), nAGQ = 7), group = +1/2 (T), -1/2 (C)
 *   UM.RS  unconditional, random study intercepts (independent of the treatment effect):
 *          glmer(... ~ 0 + trt + const + (group || study), nAGQ = 1)   (Laplace; metafor forces nAGQ = 1)
 *   CM.AL  conditional approximate likelihood: glmer(cbind(ai, ci) ~ 1 + (1 | study), offset log(n1/n2), nAGQ = 7)
 *   CM.EL  conditional exact likelihood: Fisher's noncentral hypergeometric density of ai given ai + ci,
 *          integrated over logOR_i ~ N(beta, tau2) (metafor .dnchg); fixed-effect fit reported when tau2 < 1e-4
 *
 * As in metafor, studies with zero events in both arms or events in every participant of both arms are dropped
 * (drop00 = TRUE). Objectives are lme4's deviance (UM.FS, UM.RS, CM.AL: adaptive Gauss-Hermite with lme4's
 * 7-point rule, or Laplace) and metafor's -loglik (CM.EL). They are minimised to convergence by Newton's method
 * on all parameters (study intercepts included). Standard errors follow lme4/metafor: lme4 uses the inverse of
 * the finite-difference Hessian of the deviance in (variance sd, fixed effects) when the number of parameters is
 * below 20 and the fit is not singular (sd >= 1e-4), and otherwise the RX approximation (fixed effects
 * conditional on the variance parameters, at the conditional modes); CM.EL uses the inverse Hessian of -loglik.
 * Inputs whose MLE of the log odds ratio is infinite (complete separation) are refused.
 *
 * Input rows: { events_T, n_T, events_C, n_C } (treatment = metafor's group 1: ai, n1i).
 * Output: { ok, model, theta, se_theta, tau2, sigma2 (UM.RS), OR, OR_lo, OR_hi, k, k_dropped00,
 *           n_zero_cell_studies, se_method, boundary, iterations } or { ok: false, error }.
 */
(function (global) {
  "use strict";

  var Z975 = 1.959963984540054;            // qnorm(0.975)
  var SING_TOL = 1e-4;                      // lme4 getSingTol(): sd parameter below this => singular fit
  var NPAR_MAX = 20;                        // lme4 checkConv check.conv.nparmax: Hessian only if npar < 20
  var CMEL_T0 = 1e-4;                       // metafor tau2tol: CM.EL tau2 below this => fixed-effect estimate

  // lme4 GHrule(7): nodes and weights for integrals against the standard normal density.
  var GH7_Z = [-3.7504397177257438, -2.3667594107345415, -1.1544053947399679, 0,
                1.1544053947399679,  2.3667594107345415,  3.7504397177257438];
  var GH7_W = [0.00054826885597221756, 0.03075712396758649436, 0.24012317860501272704, 0.45714285714285712858,
               0.24012317860501272704, 0.03075712396758649436, 0.00054826885597221756];

  // Gauss-Hermite rule for integrals against exp(-x^2) (Golub-Welsch-free Newton iteration; Numerical Recipes).
  function gaussHermite(n) {
    var x = new Array(n), w = new Array(n), m = (n + 1) >> 1, z = 0, pp = 0, PIM4 = 0.7511255444649425;
    for (var i = 0; i < m; i++) {
      if (i === 0) z = Math.sqrt(2 * n + 1) - 1.85575 * Math.pow(2 * n + 1, -0.16667);
      else if (i === 1) z -= 1.14 * Math.pow(n, 0.426) / z;
      else if (i === 2) z = 1.86 * z - 0.86 * x[0];
      else if (i === 3) z = 1.91 * z - 0.91 * x[1];
      else z = 2 * z - x[i - 2];
      for (var it = 0; it < 100; it++) {
        var p1 = PIM4, p2 = 0;
        for (var j = 0; j < n; j++) {
          var p3 = p2; p2 = p1;
          p1 = z * Math.sqrt(2 / (j + 1)) * p2 - Math.sqrt(j / (j + 1)) * p3;
        }
        pp = Math.sqrt(2 * n) * p2;
        var z1 = z; z = z1 - p1 / pp;
        if (Math.abs(z - z1) <= 1e-15) break;
      }
      x[i] = z; x[n - 1 - i] = -z;
      w[i] = 2 / (pp * pp); w[n - 1 - i] = w[i];
    }
    return { x: x, w: w };
  }
  var GH_CMEL = gaussHermite(48);

  function log1pexp(x) { return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)); }
  function plogis(e) { return e >= 0 ? 1 / (1 + Math.exp(-e)) : Math.exp(e) / (1 + Math.exp(e)); }
  function logSumExp(a) {
    var m = -Infinity, i, s = 0;
    for (i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    if (!isFinite(m)) return m;
    for (i = 0; i < a.length; i++) s += Math.exp(a[i] - m);
    return m + Math.log(s);
  }

  // Binomial deviance residual (glm/lme4 dev.resids): 2[y log(y/(n p)) + (n-y) log((n-y)/(n(1-p)))].
  function devRes(y, n, eta) {
    var d = 0;
    if (y > 0) d += y * (Math.log(y / n) + log1pexp(-eta));
    if (n - y > 0) d += (n - y) * (Math.log((n - y) / n) + log1pexp(eta));
    return 2 * d;
  }

  // ---------------------------------------------------------------------------------------------
  // Data preparation: validation, drop00, separation.
  function isCount(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0; }
  function prepare(rowsIn) {
    var rows = (rowsIn || []).filter(function (r) {
      return r && isCount(r.events_T) && isCount(r.n_T) && isCount(r.events_C) && isCount(r.n_C)
          && r.n_T > 0 && r.n_C > 0 && r.events_T <= r.n_T && r.events_C <= r.n_C;
    });
    var used = [], dropped = 0, zeroEvt = 0;
    rows.forEach(function (r) {
      var a = r.events_T, b = r.n_T - r.events_T, c = r.events_C, d = r.n_C - r.events_C;
      if (a === 0 || c === 0) zeroEvt++;
      if ((a === 0 && c === 0) || (b === 0 && d === 0)) { dropped++; return; }
      used.push({ a: a, b: b, c: c, d: d, n1: a + b, n2: c + d, label: r.label });
    });
    // Complete separation: no finite MLE of log OR (every study compatible with logOR -> -Inf, or with +Inf).
    var neg = used.length > 0 && used.every(function (s) { return s.a === 0 || s.d === 0; });
    var pos = used.length > 0 && used.every(function (s) { return s.b === 0 || s.c === 0; });
    return { rows: rows, studies: used, k: used.length, k_dropped00: dropped, n_zero_cell_studies: zeroEvt,
             separated: neg ? "negative" : pos ? "positive" : null };
  }

  // ---------------------------------------------------------------------------------------------
  // lme4 per-study conditional problem. obs: [{y, n, off, z: [q]}]; lam: [q] diagonal relative covariance factor.
  // devc(u) = sum devRes + |u|^2. Returns the conditional mode and the PIRLS weights there.
  function devc(obs, lam, u) {
    var s = 0, q = lam.length;
    for (var j = 0; j < obs.length; j++) {
      var eta = obs[j].off;
      for (var r = 0; r < q; r++) eta += obs[j].z[r] * lam[r] * u[r];
      s += devRes(obs[j].y, obs[j].n, eta);
    }
    for (var r2 = 0; r2 < q; r2++) s += u[r2] * u[r2];
    return s;
  }
  function condMode(obs, lam) {
    var q = lam.length, u = new Array(q).fill(0), f = devc(obs, lam, u), it, j, r, s;
    var g = new Array(q), H = [], W = new Array(obs.length);
    for (it = 0; it < 200; it++) {
      for (r = 0; r < q; r++) { g[r] = u[r]; H[r] = new Array(q).fill(0); H[r][r] = 1; }
      for (j = 0; j < obs.length; j++) {
        var eta = obs[j].off;
        for (r = 0; r < q; r++) eta += obs[j].z[r] * lam[r] * u[r];
        var p = plogis(eta), res = obs[j].y - obs[j].n * p, w = obs[j].n * p * (1 - p);
        W[j] = w;
        for (r = 0; r < q; r++) {
          var zr = obs[j].z[r] * lam[r];
          g[r] -= res * zr;
          for (s = 0; s < q; s++) H[r][s] += w * zr * obs[j].z[s] * lam[s];
        }
      }
      var step = q === 1 ? [g[0] / H[0][0]] : solve2(H, g), smax = 0, umax = 0;
      for (r = 0; r < q; r++) { smax = Math.max(smax, Math.abs(step[r])); umax = Math.max(umax, Math.abs(u[r])); }
      if (smax < 1e-12 * (1 + umax)) {            // converged: take the last (tiny) Newton step and stop
        for (r = 0; r < q; r++) u[r] -= step[r];
        f = devc(obs, lam, u);
        break;
      }
      var t = 1, unew, fnew, ok = false;
      for (var ls = 0; ls < 60; ls++) {
        unew = u.map(function (v, i) { return v - t * step[i]; });
        fnew = devc(obs, lam, unew);
        if (fnew <= f + 1e-13 * Math.max(1, Math.abs(f))) { ok = true; break; }
        t *= 0.5;
      }
      if (!ok) break;
      u = unew; f = fnew;
    }
    // weights at the mode
    for (j = 0; j < obs.length; j++) {
      var e2 = obs[j].off;
      for (r = 0; r < q; r++) e2 += obs[j].z[r] * lam[r] * u[r];
      var p2 = plogis(e2); W[j] = obs[j].n * p2 * (1 - p2);
    }
    return { u: u, devc: f, W: W };
  }
  function solve2(A, b) {
    var det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    return [(A[1][1] * b[0] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - A[1][0] * b[0]) / det];
  }
  // Lambda' Z' W Z Lambda + I at the mode (q x q).
  function lzwzl(obs, lam, W) {
    var q = lam.length, M = [], r, s, j;
    for (r = 0; r < q; r++) { M[r] = new Array(q).fill(0); M[r][r] = 1; }
    for (j = 0; j < obs.length; j++)
      for (r = 0; r < q; r++) for (s = 0; s < q; s++) M[r][s] += W[j] * obs[j].z[r] * lam[r] * obs[j].z[s] * lam[s];
    return M;
  }
  // lme4 deviance contribution of one grouping level: Laplace (nAGQ = 1) or adaptive GH with lme4's 7-point rule.
  function studyDeviance(obs, lam, nAGQ) {
    var allZero = lam.every(function (l) { return l === 0; });
    if (allZero) { var s0 = 0; for (var j = 0; j < obs.length; j++) s0 += devRes(obs[j].y, obs[j].n, obs[j].off); return s0; }
    var m = condMode(obs, lam), M = lzwzl(obs, lam, m.W);
    if (nAGQ === 1 || lam.length > 1) {
      var ld = lam.length === 1 ? Math.log(M[0][0]) : Math.log(M[0][0] * M[1][1] - M[0][1] * M[1][0]);
      return m.devc + ld;
    }
    var L = Math.sqrt(M[0][0]), sd = 1 / L, terms = new Array(GH7_Z.length);
    for (var k = 0; k < GH7_Z.length; k++) {
      var z = GH7_Z[k];
      terms[k] = Math.log(GH7_W[k]) + (z === 0 ? 0 : -(devc(obs, lam, [m.u[0] + z * sd]) - m.devc) / 2 + z * z / 2);
    }
    return m.devc + 2 * Math.log(L) - 2 * logSumExp(terms);
  }

  // ---------------------------------------------------------------------------------------------
  // Model definitions. Global parameters gp, per-study parameter sp (UM.FS intercepts only).
  var MODELS = {
    "UM.FS": {
      nGlobal: 2, perStudy: 1, factor: 2, names: ["tau", "theta"], varIdx: [0], thetaIdx: 1,
      obs: function (s, gp, sp) {
        return [{ y: s.a, n: s.n1, off: sp + gp[1], z: [0.5] }, { y: s.c, n: s.n2, off: sp, z: [-0.5] }];
      },
      lam: function (gp) { return [Math.abs(gp[0])]; }, nAGQ: 7
    },
    "UM.RS": {
      nGlobal: 4, perStudy: 0, factor: 2, names: ["sigma", "tau", "theta", "mu"], varIdx: [0, 1], thetaIdx: 2,
      obs: function (s, gp) {
        return [{ y: s.a, n: s.n1, off: gp[3] + gp[2], z: [1, 0.5] }, { y: s.c, n: s.n2, off: gp[3], z: [1, -0.5] }];
      },
      lam: function (gp) { return [Math.abs(gp[0]), Math.abs(gp[1])]; }, nAGQ: 1
    },
    "CM.AL": {
      nGlobal: 2, perStudy: 0, factor: 2, names: ["tau", "theta"], varIdx: [0], thetaIdx: 1,
      obs: function (s, gp) { return [{ y: s.a, n: s.a + s.c, off: Math.log(s.n1 / s.n2) + gp[1], z: [1] }]; },
      lam: function (gp) { return [Math.abs(gp[0])]; }, nAGQ: 7
    }
  };

  function lme4StudyDev(model, s, gp, sp) { var M = MODELS[model]; return studyDeviance(M.obs(s, gp, sp), M.lam(gp), M.nAGQ); }

  // ---------------------------------------------------------------------------------------------
  // CM.EL: Fisher noncentral hypergeometric log density of a given margins, as a function of x = log OR,
  // with its first two derivatives (mean and variance of the count). Terms below 1e-20 of the mode are dropped.
  function cmelPrep(s) {
    var n1 = s.n1, n2 = s.n2, m1 = s.a + s.c, lo = Math.max(0, m1 - n2), hi = Math.min(n1, m1);
    // log C(n1, x) C(n2, m1 - x) relative to x = lo, by exact ratios
    var lc = new Float64Array(hi - lo + 1); lc[0] = 0;
    for (var x = lo; x < hi; x++)
      lc[x - lo + 1] = lc[x - lo] + Math.log((n1 - x) / (x + 1)) + Math.log((m1 - x) / (n2 - m1 + x + 1));
    return { a: s.a, lo: lo, hi: hi, lc: lc };
  }
  function fnch(st, x) {
    var n = st.lc.length;
    if (n === 1) return { ll: 0, d1: 0, d2: 0 };
    // terms lc[i] + (lo + i) x are concave in i: locate the mode by bisection on the forward difference,
    // then sum outwards until terms fall below e^-46 (~1e-20) of the largest.
    var lo = 0, hi = n - 1, mid, i, t;
    while (lo < hi) { mid = (lo + hi) >> 1; if (st.lc[mid + 1] - st.lc[mid] + x > 0) lo = mid + 1; else hi = mid; }
    var ib = lo, best = st.lc[ib] + (st.lo + ib) * x, S0 = 0, S1 = 0, S2 = 0, v, e;
    for (i = ib; i < n; i++) {
      t = st.lc[i] + (st.lo + i) * x - best; if (t < -46) break;
      e = Math.exp(t); v = i - ib; S0 += e; S1 += e * v; S2 += e * v * v;
    }
    for (i = ib - 1; i >= 0; i--) {
      t = st.lc[i] + (st.lo + i) * x - best; if (t < -46) break;
      e = Math.exp(t); v = i - ib; S0 += e; S1 += e * v; S2 += e * v * v;
    }
    var mc = S1 / S0, vr = Math.max(0, S2 / S0 - mc * mc), mean = st.lo + ib + mc;
    return { ll: st.lc[st.a - st.lo] + st.a * x - best - Math.log(S0), d1: st.a - mean, d2: -vr };
  }
  // -log of one study's integrated likelihood: -log int dFNCH(a | e^x) N(x; beta, tau^2) dx (adaptive GH, 48 nodes)
  function cmelStudyNegLL(st, beta, tau) {
    if (st.lc.length === 1) return 0;
    if (tau === 0) return -fnch(st, beta).ll;
    var t2 = tau * tau, x = beta, it, f;
    for (it = 0; it < 100; it++) {                       // mode of g(x) = ll(x) - (x - beta)^2 / (2 tau^2)
      f = fnch(st, x);
      var g1 = f.d1 - (x - beta) / t2, g2 = f.d2 - 1 / t2, step = g1 / g2;
      x -= step;
      if (Math.abs(step) < 1e-13 * Math.max(1, Math.abs(x))) break;
    }
    f = fnch(st, x);
    var sig = Math.sqrt(-1 / (f.d2 - 1 / t2)), terms = new Array(GH_CMEL.x.length);
    for (var k = 0; k < GH_CMEL.x.length; k++) {
      var xk = x + Math.SQRT2 * sig * GH_CMEL.x[k], dk = xk - beta;
      terms[k] = Math.log(GH_CMEL.w[k]) + GH_CMEL.x[k] * GH_CMEL.x[k] + fnch(st, xk).ll - dk * dk / (2 * t2);
    }
    // int e^{g} dx / (tau sqrt(2 pi)) with x = mode + sqrt(2) sig z
    return -(Math.log(Math.SQRT2 * sig) + logSumExp(terms) - Math.log(tau) - 0.5 * Math.log(2 * Math.PI));
  }

  // ---------------------------------------------------------------------------------------------
  // Newton minimiser over global parameters (and one per-study parameter each, if any), with the arrow-shaped
  // Hessian solved by a Schur complement. Derivatives by central finite differences of per-study objectives.
  function studyObj(model, sts, g, gp, sp) {
    return model === "CM.EL" ? cmelStudyNegLL(sts[g], gp[0], Math.abs(gp[1])) : lme4StudyDev(model, sts[g], gp, sp);
  }
  function totalObj(model, sts, gp, sps) {
    var s = 0; for (var g = 0; g < sts.length; g++) s += studyObj(model, sts, g, gp, sps ? sps[g] : 0); return s;
  }
  // Per-study value, gradient and Hessian in (global..., own) coordinates; Richardson-extrapolated when fine.
  function studyDerivs(model, sts, g, gp, sp, P, S, h) {
    var D = P + S, x0 = gp.concat(S ? [sp] : []);
    var F = function (x) { return studyObj(model, sts, g, x.slice(0, P), S ? x[P] : 0); };
    var f0 = F(x0), grad = new Array(D), H = [], i, j;
    for (i = 0; i < D; i++) H[i] = new Array(D);
    var fp = [], fm = [];
    for (i = 0; i < D; i++) {
      var xp = x0.slice(), xm = x0.slice(); xp[i] += h; xm[i] -= h;
      fp[i] = F(xp); fm[i] = F(xm);
      grad[i] = (fp[i] - fm[i]) / (2 * h);
      H[i][i] = (fp[i] - 2 * f0 + fm[i]) / (h * h);
    }
    for (i = 0; i < D; i++) for (j = i + 1; j < D; j++) {
      var a = x0.slice(), b = x0.slice(), c = x0.slice(), d = x0.slice();
      a[i] += h; a[j] += h; b[i] += h; b[j] -= h; c[i] -= h; c[j] += h; d[i] -= h; d[j] -= h;
      H[i][j] = H[j][i] = (F(a) - F(b) - F(c) + F(d)) / (4 * h * h);
    }
    return { f: f0, g: grad, H: H };
  }
  function derivsAll(model, sts, gp, sps, P, S, h, rich) {
    var one = function (hh) {
      var G = new Array(P).fill(0), A = [], B = [], Dd = [], Gs = [], f = 0, i, j;
      for (i = 0; i < P; i++) A[i] = new Array(P).fill(0);
      for (var g = 0; g < sts.length; g++) {
        var r = studyDerivs(model, sts, g, gp, S ? sps[g] : 0, P, S, hh);
        f += r.f;
        for (i = 0; i < P; i++) { G[i] += r.g[i]; for (j = 0; j < P; j++) A[i][j] += r.H[i][j]; }
        if (S) { B.push(r.H[P].slice(0, P)); Dd.push(r.H[P][P]); Gs.push(r.g[P]); }
      }
      return { f: f, G: G, A: A, B: B, Dd: Dd, Gs: Gs };
    };
    var r1 = one(h);
    if (!rich) return r1;
    var r2 = one(h / 2), ex = function (x1, x2) { return (4 * x2 - x1) / 3; }, i, j;
    for (i = 0; i < P; i++) { r2.G[i] = ex(r1.G[i], r2.G[i]); for (j = 0; j < P; j++) r2.A[i][j] = ex(r1.A[i][j], r2.A[i][j]); }
    for (var g = 0; g < r2.B.length; g++) {
      for (i = 0; i < P; i++) r2.B[g][i] = ex(r1.B[g][i], r2.B[g][i]);
      r2.Dd[g] = ex(r1.Dd[g], r2.Dd[g]); r2.Gs[g] = ex(r1.Gs[g], r2.Gs[g]);
    }
    return r2;
  }
  function solveN(A, b) {               // Gaussian elimination with partial pivoting (small systems)
    var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      var t = M[i]; M[i] = M[p]; M[p] = t;
      if (M[i][i] === 0) return null;
      for (j = i + 1; j < n; j++) { var fct = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= fct * M[i][k]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  function invN(A) {
    var n = A.length, out = [];
    for (var c = 0; c < n; c++) { var e = new Array(n).fill(0); e[c] = 1; var col = solveN(A, e); if (!col) return null; out.push(col); }
    return A.map(function (_, i) { return out.map(function (col) { return col[i]; }); });
  }
  function posDef(A) {                   // Cholesky test
    var n = A.length, L = [], i, j, k;
    for (i = 0; i < n; i++) { L[i] = new Array(n).fill(0); for (j = 0; j <= i; j++) {
      var s = A[i][j]; for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 0)) return false; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j]; } }
    return true;
  }
  // Reduced (Schur) Hessian over the globals after eliminating the per-study parameters.
  function schur(r, P) {
    var A = r.A.map(function (row) { return row.slice(); }), G = r.G.slice(), i, j;
    for (var g = 0; g < r.B.length; g++) {
      var d = r.Dd[g], b = r.B[g];
      for (i = 0; i < P; i++) { G[i] -= b[i] * r.Gs[g] / d; for (j = 0; j < P; j++) A[i][j] -= b[i] * b[j] / d; }
    }
    return { A: A, G: G };
  }
  function minimise(model, sts, gp0, sps0, opts) {
    var M = model === "CM.EL" ? { nGlobal: 2, perStudy: 0 } : MODELS[model];
    var P = M.nGlobal, S = M.perStudy, gp = gp0.slice(), sps = S ? sps0.slice() : null;
    var f = totalObj(model, sts, gp, sps), lam = 0, it, conv = false, h = 1e-4;
    for (it = 0; it < 300; it++) {
      var r = derivsAll(model, sts, gp, sps, P, S, h, false), i, g;
      var tried = 0, accepted = false, maxStep = 0;
      while (tried < 40) {
        tried++;
        var Dd = S ? r.Dd.map(function (d) { return Math.max(d, 1e-8) + lam; }) : [];
        var A = r.A.map(function (row, ii) { return row.map(function (v, jj) { return v + (ii === jj ? lam : 0); }); });
        var rr = { A: A, G: r.G, B: r.B, Dd: Dd, Gs: r.Gs }, sc = schur(rr, P);
        var dg = posDef(sc.A) ? solveN(sc.A, sc.G.map(function (v) { return -v; })) : null;
        if (!dg || !dg.every(isFinite)) { lam = lam ? lam * 10 : 1e-3; continue; }
        var ds = S ? r.Gs.map(function (gs, gg) {
          var s = gs; for (i = 0; i < P; i++) s += r.B[gg][i] * dg[i]; return -s / Dd[gg]; }) : null;
        // cap absurd steps
        var mx = 0; dg.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
        if (ds) ds.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
        var scale = mx > 5 ? 5 / mx : 1;
        var gpn = gp.map(function (v, ii) { return v + scale * dg[ii]; });
        var spn = S ? sps.map(function (v, gg) { return v + scale * ds[gg]; }) : null;
        var fn = totalObj(model, sts, gpn, spn);
        if (isFinite(fn) && fn <= f + 1e-12 * Math.max(1, Math.abs(f))) {
          gp = gpn; sps = spn; maxStep = mx * scale;
          var df = f - fn; f = fn; accepted = true;
          lam = lam / 10; if (lam < 1e-12) lam = 0;
          if (maxStep < 1e-10 || (df < 1e-15 * Math.max(1, Math.abs(f)) && maxStep < 1e-7)) conv = true;
          break;
        }
        lam = lam ? lam * 10 : 1e-3;
      }
      if (!accepted) { conv = maxGradSmall(r, P, S); break; }
      if (conv) break;
    }
    for (var v = 0; v < (M.varIdx || [1]).length; v++) { var vi = (M.varIdx || [1])[v]; gp[vi] = Math.abs(gp[vi]); }
    return { gp: gp, sps: sps, f: f, conv: conv, iterations: it + 1 };
  }
  function maxGradSmall(r, P, S) {
    var mx = 0; r.G.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
    if (S) r.Gs.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
    return mx < 1e-6;
  }

  // ---------------------------------------------------------------------------------------------
  // Starting values.
  function startValues(model, sts) {
    var lor = sts.map(function (s) { return Math.log(((s.a + 0.5) * (s.d + 0.5)) / ((s.b + 0.5) * (s.c + 0.5))); });
    var th = lor.reduce(function (x, y) { return x + y; }, 0) / lor.length;
    var al = sts.map(function (s) { return Math.log((s.c + 0.5) / (s.d + 0.5)); });
    var mu = al.reduce(function (x, y) { return x + y; }, 0) / al.length;
    if (model === "UM.FS") return { gp: [0.5, th], sps: al };
    if (model === "UM.RS") return { gp: [0.5, 0.5, th, mu], sps: null };
    if (model === "CM.AL") return { gp: [0.5, th], sps: null };
    return { gp: [th, 0.5], sps: null };   // CM.EL: [beta, tau]
  }

  // SE of the log OR. lme4 models: Hessian regime or RX regime (see header). CM.EL: inverse Hessian of -loglik.
  function seLme4(model, sts, fit) {
    var M = MODELS[model], P = M.nGlobal, S = M.perStudy, gp = fit.gp, k = sts.length;
    var npar = P + S * k, singular = M.varIdx.some(function (i) { return gp[i] < SING_TOL; });
    if (npar < NPAR_MAX && !singular) {
      var r = derivsAll(model, sts, gp, fit.sps, P, S, 2e-4, true), sc = schur(r, P), V = invN(sc.A);
      if (!V) return { se: NaN, method: "hessian" };
      return { se: Math.sqrt(M.factor * V[M.thetaIdx][M.thetaIdx]), method: "hessian" };
    }
    // RX: X'WX - X'WZ Lambda (Lambda'Z'WZ Lambda + I)^{-1} Lambda'Z'WX at the conditional modes; fixed effects
    // are (theta, own intercept) for UM.FS, (theta, mu) for UM.RS, (beta) for CM.AL.
    var lam = M.lam(gp), red = 0, Mxx = [[0, 0], [0, 0]];
    for (var g = 0; g < k; g++) {
      var obs = M.obs(sts[g], gp, S ? fit.sps[g] : 0), W;
      if (lam.every(function (l) { return l === 0; }))
        W = obs.map(function (o) { var p = plogis(o.off); return o.n * p * (1 - p); });
      else W = condMode(obs, lam).W;
      var q = lam.length, C = lzwzl(obs, lam, W), Ci = q === 1 ? [[1 / C[0][0]]] : invN(C);
      // X rows per observation: UM.FS (trt, alpha_g); UM.RS (trt, mu); CM.AL (beta)
      var X = model === "CM.AL" ? [[1]] : [[1, 1], [0, 1]], p = X[0].length;
      var XtWX = [], XtWZL = [], i, j, r2, s2, o;
      for (i = 0; i < p; i++) { XtWX[i] = new Array(p).fill(0); XtWZL[i] = new Array(q).fill(0); }
      for (o = 0; o < obs.length; o++) for (i = 0; i < p; i++) {
        for (j = 0; j < p; j++) XtWX[i][j] += W[o] * X[o][i] * X[o][j];
        for (r2 = 0; r2 < q; r2++) XtWZL[i][r2] += W[o] * X[o][i] * obs[o].z[r2] * lam[r2];
      }
      var Mg = [];
      for (i = 0; i < p; i++) { Mg[i] = []; for (j = 0; j < p; j++) {
        var s = XtWX[i][j];
        for (r2 = 0; r2 < q; r2++) for (s2 = 0; s2 < q; s2++) s -= XtWZL[i][r2] * Ci[r2][s2] * XtWZL[j][s2];
        Mg[i][j] = s; } }
      if (model === "UM.FS") red += Mg[0][0] - Mg[0][1] * Mg[0][1] / Mg[1][1];      // eliminate own intercept
      else if (model === "UM.RS") { Mxx[0][0] += Mg[0][0]; Mxx[0][1] += Mg[0][1]; Mxx[1][0] += Mg[1][0]; Mxx[1][1] += Mg[1][1]; }
      else red += Mg[0][0];
    }
    if (model === "UM.RS") { var Vi = invN(Mxx); return { se: Vi ? Math.sqrt(Vi[0][0]) : NaN, method: "RX" }; }
    return { se: Math.sqrt(1 / red), method: "RX" };
  }

  function result(model, pr, theta, se, extra) {
    var out = {
      ok: isFinite(theta) && isFinite(se) && se > 0, model: model, theta: theta, se_theta: se,
      OR: Math.exp(theta), OR_lo: Math.exp(theta - Z975 * se), OR_hi: Math.exp(theta + Z975 * se),
      ci_lb: theta - Z975 * se, ci_ub: theta + Z975 * se,
      k: pr.k, k_dropped00: pr.k_dropped00, n_zero_cell_studies: pr.n_zero_cell_studies
    };
    for (var key in extra) out[key] = extra[key];
    if (!out.ok && !out.error) out.error = "The fit did not give a finite estimate and standard error; use R to diagnose this dataset.";
    return out;
  }
  function refuse(model, pr, msg) {
    return { ok: false, model: model, error: msg, k: pr.k, k_dropped00: pr.k_dropped00, n_zero_cell_studies: pr.n_zero_cell_studies };
  }
  function precheck(model, pr) {
    if (pr.k < 2) return refuse(model, pr, "Need at least 2 studies after removing studies with no events (or only events) in both arms; found " + pr.k + ".");
    if (pr.separated) return refuse(model, pr, "No finite estimate: every study is compatible with an odds ratio of " +
      (pr.separated === "negative" ? "0" : "infinity") + " (complete separation), so the maximum-likelihood log odds ratio does not exist.");
    return null;
  }

  function fitModel(model, rowsIn) {
    var pr = prepare(rowsIn), bad = precheck(model, pr);
    if (bad) return bad;
    var sts = pr.studies;
    if (model === "CM.EL") return fitCMELprepared(pr);
    var st = startValues(model, sts), fit = minimise(model, sts, st.gp, st.sps);
    // lme4-style boundary check: compare with the variance parameter(s) at zero.
    var M = MODELS[model];
    M.varIdx.forEach(function (vi) {
      if (fit.gp[vi] < 1e-5 && fit.gp[vi] !== 0) {
        var gp0 = fit.gp.slice(); gp0[vi] = 0;
        var f0 = totalObj(model, sts, gp0, fit.sps);
        if (f0 <= fit.f) { fit.gp = gp0; fit.f = f0; }
      }
    });
    if (!fit.conv) return refuse(model, pr, "The optimiser did not converge; use R (metafor::rma.glmm) to diagnose this dataset.");
    var se = seLme4(model, sts, fit), th = fit.gp[M.thetaIdx];
    var extra = { tau2: model === "UM.RS" ? fit.gp[1] * fit.gp[1] : fit.gp[0] * fit.gp[0], se_method: se.method,
                  boundary: M.varIdx.some(function (i) { return fit.gp[i] < SING_TOL; }), iterations: fit.iterations,
                  deviance: fit.f, params: fit.gp.concat(fit.sps || []) };
    if (model === "UM.RS") extra.sigma2 = fit.gp[0] * fit.gp[0];
    return result(model, pr, th, se.se, extra);
  }

  function fitCMELprepared(pr) {
    var sts = pr.studies.map(cmelPrep);
    // fixed-effect (tau = 0) conditional MLE by Newton with analytic derivatives
    var b = startValues("CM.EL", pr.studies).gp[0], it, i;
    for (it = 0; it < 200; it++) {
      var g1 = 0, g2 = 0;
      for (i = 0; i < sts.length; i++) { if (sts[i].lc.length === 1) continue; var f = fnch(sts[i], b); g1 += f.d1; g2 += f.d2; }
      if (!(g2 < 0)) break;
      var step = g1 / g2; if (Math.abs(step) > 5) step = 5 * Math.sign(step);
      b -= step;
      if (Math.abs(step) < 1e-14 * Math.max(1, Math.abs(b))) break;
    }
    var infoFE = 0; for (i = 0; i < sts.length; i++) if (sts[i].lc.length > 1) infoFE -= fnch(sts[i], b).d2;
    var fit = minimise("CM.EL", sts, [b, 0.5], null);
    var fitFE = { gp: [b, 0], f: totalObj("CM.EL", sts, [b, 0], null) };
    if (!fit.conv && !(fitFE.f <= fit.f)) return refuse("CM.EL", pr, "The optimiser did not converge; use R (metafor::rma.glmm) to diagnose this dataset.");
    if (fitFE.f <= fit.f) fit = { gp: [b, 0], f: fitFE.f, iterations: fit.iterations, conv: true };
    var tau2 = fit.gp[1] * fit.gp[1];
    if (tau2 < CMEL_T0)       // metafor: fixed-effect estimate and SE are reported
      return result("CM.EL", pr, b, Math.sqrt(1 / infoFE), { tau2: tau2, se_method: "hessian-FE", boundary: true,
        iterations: fit.iterations, deviance: fitFE.f, params: [b, null] });
    var r = derivsAll("CM.EL", sts, fit.gp, null, 2, 0, 2e-4, true), V = invN(r.A);
    return result("CM.EL", pr, fit.gp[0], V ? Math.sqrt(V[0][0]) : NaN, { tau2: tau2, se_method: "hessian", boundary: false,
      iterations: fit.iterations, deviance: fit.f, params: [fit.gp[0], Math.log(tau2)] });
  }

  // Objective at given parameters, in R's parameterisation (for validation):
  //   UM.FS [tau_sd, logOR, study intercepts...]; UM.RS [sigma_sd, tau_sd, logOR, intercept]; CM.AL [tau_sd, beta]
  //   (lme4 deviance); CM.EL [beta, log(tau2) or null for tau2 = 0] (metafor -loglik).
  function objective(model, rowsIn, params) {
    var pr = prepare(rowsIn), sts = pr.studies;
    if (model === "CM.EL") {
      var cs = sts.map(cmelPrep), tau = params[1] === null || params[1] === undefined ? 0 : Math.exp(params[1] / 2);
      return totalObj("CM.EL", cs, [params[0], tau], null);
    }
    var M = MODELS[model], gp = params.slice(0, M.nGlobal), sps = M.perStudy ? params.slice(M.nGlobal) : null;
    var d = totalObj(model, sts, gp, sps);
    // lme4's Laplace objective (nAGQ = 1) is -2 log-likelihood (family aic), i.e. the deviance-residual form plus
    // -2 sum log dbinom(y; n, y/n); the adaptive-quadrature objective is in deviance-residual form.
    if (M.nAGQ === 1) sts.forEach(function (s) { d += satConst(s.a, s.n1) + satConst(s.c, s.n2); });
    return d;
  }
  function satConst(y, n) {        // -2 log dbinom(y; n, y/n)
    var m = Math.min(y, n - y), lc = 0;
    for (var i = 0; i < m; i++) lc += Math.log((n - i) / (i + 1));
    return -2 * (lc + (y > 0 ? y * Math.log(y / n) : 0) + (n - y > 0 ? (n - y) * Math.log((n - y) / n) : 0));
  }

  var api = {
    fitUMFS: function (rows) { return fitModel("UM.FS", rows); },
    fitUMRS: function (rows) { return fitModel("UM.RS", rows); },
    fitCMAL: function (rows) { return fitModel("CM.AL", rows); },
    fitCMEL: function (rows) { return fitModel("CM.EL", rows); },
    fitModel: fitModel,
    objective: objective,
    prepare: prepare,
    // Earlier names kept for callers: all now return the metafor-equivalent fits.
    fitUnconditional: function (rows) { return fitModel("UM.FS", rows); },
    fitConditionalExact: function (rows) { return fitModel("CM.EL", rows); },
    fit: function (rows) { return fitModel("CM.AL", rows); },
    _devRes: devRes,
    _gaussHermite: gaussHermite
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRareEventsGLMM = api;
})(typeof window !== "undefined" ? window : globalThis);
