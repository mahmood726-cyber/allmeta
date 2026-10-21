/* shared/copas-core.js — Copas & Shi selection model, ported from metasens.
 *
 * A faithful port of the whole of metasens::copas() (metasens 1.5-3), not only
 * the profile likelihood: the gamma grids, the ngrid x ngrid contour surface,
 * R's own contourLines()/pretty() machinery, the approximate orthogonal line and
 * its per-line regressions, the estimates down that line, the four-parameter
 * residual-selection-bias fit and metasens's TE.adjust selection rule.
 *
 * Browser (window.AlmCopasCore) and Node (module.exports). Pure functions; no
 * DOM, no globals beyond the single export.
 *
 * Ported from, and validated against:
 *   metasens 1.5.3  copas(), copas.loglik.without.beta, copas.gradient.without.beta,
 *                   copas.loglik.with.beta, lambda()
 *   meta     8.5.0  ci(), metagen() common-effect pool
 *   R        4.6.0  grDevices::contourLines (src/main/plot3d.c + contour-common.h),
 *                   base::pretty (src/appl/pretty.c), stats::lm / summary.lm
 * Two deliberate quirks of the R code are reproduced because they change the
 * output; each is marked R-QUIRK below.
 *
 * NOT reproduced: copas() wraps each grid optim() in try() and, when a fit
 * throws, leaves the PREVIOUS fit's object in place, so TE.contour[i, j] silently
 * takes the previous grid point's value. This routine always returns a value for
 * every grid point, so there is nothing to carry forward. The validation
 * archive's R reference does reproduce the carry-forward, so if it ever fires the
 * difference shows up as a contour disagreement rather than being hidden.
 *
 * ALSO NOT identical, and worth knowing the direction of. The box-constrained
 * minimiser here is not L-BFGS-B (see minimiseBox) and converges past R's
 * factr = 1e7 stopping point, so this port's attained objective is usually
 * lower than metasens's. For stage 4's three-parameter loglik1 that is benign.
 * For stage 5's four-parameter loglikWithBeta it is not neutral:
 *   - metasens ports no analytic gradient for the four-parameter likelihood, so
 *     R's optim falls back to its OWN finite differences at ndeps = 1e-3, while
 *     numGrad below uses h = 1e-7 * max(1, |x|). Different gradient, different
 *     path, different stopping point.
 *   - pval.rsb = 1 - pchisq(2*(loglik1 - loglik2), 1). A loglik2 that converges
 *     FURTHER makes 2*(l1 - l2) LARGER and pval.rsb SMALLER. That pushes points
 *     below sign.rsb, and adjustSelection() responds by selecting a later
 *     orthogonal-line point or -- if every point goes significant -- by
 *     withholding the adjusted estimate altogether. So a better optimiser can
 *     make this port refuse to report an estimate metasens reports.
 * Both loglik1 and loglik2 therefore carry a "never worse than metasens"
 * assertion in copas/tests/copas-core-metasens.test.mjs, and the page's footer
 * states the pval.rsb direction, so the effect is measured rather than assumed.
 *
 * References: Copas JB. J R Stat Soc Ser A 1999;162:95-109. Copas JB, Shi JQ.
 * Biostatistics 2000;1:247-262. Carpenter JR, Rucker G, Schwarzer G. Biom J
 * 2009;51:919-932 (metasens's implementation).
 */
(function (global) {
  "use strict";

  // Math is captured once into locals. In a browser this is a micro-optimisation;
  // under the Node/linkedom DOM used by the validation harness the page's global
  // object is proxied, so each `Math.x` lookup goes through a getter trap and the
  // same loop runs about 50x slower. The arithmetic is unchanged.
  var mExp = Math.exp, mSqrt = Math.sqrt, mLog = Math.log, mLog10 = Math.log10,
      mAbs = Math.abs, mPow = Math.pow, mMin = Math.min, mMax = Math.max,
      mFloor = Math.floor, mCeil = Math.ceil, mTrunc = Math.trunc,
      mSign = Math.sign, isFin = isFinite, isNan = isNaN;

  var DBL_EPSILON = 2.220446049250313e-16;
  var DBL_MIN = 2.2250738585072014e-308;
  var DBL_MAX = 1.7976931348623157e308;
  var SQRT_2PI = 2.5066282746310002;
  var MAX_CONTOUR_SEGMENTS = 25000; // R's options("max.contour.segments") default

  /* ---------------------------------------------------------------- numerics */

  // Hart/West rational approximation of the standard normal CDF below
  // z = sqrt(50), a 24-term Mills continued fraction above it.
  //
  // Measured relative accuracy against R 4.6.0 (the sweep behind these
  // figures is pinned by copas/tests/copas-core-rbase.test.mjs):
  //   continued-fraction branch, z >= sqrt(50) ... machine precision (<1e-15)
  //   rational branch, |z| <= 3 ................. machine precision
  //   rational branch, z = 5 .................... 4.6e-11
  //   rational branch, z = 7 .................... 2.6e-9
  // The boundary is therefore an accuracy STEP, not a smooth join: the
  // continued fraction is already at machine precision from about z = 4.5,
  // roughly 2.5 units below where it is switched on, so pnorm is about four
  // orders of magnitude less accurate just under sqrt(50) than just over it.
  // Lowering the boundary would make this agree with R to ~1e-15 throughout,
  // but it perturbs every likelihood evaluation and hence every count the
  // validation archive reports, so it is pinned by a test rather than changed
  // here. loglikWithoutBeta clamps v at -37 and the converged v values are
  // small, which is why the 1e-9 deterministic tier holds as things stand.
  //
  // The usual "if (z > 37) return 0" shortcut is deliberately NOT used. R's
  // pnorm still returns a (subnormal) positive value out to about -37.52, and
  // lambda(u) = dnorm(u)/pnorm(u) is the Copas model's inverse Mills ratio: a
  // zero there turns lambda into Inf instead of about |u|. The cutoff is set at
  // z > 40, beyond which exp(-z*z/2) underflows to zero anyway and R returns 0
  // too. Found by probe E18.
  function pnorm(x) {
    var z = mAbs(x), p;
    if (z > 40) p = 0;
    else {
      var e = mExp(-z * z / 2);
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
        // Mills-ratio continued fraction, evaluated bottom-up:
        //   P(Z < -z) = dnorm(z) / (z + 1/(z + 2/(z + 3/(z + ...))))
        // West's four-term truncation is only about 3e-9 relative at z = 10;
        // 24 terms reproduces R's pnorm to the last digit from z = 7.07 out to
        // the subnormal limit. Checked against R at z = 7.07, 7.5, 8, 10, 15,
        // 20, 30 and 37.5. Found by probe E18.
        var f = 0;
        for (var kk = 24; kk >= 1; kk--) f = kk / (z + f);
        p = e / (SQRT_2PI * (z + f));
      }
    }
    return x > 0 ? 1 - p : p;
  }

  function dnorm(x) { return mExp(-0.5 * x * x) / SQRT_2PI; }

  // Wichura AS 241 — the algorithm R's qnorm uses; ~1e-16 relative.
  function qnorm(p) {
    if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
    var q = p - 0.5, r, val;
    if (mAbs(q) <= 0.425) {
      r = 0.180625 - q * q;
      val = q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r +
        67265.770927008700853) * r + 45921.953931549871457) * r +
        13731.693765509461125) * r + 1971.5909503065514427) * r +
        133.14166789178437745) * r + 3.387132872796366608) /
        (((((((r * 5226.495278852545925 + 28729.085735721942674) * r +
        39307.89580009271061) * r + 21213.794301586595867) * r +
        5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
      return val;
    }
    r = q > 0 ? 1 - p : p;
    r = mSqrt(-mLog(r));
    if (r <= 5) {
      r -= 1.6;
      val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r +
        0.24178072517745061177) * r + 1.27045825245236838258) * r +
        3.64784832476320460504) * r + 5.7694972214606914055) * r +
        4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r +
        0.0151986665636164571966) * r + 0.14810397642748007459) * r +
        0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r +
        0.0012426609473880784386) * r + 0.026532189526576123093) * r +
        0.29656057182850489123) * r + 1.7848265399172913358) * r +
        5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r +
        1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r +
        0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -val : val;
  }

  // Upper tail of chi-square on 1 df. chi2_1 = Z^2, so the identity is exact;
  // this is what `1 - pchisq(q, df = 1)` returns.
  function pchisq1Upper(q) {
    if (!isFin(q)) return isNan(q) ? NaN : (q > 0 ? 0 : 1);
    if (q <= 0) return 1;
    return 2 * pnorm(-mSqrt(q));
  }

  // metasens:::lambda — exactly dnorm(x)/pnorm(x). No tail guard: where both
  // underflow R yields NaN and so must the port (probe E18 in PREREG.md).
  function lambda(x) { return dnorm(x) / pnorm(x); }

  /* ------------------------------------------- R's seq(from, to, length.out) */
  // R's seq.int pins both endpoints exactly and interpolates between them.
  function seqLen(from, to, m) {
    if (m <= 0) return [];
    if (m === 1) return [from];
    var by = (to - from) / (m - 1), out = new Array(m), i;
    out[0] = from;
    for (i = 1; i < m - 1; i++) out[i] = from + i * by;
    out[m - 1] = to;
    return out;
  }

  /* --------------------------------------------- R_pretty (src/appl/pretty.c) */
  function rPrettyCore(lo, up, ndiv, min_n, shrink_sml, h, h5, f_min,
                       eps_correction, return_bounds) {
    var lo_ = lo, up_ = up, dx = up_ - lo_, cell, U, i_small;
    if (dx === 0 && up_ === 0) { cell = 1; i_small = true; }
    else {
      cell = mMax(mAbs(lo_), mAbs(up_));
      U = 1 + ((h5 >= 1.5 * h + 0.5) ? 1 / (1 + h) : 1.5 / (1 + h5));
      U *= mMax(1, ndiv) * DBL_EPSILON;
      i_small = dx < cell * U * 3;
    }
    if (i_small) {
      if (cell > 10) cell = 9 + cell / 10;
      cell *= shrink_sml;
      if (min_n > 1) cell /= min_n;
    } else {
      cell = dx;
      if (isFin(dx)) { if (ndiv > 1) cell /= ndiv; }
      else if (ndiv >= 2) cell = up_ / ndiv - lo_ / ndiv;
    }
    var MAX_F = 1.25;
    var subsmall = f_min * DBL_MIN;
    if (subsmall === 0) subsmall = DBL_MIN;
    if (cell < subsmall) cell = subsmall;
    else if (cell > DBL_MAX / MAX_F) cell = DBL_MAX / MAX_F;

    var base = mPow(10, mFloor(mLog10(cell)));
    var unit = base;
    if ((U = 2 * base) - cell < h * (cell - unit)) {
      unit = U;
      if ((U = 5 * base) - cell < h5 * (cell - unit)) {
        unit = U;
        if ((U = 10 * base) - cell < h * (cell - unit)) unit = U;
      }
    }
    var rounding_eps = 1e-10;
    var ns = mFloor(lo_ / unit + rounding_eps);
    var nu = mCeil(up_ / unit - rounding_eps);
    if (eps_correction && (eps_correction > 1 || !i_small)) {
      var E_ = DBL_EPSILON;
      var D_max = DBL_MAX * (1 - E_ / 2);
      if (lo_ < 0) lo *= (1 + E_); else if (lo_ > 0) lo *= (1 - E_);
      else lo = -mMin(unit, DBL_MIN);
      if (up_ < 0) up *= (1 - E_);
      else if (up_ > 0) { if (up_ < D_max) up *= (1 + E_); }
      else up = mMin(unit, DBL_MIN);
    }
    while (ns * unit > lo + rounding_eps * unit) ns--;
    while (!isFin(ns * unit)) ns++;
    while (nu * unit < up - rounding_eps * unit) nu++;
    while (!isFin(nu * unit)) nu--;
    var k = mTrunc(0.5 + nu - ns);
    if (k < min_n) {
      k = min_n - k;
      if (lo_ === 0 && ns === 0 && up_ !== 0) nu += k;
      else if (up_ === 0 && nu === 0 && lo_ !== 0) ns -= k;
      else if (ns >= 0) {
        nu += mTrunc(k / 2);
        ns -= mTrunc(k / 2) + (k % 2);
      } else {
        ns -= mTrunc(k / 2);
        nu += mTrunc(k / 2) + (k % 2);
      }
      ndiv = min_n;
    } else ndiv = k;
    if (return_bounds) {
      if (ns * unit < lo) lo = ns * unit;
      if (nu * unit > up) up = nu * unit;
    } else { lo = ns; up = nu; }
    return { lo: lo, up: up, ndiv: ndiv, unit: unit, ns: ns, nu: nu };
  }

  // base::pretty(x, n) for a finite numeric x, with R's defaults.
  function rPretty(values, n) {
    var fin = [], i;
    for (i = 0; i < values.length; i++) if (isFin(values[i])) fin.push(values[i]);
    if (!fin.length) return [];
    var lo = fin[0], up = fin[0];
    for (i = 1; i < fin.length; i++) { if (fin[i] < lo) lo = fin[i]; if (fin[i] > up) up = fin[i]; }
    var min_n = mFloor(n / 3);
    var z = rPrettyCore(lo, up, n, min_n, 0.75, 1.5, 0.5 + 1.5 * 1.5,
                        mPow(2, -20), 0, 1);
    var nn = z.ndiv;
    var s = seqLen(z.lo, z.up, nn + 1);
    if (nn) {
      var delta = (mMax(z.lo, z.up) - mMin(z.lo, z.up)) / nn;
      for (i = 0; i < s.length; i++) if (mAbs(s[i]) < 1e-14 * delta) s[i] = 0;
    }
    return s;
  }

  /* -------------------------------- grDevices::contourLines (R 4.6.0 port) */
  // z is the R matrix in column-major order: z[i + j * nx], nx = nrow.

  function ctrIntersect(z0, z1, zc) {
    // R's PR#15454 form: strict side change, neither corner exactly on zc.
    if (((z0 < zc) !== (z1 < zc)) && z0 !== zc && z1 !== zc) return (zc - z0) / (z1 - z0);
    return null;
  }

  function ctrSwapseg(seg) {
    var x = seg.x0, y = seg.y0;
    seg.x0 = seg.x1; seg.y0 = seg.y1; seg.x1 = x; seg.y1 = y;
  }

  // Entry direction to the next cell; mutates ij = [i, j].
  function ctrSegdir(xend, yend, x, y, ij, nx, ny) {
    if (mAbs(yend - y[ij[1]]) === 0) {
      if (ij[1] === 0) return 0;
      ij[1] -= 1; return 3;
    }
    if (mAbs(xend - x[ij[0]]) === 0) {
      if (ij[0] === 0) return 0;
      ij[0] -= 1; return 4;
    }
    if (mAbs(yend - y[ij[1] + 1]) === 0) {
      if (ij[1] >= ny - 1) return 0;
      ij[1] += 1; return 1;
    }
    if (mAbs(xend - x[ij[0] + 1]) === 0) {
      if (ij[0] >= nx - 1) return 0;
      ij[0] += 1; return 2;
    }
    return 0;
  }

  // Strip the segment with endpoint (xend, yend) from seglist; returns the new
  // list head and puts the match in out.seg (null when there is none).
  function ctrSegupdate(xend, yend, dir, tail, seglist, out) {
    if (seglist === null) { out.seg = null; return null; }
    if (dir === 1 || dir === 3) {
      if (mAbs(yend - seglist.y0) === 0) {
        if (!tail) ctrSwapseg(seglist);
        out.seg = seglist; return seglist.next;
      }
      if (mAbs(yend - seglist.y1) === 0) {
        if (tail) ctrSwapseg(seglist);
        out.seg = seglist; return seglist.next;
      }
    } else if (dir === 2 || dir === 4) {
      if (mAbs(xend - seglist.x0) === 0) {
        if (!tail) ctrSwapseg(seglist);
        out.seg = seglist; return seglist.next;
      }
      if (mAbs(xend - seglist.x1) === 0) {
        if (tail) ctrSwapseg(seglist);
        out.seg = seglist; return seglist.next;
      }
    }
    seglist.next = ctrSegupdate(xend, yend, dir, tail, seglist.next, out);
    return seglist;
  }

  function segmentDBForLevel(x, nx, y, ny, z, zc, atom) {
    var db = new Array(nx * ny);
    for (var q = 0; q < nx * ny; q++) db[q] = null;
    var xl, xh, yl, yh, i, j, k, l, m, f;
    for (i = 0; i < nx - 1; i++) {
      xl = x[i]; xh = x[i + 1];
      // R-QUIRK 1: xl is reused as a swap temporary in the k == 4 branch below
      // and is NOT restored, so later cells in the same column see the swapped
      // value. Faithfully reproduced: xl is assigned only here.
      for (j = 0; j < ny - 1; j++) {
        yl = y[j]; yh = y[j + 1];
        var kk = i + j * nx;
        var zll = z[kk], zhl = z[kk + 1], zlh = z[kk + nx], zhh = z[kk + nx + 1];
        if (zll === zc) zll += atom;
        if (zhl === zc) zhl += atom;
        if (zlh === zc) zlh += atom;
        if (zhh === zc) zhh += atom;
        var nacode = 0;
        if (isFin(zll)) nacode += 1;
        if (isFin(zhl)) nacode += 2;
        if (isFin(zlh)) nacode += 4;
        if (isFin(zhh)) nacode += 8;
        var xx = [0, 0, 0, 0], yy = [0, 0, 0, 0];
        k = 0;
        if (nacode === 15) {
          if ((f = ctrIntersect(zll, zhl, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yl; k++; }
          if ((f = ctrIntersect(zll, zlh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xl; k++; }
          if ((f = ctrIntersect(zhl, zhh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xh; k++; }
          if ((f = ctrIntersect(zlh, zhh, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yh; k++; }
        } else if (nacode === 14) {
          if ((f = ctrIntersect(zhl, zhh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xh; k++; }
          if ((f = ctrIntersect(zlh, zhh, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yh; k++; }
          if ((f = ctrIntersect(zlh, zhl, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yh + f * (yl - yh); k++; }
        } else if (nacode === 13) {
          if ((f = ctrIntersect(zll, zlh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xl; k++; }
          if ((f = ctrIntersect(zlh, zhh, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yh; k++; }
          if ((f = ctrIntersect(zll, zhh, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yl + f * (yh - yl); k++; }
        } else if (nacode === 11) {
          if ((f = ctrIntersect(zhl, zhh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xh; k++; }
          if ((f = ctrIntersect(zll, zhl, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yl; k++; }
          if ((f = ctrIntersect(zll, zhh, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yl + f * (yh - yl); k++; }
        } else if (nacode === 7) {
          if ((f = ctrIntersect(zll, zlh, zc)) !== null) { yy[k] = yl + f * (yh - yl); xx[k] = xl; k++; }
          if ((f = ctrIntersect(zll, zhl, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yl; k++; }
          if ((f = ctrIntersect(zlh, zhl, zc)) !== null) { xx[k] = xl + f * (xh - xl); yy[k] = yh + f * (yl - yh); k++; }
        }
        var seglist = null;
        if (k > 0) {
          if (k === 2) {
            seglist = { x0: xx[0], y0: yy[0], x1: xx[1], y1: yy[1], next: seglist };
          } else if (k === 4) {
            for (k = 3; k >= 1; k--) {
              m = k; xl = xx[k];
              for (l = 0; l < k; l++) if (xx[l] > xl) { xl = xx[l]; m = l; }
              if (m !== k) {
                xl = xx[k]; yl = yy[k];
                xx[k] = xx[m]; yy[k] = yy[m];
                xx[m] = xl; yy[m] = yl;
              }
            }
            seglist = { x0: xx[0], y0: yy[0], x1: xx[1], y1: yy[1], next: seglist };
            seglist = { x0: xx[2], y0: yy[2], x1: xx[3], y1: yy[3], next: seglist };
          } else throw new Error("contourLines: k = " + k + ", should be 2 or 4");
        }
        db[i + j * nx] = seglist;
      }
    }
    return db;
  }

  function addContourLines(x, nx, y, ny, zc, db, lines) {
    var i, j, ii, jj, ns, dir, seglist, seg, s, start, end, out = { seg: null };
    for (i = 0; i < nx - 1; i++) for (j = 0; j < ny - 1; j++) {
      while ((seglist = db[i + j * nx]) !== null) {
        var ij = [i, j];
        start = end = seglist;
        db[i + j * nx] = seglist.next;
        var xend = seglist.x1, yend = seglist.y1;
        while ((dir = ctrSegdir(xend, yend, x, y, ij, nx, ny))) {
          ii = ij[0]; jj = ij[1];
          db[ii + jj * nx] = ctrSegupdate(xend, yend, dir, true, db[ii + jj * nx], out);
          seg = out.seg;
          if (!seg) break;
          end.next = seg; end = seg;
          xend = end.x1; yend = end.y1;
        }
        end.next = null;
        ij[0] = i; ij[1] = j;
        xend = seglist.x0; yend = seglist.y0;
        while ((dir = ctrSegdir(xend, yend, x, y, ij, nx, ny))) {
          ii = ij[0]; jj = ij[1];
          db[ii + jj * nx] = ctrSegupdate(xend, yend, dir, false, db[ii + jj * nx], out);
          seg = out.seg;
          if (!seg) break;
          seg.next = start; start = seg;
          xend = start.x0; yend = start.y0;
        }
        s = start; ns = 0;
        while (s && ns < MAX_CONTOUR_SEGMENTS) { ns++; s = s.next; }
        var xs = new Array(ns + 1), ys = new Array(ns + 1);
        s = start; xs[0] = s.x0; ys[0] = s.y0; ns = 1;
        while (s.next && ns < MAX_CONTOUR_SEGMENTS) {
          s = s.next; xs[ns] = s.x0; ys[ns] = s.y0; ns++;
        }
        xs[ns] = s.x1; ys[ns] = s.y1;
        xs.length = ns + 1; ys.length = ns + 1;
        lines.push({ level: zc, x: xs, y: ys });
      }
    }
  }

  // grDevices::contourLines(x, y, z, levels). z column-major, nx = x.length.
  // Returns [] where R returns NULL (all z equal / all NA).
  function contourLines(x, y, z, levels) {
    var nx = x.length, ny = y.length, i;
    var zmin = DBL_MAX, zmax = DBL_MIN; // R-QUIRK 2: zmax starts at DBL_MIN, the
    // smallest positive normal, not -DBL_MAX. For an all-negative surface R
    // therefore keeps zmax = DBL_MIN and computes atom from that. Reproduced.
    for (i = 0; i < nx * ny; i++) if (isFin(z[i])) {
      if (zmax < z[i]) zmax = z[i];
      if (zmin > z[i]) zmin = z[i];
    }
    if (zmin >= zmax) return [];
    var atom = 1e-3 * (zmax - zmin);
    var lines = [];
    for (i = 0; i < levels.length; i++) {
      var db = segmentDBForLevel(x, nx, y, ny, z, levels[i], atom);
      addContourLines(x, nx, y, ny, levels[i], db, lines);
    }
    return lines;
  }

  /* ---------------------------------------------- stats::lm + summary.lm(y~x) */
  // Returns what metasens reads: nobs, intercept, slope, se.slope, adj.r.squared.
  function lmYX(xs, ys) {
    var n = xs.length, i, sx = 0, sy = 0;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / n, my = sy / n, Sxx = 0, Sxy = 0, Syy = 0, dx, dy;
    for (i = 0; i < n; i++) {
      dx = xs[i] - mx; dy = ys[i] - my;
      Sxx += dx * dx; Sxy += dx * dy; Syy += dy * dy;
    }
    if (!(Sxx > 0)) {
      // Constant x: R's lm drops the slope (rank deficient), so coef[2] is NA
      // and vcov has no second diagonal element, making se.slope NA too. The
      // rank then equals the intercept term, which takes summary.lm's OTHER
      // branch -- `r.squared <- adj.r.squared <- 0` -- rather than the
      // 1 - (1 - r2)(n - 1)/rdf formula. Found by probes lm case 2 and case 3.
      return { nobs: n, intercept: my, slope: NaN, seSlope: NaN,
               adjRSquared: 0 };
    }
    var slope = Sxy / Sxx, intercept = my - slope * mx;
    var mss = slope * Sxy;                 // = Sxy^2 / Sxx
    var rss = n === 2 ? 0 : Syy - mss;     // exactly determined for n = 2
    if (rss < 0) rss = 0;
    var rdf = n - 2;
    var rSquared = (mss + rss) > 0 ? mss / (mss + rss) : NaN;
    var adj = rdf > 0 ? 1 - (1 - rSquared) * ((n - 1) / rdf)
                      : (1 - rSquared) * ((n - 1) / rdf); // 0*Inf -> NaN, as in R
    if (rdf <= 0) adj = NaN;
    var sigma2 = rdf > 0 ? rss / rdf : NaN;
    var seSlope = rdf > 0 ? mSqrt(sigma2 / Sxx) : NaN;
    return { nobs: n, intercept: intercept, slope: slope, seSlope: seSlope,
             adjRSquared: adj };
  }

  // meta::metagen(..., method.tau.ci = "")$TE.common — inverse-variance pool.
  function commonEffect(y, se) {
    var sw = 0, swy = 0;
    for (var i = 0; i < y.length; i++) {
      var w = 1 / (se[i] * se[i]);
      sw += w; swy += w * y[i];
    }
    return swy / sw;
  }

  // meta:::ci(TE, seTE, level) with df = NULL (the normal case copas uses).
  function ci(TE, seTE, level) {
    var alpha = 1 - (level === undefined ? 0.95 : level);
    var zq = qnorm(1 - alpha / 2);
    var statistic = TE / seTE;
    return {
      lower: TE - zq * seTE, upper: TE + zq * seTE,
      statistic: statistic, p: 2 * pnorm(-mAbs(statistic))
    };
  }

  /* -------------------------------------- Copas likelihood and its gradient */

  // metasens:::copas.loglik.without.beta — the NEGATIVE log-likelihood.
  function loglikWithoutBeta(par, gamma, TE, seTE) {
    var mu = par[0], rho = par[1], tau = par[2], sum = 0;
    for (var i = 0; i < TE.length; i++) {
      var u = gamma[0] + gamma[1] / seTE[i], lam = lambda(u);
      var sigma2 = seTE[i] * seTE[i] / (1 - rho * rho * lam * (u + lam));
      var s2t2 = sigma2 + tau * tau;
      var rhoT = rho * mSqrt(sigma2) / mSqrt(s2t2);
      var v = (u + rhoT * (TE[i] - mu) / mSqrt(s2t2)) / mSqrt(1 - rhoT * rhoT);
      if (v < -37) v = -37;
      var d = TE[i] - mu;
      sum += -(-0.5 * mLog(s2t2) - d * d / (2 * s2t2) + mLog(pnorm(v)));
    }
    return sum;
  }

  // metasens:::copas.loglik.with.beta — four parameters (mu, rho, tau, beta).
  function loglikWithBeta(par, gamma, TE, seTE) {
    var mu = par[0], rho = par[1], tau = par[2], beta = par[3], sum = 0;
    for (var i = 0; i < TE.length; i++) {
      var u = gamma[0] + gamma[1] / seTE[i], lam = lambda(u);
      var sigma2 = seTE[i] * seTE[i] / (1 - rho * rho * lam * (u + lam));
      var s2t2 = sigma2 + tau * tau;
      var rhoT = rho * mSqrt(sigma2) / mSqrt(s2t2);
      var d = TE[i] - mu - beta * seTE[i];
      var v = (u + rhoT * d / mSqrt(s2t2)) / mSqrt(1 - rhoT * rhoT);
      if (v < -37) v = -37;
      sum += -(-0.5 * mLog(s2t2) - d * d / (2 * s2t2) + mLog(pnorm(v)));
    }
    return sum;
  }

  // metasens:::copas.gradient.without.beta — gradient of the NEGATIVE loglik.
  function gradientWithoutBeta(par, gamma, TE, seTE) {
    var mu = par[0], rho = par[1], tau = par[2];
    var rho2 = rho * rho, tau2 = tau * tau;
    var gm = 0, gr = 0, gt = 0;
    for (var i = 0; i < TE.length; i++) {
      var TEmu = TE[i] - mu, varTE = seTE[i] * seTE[i];
      var u = gamma[0] + gamma[1] / seTE[i], lam = lambda(u);
      var ci2 = lam * (u + lam);
      var sigma2 = varTE / (1 - rho2 * ci2);
      var sigma = mSqrt(sigma2);
      var s2t2 = sigma2 + tau2;
      var rhoT = rho * sigma / mSqrt(s2t2);
      var rho2T = rhoT * rhoT;
      var bottom = mSqrt(1 - rho2T);
      var top = u + rhoT * TEmu / mSqrt(s2t2);
      var vv = top / bottom; if (vv < -37) vv = -37;
      var lamv = lambda(vv);
      var gMu = TEmu / s2t2 - (rhoT / mSqrt(s2t2 * (1 - rho2T))) * lamv;
      var gRho = -ci2 * rho * sigma2 * sigma2 / (varTE * s2t2)
        + TEmu * TEmu * ci2 * rho * sigma2 * sigma2 / (varTE * s2t2 * s2t2);
      var diffTop = (top - u) / rho
        - (top - u) * rho * ci2 / (1 - ci2 * rho2)
        + 2 * (top - u) * rho * tau2 * ci2 / (varTE + tau2 * (1 - ci2 * rho2));
      var eta = varTE / (varTE + tau2 * (1 - ci2 * rho2));
      var diffBot = mPow(1 - rho2T, -1.5) * rho * eta
        * (1 + rho2 * tau2 * ci2 * eta / varTE);
      gRho += (top * diffBot + diffTop / bottom) * lamv;
      var gTau = -0.5 / s2t2 + 0.5 * TEmu * TEmu / (s2t2 * s2t2)
        + (-sigma * TEmu * rho / (bottom * s2t2 * s2t2)
           - 0.5 * top * mPow(1 - rho2T, -1.5) * sigma2 * rho2 / (s2t2 * s2t2)) * lamv;
      gTau = 2 * tau * gTau;
      gm += -gMu; gr += -gRho; gt += -gTau;
    }
    return [gm, gr, gt];
  }

  /* ------------------------------------------ box-constrained minimisation */
  // Projected Barzilai-Borwein descent with Armijo backtracking, then a bounded
  // Nelder-Mead polish. Note: this is NOT R's L-BFGS-B. R's optim stops on its
  // relative-reduction test (factr = 1e7, about 2.2e-9 in the objective) with
  // pgtol = 0, so metasens's reported parameters are not the exact constrained
  // optimum; this routine converges further. See PREREG.md Tier O: the page's
  // attained objective must be <= metasens's at every point.
  function clampTo(p, lower, upper) {
    var out = new Array(p.length);
    for (var i = 0; i < p.length; i++)
      out[i] = mMax(lower[i], mMin(upper[i], p[i]));
    return out;
  }

  function nelderMead(fn, x0, maxit) {
    var n = x0.length, a = 1, gc = 2, r = 0.5, sg = 0.5, i, j;
    var sx = [x0.slice()];
    for (i = 0; i < n; i++) {
      var p = x0.slice();
      p[i] += (p[i] !== 0 ? 0.05 * mAbs(p[i]) : 0.01);
      sx.push(p);
    }
    var fv = sx.map(fn);
    for (var iter = 0; iter < (maxit || 600); iter++) {
      var ord = fv.map(function (v, ix) { return ix; })
        .sort(function (ia, ib) { return fv[ia] - fv[ib]; });
      sx = ord.map(function (ix) { return sx[ix]; });
      fv = ord.map(function (ix) { return fv[ix]; });
      if (mAbs(fv[n] - fv[0]) < 1e-14 * (1 + mAbs(fv[0]))) break;
      var c = new Array(n).fill(0);
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += sx[i][j] / n;
      var xr = c.map(function (cj, jj) { return cj + a * (cj - sx[n][jj]); });
      var fr = fn(xr);
      if (fr < fv[0]) {
        var xe = c.map(function (cj, jj) { return cj + gc * (cj - sx[n][jj]); });
        var fe = fn(xe);
        if (fe < fr) { sx[n] = xe; fv[n] = fe; } else { sx[n] = xr; fv[n] = fr; }
      } else if (fr < fv[n - 1]) { sx[n] = xr; fv[n] = fr; }
      else {
        var xc = c.map(function (cj, jj) { return cj + r * (sx[n][jj] - cj); });
        var fc2 = fn(xc);
        if (fc2 < fv[n]) { sx[n] = xc; fv[n] = fc2; }
        else {
          for (i = 1; i <= n; i++) {
            sx[i] = sx[i].map(function (v, jj) { return sx[0][jj] + sg * (v - sx[0][jj]); });
            fv[i] = fn(sx[i]);
          }
        }
      }
    }
    var best = 0;
    for (i = 1; i <= n; i++) if (fv[i] < fv[best]) best = i;
    return sx[best];
  }

  // Projected Barzilai-Borwein descent with Armijo backtracking.
  function bbDescent(fn, gr, x0, f0, lower, upper) {
    var x = x0.slice(), f = f0, gprev = null, xprev = null, step = 1e-2, k, it, ls;
    for (it = 0; it < 2000; it++) {
      var g = gr(x);
      if (!g.every(isFin)) break;
      if (gprev) {
        var sy = 0, ss = 0;
        for (k = 0; k < x.length; k++) {
          var ds = x[k] - xprev[k], dg = g[k] - gprev[k];
          ss += ds * ds; sy += ds * dg;
        }
        if (sy > 1e-16) step = mMin(1e4, mMax(1e-12, ss / sy));
      }
      xprev = x.slice(); gprev = g.slice();
      var tt = step, improved = false;
      for (ls = 0; ls < 60; ls++) {
        var cand = clampTo(x.map(function (v, ix) { return v - tt * g[ix]; }), lower, upper);
        var fc = fn(cand);
        if (fc < f - 1e-17 * (1 + mAbs(f))) { x = cand; f = fc; improved = true; break; }
        tt *= 0.5;
      }
      if (!improved) break;
    }
    return { par: x, value: f };
  }

  // Coordinate pattern search on a shrinking step. Cheap, and it is what finally
  // pins down a solution sitting on an active bound, where the projected
  // gradient does not vanish and a gradient method can stall just short.
  function patternSearch(fn, x0, f0, lower, upper) {
    var x = x0.slice(), f = f0, n = x.length, i, s, improved;
    var h = new Array(n);
    for (i = 0; i < n; i++) h[i] = mMax(1e-4, mAbs(x[i]) * 1e-2);
    for (var round = 0; round < 80; round++) {
      improved = false;
      for (i = 0; i < n; i++) for (s = 0; s < 2; s++) {
        var cand = x.slice();
        cand[i] += (s === 0 ? h[i] : -h[i]);
        cand = clampTo(cand, lower, upper);
        if (cand[i] === x[i]) continue;
        var fc = fn(cand);
        if (fc < f) { x = cand; f = fc; improved = true; }
      }
      if (!improved) {
        var tiny = true;
        for (i = 0; i < n; i++) {
          h[i] *= 0.25;
          if (h[i] > 1e-15 * mMax(1, mAbs(x[i]))) tiny = false;
        }
        if (tiny) break;
      }
    }
    return { par: x, value: f };
  }

  function minimiseBox(fn, gr, start, lower, upper) {
    var x = clampTo(start.slice(), lower, upper);
    var f = fn(x);
    if (!isFin(f)) {
      // Nudge off an infeasible start the way a line search would.
      for (var t = 1; t <= 20 && !isFin(f); t++) {
        var y = x.slice();
        y[1] = y[1] / 2;
        x = clampTo(y, lower, upper); f = fn(x);
      }
    }
    var clamped = function (p) { return fn(clampTo(p, lower, upper)); };
    // Alternate gradient descent, a bounded Nelder-Mead polish and a coordinate
    // pattern search until a round stops paying. PREREG.md Tier O requires the
    // objective attained here never to be worse than the one metasens reports;
    // a single descent-then-polish pass stalls about 1e-9 short at some
    // bound-active points, which that check catches.
    for (var round = 0; round < 6; round++) {
      var f0 = f;
      var bb = bbDescent(fn, gr, x, f, lower, upper);
      if (bb.value < f) { x = bb.par; f = bb.value; }
      var nm = clampTo(nelderMead(clamped, x), lower, upper);
      var fnm = fn(nm);
      if (fnm < f) { x = nm; f = fnm; }
      var ps = patternSearch(fn, x, f, lower, upper);
      if (ps.value < f) { x = ps.par; f = ps.value; }
      if (!(f < f0 - 1e-16 * (1 + mAbs(f0)))) break;
    }
    return { par: x, value: fn(x) };
  }

  // R's optimhess (src/library/stats/src/optim.c): when optim() is given an
  // analytic gradient, hessian = TRUE differentiates THAT gradient by central
  // differences with eps = control$ndeps (default 1e-3), with fnscale =
  // parscale = 1 and — importantly — usebounds = 0, so the probe points are NOT
  // clamped back into the box. At an active bound (rho = +-rho.bound, tau = 0)
  // the +eps probe can therefore leave the feasible region and the gradient can
  // be NaN; that is exactly why metasens needs its seTE carry-forward chain.
  // Reproduced literally, including the final symmetrisation.
  function optimHess(gr, par, ndeps) {
    var n = par.length, i, j, eps = ndeps === undefined ? 1e-3 : ndeps;
    var H = [], dpar = par.slice();
    for (i = 0; i < n; i++) H.push(new Array(n).fill(0));
    for (i = 0; i < n; i++) {
      dpar[i] = dpar[i] + eps;
      var df1 = gr(dpar);
      dpar[i] = dpar[i] - 2 * eps;
      var df2 = gr(dpar);
      for (j = 0; j < n; j++) H[j][i] = (df1[j] - df2[j]) / (2 * eps);
      dpar[i] = dpar[i] + eps;
    }
    for (i = 0; i < n; i++) for (j = 0; j < i; j++) {
      var t = 0.5 * (H[i][j] + H[j][i]);
      H[i][j] = H[j][i] = t;
    }
    return H;
  }

  function solveFirstDiag(M) {
    // [0][0] element of the inverse of a symmetric n x n matrix, by Gauss-Jordan.
    var n = M.length, i, j, r, c;
    var A = [];
    for (i = 0; i < n; i++) {
      A.push(M[i].slice());
      for (j = 0; j < n; j++) A[i].push(i === j ? 1 : 0);
    }
    for (c = 0; c < n; c++) {
      var piv = c;
      for (r = c + 1; r < n; r++) if (mAbs(A[r][c]) > mAbs(A[piv][c])) piv = r;
      if (!(mAbs(A[piv][c]) > 0)) return NaN;
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      var d = A[c][c];
      for (j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (r = 0; r < n; r++) if (r !== c) {
        var m = A[r][c];
        if (m !== 0) for (j = 0; j < 2 * n; j++) A[r][j] -= m * A[c][j];
      }
    }
    return A[0][n];
  }

  /* --------------------------------------------------- the copas() pipeline */

  // Profile MLE over (mu, rho, tau) at a fixed (gamma0, gamma1).
  function profileMLE(TE, seTE, gamma, start, rhoBound) {
    var lower = [-Infinity, -rhoBound, 0], upper = [Infinity, rhoBound, Infinity];
    var fn = function (p) { return loglikWithoutBeta(p, gamma, TE, seTE); };
    var gr = function (p) { return gradientWithoutBeta(p, gamma, TE, seTE); };
    return minimiseBox(fn, gr, start, lower, upper);
  }

  // Egger's bias coefficient as meta::metabias(method = "Egger") reports it:
  // the coefficient on seTE in the WLS fit of TE on seTE with weights 1/seTE^2,
  // which equals the intercept of the OLS fit of TE/seTE on 1/seTE. Only its
  // SIGN is used (metasens's `left`).
  function eggerEstimate(TE, seTE) {
    var n = TE.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) {
      var xi = 1 / seTE[i], yi = TE[i] / seTE[i];
      sx += xi; sy += yi; sxx += xi * xi; sxy += xi * yi;
    }
    var det = n * sxx - sx * sx;
    return det !== 0 ? (sy * sxx - sx * sxy) / det : NaN;
  }

  /* Stage 3 of metasens::copas() after the per-contour regressions: the pooled
   * orthogonal-line slope, the x/y intersections, the rescaling back to gamma,
   * the in-range filter, the rev(order(publprob)) sort and the (10, 0)
   * no-selection anchor. Exposed separately so a validation run can feed it R's
   * OWN per-contour regressions instead of the page's.
   * opts: { regr, slope, gamma0, gamma1, gamma0Range, gamma1Range, seTEmax }
   */
  function orthogonalLine(opts) {
    var regr = opts.regr, nlev = regr.slopes.length, i;
    var gamma0 = opts.gamma0, gamma1 = opts.gamma1;
    var g0min = mMin.apply(null, gamma0), g0max = mMax.apply(null, gamma0);
    var g1min = mMin.apply(null, gamma1), g1max = mMax.apply(null, gamma1);
    var gamma0Range = opts.gamma0Range, gamma1Range = opts.gamma1Range;
    var seMax = opts.seTEmax;
    var slope = opts.slope, pooledCommon = NaN;
    if (slope === undefined || slope === null) {
      var ys = [], ses = [];
      for (i = 0; i < nlev; i++) if (regr.adj_r_squareds[i] > 0) {
        ys.push(regr.slopes[i]); ses.push(1 / mSqrt(regr.nobs[i]));
      }
      if (!ys.length) slope = NaN;
      else { pooledCommon = commonEffect(ys, ses); slope = -1 / pooledCommon; }
    }
    var xSlope = regr.intercepts.map(function (b0, ix) {
      return (1 - slope - b0) / (regr.slopes[ix] - slope);
    });
    var ySlope = xSlope.map(function (v) { return 1 + slope * (v - 1); });
    var g0slope = xSlope.map(function (v) { return v * (g0max - g0min) + g0min; });
    var g1slope = ySlope.map(function (v) { return v * (g1max - g1min) + g1min; });
    var xs = [], ys2 = [], g0s = [], g1s = [];
    for (i = 0; i < nlev; i++) {
      // NaN comparisons are false in both R and JS, so NaN rows drop here.
      var in0 = g0slope[i] >= mMin(gamma0Range[0], gamma0Range[1]) &&
                g0slope[i] <= mMax(gamma0Range[0], gamma0Range[1]);
      var in1 = g1slope[i] >= mMin(gamma1Range[0], gamma1Range[1]) &&
                g1slope[i] <= mMax(gamma1Range[0], gamma1Range[1]);
      if (in0 && in1) {
        xs.push(xSlope[i]); ys2.push(ySlope[i]);
        g0s.push(g0slope[i]); g1s.push(g1slope[i]);
      }
    }
    // rev(order(pnorm(g0 + g1/seTE.max))): R's order is ascending and stable, so
    // rev() puts later ties first.
    var ord1 = revOrder(g0s.map(function (v, ix) { return pnorm(v + g1s[ix] / seMax); }));
    xs = pick(xs, ord1); ys2 = pick(ys2, ord1);
    g0s = pick(g0s, ord1); g1s = pick(g1s, ord1);
    g0s = [10].concat(g0s);                      // the no-selection anchor
    g1s = [0].concat(g1s);
    var sel2 = xs.map(function (v, ix) { return !isNan(v) && !isNan(ys2[ix]); });
    xs = xs.filter(function (v, ix) { return sel2[ix]; });
    ys2 = ys2.filter(function (v, ix) { return sel2[ix]; });
    var g0f = [], g1f = [];
    for (i = 0; i < g0s.length; i++)
      if (!isNan(g0s[i]) && !isNan(g1s[i])) { g0f.push(g0s[i]); g1f.push(g1s[i]); }
    return {
      slope: slope, pooledCommon: pooledCommon,
      xSlopeAll: xSlope, ySlopeAll: ySlope,
      gamma0SlopeAll: g0slope, gamma1SlopeAll: g1slope,
      xSlope: xs, ySlope: ys2, gamma0Slope: g0f, gamma1Slope: g1f,
      publprob: g0f.map(function (v, ix) { return pnorm(v + g1f[ix] / seMax); })
    };
  }

  /* metasens's TE.adjust selection rule, applied to the ORDERED pval.rsb.
   * Returns the 1-based index metasens would select, or null when it withholds
   * the adjusted estimate (every point significant). */
  function adjustSelection(pvalRsbOrdered, signRsb) {
    var cum = 0, diffs = [], i;
    for (i = 0; i < pvalRsbOrdered.length; i++) {
      if (pvalRsbOrdered[i] <= signRsb) cum++;
      diffs.push((i + 1) - cum);
    }
    if (diffs.every(function (v) { return v === 0; })) return null;
    if (diffs.some(function (v) { return v === 0; })) {
      for (i = 0; i < diffs.length; i++) if (diffs[i] > 0) return i + 1;
    }
    return 1;
  }

  /* Full port of metasens::copas().
   * opts: { TE, seTE, TE_random, seTE_random, tau, ngrid, nlevels, levels,
   *         slope, left, rho_bound, sign_rsb, level_ma, gamma0_range,
   *         gamma1_range, TE_contour }
   * TE_random / seTE_random / tau are the metagen() values (the optimiser start);
   * when omitted a DerSimonian-Laird pool is used (closed form).
   *
   * TE_contour is a VALIDATION hook, never used by the page: supply R's own
   * ngrid x ngrid contour surface (column-major, as R's matrix) and stage 2's
   * grid of profile MLEs is skipped, so stages 3-5 run on exactly the surface
   * metasens had. It exists because contourLines() level crossing is a
   * discontinuous function of the surface: once the two surfaces differ at a
   * single stalled grid point they do not have the same contour lines, and the
   * adjusted estimate built on top of them cannot be compared like for like.
   * With the surface pinned, TE.adjust CAN be compared with metasens in every
   * configuration -- including the ngrid = 20 REML one the app ships. The
   * result then reports TE_contour_supplied: true and contour_par: null, so a
   * caller cannot mistake an injected surface for a computed one, nor an empty
   * list of per-point fits for "every point converged".
   *
   * Does NOT return null on unusable input; it returns a truthy object with a
   * `refused` string and no estimates -- { refused, k, dropped } -- so test
   * `if (!result || result.refused)`, never `if (!result)`. The refusal
   * reasons are "k<3", "seTE.min==seTE.max", "seTE.near-degenerate" and
   * "orthogonal-line.empty".
   */
  function copas(opts) {
    var TE = [], seTE = [], i, j;
    for (i = 0; i < opts.TE.length; i++)
      if (isFin(opts.TE[i]) && isFin(opts.seTE[i])) { TE.push(opts.TE[i]); seTE.push(opts.seTE[i]); }
    var k = TE.length;
    var ngrid = opts.ngrid || 20, nlevels = opts.nlevels || 10;
    var rhoBound = opts.rho_bound === undefined ? 0.9999 : opts.rho_bound;
    var signRsb = opts.sign_rsb === undefined ? 0.1 : opts.sign_rsb;
    var levelMa = opts.level_ma === undefined ? 0.95 : opts.level_ma;
    var dropped = opts.TE.length - k;

    if (k < 3) return { refused: "k<3", k: k, dropped: dropped };
    var seMin = Math.min.apply(null, seTE), seMax = Math.max.apply(null, seTE);
    if (!(seMin < seMax)) return { refused: "seTE.min==seTE.max", k: k, dropped: dropped };

    var TErandom, seTErandom, tau;
    if (typeof opts.TE_random === "number") {
      TErandom = opts.TE_random; seTErandom = opts.seTE_random; tau = opts.tau;
    } else {
      var vi = seTE.map(function (s) { return s * s; });
      var t2 = 0;
      var sw0 = 0, sw0y = 0, sw0sq = 0;
      for (i = 0; i < k; i++) { var w0 = 1 / vi[i]; sw0 += w0; sw0y += w0 * TE[i]; sw0sq += w0 * w0; }
      var mu0 = sw0y / sw0, Q = 0;
      for (i = 0; i < k; i++) Q += (1 / vi[i]) * (TE[i] - mu0) * (TE[i] - mu0);
      t2 = mMax(0, (Q - (k - 1)) / (sw0 - sw0sq / sw0));
      var sw = 0, swy = 0;
      for (i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; swy += w * TE[i]; }
      TErandom = swy / sw; seTErandom = mSqrt(1 / sw); tau = mSqrt(t2);
    }

    // stage 1 — gamma grids
    var gamma1Range = opts.gamma1_range ||
      [0, 1.29 / (1 / seMin - 1 / seMax)];
    var gamma0Range = opts.gamma0_range ||
      [-0.25 - gamma1Range[1] / seMax, 2];
    var gamma0 = seqLen(gamma0Range[0], gamma0Range[1], ngrid);
    var gamma1 = seqLen(gamma1Range[0], gamma1Range[1], ngrid);
    var g0min = Math.min.apply(null, gamma0), g0max = Math.max.apply(null, gamma0);
    var g1min = Math.min.apply(null, gamma1), g1max = Math.max.apply(null, gamma1);

    var eggerEst = eggerEstimate(TE, seTE);
    var left = (opts.left === undefined || opts.left === null)
      ? mSign(eggerEst) === 1 : !!opts.left;
    var rho0 = left ? rhoBound / 2 : -rhoBound / 2;
    var start = [TErandom, rho0, tau];

    // stage 2 — contour surface (column-major, as R's matrix)
    var TEcontour = new Float64Array(ngrid * ngrid);
    var contourPar = [];
    var supplied = !!opts.TE_contour;
    if (supplied) {
      if (opts.TE_contour.length !== ngrid * ngrid)
        return { refused: "TE_contour.length!=ngrid^2", k: k, dropped: dropped };
      for (i = 0; i < ngrid * ngrid; i++) TEcontour[i] = opts.TE_contour[i];
      contourPar = null;
    } else {
      for (i = 0; i < ngrid; i++) for (j = 0; j < ngrid; j++) {
        var fit0 = profileMLE(TE, seTE, [gamma0[i], gamma1[j]], start, rhoBound);
        TEcontour[i + j * ngrid] = fit0.par[0];
        contourPar.push({ i: i, j: j, par: fit0.par, value: fit0.value });
      }
    }

    // stage 3 — approximate orthogonal line
    var g0res = gamma0.map(function (v) { return (v - g0min) / (g0max - g0min); });
    var g1res = gamma1.map(function (v) { return (v - g1min) / (g1max - g1min); });
    var prettyLevels = rPretty(Array.prototype.slice.call(TEcontour), nlevels);
    var useLevels = opts.levels || prettyLevels;
    var cl = contourLines(g0res, g1res, TEcontour, useLevels);
    var nlev = cl.length;
    var regr = { levels: [], nobs: [], adj_r_squareds: [], slopes: [],
                 se_slopes: [], intercepts: [] };
    for (i = 0; i < nlev; i++) {
      var fitlm = lmYX(cl[i].x, cl[i].y);
      regr.levels.push(cl[i].level);
      regr.nobs.push(fitlm.nobs);
      regr.adj_r_squareds.push(isNan(fitlm.adjRSquared) ? -100 : fitlm.adjRSquared);
      regr.slopes.push(fitlm.slope);
      regr.se_slopes.push(fitlm.seSlope);
      regr.intercepts.push(fitlm.intercept);
    }
    var selR = regr.adj_r_squareds.map(function (v) { return v > 0; });
    var ol = orthogonalLine({
      regr: regr, slope: opts.slope, gamma0: gamma0, gamma1: gamma1,
      gamma0Range: gamma0Range, gamma1Range: gamma1Range, seTEmax: seMax
    });
    var slope = ol.slope, pooledCommon = ol.pooledCommon;
    var xs = ol.xSlope, ys2 = ol.ySlope, g0s = ol.gamma0Slope, g1s = ol.gamma1Slope;
    var ng = g0s.length;
    var publprob = ol.publprob;

    // stage 4 — estimates down the line
    var TEslope = [], seTEslope = [], rhoSlope = [], tauSlope = [], loglik1 = [];
    var seTEhessian = [], par1 = [];
    for (i = 0; i < ng; i++) {
      var g = [g0s[i], g1s[i]];
      var f1 = profileMLE(TE, seTE, g, start, rhoBound);
      TEslope.push(f1.par[0]); rhoSlope.push(f1.par[1]); tauSlope.push(f1.par[2]);
      loglik1.push(f1.value); par1.push(f1.par.slice());
      var H = optimHess(function (p) { return gradientWithoutBeta(p, g, TE, seTE); }, f1.par);
      // +1e-8 on EVERY element, not just the diagonal. This is metasens's own
      // regularisation: `solve(junk2$hessian + 1e-08)` in the copas() source,
      // where R's recycling adds the scalar to all n^2 entries. It looks like a
      // fudge and is numerically meaningful, so the provenance stays in the
      // code: it is faithful, not invented here.
      var Hreg = H.map(function (row) { return row.map(function (v) { return v + 1e-8; }); });
      var inv00 = solveFirstDiag(Hreg);
      var se = inv00 > 0 ? mSqrt(inv00) : NaN;
      seTEhessian.push(se);
      // metasens's carry-forward chain (copas source lines 240-247).
      if (i > 0 && (isNan(se) || se === 0)) se = seTEslope[i - 1];
      if (isNan(se) || se === 0) se = H[0][0] > 0 ? mSqrt(1 / H[0][0]) : NaN;
      seTEslope.push(se);
    }

    // stage 5 — residual selection bias and the adjusted estimate
    var rhoLim = left ? [0, rhoBound] : [-rhoBound, 0];
    var loglik2 = [], par2 = [];
    for (i = 0; i < ng; i++) {
      var gg = [g0s[i], g1s[i]];
      var fnb = function (p) { return loglikWithBeta(p, gg, TE, seTE); };
      var grb = function (p) { return numGrad(fnb, p); };
      var f3 = minimiseBox(fnb, grb, [TErandom, rho0, tau, 0],
                           [-Infinity, rhoLim[0], 0, -Infinity],
                           [Infinity, rhoLim[1], Infinity, Infinity]);
      loglik2.push(f3.value); par2.push(f3.par.slice());
    }
    var pvalRsb = loglik1.map(function (l1, ix) {
      return pchisq1Upper(2 * (l1 - loglik2[ix]));
    });

    var Nunpubl = [];
    for (i = 0; i < ng; i++) {
      var s2 = 0;
      for (j = 0; j < k; j++) {
        var psi = pnorm(g0s[i] + g1s[i] / seTE[j]);
        s2 += (1 - psi) / psi;
      }
      Nunpubl.push(s2);
    }

    var ord2 = revOrder(publprob);
    var publprobO = pick(publprob, ord2);
    var TEslopeO = pick(TEslope, ord2), seTEslopeO = pick(seTEslope, ord2);
    var rhoSlopeO = pick(rhoSlope, ord2), tauSlopeO = pick(tauSlope, ord2);
    var pvalRsbO = pick(pvalRsb, ord2), NunpublO = pick(Nunpubl, ord2);
    var ciSlope = TEslopeO.map(function (v, ix) { return ci(v, seTEslopeO[ix], levelMa); });

    var selAdj = adjustSelection(pvalRsbO, signRsb);
    var TEadj = NaN, seTEadj = NaN, pvalRsbAdj = NaN, NunpublAdj = NaN, tauAdj = NaN;
    if (selAdj !== null) {
      TEadj = TEslopeO[selAdj - 1]; seTEadj = seTEslopeO[selAdj - 1];
      pvalRsbAdj = pvalRsbO[selAdj - 1]; NunpublAdj = NunpublO[selAdj - 1];
      tauAdj = tauSlopeO[selAdj - 1];
    }
    var ciAdjust = ci(TEadj, seTEadj, levelMa);

    return {
      _schema: "copas-core-v1",
      k: k, dropped: dropped, TE: TE, seTE: seTE,
      TE_random: TErandom, seTE_random: seTErandom, tau: tau,
      egger_estimate1: eggerEst, left: left, rho0: rho0, rho_bound: rhoBound,
      sign_rsb: signRsb, level_ma: levelMa, ngrid: ngrid, nlevels_arg: nlevels,
      seTE_min: seMin, seTE_max: seMax,
      gamma0_range: gamma0Range, gamma1_range: gamma1Range,
      gamma0: gamma0, gamma1: gamma1,
      gamma0_rescale: g0res, gamma1_rescale: g1res,
      TE_contour: Array.prototype.slice.call(TEcontour),
      TE_contour_supplied: supplied,
      contour_par: contourPar,
      pretty_levels: prettyLevels,
      contour_lines: cl.map(function (c) { return { level: c.level, x: c.x, y: c.y }; }),
      regr: regr, sel_r: selR,
      slope_pooled_TE_common: pooledCommon, slope: slope,
      x_slope: xs, y_slope: ys2,
      gamma0_slope: g0s, gamma1_slope: g1s,
      publprob_unord: publprob, publprob: publprobO,
      TE_slope: TEslopeO, seTE_slope: seTEslopeO,
      rho_slope: rhoSlopeO, tau_slope: tauSlopeO,
      TE_slope_unord: TEslope, seTE_slope_unord: seTEslope,
      rho_slope_unord: rhoSlope, tau_slope_unord: tauSlope,
      seTE_hessian: seTEhessian,
      loglik1: loglik1, loglik2: loglik2,
      par_without_beta: par1, par_with_beta: par2,
      pval_rsb: pvalRsbO, pval_rsb_unord: pvalRsb,
      N_unpubl: NunpublO, N_unpubl_unord: Nunpubl,
      lower_slope: ciSlope.map(function (c) { return c.lower; }),
      upper_slope: ciSlope.map(function (c) { return c.upper; }),
      statistic_slope: ciSlope.map(function (c) { return c.statistic; }),
      pval_slope: ciSlope.map(function (c) { return c.p; }),
      sel_adj: selAdj,
      TE_adjust: TEadj, seTE_adjust: seTEadj, tau_adjust: tauAdj,
      pval_rsb_adj: pvalRsbAdj, N_unpubl_adj: NunpublAdj,
      lower_adjust: ciAdjust.lower, upper_adjust: ciAdjust.upper,
      statistic_adjust: ciAdjust.statistic, pval_adjust: ciAdjust.p
    };
  }

  function numGrad(fn, x) {
    var n = x.length, g = new Array(n), h, i;
    for (i = 0; i < n; i++) {
      h = 1e-7 * mMax(1, mAbs(x[i]));
      var a = x.slice(), b = x.slice();
      a[i] += h; b[i] -= h;
      g[i] = (fn(a) - fn(b)) / (2 * h);
    }
    return g;
  }

  // R's order() is ascending and stable; rev() then reverses, so equal keys come
  // out in reverse input order. NaN keys are placed last by order() and so come
  // FIRST after rev().
  function revOrder(key) {
    var idx = [], nanIdx = [], i;
    for (i = 0; i < key.length; i++) (isNan(key[i]) ? nanIdx : idx).push(i);
    idx.sort(function (a, b) { return key[a] - key[b] || a - b; });
    var all = idx.concat(nanIdx);
    all.reverse();
    return all;
  }

  function pick(arr, ord) { return ord.map(function (i) { return arr[i]; }); }

  var api = {
    pnorm: pnorm, dnorm: dnorm, qnorm: qnorm, pchisq1Upper: pchisq1Upper,
    lambda: lambda, seqLen: seqLen,
    rPrettyCore: rPrettyCore, rPretty: rPretty, contourLines: contourLines,
    lmYX: lmYX, commonEffect: commonEffect, ci: ci,
    loglikWithoutBeta: loglikWithoutBeta, loglikWithBeta: loglikWithBeta,
    gradientWithoutBeta: gradientWithoutBeta,
    profileMLE: profileMLE, minimiseBox: minimiseBox, optimHess: optimHess,
    solveFirstDiag: solveFirstDiag, numGrad: numGrad,
    eggerEstimate: eggerEstimate, revOrder: revOrder,
    orthogonalLine: orthogonalLine, adjustSelection: adjustSelection,
    copas: copas
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmCopasCore = api;
})(typeof window !== "undefined" ? window : globalThis);
