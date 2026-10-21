/*
 * shared/gsdesign.js — Group-sequential trial design and adaptive-trial simulation.
 *
 * Ported from the author's AdaptSim engine into the allmeta shared-module idiom,
 * then rebuilt so that it reproduces the R reference implementations:
 *
 * 1. Boundaries (gsDesign). The joint distribution of the sequential Z-statistics
 *    (independent increments, Cov(Z_i,Z_j)=sqrt(I_i/I_j)) is integrated by the
 *    Jennison & Turnbull (2000, ch. 19) recursion on their grid (r = 18 by default,
 *    Simpson weights), boundaries are solved with the same Newton iteration as
 *    gsDesign's C code, and information is sized with Brent's zeroin as in R's
 *    uniroot. Design types follow gsDesign's test.type: 1 one-sided, 2 two-sided
 *    symmetric, 3 asymmetric with binding beta-spending futility, 4 the same with
 *    non-binding futility. Spending: Lan-DeMets O'Brien-Fleming (sfLDOF),
 *    Lan-DeMets Pocock (sfLDPocock), power (sfPower, rho), Hwang-Shih-DeCani
 *    (sfHSD, gamma).
 *
 * 2. Simulation (rpact). Two-group comparison of means with known variance
 *    (rpact getSimulationMeans, normalApproximation = TRUE): group-sequential or
 *    inverse-normal combination test, optional non-binding futility bounds and
 *    sample-size re-estimation to a target conditional power (rpact's rule).
 *    The same stage logic is used for Monte Carlo simulation (seeded
 *    xoshiro128**) and for replaying externally simulated stage statistics.
 *
 * Validated against gsDesign 3.11.0 and rpact 4.4.0 (see the gsdesign-reproducible
 * archive and tests/test_gsdesign.py).
 */
(function (global) {
  "use strict";

  // --- standard normal: erfc via NR erfccheb (relative error ~1e-16) ---
  var _COF = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6,
    1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9,
    -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
    8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15,
    -9.4e-17, 1.21e-16, -2.8e-17];
  function _erfccheb(z) {
    var d = 0, dd = 0, t = 2 / (2 + z), ty = 4 * t - 2, tmp;
    for (var j = _COF.length - 1; j > 0; j--) { tmp = d; d = ty * d - dd + _COF[j]; dd = tmp; }
    return t * Math.exp(-z * z + 0.5 * (_COF[0] + ty * d) - dd);
  }
  // lower and upper tail, each accurate in relative terms in its own tail
  function pnormLower(x) {
    if (x !== x) return NaN;
    if (x === Infinity) return 1;
    if (x === -Infinity) return 0;
    return x < 0 ? 0.5 * _erfccheb(-x / Math.SQRT2) : 1 - 0.5 * _erfccheb(x / Math.SQRT2);
  }
  function pnormUpper(x) { return pnormLower(-x); }
  var INV_SQRT_2PI = 0.3989422804014327;
  function normalPDF(z) { return Math.exp(-0.5 * z * z) * INV_SQRT_2PI; }

  // Quantile: Wichura AS 241 (PPND16, as in R's qnorm) + one Halley step on the
  // tail-accurate CDF.
  function qnormLower(p) {
    if (p !== p || p < 0 || p > 1) return NaN;
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    var q = p - 0.5, r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      val = q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
        45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
        133.14166789178437745) * r + 3.387132872796366608) /
        (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
    } else {
      r = q < 0 ? p : 1 - p;
      r = Math.sqrt(-Math.log(r));
      if (r <= 5) {
        r -= 1.6;
        val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
          1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
          4.6303378461565452959) * r + 1.42343711074968357734) /
          (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
          0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
          2.05319162663775882187) * r + 1);
      } else {
        r -= 5;
        val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
          0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
          5.4637849111641143699) * r + 6.6579046435011037772) /
          (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
          7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
          0.59983220655588793769) * r + 1);
      }
      if (q < 0) val = -val;
    }
    var pdf = normalPDF(val);
    if (pdf > 0) {
      var e = val < 0 ? pnormLower(val) - p : (1 - p) - pnormUpper(val);
      var u = e / pdf;
      val = val - u / (1 + val * u / 2);
    }
    return val;
  }
  function qnormUpper(p) { return -qnormLower(p); }

  // --- spending functions (gsDesign sfLDOF, sfLDPocock, sfPower, sfHSD) ---
  function sfLDOF(alpha, t, rho) {
    if (rho == null || !(rho >= 0.005 && rho <= 20)) rho = 1;
    if (t > 1) t = 1;
    if (!(t > 0)) return 0;
    return 2 * pnormUpper(-qnormLower(alpha / 2) / Math.pow(t, rho / 2));
  }
  function sfLDPocock(alpha, t) {
    if (t > 1) t = 1;
    if (!(t > 0)) return 0;
    return alpha * Math.log(1 + (Math.E - 1) * t);
  }
  function sfPower(alpha, t, rho) {
    if (t > 1) t = 1;
    if (!(t > 0)) return 0;
    return alpha * Math.pow(t, rho);
  }
  function sfHSD(alpha, t, gamma) {
    if (t > 1) t = 1;
    if (!(t > 0)) return 0;
    if (gamma === 0) return t * alpha;
    return alpha * (1 - Math.exp(-t * gamma)) / (1 - Math.exp(-gamma));
  }
  var SF = { LDOF: sfLDOF, LDPocock: sfLDPocock, Power: sfPower, HSD: sfHSD };
  // page / legacy names -> gsDesign family
  var FAMILY_ALIAS = { obf: "LDOF", pocock: "LDPocock", landemets: "Power", power: "Power", hsd: "HSD",
    LDOF: "LDOF", LDPocock: "LDPocock", Power: "Power", HSD: "HSD" };
  function spendVector(sf, total, timing) {
    var fam = FAMILY_ALIAS[sf.family];
    if (!fam) throw new Error("unknown spending family: " + sf.family);
    return timing.map(function (t) { return SF[fam](total, t, sf.param); });
  }
  function diffs(cum) { return cum.map(function (v, i) { return i === 0 ? v : v - cum[i - 1]; }); }

  // --- Jennison & Turnbull grid (gsDesign gridpts.c) ---
  function gridpts(r, mu, a, b) {
    var z = [], w = [], j = 0, done = false, i, ztem, r2 = 2 * r, r5 = 5 * r, r6 = 6 * r;
    w[0] = 0;
    ztem = mu - 3 - 4 * Math.log(r);
    if (ztem <= a) z[0] = a;
    else if (ztem >= b) { z[0] = b; done = true; }
    else z[0] = ztem;
    for (i = 2; i < r6 && !done; i++) {
      if (i < r) ztem = mu - 3 - 4 * Math.log(r / i);
      else if (i <= r5) ztem = mu + 3 * (-1 + (i - r) / r2);
      else ztem = mu + 3 + 4 * Math.log(r / (r6 - i));
      if (ztem > a) {
        j += 2;
        z[j] = ztem;
        if (ztem >= b) { z[j] = b; done = true; }
        z[j - 1] = (z[j] + z[j - 2]) / 2;
      }
    }
    if (j > 0) {
      w[0] = (z[2] - z[0]) / 6;
      w[j] = (z[j] - z[j - 2]) / 6;
      w[j - 1] = 2 * (z[j] - z[j - 2]) / 3;
    }
    for (i = 1; i < j - 1; i += 2) {
      w[i] = 2 * (z[i + 1] - z[i - 1]) / 3;
      w[i + 1] = (z[i + 3] - z[i - 1]) / 6;
    }
    return { z: z, w: w, m: j };
  }
  // weighted density at the first analysis (h1.c)
  function h1(theta, g, I) {
    var mu = theta * Math.sqrt(I), h = new Array(g.m + 1), x;
    for (var i = 0; i <= g.m; i++) { x = g.z[i] - mu; h[i] = g.w[i] * Math.exp(-x * x / 2) * INV_SQRT_2PI; }
    return h;
  }
  // propagate weighted density to the next analysis (hupdate.c)
  function hupdate(theta, g2, g1, h, Ikm1, Ik) {
    var deltak = Ik - Ikm1, rtdeltak = Math.sqrt(deltak), rtIk = Math.sqrt(Ik), rtIkm1 = Math.sqrt(Ikm1);
    var scale = INV_SQRT_2PI * rtIk / rtdeltak, c = new Array(g1.m + 1), h2 = new Array(g2.m + 1), ii, i, u, x, s;
    for (ii = 0; ii <= g1.m; ii++) c[ii] = (g1.z[ii] * rtIkm1 + theta * deltak) / rtdeltak;
    for (i = 0; i <= g2.m; i++) {
      u = g2.z[i] * rtIk / rtdeltak;
      s = 0;
      for (ii = 0; ii <= g1.m; ii++) { x = u - c[ii]; s += h[ii] * Math.exp(-0.5 * x * x); }
      h2[i] = g2.w[i] * scale * s;
    }
    return h2;
  }
  function probpos(theta, g, h, bk, Ikm1, Ik) {
    var mu = theta * (Ik - Ikm1), rtdeltak = Math.sqrt(Ik - Ikm1), rtIk = Math.sqrt(Ik), rtIkm1 = Math.sqrt(Ikm1), p = 0;
    for (var i = 0; i <= g.m; i++) p += pnormLower((g.z[i] * rtIkm1 + mu - bk * rtIk) / rtdeltak) * h[i];
    return p;
  }
  function probneg(theta, g, h, ak, Ikm1, Ik) {
    var mu = theta * (Ik - Ikm1), rtdeltak = Math.sqrt(Ik - Ikm1), rtIk = Math.sqrt(Ik), rtIkm1 = Math.sqrt(Ikm1), p = 0;
    for (var i = 0; i <= g.m; i++) p += pnormUpper((g.z[i] * rtIkm1 + mu - ak * rtIk) / rtdeltak) * h[i];
    return p;
  }

  // Boundary crossing probabilities for each theta (rprobrej.c + R gsprob).
  function gsprob(theta, I, a, b, r) {
    r = r || 18;
    var thetas = Array.isArray(theta) ? theta : [theta], K = I.length;
    var problo = [], probhi = [], powr = [], futile = [], en = [];
    for (var t = 0; t < thetas.length; t++) {
      var th = thetas[t], plo = new Array(K), phi = new Array(K), mu = th * Math.sqrt(I[0]);
      plo[0] = pnormUpper(mu - a[0]);
      phi[0] = pnormUpper(b[0] - mu);
      if (K > 1) {
        var g = gridpts(r, mu, a[0], b[0]), h = h1(th, g, I[0]);
        for (var i = 1; i < K; i++) {
          phi[i] = probpos(th, g, h, b[i], I[i - 1], I[i]);
          plo[i] = probneg(th, g, h, a[i], I[i - 1], I[i]);
          if (i < K - 1) {
            var g2 = gridpts(r, th * Math.sqrt(I[i]), a[i], b[i]);
            h = hupdate(th, g2, g, h, I[i - 1], I[i]);
            g = g2;
          }
        }
      }
      var sp = 0, sf = 0, e = 0;
      for (var k = 0; k < K; k++) { sp += phi[k]; sf += plo[k]; }
      for (k = 0; k < K; k++) e += I[k] * (plo[k] + phi[k]);
      e += I[K - 1] * (1 - sp - sf);
      problo.push(plo); probhi.push(phi); powr.push(sp); futile.push(sf); en.push(e);
    }
    // problo[t][k], probhi[t][k] (theta-major)
    return { problo: problo, probhi: probhi, powr: powr, futile: futile, en: en };
  }

  // gsDesign 3.11.0 uses +-20 (EXTREMEZ) for absent bounds and as the Newton clamp
  var GS_MAXITER = 20, GS_ZCLAMP = 20, EXTREMEZ = 20;

  // Lower and upper bounds under theta = 0 (gsbound.c).
  function gsBound(I, trueneg, falsepos, tol, r) {
    tol = tol == null ? 1e-6 : tol; r = r || 18;
    var K = I.length, a = new Array(K), b = new Array(K), error = 0;
    a[0] = trueneg[0] <= 0 ? -EXTREMEZ : qnormLower(trueneg[0]);
    b[0] = falsepos[0] <= 0 ? EXTREMEZ : qnormUpper(falsepos[0]);
    if (K === 1) return { I: I, a: a, b: b, error: 0 };
    var g = gridpts(r, 0, a[0], b[0]), h = h1(0, g, I[0]), rtIk = Math.sqrt(I[0]);
    for (var i = 1; i < K; i++) {
      var rtIkm1 = rtIk; rtIk = Math.sqrt(I[i]);
      var rtdeltak = Math.sqrt(I[i] - I[i - 1]), scale = INV_SQRT_2PI * rtIk / rtdeltak;
      var loA = trueneg[i] > 0, hiA = falsepos[i] > 0;
      var atem2 = loA ? qnormLower(trueneg[i]) : -EXTREMEZ, btem2 = hiA ? qnormUpper(falsepos[i]) : EXTREMEZ;
      var atem = atem2, btem = btem2, adelta = loA ? 1 : 0, bdelta = hiA ? 1 : 0, j = 0, ii, x;
      while ((adelta > tol || bdelta > tol) && j++ < GS_MAXITER) {
        var plo = 0, phi = 0, dplo = 0, dphi = 0;
        atem = atem2; btem = btem2;
        if (loA) {
          for (ii = 0; ii <= g.m; ii++) {
            x = (g.z[ii] * rtIkm1 - atem * rtIk) / rtdeltak;
            plo += h[ii] * pnormUpper(x);
            dplo += h[ii] * Math.exp(-x * x / 2);
          }
          dplo *= scale;
        }
        if (hiA) {
          for (ii = 0; ii <= g.m; ii++) {
            x = (g.z[ii] * rtIkm1 - btem * rtIk) / rtdeltak;
            phi += h[ii] * pnormLower(x);
            dphi -= h[ii] * Math.exp(-x * x / 2);
          }
          dphi *= scale;
        }
        if (loA) {
          adelta = trueneg[i] - plo;
          if (adelta > dplo) atem2 = atem + 1;
          else if (adelta < -dplo) atem2 = atem - 1;
          else if (adelta === 0) atem2 = atem;
          else atem2 = atem + adelta / dplo;
          if (atem2 > GS_ZCLAMP) atem2 = GS_ZCLAMP; else if (atem2 < -GS_ZCLAMP) atem2 = -GS_ZCLAMP;
        }
        if (hiA) {
          bdelta = falsepos[i] - phi;
          if (bdelta < dphi) btem2 = btem + 1;
          else if (bdelta > -dphi) btem2 = btem - 1;
          else if (bdelta === 0) btem2 = btem;
          else btem2 = btem + bdelta / dphi;
          if (btem2 > GS_ZCLAMP) btem2 = GS_ZCLAMP; else if (btem2 < -GS_ZCLAMP) btem2 = -GS_ZCLAMP;
        }
        if (atem2 > btem2) atem2 = btem2;
        adelta = loA ? Math.abs(atem2 - atem) : 0;
        bdelta = hiA ? Math.abs(btem2 - btem) : 0;
      }
      a[i] = atem; b[i] = btem;
      if (adelta > tol || bdelta > tol) return { I: I, a: a, b: b, error: 1 };
      if (i < K - 1) {
        var g2 = gridpts(r, 0, a[i], b[i]);
        h = hupdate(0, g2, g, h, I[i - 1], I[i]);
        g = g2;
      }
    }
    return { I: I, a: a, b: b, error: error };
  }

  // Upper bounds for a given theta and fixed lower bounds (gsbound1.c + R gsBound1).
  function gsBound1(theta, I, a, probhi, tol, r) {
    tol = tol == null ? 1e-6 : tol; r = r || 18;
    var K = I.length, b = new Array(K), problo = new Array(K), error = 0;
    var rtIk = Math.sqrt(I[0]), mu = rtIk * theta;
    problo[0] = pnormUpper(mu - a[0]);
    b[0] = probhi[0] <= 0 ? EXTREMEZ : mu - qnormLower(probhi[0]);
    if (K > 1) {
      var g = gridpts(r, mu, a[0], b[0]), h = h1(theta, g, I[0]);
      for (var i = 1; i < K; i++) {
        var rtIkm1 = rtIk; rtIk = Math.sqrt(I[i]); mu = rtIk * theta;
        var rtdeltak = Math.sqrt(I[i] - I[i - 1]), drift = theta * (I[i] - I[i - 1]);
        var scale = INV_SQRT_2PI * rtIk / rtdeltak, hiA = probhi[i] > 0;
        var btem2 = hiA ? mu - qnormLower(probhi[i]) : EXTREMEZ, btem = btem2, bdelta = hiA ? 1 : 0, j = 0, ii, x;
        while (bdelta > tol && j++ < GS_MAXITER) {
          var phi = 0, dphi = 0;
          btem = btem2;
          for (ii = 0; ii <= g.m; ii++) {
            x = (g.z[ii] * rtIkm1 - btem * rtIk + drift) / rtdeltak;
            phi += pnormLower(x) * h[ii];
            dphi -= h[ii] * Math.exp(-x * x / 2);
          }
          dphi *= scale;
          bdelta = probhi[i] - phi;
          if (bdelta < dphi) btem2 = btem + 1;
          else if (bdelta > -dphi) btem2 = btem - 1;
          else if (bdelta === 0) btem2 = btem;
          else btem2 = btem + bdelta / dphi;
          if (btem2 > GS_ZCLAMP) btem2 = GS_ZCLAMP; else if (btem2 < -GS_ZCLAMP) btem2 = -GS_ZCLAMP;
          bdelta = Math.abs(btem2 - btem);
        }
        var plo = 0;
        for (ii = 0; ii <= g.m; ii++) plo += pnormUpper((g.z[ii] * rtIkm1 - a[i] * rtIk + drift) / rtdeltak) * h[ii];
        b[i] = btem; problo[i] = plo;
        if (bdelta > tol) error = 1;
        if (i < K - 1) {
          var g2 = gridpts(r, mu, a[i], b[i]);
          h = hupdate(theta, g2, g, h, I[i - 1], I[i]);
          g = g2;
        }
      }
    }
    var y = { theta: theta, I: I, a: a.slice(), b: b, problo: problo, probhi: probhi.slice(), error: error };
    if (error === 0) {
      var cross = false;
      for (var k = 0; k < K; k++) if (y.b[k] - y.a[k] < 0) { y.b[k] = y.a[k]; cross = true; }
      if (cross) {
        var z = gsprob(theta, I, a, y.b, r);
        y.probhi = z.probhi[0]; y.problo = z.problo[0];
      }
    }
    return y;
  }

  // Brent's zeroin exactly as R's R_zeroin2 (used by uniroot).
  var DBL_EPSILON = 2.220446049250313e-16;
  function uniroot(f, lower, upper, tol, maxiter) {
    maxiter = maxiter || 1000;
    var fa = f(lower), fb = f(upper);
    if (fa * fb > 0) throw new Error("f() values at end points not of opposite sign");
    var a = lower, b = upper, c = a, fc = fa, it = maxiter + 1;
    if (fa === 0) return a;
    if (fb === 0) return b;
    while (it--) {
      var prev_step = b - a, tol_act, p, q, new_step;
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      tol_act = 2 * DBL_EPSILON * Math.abs(b) + tol / 2;
      new_step = (c - b) / 2;
      if (Math.abs(new_step) <= tol_act || fb === 0) return b;
      if (Math.abs(prev_step) >= tol_act && Math.abs(fa) > Math.abs(fb)) {
        var t1, cb = c - b, t2;
        if (a === c) { t1 = fb / fa; p = cb * t1; q = 1 - t1; }
        else {
          q = fa / fc; t1 = fb / fc; t2 = fb / fa;
          p = t2 * (cb * q * (q - t1) - (b - a) * (t1 - 1));
          q = (q - 1) * (t1 - 1) * (t2 - 1);
        }
        if (p > 0) q = -q; else p = -p;
        if (p < (0.75 * cb * q - Math.abs(tol_act * q) / 2) && p < Math.abs(prev_step * q / 2)) new_step = p / q;
      }
      if (Math.abs(new_step) < tol_act) new_step = new_step > 0 ? tol_act : -tol_act;
      a = b; fa = fb;
      b += new_step; fb = f(b);
      if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) { c = a; fc = fa; }
    }
    return b;
  }

  function scaleVec(v, s) { return v.map(function (x) { return x * s; }); }
  function sum(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s; }
  function maxAbsDiff(u, v) { var m = 0; for (var i = 0; i < u.length; i++) m = Math.max(m, Math.abs(u[i] - v[i])); return m; }
  function boundChange(n, o) {
    var m = 0;
    for (var i = 0; i < n.length; i++) { var d = Math.abs(n[i] - o[i]); if (d === d) m = Math.max(m, d); }
    return m;
  }

  // R gsbetadiff / gsI / gsbetadiff1 / gsI1
  function gsbetadiff(Imax, theta, beta, time, a, b, r) {
    return beta - 1 + sum(gsprob(theta, scaleVec(time, Imax), a, b, r).probhi[0]);
  }
  function gsI(I, theta, beta, trueneg, falsepos, tol, r) {
    var K = I.length, tx = I.map(function (v) { return v / I[K - 1]; });
    var x = gsBound(I, trueneg, falsepos, tol, r);
    var alpha = sum(falsepos), I0 = Math.pow((qnormLower(alpha) + qnormLower(beta)) / theta, 2);
    var root = uniroot(function (Im) { return gsbetadiff(Im, theta, beta, tx, x.a, x.b, r); }, I0, 10 * I0, tol);
    return { I: scaleVec(tx, root), a: x.a, b: x.b, error: x.error };
  }
  function gsbetadiff1(Imax, theta, tx, problo, b, tol, r) {
    var I = scaleVec(tx, Imax);
    var x = gsBound1(-theta, I, b.map(function (v) { return -v; }), problo, tol, r);
    var y = gsprob(theta, I, x.b.map(function (v) { return -v; }), b, r);
    return sum(problo) - 1 + y.powr[0];
  }
  function gsI1(theta, I, beta, b, Ilow, Ihigh, tol, r) {
    var K = I.length, tx = I.map(function (v) { return v / I[K - 1]; });
    var root = uniroot(function (Im) { return gsbetadiff1(Im, theta, tx, beta, b, tol, r); }, Ilow, Ihigh, tol);
    var In = scaleVec(tx, root);
    var x = gsBound1(-theta, In, b.map(function (v) { return -v; }), beta, tol, r);
    var xb = x.b.slice(); xb[K - 1] = -b[K - 1];
    var a = xb.map(function (v) { return -v; });
    var y = gsprob(theta, In, a, b, r);
    return { I: In, a: a, b: b, problo: y.problo[0], probhi: y.probhi[0], powr: y.powr[0], error: x.error };
  }
  function searchIhigh(lo, hi, theta, tx, falseneg, b, tol, r, nfix) {
    while (0 > gsbetadiff1(hi, theta, tx, falseneg, b, tol, r)) {
      if (hi > 5 * nfix) throw new Error("Unable to derive sample size");
      lo = hi; hi = hi * 1.2;
    }
    return [lo, hi];
  }

  /**
   * Group-sequential design, reproducing gsDesign::gsDesign(k, test.type, alpha,
   * beta, n.fix = 1, timing, sfu, sfupar, sfl, sflpar, tol, r).
   * opts: { testType 1-4, alpha (one-sided), beta, timing [..,1] or k,
   *         sfu: {family:'LDOF'|'LDPocock'|'Power'|'HSD', param}, sfl: {...},
   *         tol = 1e-6, r = 18, nFix = 1, delta (if > 0, sets nFix as gsDesign does) }
   * Returns { k, testType, alpha, beta, delta, timing, nI, inflation,
   *   upper:{bound, spend, prob:[[theta0 per look],[theta1 per look]]},
   *   lower:{bound, spend, prob} (types 2-4), en:[E(I|theta0), E(I|theta1)] }.
   * Throws the same errors as gsDesign where it stops.
   */
  function design(opts) {
    opts = opts || {};
    var testType = opts.testType || 1, alpha = opts.alpha != null ? opts.alpha : 0.025;
    var beta = opts.beta != null ? opts.beta : 0.1, tol = opts.tol != null ? opts.tol : 1e-6, r = opts.r || 18;
    var nfix = opts.nFix || 1, timing = opts.timing;
    if (!timing) { var kk = opts.k || 3; timing = []; for (var q = 1; q <= kk; q++) timing.push(q / kk); }
    var K = timing.length;
    if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be in (0, 0.5)");
    if (!(beta > 0 && beta < 1 - alpha)) throw new Error("beta must be in (0, 1 - alpha)");
    if (Math.abs(timing[K - 1] - 1) > 1e-12) throw new Error("timing must end at 1");
    for (var c = 0; c < K; c++) if (!(timing[c] > (c ? timing[c - 1] : 0))) throw new Error("timing must be increasing and > 0");
    var delta;
    if (opts.delta > 0) { delta = opts.delta; nfix = Math.pow((qnormLower(alpha) + qnormLower(beta)) / delta, 2); }
    else delta = Math.abs(qnormLower(alpha) + qnormLower(beta)) / Math.sqrt(nfix);
    var sfu = opts.sfu || { family: "HSD", param: -4 }, sfl = opts.sfl || { family: "HSD", param: -2 };
    var uCum = spendVector(sfu, alpha, timing), falsepos = diffs(uCum), out;

    if (testType === 1) {
      var a1 = timing.map(function () { return -EXTREMEZ; });
      var b1 = gsBound1(0, timing, a1, falsepos, tol, r).b;
      var Im = uniroot(function (x) { return gsbetadiff(x, delta, beta, timing, a1, b1, r); }, nfix, 10 * nfix, tol);
      var nI1 = scaleVec(timing, Im), y1 = gsprob([0, delta], nI1, a1, b1, r);
      if (maxAbsDiff(falsepos, y1.probhi[0]) > tol) throw new Error("False positive rates not achieved");
      out = { nI: nI1, upper: { bound: b1, spend: falsepos, prob: y1.probhi }, lower: null, en: y1.en };
    } else if (testType === 2) {
      var x2 = gsI(timing, delta, beta, falsepos, falsepos, 1e-6, 18);
      var y2 = gsprob([0, delta], x2.I, x2.a, x2.b, r);
      if (maxAbsDiff(falsepos, y2.probhi[0]) > tol) throw new Error("False positive rates not achieved");
      if (maxAbsDiff(falsepos, y2.problo[0]) > tol) throw new Error("False negative rates not achieved");
      out = { nI: x2.I, upper: { bound: x2.b, spend: falsepos, prob: y2.probhi },
        lower: { bound: x2.a, spend: falsepos.slice(), prob: y2.problo }, en: y2.en };
    } else if (testType === 3 || testType === 4) {
      var falseneg = diffs(spendVector(sfl, beta, timing)), lim, res;
      if (testType === 4) {
        var x0 = gsBound1(0, timing, timing.map(function () { return -EXTREMEZ; }), falsepos, tol, r);
        lim = searchIhigh(0.98 * nfix, 1.2 * nfix, delta, timing, falseneg, x0.b, tol, r, nfix);
        res = gsI1(delta, timing, falseneg, x0.b, lim[0], lim[1], tol, r);
        var nb = gsprob(0, res.I, timing.map(function () { return -EXTREMEZ; }), x0.b, r).probhi[0];
        var y4 = gsprob([0, delta], res.I, res.a, x0.b, r);
        if (maxAbsDiff(falsepos, nb) > tol) throw new Error("False positive rates not achieved");
        if (maxAbsDiff(falseneg, y4.problo[1]) > tol) throw new Error("False negative rates not achieved");
        out = { nI: res.I, upper: { bound: x0.b, spend: falsepos, prob: y4.probhi },
          lower: { bound: res.a, spend: falseneg, prob: y4.problo }, en: y4.en, falseposnb: nb };
      } else {
        var trueneg = timing.map(function () { return (1 - alpha) / K; });
        var xb1 = gsBound(timing, trueneg, falsepos, tol, r);
        lim = searchIhigh(nfix / 3, 1.2 * nfix, delta, timing, falseneg, xb1.b, tol, r, nfix);
        res = gsI1(delta, timing, falseneg, xb1.b, lim[0], lim[1], tol, r);
        var x3 = gsprob(0, res.I, res.a, res.b, 18), flag = Math.abs(x3.powr[0] - alpha), jj = 0, I3 = res.I;
        while (flag > tol && jj < 100) {
          var aa = res.a.slice(0, K - 1).concat([-EXTREMEZ]);
          var x4 = gsBound1(0, I3, aa, falsepos, 1e-6, 18);
          lim = searchIhigh(nfix / 3, 1.2 * nfix, delta, timing, falseneg, x4.b, tol, r, nfix);
          res = gsI1(delta, timing, falseneg, x4.b, lim[0], lim[1], tol, r);
          x3 = gsprob(0, res.I, res.a, res.b, 18);
          I3 = res.I;
          flag = Math.max(Math.abs(x3.powr[0] - alpha), maxAbsDiff(falsepos, x3.probhi[0]));
          jj++;
        }
        var y3 = gsprob([0, delta], res.I, res.a, res.b, 18);
        if (maxAbsDiff(falsepos, x3.probhi[0]) > tol) throw new Error("False positive rates not achieved");
        if (maxAbsDiff(falseneg, res.problo) > tol) throw new Error("False negative rates not achieved");
        out = { nI: res.I, upper: { bound: res.b, spend: falsepos, prob: y3.probhi },
          lower: { bound: res.a, spend: falseneg, prob: y3.problo }, en: y3.en };
      }
    } else {
      throw new Error("testType must be 1, 2, 3 or 4");
    }
    out.k = K; out.testType = testType; out.alpha = alpha; out.beta = beta; out.delta = delta;
    out.timing = timing.slice(); out.nFix = nfix; out.inflation = out.nI[K - 1] / nfix;
    out.tol = tol; out.r = r;
    return out;
  }

  /**
   * Page-level wrapper (kept for the gsdesign page and earlier callers).
   * opts: { alpha (one-sided; total two-sided if twoSided), infoFracs, spend, param,
   *         twoSided, futility:'none'|'betaspend', futSpend, futParam, beta,
   *         binding (futility), tol }
   * Returns [{ look, infoFrac, z_eff, z_fut, nomP_eff, cumAlpha, ... }] with the
   * full design attached as .design.
   */
  function boundaries(opts) {
    opts = opts || {};
    var alpha = opts.alpha != null ? opts.alpha : 0.025, twoSided = !!opts.twoSided;
    var hasFut = !twoSided && opts.futility && opts.futility !== "none";
    var tt = twoSided ? 2 : (hasFut ? (opts.binding ? 3 : 4) : 1);
    var d = design({
      testType: tt, alpha: twoSided ? alpha / 2 : alpha, beta: opts.beta != null ? opts.beta : 0.1,
      timing: opts.infoFracs || [0.5, 1], tol: opts.tol,
      sfu: { family: opts.spend || "obf", param: opts.param },
      sfl: { family: opts.futSpend || opts.spend || "obf", param: opts.futParam != null ? opts.futParam : opts.param }
    });
    var cumA = 0, cumB = 0, rows = [];
    for (var k = 0; k < d.k; k++) {
      var aSpend = d.upper.spend[k] * (twoSided ? 2 : 1);
      cumA += aSpend;
      var zf = d.lower && !twoSided ? d.lower.bound[k] : -Infinity;
      if (d.lower && !twoSided) cumB += d.lower.spend[k];
      rows.push({
        look: k + 1, infoFrac: d.timing[k], z_eff: d.upper.bound[k], z_fut: zf,
        nomP_eff: twoSided ? 2 * pnormUpper(d.upper.bound[k]) : pnormUpper(d.upper.bound[k]),
        cumAlpha: cumA, cumBeta: cumB,
        probEffH0: d.upper.prob[0][k] * (twoSided ? 2 : 1), probEffH1: d.upper.prob[1][k],
        probFutH0: d.lower && !twoSided ? d.lower.prob[0][k] : 0,
        probFutH1: d.lower && !twoSided ? d.lower.prob[1][k] : 0,
        infoRatio: d.nI[k]
      });
    }
    rows.design = d;
    return rows;
  }

  /**
   * Conditional power at an interim look. Given observed z_m at info fraction
   * t_m, the final efficacy boundary z_K at t_K=1, and an assumed standardized
   * drift theta (per unit information^0.5); if theta is null uses the current
   * trend (theta_hat = z_m / sqrt(t_m)).
   *   CP = 1 - Phi( (z_K - z_m*sqrt(t_m) - theta*(1 - t_m)) / sqrt(1 - t_m) ).
   */
  function conditionalPower(zObs, tm, zK, theta) {
    if (!(tm > 0 && tm < 1)) return NaN;
    var th = (theta == null) ? zObs / Math.sqrt(tm) : theta;
    var num = zK - zObs * Math.sqrt(tm) - th * (1 - tm);
    return pnormUpper(num / Math.sqrt(1 - tm));
  }

  // ===== Adaptive simulation: two-group means (rpact getSimulationMeans logic) =====

  // Seeded PRNG: xoshiro128** seeded by splitmix32 (as AdaptSim); 53-bit uniforms;
  // Box-Muller normals (both variates used).
  function makeRng(seed) {
    var s = seed >>> 0;
    function sm() {
      s = (s + 0x9e3779b9) | 0;
      var t = s ^ (s >>> 16); t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    }
    var a = sm(), b = sm(), c = sm(), d = sm();
    function next() {
      var t = b << 9, r = b * 5;
      r = (r << 7 | r >>> 25) * 9;
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
      d = d << 11 | d >>> 21;
      return r >>> 0;
    }
    function unif() { return ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992; }
    var spare = null;
    function norm() {
      if (spare !== null) { var v = spare; spare = null; return v; }
      var u1 = unif(), u2 = unif();
      while (u1 === 0) u1 = unif();
      var rad = Math.sqrt(-2 * Math.log(u1));
      spare = rad * Math.sin(2 * Math.PI * u2);
      return rad * Math.cos(2 * Math.PI * u2);
    }
    return { unif: unif, norm: norm };
  }

  function isNA(v) { return v == null || v !== v; }

  // Normalise a simulation setting. design: { kMax, informationRates, criticalValues,
  // futilityBounds (kMax-1; NaN/null = none), method:'inverseNormal'|'groupSequential' }.
  function simSetup(dsg, o) {
    var K = dsg.kMax || dsg.criticalValues.length, ar = o.allocationRatio || 1;
    var sd = o.stDev != null ? o.stDev : 1, sdH1 = o.stDevH1 != null && !isNA(o.stDevH1) ? o.stDevH1 : sd;
    return {
      K: K, ir: dsg.informationRates, cv: dsg.criticalValues,
      fb: (dsg.futilityBounds || []).map(function (v) { return isNA(v) ? NaN : v; }),
      gsd: dsg.method === "groupSequential", ar: ar, sd: sd, sdH1: sdH1,
      thetaH0: o.thetaH0 || 0, planned: o.plannedSubjects,
      cp: isNA(o.conditionalPower) ? NaN : o.conditionalPower,
      minN: o.minNumberOfSubjectsPerStage || [], maxN: o.maxNumberOfSubjectsPerStage || [],
      thetaH1: isNA(o.thetaH1) ? NaN : o.thetaH1, ssrFirstOnly: o.ssrStages === "first",
      // sqrt(sd1^2 (1 + 1/r) + sd2^2 (1 + r)): SD of the standardised difference
      den: Math.sqrt(sd * sd * (1 + 1 / ar) + sd * sd * (1 + ar)),
      denH1: Math.sqrt(sdH1 * sdH1 * (1 + 1 / ar) + sdH1 * sdH1 * (1 + ar))
    };
  }
  // Test statistic of stage k (1-based count = n.length) from stage-wise z (rpact getTestStatisticsMeans).
  function combine(S, n, z) {
    var k = n.length, sn = 0, sw = 0, i;
    for (i = 0; i < k; i++) { sw += Math.sqrt(n[i]) * z[i]; sn += n[i]; }
    var overall = sw / Math.sqrt(sn), value;
    if (S.gsd) value = overall;
    else if (k === 1) value = z[0];
    else {
      var acc = Math.sqrt(S.ir[0]) * z[0];
      for (i = 1; i < k; i++) acc += Math.sqrt(S.ir[i] - S.ir[i - 1]) * z[i];
      value = acc / Math.sqrt(S.ir[k - 1]);
    }
    var r = S.ar, s1 = 0, s2 = 0;
    for (i = 0; i < k; i++) { s1 += r / (1 + r) * n[i]; s2 += 1 / (1 + r) * n[i]; }
    var std = overall * Math.sqrt(1 / s1 + 1 / s2);
    return { value: value, overall: overall, effect: std * S.sd };
  }
  // Stage-k subjects (k >= 2, 1-based) and the conditional power they achieve.
  function stageSubjects(S, k, prevValue, effect, nPrev) {
    var thetaH1 = isNA(S.thetaH1) ? effect : S.thetaH1 - S.thetaH0;
    var thetaStd = thetaH1 / S.denH1;
    var ccv = (S.cv[k - 1] * Math.sqrt(S.ir[k - 1]) - prevValue * Math.sqrt(S.ir[k - 2])) /
      Math.sqrt(S.ir[k - 1] - S.ir[k - 2]);
    var n;
    if (isNA(S.cp)) n = S.planned[k - 1] - S.planned[k - 2];
    else if (S.ssrFirstOnly && k > 2) n = nPrev[k - 2];
    else {
      var num = Math.max(0, ccv + qnormLower(S.cp)), d = Math.max(1e-12, thetaStd);
      n = Math.min(Math.max(S.minN[k - 1], num * num / (d * d)), S.maxN[k - 1]);
    }
    return { n: n, ccv: ccv, cpAchieved: pnormUpper(ccv - thetaStd * Math.sqrt(n)) };
  }
  /**
   * Run one trial. drawZ(k, nz) returns the stage-k (1-based) stage-wise z given
   * its mean nz (simulation: nz + N(0,1); replay: the recorded value).
   * Returns per-stage rows and the outcome.
   */
  function runTrial(S, alternative, drawZ) {
    var n = [], z = [], rows = [], ts = null, stop = false;
    for (var k = 1; k <= S.K && !stop; k++) {
      var nk, cpA = NaN;
      if (k === 1) nk = S.planned[0];
      else { var ss = stageSubjects(S, k, ts.value, ts.effect, n); nk = ss.n; cpA = ss.cpAchieved; }
      var nz = (alternative - S.thetaH0) * Math.sqrt(nk) / S.den;
      n.push(nk); z.push(drawZ(k, nz));
      ts = combine(S, n, z);
      var rej = ts.value >= S.cv[k - 1], fut = false;
      if (k < S.K && !isNA(S.fb[k - 1]) && ts.value <= S.fb[k - 1]) fut = true;
      stop = rej || fut || k === S.K;
      rows.push({ stage: k, subjects: nk, cumSubjects: sum(n), stageZ: z[k - 1], testStatistic: ts.value,
        overall: ts.overall, effectEstimate: ts.effect, conditionalPowerAchieved: cpA,
        reject: rej, futility: fut, trialStop: stop });
    }
    return rows;
  }
  function newAcc(K) {
    var z = function () { var v = []; for (var i = 0; i < K; i++) v.push(0); return v; };
    return { iter: 0, reached: z(), subj: z(), rej: z(), fut: z(), cp: z(), totalN: 0, totalN2: 0 };
  }
  function accumulate(A, rows) {
    var tot = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], k = r.stage - 1;
      A.reached[k]++; A.subj[k] += r.subjects; tot += r.subjects;
      if (r.reject) A.rej[k]++;
      if (r.futility) A.fut[k]++;
      if (k > 0) A.cp[k] += r.conditionalPowerAchieved;
    }
    A.iter++; A.totalN += tot; A.totalN2 += tot * tot;
  }
  function summarise(A, K) {
    var N = A.iter, out = { iterations: A.reached.slice(), sampleSizes: [], rejectPerStage: [], futilityPerStage: [],
      conditionalPowerAchieved: [] };
    for (var k = 0; k < K; k++) {
      out.sampleSizes.push(A.reached[k] > 0 ? A.subj[k] / A.reached[k] : 0);
      out.rejectPerStage.push(A.rej[k] / N);
      if (k < K - 1) out.futilityPerStage.push(A.fut[k] / N);
      out.conditionalPowerAchieved.push(k === 0 || A.reached[k] === 0 ? NaN : A.cp[k] / A.reached[k]);
    }
    out.overallReject = sum(out.rejectPerStage);
    out.futilityStop = sum(out.futilityPerStage);
    out.earlyStop = out.futilityStop + sum(out.rejectPerStage.slice(0, K - 1));
    out.expectedNumberOfSubjects = A.totalN / N;
    var m = A.totalN / N;
    out.sdNumberOfSubjects = N > 1 ? Math.sqrt(Math.max(0, (A.totalN2 - N * m * m) / (N - 1))) : 0;
    out.counts = { N: N, reject: A.rej.slice(), futility: A.fut.slice(0, K - 1),
      overallReject: sum(A.rej), futilityStop: sum(A.fut.slice(0, K - 1)) };
    return out;
  }
  /**
   * Monte Carlo simulation. opts: { alternative:[...], stDev, allocationRatio,
   * plannedSubjects:[cumulative], conditionalPower, minNumberOfSubjectsPerStage,
   * maxNumberOfSubjectsPerStage, thetaH1, stDevH1, ssrStages:'all'|'first',
   * maxNumberOfIterations, seed }. Returns one summary per alternative.
   */
  function simulateMeans(dsg, opts) {
    var S = simSetup(dsg, opts), alts = opts.alternative, N = opts.maxNumberOfIterations || 10000;
    var seed = opts.seed != null ? opts.seed : 20261021, res = [];
    for (var j = 0; j < alts.length; j++) {
      var rng = makeRng(seed + 7919 * j), A = newAcc(S.K);
      for (var it = 0; it < N; it++) accumulate(A, runTrial(S, alts[j], function (k, nz) { return nz + rng.norm(); }));
      var s = summarise(A, S.K); s.alternative = alts[j]; res.push(s);
    }
    return res;
  }
  /**
   * Replay externally simulated trials. stageZ[i] = array of stage-wise z for
   * iteration i (length = number of stages that trial reached).
   * Returns { rows: per iteration rows, summary }.
   */
  function replayMeans(dsg, opts, alternative, stageZ) {
    var S = simSetup(dsg, opts), A = newAcc(S.K), all = [];
    for (var i = 0; i < stageZ.length; i++) {
      var zs = stageZ[i];
      var rows = runTrial(S, alternative, function (k) { return zs[k - 1]; });
      all.push(rows); accumulate(A, rows);
    }
    var s = summarise(A, S.K); s.alternative = alternative;
    return { rows: all, summary: s };
  }
  // Design object for simulation from a gsDesign-type design (one-sided, types 1/3/4).
  function simDesignFrom(d) {
    if (d.testType === 2) throw new Error("simulation supports one-sided designs only");
    return { kMax: d.k, informationRates: d.timing.slice(), criticalValues: d.upper.bound.slice(),
      futilityBounds: d.lower ? d.lower.bound.slice(0, d.k - 1) : d.timing.slice(0, d.k - 1).map(function () { return NaN; }),
      method: "inverseNormal" };
  }

  var api = {
    design: design,
    boundaries: boundaries,
    gsprob: gsprob,
    gsBound: gsBound,
    gsBound1: gsBound1,
    uniroot: uniroot,
    gridpts: gridpts,
    conditionalPower: conditionalPower,
    sf: SF,
    // legacy (t, alpha) signatures
    spend: {
      obf: function (t, a) { return sfLDOF(a, t); },
      pocock: function (t, a) { return sfLDPocock(a, t); },
      landemets: function (t, a, rho) { return sfPower(a, t, rho); },
      hsd: function (t, a, g) { return sfHSD(a, t, g); }
    },
    normalCDF: pnormLower, pnormLower: pnormLower, pnormUpper: pnormUpper,
    normalQuantile: qnormLower, qnormLower: qnormLower, qnormUpper: qnormUpper,
    makeRng: makeRng,
    simulateMeans: simulateMeans,
    replayMeans: replayMeans,
    simDesignFrom: simDesignFrom
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmGSDesign = api;
})(typeof window !== "undefined" ? window : globalThis);
