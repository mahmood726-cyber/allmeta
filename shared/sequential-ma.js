/* shared/sequential-ma.js — sequential meta-analysis with α-spending (Lan-DeMets) and β-spending futility.
 *
 * Trial sequential analysis: the cumulative Z-statistic at each look is compared with group-sequential monitoring
 * boundaries obtained by spending α over the information fraction t (Lan & DeMets 1983). Spending families:
 *
 *   - O'BRIEN-FLEMING-type: a(t) = 2 − 2·Φ(z_{1−α/2}/√t)
 *   - POCOCK-type:           a(t) = α · ln(1 + (e − 1)·t)
 *   - LINEAR (reference):    a(t) = α·t
 *
 * Spending convention for two-sided tests (opts.spendingConvention):
 *   - "total" (default; Lan & DeMets 1983): a(t) is the TOTAL α spent over both sides, a(t)/2 per side.
 *   - "per-side" (RTSA, ldbounds, gsDesign): the spending function of α/2 is applied to EACH side,
 *     e.g. per side 2 − 2·Φ(z_{1−α/4}/√t) for O'Brien-Fleming. The two agree for Pocock, linear and one-sided tests.
 *
 * Boundaries are EXACT group-sequential boundaries: at look k the critical value c_k solves
 *   P_H0( |Z_j| < c_j for j < k, Z_k ≥ c_k ) = (incremental per-side α at look k)
 * by recursive numerical integration of the joint normal density of (Z_1..Z_k) (Armitage, McPherson & Rowe 1969;
 * Jennison & Turnbull 2000, ch. 19 grid) with correlation √(t_i/t_j). Information fractions > 1 are allowed: α is
 * spent on min(t, 1) and the correlation uses the actual information (looks after α is exhausted get no α).
 *
 * Futility (opts.futility) is NON-BINDING: efficacy boundaries do not depend on it, so ignoring a futility signal keeps
 * the type-I error at α. It follows the RTSA (R package, version 0.2.2) non-binding design: β is spent with the
 * chosen family on t, under the design drift θ = z_{1−α/s} + z_{1−β}, on an information scale inflated by the factor R
 * that makes the final futility and efficacy boundaries meet; R is returned as infoInflation. Two-sided tests: the
 * futility region is the inner wedge |z| < l_k, and looks whose futility boundary would be negative spend no β (RTSA
 * convention) and return null. One-sided tests: stop for futility when z < l_k.
 *
 * References: Lan KKG, DeMets DL. Biometrika 1983;70:659-663. O'Brien PC, Fleming TR. Biometrics 1979;35:549-556.
 * Jennison C, Turnbull BW. Group Sequential Methods with Applications to Clinical Trials. 2000, ch. 19.
 * Wetterslev J, Thorlund K, Brok J, Gluud C. J Clin Epidemiol 2008;61:64-75. Pampallona S, Tsiatis AA 1994.
 * West G. Better approximations to cumulative normal functions. Wilmott Magazine 2005 (Hart 1968 algorithm).
 */
(function (global) {
  "use strict";

  // ---- Standard normal quantile: Wichura AS241 (the algorithm of R's qnorm) ----
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      // AS241 central region: r = 0.180625 − q² (0.180625 = 0.425²). The prior
      // r = q² returned wrong central quantiles (e.g. qnorm(0.90)=1.025 vs
      // 1.281552), which corrupted the β-spend boundary for β in the central
      // range (β=0.20 → qnorm(0.90)). Tails (incl. 0.975→1.96) were unaffected.
      var r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
        / (((((((5226.495278852854561 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    var rr = q < 0 ? p : 1 - p;
    var u = Math.sqrt(-Math.log(rr));
    var z;
    if (u <= 5) {
      u -= 1.6;
      z = (((((((0.00077454501427834140764 * u + 0.0227238449892691845833) * u + 0.24178072517745061177) * u + 1.27045825245236838258) * u + 3.64784832476320460504) * u + 5.7694972214606914055) * u + 4.6303378461565452959) * u + 1.42343711074968357734)
        / (((((((1.05075007164441684324e-9 * u + 0.0005475938084995344946) * u + 0.0151986665636164571966) * u + 0.14810397642748007459) * u + 0.68976733498510000455) * u + 1.6763848301838038494) * u + 2.05319162663775882187) * u + 1);
    } else {
      u -= 5;
      z = (((((((2.01033439929228813265e-7 * u + 0.0000271155556874348757815) * u + 0.0012426609473880784386) * u + 0.026532189526576123093) * u + 0.29656057182850489123) * u + 1.7848265399172913358) * u + 5.4637849111641143699) * u + 6.6579046435011037772)
        / (((((((2.04426310338993978564e-15 * u + 1.4215117583164458887e-7) * u + 1.8463183175100546818e-5) * u + 0.0007868691311456132591) * u + 0.0148753612908506148525) * u + 0.13692988092273580531) * u + 0.59983220655588793769) * u + 1);
    }
    return q < 0 ? -z : z;
  }

  // ---- Standard normal CDF: Hart (1968) / West (2005), double precision ----
  // _tail(x) = Φ(−x) for x ≥ 0, computed directly (no cancellation): Hart rational form below 3, continued fraction above.
  function _tail(xa) {
    if (xa > 37) return 0;
    var e = Math.exp(-xa * xa / 2), b, c;
    if (xa < 3) {
      b = 3.52624965998911e-02 * xa + 0.700383064443688; b = b * xa + 6.37396220353165; b = b * xa + 33.912866078383;
      b = b * xa + 112.079291497871; b = b * xa + 221.213596169931; b = b * xa + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-02 * xa + 1.75566716318264; b = b * xa + 16.064177579207; b = b * xa + 86.7807322029461;
      b = b * xa + 296.564248779674; b = b * xa + 637.333633378831; b = b * xa + 793.826512519948; b = b * xa + 440.413735824752;
      return c / b;
    }
    b = xa;                                   // Laplace continued fraction, 80 terms: relative error < 1e-14 for x >= 3
    for (var k = 80; k >= 1; k--) b = xa + k / b;
    return e / b / 2.5066282746310002;
  }
  function pnorm(x) { return x >= 0 ? 1 - _tail(x) : _tail(-x); }
  function pnormUpper(x) { return x >= 0 ? _tail(x) : 1 - _tail(-x); }
  function dnorm(x) { return 0.3989422804014327 * Math.exp(-x * x / 2); }

  // ---- α-spending functions ---------------------------------------------
  function _fam(family) {
    family = String(family || "OBF").toUpperCase();
    if (family === "O'BRIEN-FLEMING") family = "OBF";
    if (family !== "OBF" && family !== "POCOCK" && family !== "LINEAR") throw new Error("Unknown spending family: " + family);
    return family;
  }
  // f(family, a, t): spending function of level a at fraction t (t clamped to [0, 1]).
  function _f(family, a, t) {
    if (t <= 0) return 0;
    if (t >= 1) return a;
    family = _fam(family);
    if (family === "OBF") return 2 * pnormUpper(qnorm(1 - a / 2) / Math.sqrt(t));
    if (family === "POCOCK") return a * Math.log(1 + (Math.E - 1) * t);
    return a * t;
  }
  // Documented total spending a(t) (Lan-DeMets 1983 form; total over both sides of a two-sided test).
  function _spend(family, alpha, t) { return _f(family, alpha, t); }
  // Per-side cumulative spending under the chosen convention.
  function _spendPerSide(family, alpha, t, sided, convention) {
    if (sided === 1) return _f(family, alpha, t);
    return convention === "per-side" ? _f(family, alpha / 2, t) : _f(family, alpha, t) / 2;
  }

  // ---- Recursive numerical integration (Jennison & Turnbull 2000, ch. 19) ----
  // Grid in the z-scale of Z_k ~ N(theta * sqrt(I_k), 1); I_k is the information (only ratios matter under H0).
  // R_MESH is the J&T mesh parameter r (they recommend r >= 16); 64 is used here.
  // When looks are close, the transition density between look k and its neighbours has SD
  // sqrt(|I_neighbour - I_k| / I_k) in the z-scale of Z_k: both the kernel to the next look and the edge of the
  // density carried from the previous look are that narrow. The mesh at look k is refined to
  // r >= 4 * sqrt(I_k / gap) for the smaller neighbouring gap (mid-grid spacing about 0.75 / r), capped at R_MESH_MAX.
  // Ordinary designs (neighbouring looks more than I_k / 256 apart) keep r = 64.
  var R_MESH = 64, R_MESH_MAX = 2048;
  function _mesh(Iprev, Ik, Inext) {
    var gap = Infinity;
    if (Inext > Ik) gap = Inext - Ik;
    if (Iprev != null && Ik > Iprev) gap = Math.min(gap, Ik - Iprev);
    if (!isFinite(gap)) return R_MESH;
    return Math.min(R_MESH_MAX, Math.max(R_MESH, Math.ceil(4 * Math.sqrt(Ik / gap))));
  }
  function _grid(mu, lo, hi, rIn) {
    var r = rIn || R_MESH, pts = [], j, n = 6 * r - 1, x;
    if (!(hi > lo)) return { z: [], w: [] };
    if (isFinite(lo)) pts.push(lo);
    for (j = 1; j <= n; j++) {
      if (j < r) x = mu - 3 - 4 * Math.log(r / j);
      else if (j <= 5 * r) x = mu - 3 + 3 * (j - r) / (2 * r);
      else x = mu + 3 + 4 * Math.log(r / (6 * r - j));
      if (x > lo && x < hi) pts.push(x);
    }
    if (isFinite(hi)) pts.push(hi);
    if (pts.length < 2) return { z: [], w: [] };
    var m = 2 * pts.length - 1, z = new Array(m), w = new Array(m), k;
    for (k = 0; k < pts.length; k++) z[2 * k] = pts[k];
    for (k = 0; k < pts.length - 1; k++) z[2 * k + 1] = (pts[k] + pts[k + 1]) / 2;
    for (k = 0; k < m; k++) w[k] = 0;
    for (k = 0; k + 2 < m; k += 2) {          // composite Simpson on each [z_k, z_{k+2}]
      var hh = (z[k + 2] - z[k]) / 6;
      w[k] += hh; w[k + 1] += 4 * hh; w[k + 2] += hh;
    }
    return { z: z, w: w };
  }
  function _start(I1, theta, lo, hi, r) {     // density of Z_1 on the continuation region (lo, hi)
    var mu = theta * Math.sqrt(I1), g = _grid(mu, lo, hi, r);
    return { z: g.z, w: g.w, h: g.z.map(function (x) { return dnorm(x - mu); }), I: I1 };
  }
  function _mass(s) { var p = 0; for (var j = 0; j < s.z.length; j++) p += s.w[j] * s.h[j]; return p; }
  // P(continue up to the previous look, then Z_k > c) (upper) or (... Z_k < c) (lower), Z_k at information Ik.
  function _cross(s, Ik, c, theta, upper) {
    if (c === Infinity) return upper ? 0 : _mass(s);
    if (c === -Infinity) return upper ? _mass(s) : 0;
    var d = Ik - s.I, sd = Math.sqrt(d), sq = Math.sqrt(Ik), sp = Math.sqrt(s.I), p = 0, j, x;
    for (j = 0; j < s.z.length; j++) {
      x = (c * sq - s.z[j] * sp - theta * d) / sd;
      p += s.w[j] * s.h[j] * (upper ? pnormUpper(x) : pnorm(x));
    }
    return p;
  }
  function _advance(s, Ik, theta, lo, hi, r) { // density of Z_k on (lo, hi) for paths that continued so far
    var d = Ik - s.I, sd = Math.sqrt(d), sq = Math.sqrt(Ik), sp = Math.sqrt(s.I);
    var g = _grid(theta * Math.sqrt(Ik), lo, hi, r), h = new Array(g.z.length);
    for (var i = 0; i < g.z.length; i++) {
      var acc = 0, xs = g.z[i] * sq - theta * d;
      for (var j = 0; j < s.z.length; j++) acc += s.w[j] * s.h[j] * dnorm((xs - s.z[j] * sp) / sd);
      h[i] = acc * sq / sd;
    }
    return { z: g.z, w: g.w, h: h, I: Ik };
  }
  // Root of a monotone fn on [lo, hi] by bisection to 1e-12.
  function _solve(fn, lo, hi) {
    var flo = fn(lo), fhi = fn(hi);
    if (flo === 0) return lo;
    if (fhi === 0) return hi;
    if ((flo > 0) === (fhi > 0)) return NaN;
    for (var it = 0; it < 200 && hi - lo > 1e-12; it++) {
      var mid = (lo + hi) / 2, fm = fn(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  // Exact efficacy boundaries. info: information fractions (may exceed 1); incr: per-side α increments.
  function _efficacy(info, incr, sided) {
    var K = info.length, b = new Array(K), s = null;
    for (var k = 0; k < K; k++) {
      var inc = incr[k];
      if (k === 0) b[0] = inc > 0 ? -qnorm(inc) : Infinity;
      else if (!(inc > 0)) b[k] = Infinity;
      else b[k] = _solve(function (c) { return _cross(s, info[k], c, 0, true) - inc; }, -10, 40);
      if (k < K - 1) {
        var lo = sided === 2 ? -b[k] : -Infinity;
        var rk = _mesh(k > 0 ? info[k - 1] : null, info[k], info[k + 1]);
        s = k === 0 ? _start(info[0], 0, lo, b[0], rk) : _advance(s, info[k], 0, lo, b[k], rk);
      }
    }
    return b;
  }

  // RTSA-compatible β-spending boundaries (in the direction of the effect) for inflation R; the first rm looks spend
  // no β. eff: upper efficacy boundaries. Returns za (−Infinity = no futility stop at that look).
  function _betaBounds(t, eff, beta, bfam, theta, R, rm) {
    var K = t.length, cum = t.map(function (x, i) { return i < rm ? 0 : _f(bfam, beta, Math.min(x, 1)); });
    var za = new Array(K), s = null;
    for (var k = 0; k < K; k++) {
      var inc = k === 0 ? cum[0] : cum[k] - cum[k - 1], Ik = t[k] * R;
      if (!(inc > 0)) za[k] = -Infinity;
      else if (k === 0) za[0] = theta * Math.sqrt(Ik) + qnorm(inc);
      else za[k] = _solve(function (c) { return _cross(s, Ik, c, theta, false) - inc; }, -40, 40);
      if (k < K - 1) { var rk = _mesh(k > 0 ? t[k - 1] * R : null, Ik, t[k + 1] * R); s = k === 0 ? _start(Ik, theta, za[0], eff[0], rk) : _advance(s, Ik, theta, za[k], eff[k], rk); }
    }
    return za;
  }
  function _warpRoot(t, eff, beta, bfam, theta, rm) {
    var K = t.length, g = function (R) { return eff[K - 1] - _betaBounds(t, eff, beta, bfam, theta, R, rm)[K - 1]; };
    var a = 0.9, ga = g(a);
    for (var b = 0.92; b <= 10; b += 0.02) {           // first sign change at or above 0.9, then bisection
      var gb = g(b);
      if ((ga > 0) !== (gb > 0)) return _solve(g, a, b);
      a = b; ga = gb;
    }
    return NaN;
  }
  function _futility(t, eff, beta, bfam, theta, sided) {
    var R = _warpRoot(t, eff, beta, bfam, theta, 0), rm = 0;
    var za = _betaBounds(t, eff, beta, bfam, theta, R, 0);
    if (sided === 2) {
      rm = za.filter(function (x) { return x < 0; }).length;
      if (rm > 0) { R = _warpRoot(t, eff, beta, bfam, theta, rm); za = _betaBounds(t, eff, beta, bfam, theta, R, rm); }
    }
    return { R: R, za: za, rm: rm };
  }

  // ---- Compute boundary at each look ------------------------------------
  // looks: array of { t, z } (t = information fraction > 0, may exceed 1; z = cumulative Z-statistic).
  // opts: { alpha, beta, family, sided (1|2), futility (bool), futilityFamily, spendingConvention, drift }.
  // Returns per-look { t, z, spend_alpha (incremental, total over both sides), alpha_boundary, futility_boundary,
  // decision: "continue" | "reject-H0" | "futility" | "after-stop" }.
  function computeBoundary(looks, opts) {
    opts = opts || {};
    var alpha = isFinite(opts.alpha) ? opts.alpha : 0.05;
    var beta = isFinite(opts.beta) ? opts.beta : 0.20;
    var family = _fam(opts.family || "OBF");
    var sided = opts.sided === 1 ? 1 : 2;
    var convention = opts.spendingConvention === "per-side" ? "per-side" : "total";
    var includeFutility = !!opts.futility;
    var futilityFamily = _fam(opts.futilityFamily || family);
    var drift = isFinite(opts.drift) ? opts.drift : qnorm(1 - alpha / sided) + qnorm(1 - beta);
    if (!Array.isArray(looks) || !looks.length) throw new Error("looks must be a non-empty array");
    var sorted = looks.slice().sort(function (a, b) { return a.t - b.t; });
    var t = sorted.map(function (l) { return l.t; });
    if (t.some(function (x) { return !(x > 0); })) throw new Error("information fractions must be > 0");
    if (t.some(function (x, i) { return i > 0 && !(x > t[i - 1]); })) throw new Error("information fractions must be strictly increasing (two looks share the same information)");
    var cumSide = t.map(function (x) { return _spendPerSide(family, alpha, x, sided, convention); });
    var incSide = cumSide.map(function (c, i) { return Math.max(0, i ? c - cumSide[i - 1] : c); });
    var eff = _efficacy(t, incSide, sided);
    var fut = null;
    if (includeFutility) {
      // The futility design needs the planned final analysis: if the looks stop before t = 1, a final look at t = 1 is
      // appended for the design computation only (as RTSA does for designs); efficacy boundaries at the given looks
      // do not depend on later looks.
      if (t[t.length - 1] < 1) {
        var tx = t.concat([1]), cx = tx.map(function (x) { return _spendPerSide(family, alpha, x, sided, convention); });
        var effx = _efficacy(tx, cx.map(function (c, i) { return Math.max(0, i ? c - cx[i - 1] : c); }), sided);
        fut = _futility(tx, effx, beta, futilityFamily, drift, sided);
      } else fut = _futility(t, eff, beta, futilityFamily, drift, sided);
    }
    var decisionTaken = null, out = [];
    for (var k = 0; k < sorted.length; k++) {
      var z = sorted[k].z, b = eff[k], l = null;
      if (fut && isFinite(fut.za[k]) && !(sided === 2 && fut.za[k] <= 0)) l = fut.za[k];
      var decision = "continue";
      if (!decisionTaken) {
        var rej = sided === 2 ? Math.abs(z) >= b : z >= b;
        var fu = l !== null && (sided === 2 ? Math.abs(z) < l : z < l);
        if (rej) decision = "reject-H0"; else if (fu) decision = "futility";
        if (decision !== "continue") decisionTaken = decision;
      } else decision = "after-stop";
      out.push({ t: t[k], z: z, spend_alpha: incSide[k] * sided, alpha_boundary: b, futility_boundary: l, decision: decision });
    }
    return { alpha: alpha, beta: beta, family: family, sided: sided, spendingConvention: convention,
      drift: includeFutility ? drift : null, infoInflation: fut ? fut.R : null, looks: out, decision: decisionTaken || "continue" };
  }

  // ---- Convenience: build looks from a list of cumulative pooled effects -
  //
  // rows: [{ y_cum, se_cum, n_cum }, ...] in chronological order. Returns
  // looks suitable for computeBoundary; information fraction t_k = n_cum_k
  // / n_final (or sum of weights, see opts.fractionMode).

  function looksFromRows(rows, opts) {
    opts = opts || {};
    if (!Array.isArray(rows) || !rows.length) return [];
    var fractionMode = opts.fractionMode || "n_cum";
    var totals = rows.map(function (r) {
      if (fractionMode === "weight_cum") return r.weight_cum || 1 / (r.se_cum * r.se_cum);
      return r.n_cum;
    });
    var max = Math.max.apply(null, totals);
    return rows.map(function (r, i) {
      return { t: totals[i] / max, z: r.y_cum / r.se_cum };
    });
  }

  var api = {
    computeBoundary: computeBoundary,
    looksFromRows: looksFromRows,
    _spend: _spend, _spendPerSide: _spendPerSide,
    _qnorm: qnorm, _pnorm: pnorm, _pnormUpper: pnormUpper,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmSequentialMA = api;
})(typeof window !== "undefined" ? window : globalThis);
