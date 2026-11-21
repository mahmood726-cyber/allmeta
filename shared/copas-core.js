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
 * The optimiser IS R's. Every fit copas() makes goes through
 * optim(method = "L-BFGS-B") with its default control, so this module carries
 * a transliteration of R's L-BFGS-B (lbfgsb.c and its driver, LINPACK and
 * BLAS pieces, and optim()'s own finite-difference gradient for the
 * four-parameter fit, which metasens gives no analytic gradient). The
 * likelihoods are evaluated in R's operation order with R's own pnorm/dnorm
 * and a long-double-equivalent sum, and the REML start value is metafor's
 * Fisher-scoring stopping point rather than the exact REML optimum. Given the
 * same bits the optimiser takes the same steps, so the page stops where
 * metasens stops instead of somewhere "better" -- which is what makes contour
 * lines, the orthogonal line and the adjusted estimate agree with metasens.
 *
 * Also reproduced: copas() wraps each optim() in try() and, when a fit throws,
 * leaves the PREVIOUS fit's object in place, so TE.contour[i, j] (and the
 * orthogonal-line estimates) silently take the previous point's values. The
 * port does the same and counts every such point (optim_try_failures), which
 * metasens does not report.
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
  // exp and log are NOT Math.exp/Math.log: they are the correctly rounded
  // crExp/crLog defined just below (function declarations, so hoisted; their
  // tables are built before anything in this module can call them). mPow stays
  // Math.pow for the exact powers of two and ten it is used for; the one
  // non-trivial power on the likelihood path, (1 - rho2T)^-1.5, calls crPow.
  var mExp = crExp, mSqrt = Math.sqrt, mLog = crLog, mLog10 = Math.log10,
      mAbs = Math.abs, mPow = Math.pow, mMin = Math.min, mMax = Math.max,
      mFloor = Math.floor, mCeil = Math.ceil, mTrunc = Math.trunc,
      mSign = Math.sign, isFin = isFinite, isNan = isNaN;

  /* ------------------------------------- correctly rounded exp, log, pow */
  // V8's Math.exp/log are faithful (< 1 ulp) but NOT correctly rounded: on
  // arguments from the likelihood's ranges they differ from the correctly
  // rounded value in 7.2% (exp) and 3.7% (log) of calls. R 4.6.0 on Windows
  // (mingw-w64's x87-based libm; x^y is powl) is far closer -- 0.23% (exp),
  // 0.05% (log), 1.5% (x^-1.5) -- and L-BFGS-B turns a one-ulp difference in
  // f or g into a different path, so the page stopped where metasens did not.
  // R's own residual is not reproducible from first principles (it depends on
  // the x87 transcendental instructions), so the target is the correctly
  // rounded value; copas/tests/crmath.test.mjs pins how often R misses it.
  // These return the correctly rounded (round-to-nearest-even) result.
  //
  // Method (Ziv): a fast double-double evaluation with a stated relative error
  // bound, then a rounding test that proves the bound cannot straddle a
  // rounding boundary; if it might, an exact BigInt fixed-point evaluation
  // with rigorous error bounds is repeated at rising precision until it can
  // decide. The fast path decides all but ~1 in 10^7 calls. The tables are
  // computed here, at load, by that same BigInt code -- nothing is hand-typed.
  //   exp: x = k ln2/1024 + r, |r| <= ln2/2048, 2^(j/1024) from a 1024-entry
  //        double-double table, expm1(r) to degree 6 (truncation 2^-93);
  //        evaluation error < 2^-86, bound used 2^-80.
  //   log: x = 2^e m, m in (sqrt(1/2), sqrt(2)], r = m c_i - 1 exact,
  //        |r| <= 2^-9, log1p(r) to degree 10 (truncation 2^-93); r and r^2
  //        in double-double, the rest in double: error < 2^-71.5, bound 2^-70
  //        (pow uses an r^3/3-in-double-double variant: < 2^-80, bound 2^-81.5).
  //   pow: exp(y log x) in double-double; bound 2^-80 + |y log x| 2^-81.5.
  //        R's own special cases (R_pow, src/main/arithmetic.c) are kept:
  //        1^y = x^0 = 1 (also for NaN), x^2 = x*x, 0^y, infinities.
  // Each fast path's measured error is asserted by crmath.test.mjs against
  // the BigInt evaluation, and the results against 3,000,000+ reference
  // values and against R 4.6.0's own exp/log/^ (crmath fixture).
  // Globals captured once (see the note on mExp above: the validation harness
  // proxies the global object, so each Math.x / BigInt lookup is a trap).
  var crRound = Math.round, crFloor = Math.floor, crMax = Math.max, CR_LN2D = Math.LN2,
      crPow2f = function (e) { return Math.pow(2, e); }, crBI = BigInt, crNum = Number;
  var CR_INF = 1 / 0, CR_NAN = 0 / 0; // the identifiers Infinity / NaN are global lookups too
  var CRM_SPLIT = 134217729; // 2^27 + 1, Dekker
  var crE = 0; // error word of the last twoProd (avoids allocating pairs)
  function crTwoProd(a, b) {
    var p = a * b;
    var t = CRM_SPLIT * a, ah = t - (t - a), al = a - ah;
    t = CRM_SPLIT * b; var bh = t - (t - b), bl = b - bh;
    crE = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    return p;
  }
  var crF64 = new Float64Array(1), crU32 = new Uint32Array(crF64.buffer);
  crF64[0] = 1; var CR_HI = crU32[1] === 0x3ff00000 ? 1 : 0;
  var CR_POW2 = new Float64Array(2100); // CR_POW2[p + 1074] = 2^p, p in [-1074, 1025)
  (function () { var v = 5e-324; for (var i = 0; i < 2100; i++) { CR_POW2[i] = v; v *= 2; } })();
  function crLdexp(n, p) { // n * 2^p, exact whenever the result is representable
    if (p >= -1022) {
      if (p > 1000) return n * CR_POW2[1000 + 1074] * CR_POW2[p - 1000 + 1074];
      return n * CR_POW2[p + 1074];
    }
    return n * CR_POW2[p + 52 + 1074] * CR_POW2[-52 + 1074];
  }

  // ---- exact BigInt fixed point (reference / fallback / table builder) ----
  var crDV = new DataView(new ArrayBuffer(8));
  function crDecomp(x) { // |x| = m 2^ex exactly (x finite, nonzero)
    crDV.setFloat64(0, x);
    var hi = crDV.getUint32(0), lo = crDV.getUint32(4), be = (hi >>> 20) & 0x7ff;
    var m = (crBI(hi & 0xfffff) << 32n) | crBI(lo);
    if (be === 0) return { neg: hi >>> 31 === 1, m: m, ex: -1074 };
    return { neg: hi >>> 31 === 1, m: m | (1n << 52n), ex: be - 1075 };
  }
  function crBitLen(v) { return v.toString(2).length; } // v > 0
  function crToFixed(x, Q) { // trunc(x 2^Q), error < 1 unit
    if (x === 0) return 0n;
    var d = crDecomp(x), s = d.ex + Q;
    var v = s >= 0 ? d.m << crBI(s) : d.m >> crBI(-s);
    return d.neg ? -v : v;
  }
  // V 2^s rounded to the nearest double, ties to even; subnormals and
  // overflow (to Infinity) included.
  function crBigRound(V, s) {
    if (V === 0n) return 0;
    var neg = V < 0n; if (neg) V = -V;
    var top = crBitLen(V) - 1 + s, r;
    if (top > 1023) r = CR_INF;
    else {
      var lsb = crMax(top - 52, -1074), sh = lsb - s, q;
      if (sh <= 0) q = V << crBI(-sh);
      else {
        q = V >> crBI(sh);
        var rem = V - (q << crBI(sh)), half = 1n << crBI(sh - 1);
        if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
      }
      r = crLdexp(crNum(q), lsb);
    }
    return neg ? -r : r;
  }
  function crAbsBig(v) { return v < 0n ? -v : v; }
  // ln 2 2^Q, error <= 2 units: 2 atanh(1/3) at Q + 24 bits, then shifted.
  var crLn2Cache = {};
  function crLn2(Q) {
    if (crLn2Cache[Q] !== undefined) return crLn2Cache[Q];
    var W = crBI(Q + 24), one = 1n << W, t = one / 3n, t2 = (t * t) >> W, s = 0n, term = t, n = 1n;
    while (term !== 0n) { s += term / n; term = (term * t2) >> W; n += 2n; }
    var v = (2n * s) >> 24n;
    crLn2Cache[Q] = v; return v;
  }
  // exp(z), z = Z 2^-Q with |error| <= Ez units. Returns [S, E, k]:
  // exp(z) lies in [(S - E) 2^(k-Q), (S + E) 2^(k-Q)].
  function crBigExpZ(Z, Q, Ez) {
    var Qb = crBI(Q), LN2 = crLn2(Q);
    var zd = crNum(Z >> crBI(Q - 60)) / 1152921504606846976; // 2^60
    var k = crRound(zd / CR_LN2D), kb = crBI(k);
    var R = Z - kb * LN2;                                  // |R| < 0.35 * 2^Q
    var errR = Ez + 2n * crAbsBig(kb) + 1n;
    var one = 1n << Qb, S = one, T = one, n = 1n, nt = 0n;
    while (T !== 0n) { T = ((T * R) >> Qb) / n; S += T; n += 1n; nt += 1n; }
    return [S, 4n * nt + 8n + 2n * errR, k];
  }
  // log(x) 2^Q for finite x > 0. Returns [L, E]: log x in [(L-E) 2^-Q, (L+E) 2^-Q].
  function crBigLogFixed(x, Q) {
    var d = crDecomp(x), bl = crBitLen(d.m), e = d.ex + bl - 1, Qb = crBI(Q);
    var one = 1n << Qb, M = d.m << crBI(Q - bl + 1);     // [1, 2) 2^Q, exact
    if (M > (3n * one) / 2n) { M >>= 1n; e += 1; }          // [0.75, 1.5] 2^Q, exact
    var t = ((M - one) << Qb) / (M + one);                  // |t| <= 0.2, error < 1
    var t2 = (t * t) >> Qb, s = 0n, term = t, n = 1n, nt = 0n; // t2 >= 0
    // (term * t2) / one truncates toward zero, so a negative term reaches 0n.
    while (term !== 0n) { s += term / n; term = (term * t2) / one; n += 2n; nt += 1n; }
    var eb = crBI(e);
    return [2n * s + eb * crLn2(Q), 2n * (3n * nt + 4n) + 2n * crAbsBig(eb) + 2n];
  }
  var CR_PRECS = [128, 256, 512, 1024, 2048];
  var crStats = { expFallback: 0, logFallback: 0, powFallback: 0, undecided: 0 };
  // Both ends of the error interval round to the same double -> that double is
  // the correctly rounded result. If even 2048 bits cannot decide, the value is
  // an exact midpoint (only possible for pow): round half to even.
  function crDecide(lo, hi) {
    crStats.undecided++;
    var f = crDecomp(lo); return (f.m & 1n) === 0n ? lo : hi;
  }
  function crBigExp(x) {
    var lo, hi;
    for (var i = 0; i < CR_PRECS.length; i++) {
      var Q = CR_PRECS[i] + 64, r = crBigExpZ(crToFixed(x, Q), Q, 1n);
      lo = crBigRound(r[0] - r[1], r[2] - Q); hi = crBigRound(r[0] + r[1], r[2] - Q);
      if (lo === hi) return lo;
    }
    return crDecide(lo, hi);
  }
  function crBigLog(x) {
    var lo, hi;
    for (var i = 0; i < CR_PRECS.length; i++) {
      var Q = CR_PRECS[i] + 64, r = crBigLogFixed(x, Q);
      lo = crBigRound(r[0] - r[1], -Q); hi = crBigRound(r[0] + r[1], -Q);
      if (lo === hi) return lo;
    }
    return crDecide(lo, hi);
  }
  // x > 0 finite, x != 1; y finite, y != 0.
  function crBigPow(x, y) {
    var dy = crDecomp(y), lo, hi;
    var extra = crMax(0, dy.ex + crBitLen(dy.m));         // log2 |y|, rounded up
    for (var i = 0; i < CR_PRECS.length; i++) {
      var Q = CR_PRECS[i] + 64 + extra, r = crBigLogFixed(x, Q), Z, Ez;
      var my = dy.neg ? -dy.m : dy.m;
      if (dy.ex >= 0) { Z = (r[0] * my) << crBI(dy.ex); Ez = (r[1] * dy.m) << crBI(dy.ex); }
      else { Z = (r[0] * my) >> crBI(-dy.ex); Ez = ((r[1] * dy.m) >> crBI(-dy.ex)) + 2n; }
      var lim = 746n << crBI(Q);
      if (Z > lim) return CR_INF;
      if (Z < -lim) return 0;
      var e = crBigExpZ(Z, Q, Ez);
      lo = crBigRound(e[0] - e[1], e[2] - Q); hi = crBigRound(e[0] + e[1], e[2] - Q);
      if (lo === hi) return lo;
    }
    return crDecide(lo, hi);
  }

  // ---- tables and constants, from the BigInt code above ----
  function crSplitDD(V, Q) { // V 2^-Q as hi + lo (each rounded to nearest)
    var h = crBigRound(V, -Q); return [h, crBigRound(V - crToFixed(h, Q), -Q)];
  }
  var CR_Q0 = 160;
  var CR_EXP_TH = new Float64Array(1024), CR_EXP_TL = new Float64Array(1024);
  var CR_L1, CR_L2, CR_L3, CR_LN2H, CR_LN2M, CR_LN2L, CR_THIRD_H, CR_THIRD_L;
  var CR_LOG_C = new Float64Array(363), CR_LOG_TH = new Float64Array(363), CR_LOG_TL = new Float64Array(363);
  function crTopBits(v, n) { var b = crBitLen(v) - n; return b > 0 ? (v >> crBI(b)) << crBI(b) : v; }
  (function () {
    var Q = CR_Q0, Qx = Q + 16, LN2 = crLn2(Qx), Qb = crBI(Q), j, dd, r;
    // 2^(j/1024) = 2^(j1/32) 2^(j2/1024): 64 BigInt exps, then exact products
    var F1 = [], F2 = [];
    for (j = 0; j < 32; j++) {
      r = crBigExpZ((crBI(j) * LN2) >> 21n, Q, 2n); F1.push(r[0] << crBI(r[2]));
      r = crBigExpZ((crBI(j) * LN2) >> 26n, Q, 2n); F2.push(r[0] << crBI(r[2]));
    }
    for (j = 0; j < 1024; j++) {
      dd = crSplitDD((F1[j >> 5] * F2[j & 31]) >> Qb, Q); CR_EXP_TH[j] = dd[0]; CR_EXP_TL[j] = dd[1];
    }
    // ln2/1024 = L1 + L2 + L3, L1 and L2 of 32 bits: k*L1, k*L2 exact for |k| < 2^21
    var l = LN2 >> 10n, v1 = crTopBits(l, 32), v2 = crTopBits(l - v1, 32);
    CR_L1 = crBigRound(v1, -Qx); CR_L2 = crBigRound(v2, -Qx); CR_L3 = crBigRound(l - v1 - v2, -Qx);
    // ln2 = H + M + L, H and M of 42 bits: e*H, e*M exact for |e| < 2^11
    v1 = crTopBits(LN2, 42); v2 = crTopBits(LN2 - v1, 42);
    CR_LN2H = crBigRound(v1, -Qx); CR_LN2M = crBigRound(v2, -Qx); CR_LN2L = crBigRound(LN2 - v1 - v2, -Qx);
    dd = crSplitDD((1n << Qb) / 3n, Q); CR_THIRD_H = dd[0]; CR_THIRD_L = dd[1];
    for (var i = 362; i <= 724; i++) {        // c_i ~ 1/m on [i/512, (i+1)/512)
      var c = (i === 511 || i === 512) ? 1 : 512 / (i + 0.5);
      CR_LOG_C[i - 362] = c;
      if (c === 1) { CR_LOG_TH[i - 362] = 0; CR_LOG_TL[i - 362] = 0; continue; }
      var L = crBigLogFixed(c, Q);            // -log c
      dd = crSplitDD(-L[0], Q); CR_LOG_TH[i - 362] = dd[0]; CR_LOG_TL[i - 362] = dd[1];
    }
  })();
  var CR_INV_L1024 = 1477.3197218702985; // 1024/ln2 (any nearby value works)
  var CR_EXP_EPS2 = 2 * crPow2f(-80), CR_LOG_EPS2 = 2 * crPow2f(-70);
  var CR_POW_EPS2A = 2 * crPow2f(-80), CR_POW_EPS2B = 2 * crPow2f(-79);

  var crH = 0, crL = 0, crK = 0; // double-double result h + l, times 2^crK
  // exp(xh + xl) in double-double, -745.2 < xh < 709.7, |xl| <= ulp(xh)/2.
  function crExpDD(xh, xl) {
    var kf = crRound(xh * CR_INV_L1024) | 0, j = kf & 1023; // int32: never -0
    crK = (kf - j) / 1024;
    var t = xh - kf * CR_L1, u = kf * CR_L2;          // both exact
    var s = t - u, bb = s - t, se = (t - (s - bb)) + (-u - bb);
    se += xl - kf * CR_L3;
    var rh = s + se, rl = se - (rh - s);              // r, |r| <= ln2/2048 + tiny
    var q = crTwoProd(rh, rh), qe = crE + 2 * rh * rl; // r^2
    // r^3 (1/6 + r/24 + r^2/120 + r^3/720); truncation r^7/7! < 2^-93
    var tail = q * rh * (0.16666666666666666 + rh * (0.041666666666666664 +
      rh * (0.008333333333333333 + rh * 0.001388888888888889)));
    var h2 = q * 0.5;
    var s1 = rh + h2; bb = s1 - rh;
    var lo = (rh - (s1 - bb)) + (h2 - bb) + rl + qe * 0.5 + tail;
    var ph = s1 + lo, pl = lo - (ph - s1);           // expm1(r)
    var Th = CR_EXP_TH[j], Tl = CR_EXP_TL[j];
    var m = crTwoProd(Th, ph), me = crE + Th * pl + Tl * ph;
    s = Th + m; bb = s - Th; se = (Th - (s - bb)) + (m - bb);
    se += me + Tl;
    crH = s + se; crL = se - (crH - s);
  }
  // log(x) in double-double (crH + crL), x > 0 finite, x != 1.
  // acc = false (log): r^3 onwards in plain double; error < 2^-71.5, bound 2^-70.
  // acc = true (pow, whose result error is |y log x| times log's relative
  // error): r^3/3 in double-double; error < 2^-80, bound 2^-81.5 relative...
  // see crmath.test.mjs for both measured.
  function crLogDD(x, acc) {
    var e = 0;
    if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; }
    crF64[0] = x; var hw = crU32[CR_HI];
    e += (hw >>> 20) - 1023;
    crU32[CR_HI] = (hw & 0x000fffff) | 0x3ff00000; var m = crF64[0];  // [1, 2)
    if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
    var i = ((m * 512) | 0) - 362, c = CR_LOG_C[i], rh, rl, s, bb, t, se;
    if (c === 1) { rh = m - 1; rl = 0; }                // |r| <= 2^-9
    else {                                               // |r| <= 2^-9.5
      var p = crTwoProd(m, c), pe = crE; t = p - 1;      // exact
      rh = t + pe; bb = rh - t; rl = (t - (rh - bb)) + (pe - bb);
    }
    var q = crTwoProd(rh, rh), qe = crE + 2 * rh * rl;  // r^2
    // log1p(r) = r - r^2/2 + r^3/3 - ...; truncation after r^10: < 2^-93 relative
    var w = rh * (-0.25 + rh * (0.2 + rh * (-0.16666666666666666 + rh * (0.14285714285714285 +
      rh * (-0.125 + rh * (0.1111111111111111 + rh * -0.1))))));   // r^4.. / r^3
    var hq = -q * 0.5;
    if (acc) {
      var cc = crTwoProd(q, rh), ce = crE + qe * rh + q * rl;        // r^3
      var f = crTwoProd(cc, CR_THIRD_H), fe = crE + ce * CR_THIRD_H + cc * CR_THIRD_L;
      w *= q * rh;
      s = f + w; bb = s - f; se = (f - (s - bb)) + (w - bb) + fe;
    } else {
      s = q * rh * (0.3333333333333333 + w); se = 0;
    }
    t = hq + s; bb = t - hq; se += (hq - (t - bb)) + (s - bb); s = t;
    t = rh + s; bb = t - rh; se += (rh - (t - bb)) + (s - bb); s = t;
    se += rl - qe * 0.5;
    var Ph = s + se, Pl = se - (Ph - s);                            // log1p(r)
    // e ln2 + (-log c) + log1p(r); e*H and e*M exact
    var a = e * CR_LN2H, am = e * CR_LN2M, Lh = CR_LOG_TH[i];
    s = a + Lh; bb = s - a; var lo = (a - (s - bb)) + (Lh - bb);
    t = s + am; bb = t - s; lo += (s - (t - bb)) + (am - bb); s = t;
    t = s + Ph; bb = t - s; lo += (s - (t - bb)) + (Ph - bb); s = t;
    lo += e * CR_LN2L + CR_LOG_TL[i] + Pl;
    crH = s + lo; crL = lo - (crH - s);
  }
  // The rounding test. True value v satisfies |v - (h + l)| <= eps2/2 |h|,
  // h = fl(h + l). Adding l +/- eps2|h| to h and getting h back both times
  // proves every such v rounds to h (eps2 is twice the bound, which absorbs
  // the rounding of l +/- eps2|h| itself; see crmath.test.mjs).
  function crRounds(h, l, eps2) {
    var E = (h < 0 ? -h : h) * eps2;
    return h + (l + E) === h && h + (l - E) === h;
  }
  // The double-double exp result crH + crL (relative error bound eps2/2),
  // scaled by 2^crK, rounded -- or NaN when the rounding test cannot decide.
  // Results below 2^-1021 are rounded on the subnormal grid 2^-1074 directly
  // (one rounding, never two): H = crH 2^(crK+1074) is exact, n0 its nearest
  // integer, and n0 is the answer iff |H + L - n0| stays below 1/2 by more
  // than the error bound.
  function crExpFinish(eps2) {
    if (crK >= -1021) return crRounds(crH, crL, eps2) ? crLdexp(crH, crK) : CR_NAN;
    var sc = CR_POW2[crK + 2148], H = crH * sc, L = crL * sc;  // 2^(crK+1074), exact
    var n0 = crRound(H), f = (H - n0) + L, E = H * eps2;
    if (f < 0) f = -f;
    return f + E < 0.4999999999999 ? crLdexp(n0, -1074) : CR_NAN;
  }
  // Fallback results, memoised: the hard cases are not random -- log(1 - 2^-52)
  // (pnorm returning 1 - ulp) recurs hundreds of times in one fit.
  var crMemo = { e: new Map(), l: new Map(), p: new Map() };
  function crMemoSet(m, key, v) { if (m.size >= 4096) m.clear(); m.set(key, v); return v; }
  function crExp(x) {
    var r;
    if (x > -745.2 && x < 709.7) {
      crExpDD(x, 0);
      r = crExpFinish(CR_EXP_EPS2);
      if (r === r) return r;
    } else {
      if (x !== x) return x;
      if (x > 709.79) return CR_INF;
      if (x < -746) return 0;
    }
    r = crMemo.e.get(x);
    if (r !== undefined) return r;
    crStats.expFallback++;
    return crMemoSet(crMemo.e, x, crBigExp(x));
  }
  function crLog(x) {
    if (!(x > 0) || x === CR_INF) {
      if (x === 0) return -CR_INF;
      return x === CR_INF ? x : CR_NAN;   // NaN, negative
    }
    if (x === 1) return 0;
    crLogDD(x, false);
    if (crRounds(crH, crL, CR_LOG_EPS2)) return crH;
    var r = crMemo.l.get(x);
    if (r !== undefined) return r;
    crStats.logFallback++;
    return crMemoSet(crMemo.l, x, crBigLog(x));
  }
  // R_pow() (src/main/arithmetic.c) semantics, correctly rounded finite part.
  function crPow(x, y) {
    if (x === 1 || y === 0) return 1;
    if (x === 0) { if (y > 0) return 0; if (y < 0) return CR_INF; return y; }
    if (x !== x || y !== y) return x + y;
    if (y === 2) return x * x;           // R's R_POW macro: x^2 is x * x
    if (x === CR_INF) return y < 0 ? 0 : CR_INF;
    if (x === -CR_INF) {
      if (y === CR_INF || y === -CR_INF || y !== crFloor(y)) return CR_NAN;
      return y < 0 ? 0 : (y % 2 !== 0 ? x : -x);
    }
    if (y === CR_INF || y === -CR_INF) {
      if (x >= 0) return y > 0 ? (x >= 1 ? CR_INF : 0) : (x < 1 ? CR_INF : 0);
      return CR_NAN;
    }
    var neg = false;
    if (x < 0) { if (y !== crFloor(y)) return CR_NAN; neg = y % 2 !== 0; x = -x; if (x === 1) return neg ? -1 : 1; }
    crLogDD(x, true);
    var zh = crTwoProd(y, crH), zl = crE + y * crL, r;
    var z = zh + zl; zl = zl - (z - zh); zh = z;
    if (zh > 709.8) r = CR_INF;
    else if (zh < -745.2) r = 0;
    else {
      r = CR_NAN;
      if (zh < 709.7) {
        crExpDD(zh, zl);
        r = crExpFinish(CR_POW_EPS2A + (zh < 0 ? -zh : zh) * CR_POW_EPS2B);
      }
      if (r !== r) {
        var pm = crMemo.p.get(y), key = x;
        if (pm === undefined) { if (crMemo.p.size >= 64) crMemo.p.clear(); pm = new Map(); crMemo.p.set(y, pm); }
        r = pm.get(key);
        if (r === undefined) { crStats.powFallback++; r = crMemoSet(pm, key, crBigPow(x, y)); }
      }
    }
    return neg ? -r : r;
  }
  var crmath = { exp: crExp, log: crLog, pow: crPow, stats: crStats,
    // internals, for crmath.test.mjs (error measurement and reference values)
    _expDD: function (xh, xl) { crExpDD(xh, xl || 0); return [crH, crL, crK]; },
    _logDD: function (x, acc) { crLogDD(x, !!acc); return [crH, crL]; },
    _bigExp: crBigExp, _bigLog: crBigLog, _bigPow: crBigPow,
    _bigExpZ: crBigExpZ, _bigLogFixed: crBigLogFixed, _toFixed: crToFixed, _bigRound: crBigRound };


  var DBL_EPSILON = 2.220446049250313e-16;
  var DBL_MIN = 2.2250738585072014e-308;
  var DBL_MAX = 1.7976931348623157e308;
  var SQRT_2PI = 2.5066282746310002;
  var MAX_CONTOUR_SEGMENTS = 25000; // R's options("max.contour.segments") default

  /* ---------------------------------------------------------------- numerics */

  // R's own standard normal CDF: pnorm_both() from src/nmath/pnorm.c (Cody's
  // rational Chebyshev approximations, W. J. Cody, Math. Comp. 1969), lower
  // tail, log_p = FALSE, transliterated operation for operation. Earlier
  // versions of this module used a Hart/West approximation that was up to
  // 2.6e-9 relative off R near z = 7; this is R's algorithm, so it agrees with
  // R to the last bit or two everywhere, tails and subnormal range included
  // (R returns a positive subnormal out to about -37.5 and exactly 0 below
  // -38.4674, and so does this).
  var PN_A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582,
              18154.981253343561249, 0.065682337918207449113];
  var PN_B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205,
              45507.789335026729956];
  var PN_C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979,
              597.27027639480026226, 2494.5375852903726711, 6848.1904505362823326,
              11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
  var PN_D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805,
              6485.558298266760755, 18615.571640885098091, 34900.952721145977266,
              38912.003286093271411, 19685.429676859990727];
  var PN_P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807,
              0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303];
  var PN_Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515,
              0.00378239633202758244, 7.29751555083966205e-5];
  var M_SQRT_32 = 5.656854249492380195206754896838;
  var M_1_SQRT_2PI = 0.398942280401432677939946059934;

  function pnorm(x) {
    if (isNan(x)) return x;
    if (!isFin(x)) return x < 0 ? 0 : 1;
    var xden, xnum, temp, del, xsq, y = mAbs(x), i, cum, ccum;
    var eps = DBL_EPSILON * 0.5;
    if (y <= 0.67448975) {
      if (y > eps) {
        xsq = x * x;
        xnum = PN_A[4] * xsq;
        xden = xsq;
        for (i = 0; i < 3; ++i) {
          xnum = (xnum + PN_A[i]) * xsq;
          xden = (xden + PN_B[i]) * xsq;
        }
      } else { xnum = xden = 0.0; }
      temp = x * (xnum + PN_A[3]) / (xden + PN_B[3]);
      return 0.5 + temp;
    }
    if (y <= M_SQRT_32) {
      xnum = PN_C[8] * y;
      xden = y;
      for (i = 0; i < 7; ++i) {
        xnum = (xnum + PN_C[i]) * y;
        xden = (xden + PN_D[i]) * y;
      }
      temp = (xnum + PN_C[7]) / (xden + PN_D[7]);
      xsq = mTrunc(y * 16) / 16;
      del = (y - xsq) * (y + xsq);
      cum = mExp(-xsq * (xsq / 2)) * mExp(-(del / 2)) * temp;
      ccum = 1.0 - cum;
      return x > 0 ? ccum : cum;
    }
    if (-38.4674 < x && x < 8.2924) {
      xsq = 1.0 / (x * x);
      xnum = PN_P[5] * xsq;
      xden = xsq;
      for (i = 0; i < 4; ++i) {
        xnum = (xnum + PN_P[i]) * xsq;
        xden = (xden + PN_Q[i]) * xsq;
      }
      temp = xsq * (xnum + PN_P[4]) / (xden + PN_Q[4]);
      temp = (M_1_SQRT_2PI - temp) / y;
      xsq = mTrunc(x * 16) / 16;
      del = (x - xsq) * (x + xsq);
      cum = mExp(-xsq * (xsq / 2)) * mExp(-(del / 2)) * temp;
      ccum = 1.0 - cum;
      return x > 0 ? ccum : cum;
    }
    return x > 0 ? 1 : 0;
  }

  // R_forceint() is nearbyint(): round half to even.
  function roundHalfEven(v) {
    var f = mFloor(v), d = v - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  }

  // R's dnorm4() (src/nmath/dnorm.c), mu = 0, sigma = 1, give_log = FALSE,
  // including its more accurate split evaluation for |x| >= 5.
  var DNORM_ZERO_BEYOND = mSqrt(-2 * Math.LN2 * (-1021 + 1 - 53));
  function dnorm(x) {
    if (isNan(x)) return x;
    if (!isFin(x)) return 0;
    x = mAbs(x);
    if (x < 5) return M_1_SQRT_2PI * mExp(-0.5 * x * x);
    if (x > DNORM_ZERO_BEYOND) return 0;
    var x1 = roundHalfEven(x * 65536) / 65536;
    var x2 = x - x1;
    return M_1_SQRT_2PI * (mExp(-0.5 * x1 * x1) * mExp((-0.5 * x2 - x1) * x2));
  }

  // R's sum() of a double vector accumulates in long double (80-bit on the
  // x86-64 builds R ships), then rounds once to double. A compensated two-sum
  // approximates that: like the 80-bit accumulator it keeps far more than 53
  // bits of the running sum, so for sums of likelihood terms of comparable size
  // it returns the same double as R. It is NOT bit-exact 80-bit arithmetic in
  // adversarial cases -- e.g. sum(c(1, 2^-64, -1)) is 0 in R and 2^-64 here,
  // and it has no extended exponent range (1e308 + 1e308 - 1e308 overflows).
  function rsum(a) {
    var hi = 0, lo = 0;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], s = hi + x, bp = s - hi;
      lo += (hi - (s - bp)) + (x - bp);
      hi = s;
    }
    return hi + lo;
  }

  // R's sum() EXACTLY, for the places where its last bit decides what follows
  // (the optimiser's start values -- see metaforTau2Exact). R accumulates in
  // the x87 80-bit long double: each partial sum is rounded to a 64-bit
  // significand (round half to even), the total once more to double. Emulated
  // exactly with BigInt: every double is an integer multiple of 2^-1074, so the
  // running sum is held as that integer and rounded to 64 significant bits after
  // each addition. Checked against R 4.6.0 sum() and colMeans() on 3,000
  // adversarial vectors (cancellation, 1e-8..1e8 magnitudes): 3,000 / 3,000
  // identical, where rsum() above agreed on 2,267. It costs a BigInt operation
  // per element, so it is used for the O(k) start-value sums, not inside the
  // likelihood. Non-finite input falls back to an ordinary sum (R's Inf/NaN).
  var LD_DV = (typeof DataView === "function") ? new DataView(new ArrayBuffer(8)) : null;
  var HAS_BIGINT = typeof BigInt === "function" && LD_DV !== null;
  function ldToFix(x) {
    LD_DV.setFloat64(0, x);
    var hi = LD_DV.getUint32(0), lo = LD_DV.getUint32(4);
    var e = (hi >>> 20) & 0x7ff;
    var m = BigInt(hi & 0xfffff) * BigInt(4294967296) + BigInt(lo);
    var v = e === 0 ? m : (m + BigInt(4503599627370496)) * (BigInt(1) << BigInt(e - 1));
    return (hi >>> 31) ? -v : v;
  }
  function ldBitlen(a) {            // a > 0
    var h = a.toString(16);
    return 4 * (h.length - 1) + (parseInt(h[0], 16).toString(2).length);
  }
  function ldRound(v, bits) {      // round to `bits` significant bits, half to even
    var Z = BigInt(0), one = BigInt(1);
    if (v === Z) return v;
    var neg = v < Z, a = neg ? -v : v, L = ldBitlen(a);
    if (L <= bits) return v;
    var sh = BigInt(L - bits), q = a >> sh, r = a - (q << sh), half = one << (sh - one);
    if (r > half || (r === half && (q & one) === one)) q = q + one;
    a = q << sh;
    return neg ? -a : a;
  }
  function ldFixToDouble(v) {
    var Z = BigInt(0);
    v = ldRound(v, 53);
    if (v === Z) return 0;
    var neg = v < Z, a = neg ? -v : v, L = ldBitlen(a), sh = L > 53 ? L - 53 : 0;
    var d = Number(a >> BigInt(sh)) * mPow(2, sh - 1074);
    return neg ? -d : d;
  }
  function ldAccumulate(a) {       // the rounded 64-bit-significand running sum, or null
    var s = BigInt(0);
    for (var i = 0; i < a.length; i++) {
      if (!isFin(a[i])) return null;
      s = ldRound(s + ldToFix(a[i]), 64);
    }
    return s;
  }
  // Non-finite input: the 80-bit accumulator has the exponent range not to
  // overflow on finite terms, so only the NaNs and infinities decide.
  function ldNonFinite(a) {
    var pos = false, neg = false;
    for (var i = 0; i < a.length; i++) {
      if (isNan(a[i])) return NaN;
      if (a[i] === Infinity) pos = true; else if (a[i] === -Infinity) neg = true;
    }
    return pos && neg ? NaN : (pos ? Infinity : -Infinity);
  }
  // base::sum(x) for a double vector.
  function ldsum(a) {
    if (!HAS_BIGINT) return rsum(a);
    var s = ldAccumulate(a);
    return s === null ? ldNonFinite(a) : ldFixToDouble(s);
  }
  // base::colMeans() of one column: long-double sum, divided by n IN long
  // double (rounded to 64 bits), then rounded to double -- a double rounding
  // that a double division does not reproduce.
  function ldmean(a) {
    if (a.length === 0) return NaN;                 // colMeans of no rows
    if (!HAS_BIGINT) return rsum(a) / a.length;
    var s = ldAccumulate(a);
    if (s === null) return ldNonFinite(a);
    var Z = BigInt(0), one = BigInt(1);
    if (s === Z) return 0;
    var neg = s < Z, x = neg ? -s : s, n = BigInt(a.length), SC = BigInt(200);
    var num = x << SC, q = num / n, r = num - q * n;          // q in units of 2^-(1074+200)
    var sh = BigInt(ldBitlen(q) - 64), qq = q >> sh, rem = q - (qq << sh), half = one << (sh - one);
    if (rem > half || (rem === half && (r > Z || (qq & one) === one))) qq = qq + one;
    // Round to double while still scaled by 2^-SC (shifting first would
    // truncate the significand of a mean below ~2^-820): to 53 bits, or -- in
    // the subnormal range -- straight to the 2^-1074 grid (SC = 200 bits up),
    // once, as the x87 store does. Then unscale by an exact power of two.
    var w64 = qq << sh, L1 = ldBitlen(w64), bits = mMin(53, L1 - 200);
    if (bits < 1) return neg ? -0 : 0;
    var v = ldRound(w64, bits), s2 = mMax(ldBitlen(v) - 53, 200);   // v is a multiple of 2^s2
    var top = Number(v >> BigInt(s2)), e = s2 - 1274;
    var d = top * mPow(2, e);
    return neg ? -d : d;
  }

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

  /* ------------------------------------------------------------ input tokens */
  // The one rule by which a user-supplied field becomes a number, shared by
  // every reader the page has. parseFloat is a PREFIX parser: parseFloat(".4oops")
  // is 0.4 and parseFloat("30oops") is 30, so a reader built on it silently
  // admits a malformed row as a plausible value -- schema-valid, semantically
  // wrong, and invisible to everything downstream. A token is accepted only if
  // the WHOLE of it is a number.
  //
  // Lives here rather than in copas/index.html because the page has TWO
  // ingestion paths (the textarea and the CSV upload), they must not disagree,
  // and a rule declared inside the page cannot be tested without a browser.
  // Accepts a number as well as a string, because the CSV reader is handed
  // already-coerced values; non-finite numbers are still refused.
  var NUM_TOKEN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function parseNumToken(tok) {
    if (typeof tok === "number") return isFin(tok) ? tok : NaN;
    if (typeof tok !== "string") return NaN;
    if (!NUM_TOKEN.test(tok)) return NaN;
    var v = parseFloat(tok);
    return isFin(v) ? v : NaN;
  }

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
      // and is NOT restored, and it is assigned only HERE (in the i loop), not
      // per cell -- so a later cell in the same column could in principle read
      // the swapped value. Faithfully reproduced, scoping included.
      //
      // Measured, though: the leak has no observable effect. On exit from that
      // branch xl is always exactly x[i] again, because the selection sort
      // leaves it holding the left-edge intersection, whose x IS xl. Checked
      // over the six hand-built surfaces in copas-cases-fixture.json (saddle2
      // takes this branch 20 times), the three metasens fixture surfaces
      // (REML_20 takes it once) and 200,000 randomly generated small surfaces:
      // xl === x[i] at every branch exit, and restoring xl explicitly changes
      // no contour line on any of them. Reproduced for fidelity and for the
      // scoping; but the earlier claim that "later cells in the same column
      // see the swapped value" was never demonstrated and no input has been
      // found for which it holds. The branch ITSELF is now exercised against
      // R -- see copas/tests/copas-cases.test.mjs, surface saddle2.
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
  // Each is metasens's R function evaluated in R's own operation order (R
  // computes x^2 as x*x, evaluates left to right, and sum() accumulates in
  // long double -- see rsum). The order matters here, not for accuracy but
  // because L-BFGS-B below is R's own algorithm: fed the same f and g bits it
  // takes the same steps, so the page lands where metasens lands.

  // lambda(u_i), u_i = gamma[0] + gamma[1] / seTE[i], does not depend on the
  // parameters being optimised, yet every evaluation of the likelihood and its
  // gradient recomputed it (three to four exp calls per study). Memoised on the
  // VALUES of gamma and seTE, not on array identity, so what it returns is
  // exactly what lambda(u) returns -- the same bits, computed once per gamma.
  var lamMemo = { g0: NaN, g1: NaN, se: [], u: [], lam: [] };
  function lamSame(a, b) { return a === b && (a !== 0 || 1 / a === 1 / b); }
  function lambdaU(gamma, seTE) {
    var M = lamMemo, k = seTE.length, g0 = gamma[0], g1 = gamma[1], i;
    // Identical values, -0 told apart from 0 (1/+-0 differ); NaN never hits.
    var hit = lamSame(g0, M.g0) && lamSame(g1, M.g1) && k === M.se.length;
    for (i = 0; hit && i < k; i++) if (!lamSame(seTE[i], M.se[i])) hit = false;
    if (hit) return M;
    var se = new Array(k), u = new Array(k), lam = new Array(k);
    for (i = 0; i < k; i++) { se[i] = seTE[i]; u[i] = g0 + g1 / seTE[i]; lam[i] = lambda(u[i]); }
    lamMemo = M = { g0: g0, g1: g1, se: se, u: u, lam: lam };
    return M;
  }

  // metasens:::copas.loglik.without.beta — the NEGATIVE log-likelihood.
  function loglikWithoutBeta(par, gamma, TE, seTE) {
    var LU = lambdaU(gamma, seTE);
    var mu = par[0], rho = par[1], tau = par[2], k = TE.length;
    var ell = new Array(k);
    for (var i = 0; i < k; i++) {
      var u = LU.u[i], lam = LU.lam[i];
      var sigma = mSqrt(seTE[i] * seTE[i] / (1 - rho * rho * lam * (u + lam)));
      var s2t2 = sigma * sigma + tau * tau;
      var rhoT = rho * sigma / mSqrt(s2t2);
      var v = (u + rhoT * (TE[i] - mu) / (mSqrt(s2t2))) / mSqrt(1 - rhoT * rhoT);
      if (v < -37) v = -37;
      var d = TE[i] - mu;
      ell[i] = -(-0.5 * mLog(s2t2) - d * d / (2 * s2t2) + mLog(pnorm(v)));
    }
    return rsum(ell);
  }

  // metasens:::copas.loglik.with.beta — four parameters (mu, rho, tau, beta).
  function loglikWithBeta(par, gamma, TE, seTE) {
    var LU = lambdaU(gamma, seTE);
    var mu = par[0], rho = par[1], tau = par[2], beta = par[3], k = TE.length;
    var ell = new Array(k);
    for (var i = 0; i < k; i++) {
      var u = LU.u[i], lam = LU.lam[i];
      var sigma = mSqrt(seTE[i] * seTE[i] / (1 - rho * rho * lam * (u + lam)));
      var s2t2 = sigma * sigma + tau * tau;
      var rhoT = rho * sigma / mSqrt(s2t2);
      var d = TE[i] - mu - beta * seTE[i];
      var v = (u + rhoT * d / (mSqrt(s2t2))) / mSqrt(1 - rhoT * rhoT);
      if (v < -37) v = -37;
      ell[i] = -(-0.5 * mLog(s2t2) - d * d / (2 * s2t2) + mLog(pnorm(v)));
    }
    return rsum(ell);
  }

  // metasens:::copas.gradient.without.beta — gradient of the NEGATIVE loglik.
  function gradientWithoutBeta(par, gamma, TE, seTE) {
    var LU = lambdaU(gamma, seTE);
    var mu = par[0], rho = par[1], tau = par[2], k = TE.length;
    var rho2 = rho * rho, tau2 = tau * tau;
    var gm = new Array(k), gr = new Array(k), gt = new Array(k);
    for (var i = 0; i < k; i++) {
      var TEmu = TE[i] - mu, varTE = seTE[i] * seTE[i];
      var u = LU.u[i], lam = LU.lam[i];
      var sigma = mSqrt(varTE / (1 - rho2 * lam * (u + lam)));
      var sigma2 = sigma * sigma;
      var s2t2 = sigma2 + tau2;
      var rhoT = rho * sigma / mSqrt(s2t2);
      var rho2T = rhoT * rhoT;
      var v = (u + rhoT * TEmu / (mSqrt(s2t2))) / mSqrt(1 - rho2T);
      if (v < -37) v = -37;
      var ci2 = lam * (u + lam);
      var lamv = lambda(v);
      var gMu = TEmu / s2t2;
      gMu = gMu - (rhoT / (mSqrt((s2t2) * (1 - rho2T)))) * lamv;
      var gRho = -ci2 * rho * sigma2 * sigma2 / (varTE * s2t2);
      gRho = gRho + TEmu * TEmu * ci2 * rho * sigma2 * sigma2 / (varTE * (s2t2 * s2t2));
      var top = u + rhoT * TEmu / mSqrt(s2t2);
      var bottom = mSqrt((1 - rho2T));
      var diffTop = (top - u) / rho - (top - u) * rho * ci2 / (1 - ci2 * rho2) +
        2 * (top - u) * rho * tau2 * ci2 / (varTE + tau2 * (1 - ci2 * rho2));
      var eta = varTE / (varTE + tau2 * (1 - ci2 * rho2));
      var p15 = crPow((1 - rho2T), -1.5); // R evaluates it twice; same bits
      var diffBot = (p15) * rho * eta *
        (1 + (rho2 * tau2 * ci2 * eta) / varTE);
      gRho = gRho + (top * diffBot + diffTop / bottom) * lamv;
      var gTau = -0.5 / s2t2;
      gTau = gTau + 0.5 * (TEmu * TEmu) / (s2t2 * s2t2);
      gTau = gTau + (-sigma * TEmu * rho / (bottom * (s2t2 * s2t2)) -
        0.5 * top * (p15) * sigma2 * rho2 / (s2t2 * s2t2)) * lamv;
      gTau = 2 * tau * gTau;
      gm[i] = -gMu; gr[i] = -gRho; gt[i] = -gTau;
    }
    return [rsum(gm), rsum(gr), rsum(gt)];
  }

  /* ------------------------------------- R's optim(method = "L-BFGS-B") */
  // This is the optimiser metasens::copas() calls for every fit, transliterated
  // from R's sources so the page follows the same path and stops where R stops:
  //   src/appl/lbfgsb.c              setulb/mainlb and its subroutines
  //   src/appl/optim.c               lbfgsb(), the reverse-communication driver
  //   src/library/stats/src/optim.c  fminfn/fmingr (objective, and optim()'s own
  //                                  finite-difference gradient, used when no
  //                                  gradient is given: ndeps = 1e-3, clipped to
  //                                  the bounds because usebounds = 1)
  //   src/appl/dpofa.f, dtrsl.f      LINPACK (R's dpofa tolerance 1e-14)
  //   src/extra/blas/blas.f          reference DDOT/DAXPY/DSCAL/DCOPY
  // Arithmetic is kept in the source's order. Indexing keeps f2c's 1-based
  // convention: a C pointer starting at buffer index s has element i at
  // BUF[s - 1 + i]; an f2c matrix a(i,j) with leading dimension D starting at s
  // is BUF[s + (i-1) + (j-1)*D]. Errors R raises inside optim() -- which
  // copas()'s try() then swallows -- are thrown with R's own message.
  // Checked against R's optim() on bounded and unbounded problems, with and
  // without an analytic gradient: same iterates, same function counts, same
  // convergence message (copas/tests/copas-core-lbfgsb.test.mjs).
  /* ---------------------------------------------------------------- BLAS */
  // DDOT's unrolled loop adds left to right, so it is this plain loop.
  function ddot(n, X, xs, Y, ys) {
    var s = 0;
    if (n <= 0) return 0;
    for (var i = 0; i < n; i++) s = s + X[xs + i] * Y[ys + i];
    return s;
  }
  function daxpy(n, da, X, xs, Y, ys) {
    if (n <= 0) return;
    if (da === 0) return;
    for (var i = 0; i < n; i++) Y[ys + i] = Y[ys + i] + da * X[xs + i];
  }
  function dscal(n, da, X, xs) {
    if (n <= 0 || da === 1) return;
    for (var i = 0; i < n; i++) X[xs + i] = da * X[xs + i];
  }
  function dcopy(n, X, xs, Y, ys) {
    for (var i = 0; i < n; i++) Y[ys + i] = X[xs + i];
  }

  /* ------------------------------------------------------------- LINPACK */
  // a(k,j) = A[as + (k-1) + (j-1)*lda]; returns info.
  function dpofa(A, as, lda, n) {
    for (var j = 1; j <= n; j++) {
      var s = 0;
      for (var k = 1; k <= j - 1; k++) {
        var t = A[as + (k - 1) + (j - 1) * lda] -
          ddot(k - 1, A, as + (k - 1) * lda, A, as + (j - 1) * lda);
        t = t / A[as + (k - 1) + (k - 1) * lda];
        A[as + (k - 1) + (j - 1) * lda] = t;
        s = s + t * t;
      }
      s = A[as + (j - 1) + (j - 1) * lda] - s;
      if (s <= 1e-14 * mAbs(A[as + (j - 1) + (j - 1) * lda])) return j;
      A[as + (j - 1) + (j - 1) * lda] = mSqrt(s);
    }
    return 0;
  }
  // Only the two jobs L-BFGS-B uses: 01 (T x = b) and 11 (T' x = b), T upper.
  function dtrsl(T, ts, ldt, n, B, bs, job) {
    var info, j, jj, temp;
    for (info = 1; info <= n; info++)
      if (T[ts + (info - 1) + (info - 1) * ldt] === 0) return info;
    if (job === 1) {
      B[bs + n - 1] = B[bs + n - 1] / T[ts + (n - 1) + (n - 1) * ldt];
      for (jj = 2; jj <= n; jj++) {
        j = n - jj + 1;
        temp = -B[bs + j];                                  // -b(j+1)
        daxpy(j, temp, T, ts + j * ldt, B, bs);             // t(1,j+1)
        B[bs + j - 1] = B[bs + j - 1] / T[ts + (j - 1) + (j - 1) * ldt];
      }
    } else if (job === 11) {
      B[bs] = B[bs] / T[ts];
      for (j = 2; j <= n; j++) {
        B[bs + j - 1] = B[bs + j - 1] - ddot(j - 1, T, ts + (j - 1) * ldt, B, bs);
        B[bs + j - 1] = B[bs + j - 1] / T[ts + (j - 1) + (j - 1) * ldt];
      }
    } else throw new Error("dtrsl: job " + job + " not ported");
    return 0;
  }

  /* ---------------------------------------------------------- the solver */
  function makeState(n, m) {
    return {
      n: n, m: m,
      ws: new Float64Array(n * m), wy: new Float64Array(n * m),
      sy: new Float64Array(m * m), ss: new Float64Array(m * m),
      wt: new Float64Array(m * m),
      wn: new Float64Array(4 * m * m), snd: new Float64Array(4 * m * m),
      z: new Float64Array(n), r: new Float64Array(n), d: new Float64Array(n),
      t: new Float64Array(n), wa: new Float64Array(8 * m),
      indx: new Int32Array(n), iwhere: new Int32Array(n), indx2: new Int32Array(n),
      // mainlb's statics
      prjctd: 0, cnstnd: 0, boxed: 0, updatd: 0,
      nintol: 0, iback: 0, nskip: 0, head: 0, col: 0, itail: 0, iter: 0,
      iupdat: 0, nint: 0, nfgv: 0, info: 0, ifun: 0, iword: 0, nfree: 0,
      nact: 0, ileave: 0, nenter: 0,
      theta: 0, fold: 0, tol: 0, dnorm: 0, epsmch: 0, gd: 0, stpmx: 0,
      sbgnrm: 0, stp: 0, gdold: 0, dtd: 0,
      // dcsrch's statics
      ls: { stage: 0, brackt: 0, ginit: 0, gtest: 0, gx: 0, gy: 0, finit: 0,
            fx: 0, fy: 0, stx: 0, sty: 0, stmin: 0, stmax: 0, width: 0, width1: 0 }
    };
  }

  // x, l, u, nbd, g are 0-based buffers of length n (C's &x[1] in mainlb).
  function active(S, l, u, nbd, x) {
    var n = S.n, i;
    S.prjctd = 0; S.cnstnd = 0; S.boxed = 1;
    for (i = 1; i <= n; i++) {
      if (nbd[i - 1] > 0) {
        if (nbd[i - 1] <= 2 && x[i - 1] <= l[i - 1]) {
          if (x[i - 1] < l[i - 1]) { S.prjctd = 1; x[i - 1] = l[i - 1]; }
        } else if (nbd[i - 1] >= 2 && x[i - 1] >= u[i - 1]) {
          if (x[i - 1] > u[i - 1]) { S.prjctd = 1; x[i - 1] = u[i - 1]; }
        }
      }
    }
    for (i = 1; i <= n; i++) {
      if (nbd[i - 1] !== 2) S.boxed = 0;
      if (nbd[i - 1] === 0) S.iwhere[i - 1] = -1;
      else {
        S.cnstnd = 1;
        if (nbd[i - 1] === 2 && u[i - 1] - l[i - 1] <= 0) S.iwhere[i - 1] = 3;
        else S.iwhere[i - 1] = 0;
      }
    }
  }

  // bmv: v = V[vs - 1 + i], p = P[ps - 1 + i]; sy, wt are S.sy / S.wt (m x m).
  function bmv(S, col, V, vs, P, ps) {
    var m = S.m, sy = S.sy, wt = S.wt, i, k, i2, sum, info;
    var SY = function (a, b) { return sy[(a - 1) + (b - 1) * m]; };
    if (col === 0) return 0;
    P[ps - 1 + col + 1] = V[vs - 1 + col + 1];
    for (i = 2; i <= col; i++) {
      i2 = col + i;
      sum = 0;
      for (k = 1; k <= i - 1; k++) sum += SY(i, k) * V[vs - 1 + k] / SY(k, k);
      P[ps - 1 + i2] = V[vs - 1 + i2] + sum;
    }
    info = dtrsl(wt, 0, m, col, P, ps - 1 + col + 1, 11);
    if (info !== 0) return info;
    for (i = 1; i <= col; i++) P[ps - 1 + i] = V[vs - 1 + i] / mSqrt(SY(i, i));
    info = dtrsl(wt, 0, m, col, P, ps - 1 + col + 1, 1);
    if (info !== 0) return info;
    for (i = 1; i <= col; i++) P[ps - 1 + i] = -P[ps - 1 + i] / mSqrt(SY(i, i));
    for (i = 1; i <= col; i++) {
      sum = 0;
      for (k = i + 1; k <= col; k++)
        sum += SY(k, i) * P[ps - 1 + col + k] / SY(i, i);
      P[ps - 1 + i] += sum;
    }
    return 0;
  }

  function hpsolb(nn, T, ts, IO, ios, iheap) {
    // t(i) = T[ts - 1 + i], iorder(i) = IO[ios - 1 + i]
    var i, j, k, ddum, indxin, indxou, out;
    var tb = ts - 1, ib = ios - 1;
    if (iheap === 0) {
      for (k = 2; k <= nn; k++) {
        ddum = T[tb + k];
        indxin = IO[ib + k];
        i = k;
        while (i > 1) {
          j = (i / 2) | 0;
          if (ddum < T[tb + j]) {
            T[tb + i] = T[tb + j]; IO[ib + i] = IO[ib + j]; i = j;
          } else break;
        }
        T[tb + i] = ddum;
        IO[ib + i] = indxin;
      }
    }
    if (nn > 1) {
      i = 1;
      out = T[tb + 1];
      indxou = IO[ib + 1];
      ddum = T[tb + nn];
      indxin = IO[ib + nn];
      for (;;) {
        j = i + i;
        if (j <= nn - 1) {
          if (T[tb + j + 1] < T[tb + j]) ++j;
          if (T[tb + j] < ddum) {
            T[tb + i] = T[tb + j]; IO[ib + i] = IO[ib + j]; i = j;
            continue;
          }
        }
        break;
      }
      T[tb + i] = ddum;
      IO[ib + i] = indxin;
      T[tb + nn] = out;
      IO[ib + nn] = indxou;
    }
  }

  // Generalised Cauchy point. Writes S.nint; returns info.
  function cauchy(S, x, l, u, nbd, g) {
    var n = S.n, m = S.m, col = S.col, head = S.head, theta = S.theta;
    var iorder = S.indx2, iwhere = S.iwhere, t = S.t, d = S.d, xcp = S.z;
    var wy = S.wy, ws = S.ws, WA = S.wa;
    // p = wa[0..), c = wa[2m..), wbp = wa[4m..), v = wa[6m..)  (0-based starts)
    var P0 = 0, C0 = 2 * m, WBP0 = 4 * m, V0 = 6 * m;
    var i, j, info;
    var bkmin, dibp, dibp2, zibp, neggi, tsum, f1, f2, f2_org, dt, tj, tj0;
    var tl = 0, tu = 0, dtm, wmc, wmp, wmw, d1;
    var ibp, iter, bnded, nfree, nleft, nbreak, ibkmin, pointr, xlower, xupper, col2;

    if (S.sbgnrm <= 0) { dcopy(n, x, 0, xcp, 0); return 0; }
    bnded = 1;
    nfree = n + 1;
    nbreak = 0;
    ibkmin = 0;
    bkmin = 0;
    col2 = col << 1;
    f1 = 0;
    for (i = 1; i <= col2; i++) WA[P0 + i - 1] = 0;
    for (i = 1; i <= n; i++) {
      neggi = -g[i - 1];
      if (iwhere[i - 1] !== 3 && iwhere[i - 1] !== -1) {
        if (nbd[i - 1] <= 2) tl = x[i - 1] - l[i - 1];
        if (nbd[i - 1] >= 2) tu = u[i - 1] - x[i - 1];
        xlower = nbd[i - 1] <= 2 && tl <= 0;
        xupper = nbd[i - 1] >= 2 && tu <= 0;
        iwhere[i - 1] = 0;
        if (xlower) {
          if (neggi <= 0) iwhere[i - 1] = 1;
        } else if (xupper) {
          if (neggi >= 0) iwhere[i - 1] = 2;
        } else {
          if (mAbs(neggi) <= 0) iwhere[i - 1] = -3;
        }
      }
      pointr = head;
      if (iwhere[i - 1] !== 0 && iwhere[i - 1] !== -1) {
        d[i - 1] = 0;
      } else {
        d[i - 1] = neggi;
        f1 -= neggi * neggi;
        for (j = 1; j <= col; j++) {
          WA[P0 + j - 1] += wy[(i - 1) + (pointr - 1) * n] * neggi;
          WA[P0 + col + j - 1] += ws[(i - 1) + (pointr - 1) * n] * neggi;
          pointr = pointr % m + 1;
        }
        if (nbd[i - 1] <= 2 && nbd[i - 1] !== 0 && neggi < 0) {
          ++nbreak;
          iorder[nbreak - 1] = i;
          t[nbreak - 1] = tl / (-neggi);
          if (nbreak === 1 || t[nbreak - 1] < bkmin) { bkmin = t[nbreak - 1]; ibkmin = nbreak; }
        } else if (nbd[i - 1] >= 2 && neggi > 0) {
          ++nbreak;
          iorder[nbreak - 1] = i;
          t[nbreak - 1] = tu / neggi;
          if (nbreak === 1 || t[nbreak - 1] < bkmin) { bkmin = t[nbreak - 1]; ibkmin = nbreak; }
        } else {
          --nfree;
          iorder[nfree - 1] = i;
          if (mAbs(neggi) > 0) bnded = 0;
        }
      }
    }
    if (theta !== 1) dscal(col, theta, WA, P0 + col);
    dcopy(n, x, 0, xcp, 0);
    if (nbreak === 0 && nfree === n + 1) return 0;
    for (j = 1; j <= col2; j++) WA[C0 + j - 1] = 0;
    f2 = -theta * f1;
    f2_org = f2;
    if (col > 0) {
      info = bmv(S, col, WA, P0, WA, V0);
      if (info !== 0) return info;
      f2 -= ddot(col2, WA, V0, WA, P0);
    }
    dtm = -f1 / f2;
    tsum = 0;
    S.nint = 1;
    var lab = (nbreak === 0) ? 888 : 0;
    if (lab === 0) {
      nleft = nbreak;
      iter = 1;
      tj = 0;
      for (;;) {                                           // L777
        tj0 = tj;
        if (iter === 1) {
          tj = bkmin;
          ibp = iorder[ibkmin - 1];
        } else {
          if (iter === 2) {
            if (ibkmin !== nbreak) {
              t[ibkmin - 1] = t[nbreak - 1];
              iorder[ibkmin - 1] = iorder[nbreak - 1];
            }
          }
          hpsolb(nleft, t, 0, iorder, 0, iter - 2);
          tj = t[nleft - 1];
          ibp = iorder[nleft - 1];
        }
        dt = tj - tj0;
        if (dtm < dt) { lab = 888; break; }
        tsum += dt;
        --nleft;
        ++iter;
        dibp = d[ibp - 1];
        d[ibp - 1] = 0;
        if (dibp > 0) {
          zibp = u[ibp - 1] - x[ibp - 1];
          xcp[ibp - 1] = u[ibp - 1];
          iwhere[ibp - 1] = 2;
        } else {
          zibp = l[ibp - 1] - x[ibp - 1];
          xcp[ibp - 1] = l[ibp - 1];
          iwhere[ibp - 1] = 1;
        }
        if (nleft === 0 && nbreak === n) { dtm = dt; lab = 999; break; }
        ++S.nint;
        dibp2 = dibp * dibp;
        f1 += dt * f2 + dibp2 - theta * dibp * zibp;
        f2 -= theta * dibp2;
        if (col > 0) {
          daxpy(col2, dt, WA, P0, WA, C0);
          pointr = head;
          for (j = 1; j <= col; j++) {
            WA[WBP0 + j - 1] = wy[(ibp - 1) + (pointr - 1) * n];
            WA[WBP0 + col + j - 1] = theta * ws[(ibp - 1) + (pointr - 1) * n];
            pointr = pointr % m + 1;
          }
          info = bmv(S, col, WA, WBP0, WA, V0);
          if (info !== 0) return info;
          wmc = ddot(col2, WA, C0, WA, V0);
          wmp = ddot(col2, WA, P0, WA, V0);
          wmw = ddot(col2, WA, WBP0, WA, V0);
          d1 = -dibp;
          daxpy(col2, d1, WA, WBP0, WA, P0);
          f1 += dibp * wmc;
          f2 += (2 * dibp * wmp - dibp2 * wmw);
        }
        if (f2 < (d1 = S.epsmch * f2_org)) f2 = d1;
        if (nleft > 0) {
          dtm = -f1 / f2;
          continue;
        } else if (bnded) {
          f1 = 0; f2 = 0; dtm = 0;
        } else {
          dtm = -f1 / f2;
        }
        lab = 888;
        break;
      }
    }
    if (lab === 888) {
      if (dtm <= 0) dtm = 0;
      tsum += dtm;
      daxpy(n, tsum, d, 0, xcp, 0);
    }
    // L999
    if (col > 0) daxpy(col2, dtm, WA, P0, WA, C0);
    return 0;
  }

  function cmprlb(S, x, g) {
    var n = S.n, m = S.m, col = S.col, theta = S.theta, WA = S.wa;
    var r = S.r, z = S.z, indx = S.indx, wy = S.wy, ws = S.ws;
    var i, j, k, a1, a2, pointr, info, nf;
    if (!S.cnstnd && col > 0) {
      for (i = 1; i <= n; i++) r[i - 1] = -g[i - 1];
    } else {
      nf = S.nfree;
      for (i = 1; i <= nf; i++) {
        k = indx[i - 1];
        r[i - 1] = -theta * (z[k - 1] - x[k - 1]) - g[k - 1];
      }
      // bmv(..., v = &wa[2m+1], p = &wa[1])
      info = bmv(S, col, WA, 2 * m, WA, 0);
      if (info !== 0) return -8;
      pointr = S.head;
      for (j = 1; j <= col; j++) {
        a1 = WA[j - 1];
        a2 = theta * WA[col + j - 1];
        for (i = 1; i <= nf; i++) {
          k = indx[i - 1];
          r[i - 1] += wy[(k - 1) + (pointr - 1) * n] * a1 +
                      ws[(k - 1) + (pointr - 1) * n] * a2;
        }
        pointr = pointr % m + 1;
      }
    }
    return 0;
  }

  function errclb(n, m, factr, l, u, nbd) {
    var task = null, info = 0, k = 0;
    if (n <= 0) task = "ERROR: N .LE. 0";
    if (m <= 0) task = "ERROR: M .LE. 0";
    if (factr < 0) task = "ERROR: FACTR .LT. 0";
    for (var i = 1; i <= n; i++) {
      if (nbd[i - 1] < 0 || nbd[i - 1] > 3) { task = "ERROR: INVALID NBD"; info = -6; k = i; }
      if (nbd[i - 1] === 2 && l[i - 1] > u[i - 1]) {
        task = "ERROR: NO FEASIBLE SOLUTION"; info = -7; k = i;
      }
    }
    return { task: task, info: info, k: k };
  }

  function formk(S, wrkUpdatd) {
    var n = S.n, m = S.m, col = S.col, head = S.head, theta = S.theta;
    var nsub = S.nfree, ind = S.indx, indx2 = S.indx2, nenter = S.nenter, ileave = S.ileave;
    var wn = S.wn, wn1 = S.snd, ws = S.ws, wy = S.wy, sy = S.sy;
    var D = 2 * m;
    var i, k, iy, jy, is, js, is1, js1, k1, ipntr, jpntr, upcl, info, i2;
    var temp1, temp2, temp3, temp4, pbegin, pend, dbegin, dend, m2, col2;
    function W1(a, b) { return (a - 1) + (b - 1) * D; }      // wn1 / wn index
    function WY(a, b) { return wy[(a - 1) + (b - 1) * n]; }
    function WS(a, b) { return ws[(a - 1) + (b - 1) * n]; }

    if (wrkUpdatd) {
      if (S.iupdat > m) {
        for (jy = 1; jy <= m - 1; jy++) {
          js = m + jy;
          i2 = m - jy;
          dcopy(i2, wn1, W1(jy + 1, jy + 1), wn1, W1(jy, jy));
          dcopy(i2, wn1, W1(js + 1, js + 1), wn1, W1(js, js));
          i2 = m - 1;
          dcopy(i2, wn1, W1(m + 2, jy + 1), wn1, W1(m + 1, jy));
        }
      }
      pbegin = 1; pend = nsub; dbegin = nsub + 1; dend = n;
      iy = col;
      is = m + col;
      ipntr = head + col - 1;
      if (ipntr > m) ipntr -= m;
      jpntr = head;
      for (jy = 1; jy <= col; jy++) {
        js = m + jy;
        temp1 = 0; temp2 = 0; temp3 = 0;
        for (k = pbegin; k <= pend; k++) {
          k1 = ind[k - 1];
          temp1 += WY(k1, ipntr) * WY(k1, jpntr);
        }
        for (k = dbegin; k <= dend; k++) {
          k1 = ind[k - 1];
          temp2 += WS(k1, ipntr) * WS(k1, jpntr);
          temp3 += WS(k1, ipntr) * WY(k1, jpntr);
        }
        wn1[W1(iy, jy)] = temp1;
        wn1[W1(is, js)] = temp2;
        wn1[W1(is, jy)] = temp3;
        jpntr = jpntr % m + 1;
      }
      jy = col;
      jpntr = head + col - 1;
      if (jpntr > m) jpntr -= m;
      ipntr = head;
      for (i = 1; i <= col; i++) {
        is = m + i;
        temp3 = 0;
        for (k = pbegin; k <= pend; k++) {
          k1 = ind[k - 1];
          temp3 += WS(k1, ipntr) * WY(k1, jpntr);
        }
        ipntr = ipntr % m + 1;
        wn1[W1(is, jy)] = temp3;
      }
      upcl = col - 1;
    } else {
      upcl = col;
    }
    ipntr = head;
    for (iy = 1; iy <= upcl; iy++) {
      is = m + iy;
      jpntr = head;
      for (jy = 1; jy <= iy; jy++) {
        js = m + jy;
        temp1 = 0; temp2 = 0; temp3 = 0; temp4 = 0;
        for (k = 1; k <= nenter; k++) {
          k1 = indx2[k - 1];
          temp1 += WY(k1, ipntr) * WY(k1, jpntr);
          temp2 += WS(k1, ipntr) * WS(k1, jpntr);
        }
        for (k = ileave; k <= n; k++) {
          k1 = indx2[k - 1];
          temp3 += WY(k1, ipntr) * WY(k1, jpntr);
          temp4 += WS(k1, ipntr) * WS(k1, jpntr);
        }
        wn1[W1(iy, jy)] = wn1[W1(iy, jy)] + temp1 - temp3;
        wn1[W1(is, js)] = wn1[W1(is, js)] - temp2 + temp4;
        jpntr = jpntr % m + 1;
      }
      ipntr = ipntr % m + 1;
    }
    ipntr = head;
    for (is = m + 1; is <= m + upcl; is++) {
      jpntr = head;
      for (jy = 1; jy <= upcl; jy++) {
        temp1 = 0; temp3 = 0;
        for (k = 1; k <= nenter; k++) {
          k1 = indx2[k - 1];
          temp1 += WS(k1, ipntr) * WY(k1, jpntr);
        }
        for (k = ileave; k <= n; k++) {
          k1 = indx2[k - 1];
          temp3 += WS(k1, ipntr) * WY(k1, jpntr);
        }
        if (is <= jy + m) wn1[W1(is, jy)] += temp1 - temp3;
        else wn1[W1(is, jy)] += -temp1 + temp3;
        jpntr = jpntr % m + 1;
      }
      ipntr = ipntr % m + 1;
    }
    m2 = m << 1;
    for (iy = 1; iy <= col; iy++) {
      is = col + iy;
      is1 = m + iy;
      for (jy = 1; jy <= iy; jy++) {
        js = col + jy;
        js1 = m + jy;
        wn[W1(jy, iy)] = wn1[W1(iy, jy)] / theta;
        wn[W1(js, is)] = wn1[W1(is1, js1)] * theta;
      }
      for (jy = 1; jy <= iy - 1; jy++) wn[W1(jy, is)] = -wn1[W1(is1, jy)];
      for (jy = iy; jy <= col; jy++) wn[W1(jy, is)] = wn1[W1(is1, jy)];
      wn[W1(iy, iy)] += sy[(iy - 1) + (iy - 1) * m];
    }
    info = dpofa(wn, 0, m2, col);
    if (info !== 0) return -1;
    col2 = col << 1;
    for (js = col + 1; js <= col2; js++) dtrsl(wn, 0, m2, col, wn, W1(1, js), 11);
    for (is = col + 1; is <= col2; is++)
      for (js = is; js <= col2; js++)
        wn[W1(is, js)] += ddot(col, wn, W1(1, is), wn, W1(1, js));
    info = dpofa(wn, W1(col + 1, col + 1), m2, col);
    if (info !== 0) return -2;
    return 0;
  }

  function formt(S) {
    var m = S.m, col = S.col, theta = S.theta, wt = S.wt, sy = S.sy, ss = S.ss;
    var i, j, k, k1, ddum;
    for (j = 1; j <= col; j++) wt[(j - 1) * m] = theta * ss[(j - 1) * m];
    for (i = 2; i <= col; i++) {
      for (j = i; j <= col; j++) {
        k1 = mMin(i, j) - 1;
        ddum = 0;
        for (k = 1; k <= k1; k++)
          ddum += sy[(i - 1) + (k - 1) * m] * sy[(j - 1) + (k - 1) * m] /
                  sy[(k - 1) + (k - 1) * m];
        wt[(i - 1) + (j - 1) * m] = ddum + theta * ss[(i - 1) + (j - 1) * m];
      }
    }
    var info = dpofa(wt, 0, m, col);
    return info !== 0 ? -3 : 0;
  }

  // returns wrk
  function freev(S) {
    var n = S.n, indx = S.indx, indx2 = S.indx2, iwhere = S.iwhere, i, k, iact;
    S.nenter = 0;
    S.ileave = n + 1;
    if (S.iter > 0 && S.cnstnd) {
      for (i = 1; i <= S.nfree; i++) {
        k = indx[i - 1];
        if (iwhere[k - 1] > 0) { --S.ileave; indx2[S.ileave - 1] = k; }
      }
      for (i = S.nfree + 1; i <= n; i++) {
        k = indx[i - 1];
        if (iwhere[k - 1] <= 0) { ++S.nenter; indx2[S.nenter - 1] = k; }
      }
    }
    var wrk = (S.ileave < n + 1 || S.nenter > 0 || S.updatd) ? 1 : 0;
    S.nfree = 0;
    iact = n + 1;
    for (i = 1; i <= n; i++) {
      if (iwhere[i - 1] <= 0) { ++S.nfree; indx[S.nfree - 1] = i; }
      else { --iact; indx[iact - 1] = i; }
    }
    return wrk;
  }

  function dcstep(st, stp, fp, dp, brackt, stpmin, stpmax) {
    // st: {stx, fx, dx, sty, fy, dy}; returns {stp, brackt}
    var stx = st.stx, fx = st.fx, dx = st.dx, sty = st.sty, fy = st.fy, dy = st.dy;
    var d1, d2, sgnd, stpc, stpf, stpq, p, q, gamm, r, s, theta;
    sgnd = dp * (dx / mAbs(dx));
    if (fp > fx) {
      theta = (fx - fp) * 3 / (stp - stx) + dx + dp;
      d1 = mAbs(theta); d2 = mAbs(dx); d1 = mMax(d1, d2); d2 = mAbs(dp);
      s = mMax(d1, d2);
      d1 = theta / s;
      gamm = s * mSqrt(d1 * d1 - dx / s * (dp / s));
      if (stp < stx) gamm = -gamm;
      p = gamm - dx + theta;
      q = gamm - dx + gamm + dp;
      r = p / q;
      stpc = stx + r * (stp - stx);
      stpq = stx + dx / ((fx - fp) / (stp - stx) + dx) / 2 * (stp - stx);
      if (mAbs(stpc - stx) < mAbs(stpq - stx)) stpf = stpc;
      else stpf = stpc + (stpq - stpc) / 2;
      brackt = 1;
    } else if (sgnd < 0) {
      theta = (fx - fp) * 3 / (stp - stx) + dx + dp;
      d1 = mAbs(theta); d2 = mAbs(dx); d1 = mMax(d1, d2); d2 = mAbs(dp);
      s = mMax(d1, d2);
      d1 = theta / s;
      gamm = s * mSqrt(d1 * d1 - dx / s * (dp / s));
      if (stp > stx) gamm = -gamm;
      p = gamm - dp + theta;
      q = gamm - dp + gamm + dx;
      r = p / q;
      stpc = stp + r * (stx - stp);
      stpq = stp + dp / (dp - dx) * (stx - stp);
      if (mAbs(stpc - stp) > mAbs(stpq - stp)) stpf = stpc;
      else stpf = stpq;
      brackt = 1;
    } else if (mAbs(dp) < mAbs(dx)) {
      theta = (fx - fp) * 3 / (stp - stx) + dx + dp;
      d1 = mAbs(theta); d2 = mAbs(dx); d1 = mMax(d1, d2); d2 = mAbs(dp);
      s = mMax(d1, d2);
      d1 = theta / s;
      d1 = d1 * d1 - dx / s * (dp / s);
      gamm = d1 < 0 ? 0 : s * mSqrt(d1);
      if (stp > stx) gamm = -gamm;
      p = gamm - dp + theta;
      q = gamm + (dx - dp) + gamm;
      r = p / q;
      if (r < 0 && gamm !== 0) stpc = stp + r * (stx - stp);
      else if (stp > stx) stpc = stpmax;
      else stpc = stpmin;
      stpq = stp + dp / (dp - dx) * (stx - stp);
      if (brackt) {
        if (mAbs(stpc - stp) < mAbs(stpq - stp)) stpf = stpc;
        else stpf = stpq;
        d1 = stp + (sty - stp) * 0.66;
        if (stp > stx) stpf = mMin(d1, stpf);
        else stpf = mMax(d1, stpf);
      } else {
        if (mAbs(stpc - stp) > mAbs(stpq - stp)) stpf = stpc;
        else stpf = stpq;
        stpf = mMin(stpmax, stpf);
        stpf = mMax(stpmin, stpf);
      }
    } else {
      if (brackt) {
        theta = (fp - fy) * 3 / (sty - stp) + dy + dp;
        d1 = mAbs(theta); d2 = mAbs(dy); d1 = mMax(d1, d2); d2 = mAbs(dp);
        s = mMax(d1, d2);
        d1 = theta / s;
        gamm = s * mSqrt(d1 * d1 - dy / s * (dp / s));
        if (stp > sty) gamm = -gamm;
        p = gamm - dp + theta;
        q = gamm - dp + gamm + dy;
        r = p / q;
        stpc = stp + r * (sty - stp);
        stpf = stpc;
      } else if (stp > stx) stpf = stpmax;
      else stpf = stpmin;
    }
    if (fp > fx) {
      st.sty = stp; st.fy = fp; st.dy = dp;
    } else {
      if (sgnd < 0) { st.sty = stx; st.fy = fx; st.dy = dx; }
      st.stx = stp; st.fx = fp; st.dx = dp;
    }
    return { stp: stpf, brackt: brackt };
  }

  // C's fmax/fmin macros as written in R: max(a,b) = ((a) > (b) ? (a) : (b)).
  function cmax(a, b) { return a > b ? a : b; }
  function cmin(a, b) { return a < b ? a : b; }

  // dcsrch: returns the new task; reads/writes S.stp through `io`.
  function dcsrch(L, f, g, io, ftol, gtol, xtol, stpmin, stpmax, task) {
    var ftest, fm, gm, fxm, fym, gxm, gym, stp = io.stp, r;
    if (task.substr(0, 5) === "START") {
      if (stp < stpmin) task = "ERROR: STP .LT. STPMIN";
      if (stp > stpmax) task = "ERROR: STP .GT. STPMAX";
      if (g >= 0) task = "ERROR: INITIAL G .GE. ZERO";
      if (ftol < 0) task = "ERROR: FTOL .LT. ZERO";
      if (gtol < 0) task = "ERROR: GTOL .LT. ZERO";
      if (xtol < 0) task = "ERROR: XTOL .LT. ZERO";
      if (stpmin < 0) task = "ERROR: STPMIN .LT. ZERO";
      if (stpmax < stpmin) task = "ERROR: STPMAX .LT. STPMIN";
      if (task.substr(0, 5) === "ERROR") return task;
      L.brackt = 0;
      L.stage = 1;
      L.finit = f;
      L.ginit = g;
      L.gtest = ftol * L.ginit;
      L.width = stpmax - stpmin;
      L.width1 = L.width / 0.5;
      L.stx = 0; L.fx = L.finit; L.gx = L.ginit;
      L.sty = 0; L.fy = L.finit; L.gy = L.ginit;
      L.stmin = 0;
      L.stmax = stp + stp * 4;
      return "FG";
    }
    ftest = L.finit + stp * L.gtest;
    if (L.stage === 1 && f <= ftest && g >= 0) L.stage = 2;
    if (L.brackt && (stp <= L.stmin || stp >= L.stmax))
      task = "WARNING: ROUNDING ERRORS PREVENT PROGRESS";
    if (L.brackt && L.stmax - L.stmin <= xtol * L.stmax)
      task = "WARNING: XTOL TEST SATISFIED";
    if (stp === stpmax && f <= ftest && g <= L.gtest) task = "WARNING: STP = STPMAX";
    if (stp === stpmin && (f > ftest || g >= L.gtest)) task = "WARNING: STP = STPMIN";
    if (f <= ftest && mAbs(g) <= gtol * (-L.ginit)) task = "CONVERGENCE";
    if (task.substr(0, 4) === "WARN" || task.substr(0, 4) === "CONV") return task;
    var st;
    if (L.stage === 1 && f <= L.fx && f > ftest) {
      fm = f - stp * L.gtest;
      fxm = L.fx - L.stx * L.gtest;
      fym = L.fy - L.sty * L.gtest;
      gm = g - L.gtest;
      gxm = L.gx - L.gtest;
      gym = L.gy - L.gtest;
      st = { stx: L.stx, fx: fxm, dx: gxm, sty: L.sty, fy: fym, dy: gym };
      r = dcstep(st, stp, fm, gm, L.brackt, L.stmin, L.stmax);
      L.stx = st.stx; L.sty = st.sty;
      fxm = st.fx; fym = st.fy; gxm = st.dx; gym = st.dy;
      stp = r.stp; L.brackt = r.brackt;
      L.fx = fxm + L.stx * L.gtest;
      L.fy = fym + L.sty * L.gtest;
      L.gx = gxm + L.gtest;
      L.gy = gym + L.gtest;
    } else {
      st = { stx: L.stx, fx: L.fx, dx: L.gx, sty: L.sty, fy: L.fy, dy: L.gy };
      r = dcstep(st, stp, f, g, L.brackt, L.stmin, L.stmax);
      L.stx = st.stx; L.fx = st.fx; L.gx = st.dx;
      L.sty = st.sty; L.fy = st.fy; L.gy = st.dy;
      stp = r.stp; L.brackt = r.brackt;
    }
    if (L.brackt) {
      if (mAbs(L.sty - L.stx) >= L.width1 * 0.66) stp = L.stx + (L.sty - L.stx) * 0.5;
      L.width1 = L.width;
      L.width = mAbs(L.sty - L.stx);
    }
    if (L.brackt) {
      L.stmin = cmin(L.stx, L.sty);
      L.stmax = cmax(L.stx, L.sty);
    } else {
      L.stmin = stp + (stp - L.stx) * 1.1;
      L.stmax = stp + (stp - L.stx) * 4;
    }
    if (stp < stpmin) stp = stpmin;
    if (stp > stpmax) stp = stpmax;
    if ((L.brackt && (stp <= L.stmin || stp >= L.stmax)) ||
        (L.brackt && (L.stmax - L.stmin <= xtol * L.stmax))) {
      stp = L.stx;
    }
    io.stp = stp;
    return "FG";
  }

  // lnsrlb: f is passed in, the rest lives in S. Returns the new task.
  function lnsrlb(S, l, u, nbd, x, f, g, task) {
    var n = S.n, d = S.d, r = S.r, t = S.t, z = S.z, i, a1, a2, d1;
    var csave = "";
    var ftol = 0.001, gtol = 0.9, xtol = 0.1, stpmin = 0;
    if (task.substr(0, 5) !== "FG_LN") {
      S.dtd = ddot(n, d, 0, d, 0);
      S.dnorm = mSqrt(S.dtd);
      S.stpmx = 1e10;
      if (S.cnstnd) {
        if (S.iter === 0) {
          S.stpmx = 1;
        } else {
          for (i = 1; i <= n; i++) {
            a1 = d[i - 1];
            if (nbd[i - 1] !== 0) {
              if (a1 < 0 && nbd[i - 1] <= 2) {
                a2 = l[i - 1] - x[i - 1];
                if (a2 >= 0) S.stpmx = 0;
                else if (a1 * S.stpmx < a2) S.stpmx = a2 / a1;
              } else if (a1 > 0 && nbd[i - 1] >= 2) {
                a2 = u[i - 1] - x[i - 1];
                if (a2 <= 0) S.stpmx = 0;
                else if (a1 * S.stpmx > a2) S.stpmx = a2 / a1;
              }
            }
          }
        }
      }
      if (S.iter === 0 && !S.boxed) {
        d1 = 1 / S.dnorm;
        S.stp = cmin(d1, S.stpmx);
      } else {
        S.stp = 1;
      }
      dcopy(n, x, 0, t, 0);
      dcopy(n, g, 0, r, 0);
      S.fold = f;
      S.ifun = 0;
      S.iback = 0;
      csave = "START";
    }
    // L556
    S.gd = ddot(n, g, 0, d, 0);
    if (S.ifun === 0) {
      S.gdold = S.gd;
      if (S.gd >= 0) { S.info = -4; return task; }
    }
    var io = { stp: S.stp };
    csave = dcsrch(S.ls, f, S.gd, io, ftol, gtol, xtol, stpmin, S.stpmx, csave);
    S.stp = io.stp;
    if (csave.substr(0, 4) !== "CONV" && csave.substr(0, 4) !== "WARN") {
      task = "FG_LNSRCH";
      ++S.ifun;
      ++S.nfgv;
      S.iback = S.ifun - 1;
      if (S.stp === 1) {
        dcopy(n, z, 0, x, 0);
      } else {
        for (i = 1; i <= n; i++) x[i - 1] = S.stp * d[i - 1] + t[i - 1];
      }
    } else {
      task = "NEW_X";
    }
    return task;
  }

  function matupd(S, rr, dr) {
    var n = S.n, m = S.m, ws = S.ws, wy = S.wy, sy = S.sy, ss = S.ss, d = S.d, r = S.r;
    var j, pointr, i2;
    if (S.iupdat <= m) {
      S.col = S.iupdat;
      S.itail = (S.head + S.iupdat - 2) % m + 1;
    } else {
      S.itail = S.itail % m + 1;
      S.head = S.head % m + 1;
    }
    dcopy(n, d, 0, ws, (S.itail - 1) * n);
    dcopy(n, r, 0, wy, (S.itail - 1) * n);
    S.theta = rr / dr;
    var col = S.col;
    if (S.iupdat > m) {
      for (j = 1; j <= col - 1; j++) {
        dcopy(j, ss, 1 + j * m, ss, (j - 1) * m);                 // ss(2,j+1) -> ss(1,j)
        i2 = col - j;
        dcopy(i2, sy, j + j * m, sy, (j - 1) + (j - 1) * m);      // sy(j+1,j+1) -> sy(j,j)
      }
    }
    pointr = S.head;
    for (j = 1; j <= col - 1; j++) {
      sy[(col - 1) + (j - 1) * m] = ddot(n, d, 0, wy, (pointr - 1) * n);
      ss[(j - 1) + (col - 1) * m] = ddot(n, ws, (pointr - 1) * n, d, 0);
      pointr = pointr % m + 1;
    }
    if (S.stp === 1) ss[(col - 1) + (col - 1) * m] = S.dtd;
    else ss[(col - 1) + (col - 1) * m] = S.stp * S.stp * S.dtd;
    sy[(col - 1) + (col - 1) * m] = dr;
  }

  function projgr(n, l, u, nbd, x, g) {
    var sbgnrm = 0, gi, d1;
    for (var i = 0; i < n; i++) {
      gi = g[i];
      if (nbd[i] !== 0) {
        if (gi < 0) {
          if (nbd[i] >= 2) { if (gi < (d1 = x[i] - u[i])) gi = d1; }
        } else {
          if (nbd[i] <= 2) { if (gi > (d1 = x[i] - l[i])) gi = d1; }
        }
      }
      if (sbgnrm < (d1 = mAbs(gi))) sbgnrm = d1;
    }
    return sbgnrm;
  }

  function subsm(S, l, u, nbd) {
    var n = S.n, m = S.m, col = S.col, theta = S.theta, ind = S.indx;
    var x = S.z, d = S.r, ws = S.ws, wy = S.wy, wv = S.wa, wn = S.wn;
    var ns = S.nfree, i, j, k, jy, js, pointr, ibd = 0, m2, col2, info;
    var alpha, dk, temp1, temp2;
    if (ns <= 0) return 0;
    pointr = S.head;
    for (i = 1; i <= col; i++) {
      temp1 = 0; temp2 = 0;
      for (j = 1; j <= ns; j++) {
        k = ind[j - 1];
        temp1 += wy[(k - 1) + (pointr - 1) * n] * d[j - 1];
        temp2 += ws[(k - 1) + (pointr - 1) * n] * d[j - 1];
      }
      wv[i - 1] = temp1;
      wv[col + i - 1] = theta * temp2;
      pointr = pointr % m + 1;
    }
    m2 = m << 1;
    col2 = col << 1;
    info = dtrsl(wn, 0, m2, col2, wv, 0, 11);
    if (info !== 0) return info;
    for (i = 1; i <= col; i++) wv[i - 1] = -wv[i - 1];
    info = dtrsl(wn, 0, m2, col2, wv, 0, 1);
    if (info !== 0) return info;
    pointr = S.head;
    for (jy = 1; jy <= col; jy++) {
      js = col + jy;
      for (i = 1; i <= ns; i++) {
        k = ind[i - 1];
        d[i - 1] += (wy[(k - 1) + (pointr - 1) * n] * wv[jy - 1] / theta +
                     ws[(k - 1) + (pointr - 1) * n] * wv[js - 1]);
      }
      pointr = pointr % m + 1;
    }
    for (i = 1; i <= ns; i++) d[i - 1] /= theta;
    alpha = 1;
    temp1 = alpha;
    for (i = 1; i <= ns; i++) {
      k = ind[i - 1];
      dk = d[i - 1];
      if (nbd[k - 1] !== 0) {
        if (dk < 0 && nbd[k - 1] <= 2) {
          temp2 = l[k - 1] - x[k - 1];
          if (temp2 >= 0) temp1 = 0;
          else if (dk * alpha < temp2) temp1 = temp2 / dk;
        } else if (dk > 0 && nbd[k - 1] >= 2) {
          temp2 = u[k - 1] - x[k - 1];
          if (temp2 <= 0) temp1 = 0;
          else if (dk * alpha > temp2) temp1 = temp2 / dk;
        }
        if (temp1 < alpha) { alpha = temp1; ibd = i; }
      }
    }
    if (alpha < 1) {
      dk = d[ibd - 1];
      k = ind[ibd - 1];
      if (dk > 0) { x[k - 1] = u[k - 1]; d[ibd - 1] = 0; }
      else if (dk < 0) { x[k - 1] = l[k - 1]; d[ibd - 1] = 0; }
    }
    for (i = 1; i <= ns; i++) x[ind[i - 1] - 1] += alpha * d[i - 1];
    S.iword = (alpha < 1) ? 1 : 0;
    return 0;
  }

  function resetMemory(S) {
    S.info = 0; S.col = 0; S.head = 1; S.theta = 1; S.iupdat = 0; S.updatd = 0;
  }

  /* mainlb: one reverse-communication step. `io` = {f}; x, g are the caller's
   * buffers (0-based, length n). Returns the new task string. */
  function mainlb(S, x, l, u, nbd, io, g, factr, pgtol, task) {
    var n = S.n, i, lab, wrk = 0, rr, dr, ddum, d1, d2;
    if (task.substr(0, 5) === "START") {
      S.epsmch = DBL_EPSILON;
      S.fold = 0; S.dnorm = 0; S.gd = 0; S.sbgnrm = 0; S.stp = 0;
      S.stpmx = 0; S.gdold = 0; S.dtd = 0;
      S.col = 0; S.head = 1; S.theta = 1; S.iupdat = 0; S.updatd = 0;
      S.iback = 0; S.itail = 0; S.ifun = 0; S.iword = 0; S.nact = 0;
      S.ileave = 0; S.nenter = 0; S.iter = 0; S.nfgv = 0; S.nint = 0;
      S.nintol = 0; S.nskip = 0; S.nfree = n;
      S.tol = factr * S.epsmch;
      S.info = 0;
      var e = errclb(n, S.m, factr, l, u, nbd);
      if (e.task) { S.info = e.info; return e.task; }
      active(S, l, u, nbd, x);
      return "FG_START";
    }
    if (task.substr(0, 5) === "FG_LN") lab = 666;
    else if (task.substr(0, 5) === "NEW_X") lab = 777;
    else if (task.substr(0, 5) === "FG_ST") lab = 111;
    else if (task.substr(0, 4) === "STOP") return task;      // CPU branch unused by R
    else return task;

    for (;;) {
      switch (lab) {
        case 111:
          S.nfgv = 1;
          S.sbgnrm = projgr(n, l, u, nbd, x, g);
          if (S.sbgnrm <= pgtol) return "CONVERGENCE: NORM OF PROJECTED GRADIENT <= PGTOL";
          lab = 222; break;
        case 222:
          S.iword = -1;
          if (!S.cnstnd && S.col > 0) {
            dcopy(n, x, 0, S.z, 0);
            wrk = S.updatd;
            S.nint = 0;
            lab = 333; break;
          }
          S.info = cauchy(S, x, l, u, nbd, g);
          if (S.info !== 0) { resetMemory(S); lab = 222; break; }
          S.nintol += S.nint;
          wrk = freev(S);
          S.nact = n - S.nfree;
          lab = 333; break;
        case 333:
          if (S.nfree === 0 || S.col === 0) { lab = 555; break; }
          if (wrk) S.info = formk(S, S.updatd);
          if (S.info !== 0) { resetMemory(S); lab = 222; break; }
          S.info = cmprlb(S, x, g);
          if (S.info === 0) S.info = subsm(S, l, u, nbd);
          if (S.info !== 0) { resetMemory(S); lab = 222; break; }
          lab = 555; break;
        case 555:
          for (i = 0; i < n; i++) S.d[i] = S.z[i] - x[i];
          task = "";                                     // not FG_LN: start a new search
          lab = 666; break;
        case 666:
          task = lnsrlb(S, l, u, nbd, x, io.f, g, task);
          if (S.info !== 0 || S.iback >= 20) {
            dcopy(n, S.t, 0, x, 0);
            dcopy(n, S.r, 0, g, 0);
            io.f = S.fold;
            if (S.col === 0) {
              if (S.info === 0) { S.info = -9; --S.nfgv; --S.ifun; --S.iback; }
              ++S.iter;
              return "ERROR: ABNORMAL_TERMINATION_IN_LNSRCH";
            } else {
              if (S.info === 0) --S.nfgv;
              resetMemory(S);
              task = "RESTART_FROM_LNSRCH";
              lab = 222; break;
            }
          } else if (task.substr(0, 5) === "FG_LN") {
            return task;
          } else {
            ++S.iter;
            S.sbgnrm = projgr(n, l, u, nbd, x, g);
            return task;                                  // NEW_X
          }
        case 777:
          if (S.sbgnrm <= pgtol) return "CONVERGENCE: NORM OF PROJECTED GRADIENT <= PGTOL";
          d1 = mAbs(S.fold); d2 = mAbs(io.f); d1 = cmax(d1, d2);
          ddum = cmax(d1, 1);
          if (S.fold - io.f <= S.tol * ddum) {
            if (S.iback >= 10) S.info = -5;
            return "CONVERGENCE: REL_REDUCTION_OF_F <= FACTR*EPSMCH";
          }
          for (i = 0; i < n; i++) S.r[i] = g[i] - S.r[i];
          rr = ddot(n, S.r, 0, S.r, 0);
          if (S.stp === 1) {
            dr = S.gd - S.gdold;
            ddum = -S.gdold;
          } else {
            dr = (S.gd - S.gdold) * S.stp;
            dscal(n, S.stp, S.d, 0);
            ddum = -S.gdold * S.stp;
          }
          if (dr <= S.epsmch * ddum) {
            ++S.nskip;
            S.updatd = 0;
            lab = 222; break;
          }
          S.updatd = 1;
          ++S.iupdat;
          matupd(S, rr, dr);
          S.info = formt(S);
          if (S.info !== 0) { resetMemory(S); lab = 222; break; }
          lab = 222; break;
        default:
          throw new Error("mainlb: bad label " + lab);
      }
    }
  }

  /* R's optim(par, fn, gr, method = "L-BFGS-B", lower, upper) with the default
   * control: fnscale = 1, parscale = 1, lmm = 5, factr = 1e7, pgtol = 0,
   * maxit = 100, ndeps = 1e-3. Errors R raises (and copas()'s try() swallows)
   * are thrown as JS Errors with R's message. gr === null selects optim's own
   * finite differences (fmingr with usebounds = 1). */
  function optimLBFGSB(fn, gr, par, lower, upper, control) {
    control = control || {};
    var n = par.length, m = control.lmm || 5;
    var factr = control.factr === undefined ? 1e7 : control.factr;
    var pgtol = control.pgtol === undefined ? 0 : control.pgtol;
    var maxit = control.maxit === undefined ? 100 : control.maxit;
    var ndeps = control.ndeps || (function () { var a = []; for (var i = 0; i < n; i++) a.push(1e-3); return a; })();
    var x = new Float64Array(n), g = new Float64Array(n);
    var l = new Float64Array(n), u = new Float64Array(n), nbd = new Int32Array(n);
    var i;
    for (i = 0; i < n; i++) {
      x[i] = par[i];
      l[i] = lower[i]; u[i] = upper[i];
      if (!isFin(l[i])) nbd[i] = isFin(u[i]) ? 3 : 0;
      else nbd[i] = isFin(u[i]) ? 2 : 1;
    }
    var fcount = 0, gcount = 0;
    function fminfn(p) {
      for (var j = 0; j < n; j++)
        if (!isFin(p[j])) throw new Error("non-finite value supplied by optim");
      fcount++;
      return fn(Array.prototype.slice.call(p));
    }
    function fmingr(p, df) {
      var j;
      if (gr) {
        for (j = 0; j < n; j++)
          if (!isFin(p[j])) throw new Error("non-finite value supplied by optim");
        var s = gr(Array.prototype.slice.call(p));
        for (j = 0; j < n; j++) df[j] = s[j];
        return;
      }
      var xx = Array.prototype.slice.call(p), eps, epsused, tmp, v1, v2;
      for (j = 0; j < n; j++) {
        epsused = eps = ndeps[j];
        tmp = p[j] + eps;
        if (tmp > u[j]) { tmp = u[j]; epsused = tmp - p[j]; }
        xx[j] = tmp;
        v1 = fn(xx.slice());
        tmp = p[j] - eps;
        if (tmp < l[j]) { tmp = l[j]; eps = p[j] - tmp; }
        xx[j] = tmp;
        v2 = fn(xx.slice());
        df[j] = (v1 - v2) / (epsused + eps);
        if (!isFin(df[j]))
          throw new Error("non-finite finite-difference value [" + (j + 1) + "]");
        xx[j] = p[j];
      }
    }

    var S = makeState(n, m);
    var io = { f: 0 };
    var task = "START", fail = 0, iter = 0;
    for (;;) {
      task = mainlb(S, x, l, u, nbd, io, g, factr, pgtol, task);
      if (task.substr(0, 2) === "FG") {
        io.f = fminfn(x);
        if (!isFin(io.f)) throw new Error("L-BFGS-B needs finite values of 'fn'");
        fmingr(x, g);
      } else if (task.substr(0, 5) === "NEW_X") {
        iter++;
        if (iter > maxit) { fail = 1; break; }
      } else if (task.substr(0, 4) === "WARN") { fail = 51; break; }
      else if (task.substr(0, 4) === "CONV") { break; }
      else if (task.substr(0, 5) === "ERROR") { fail = 52; break; }
      else { fail = 52; break; }
    }
    return {
      par: Array.prototype.slice.call(x), value: io.f,
      counts: [S.nfgv, S.nfgv], convergence: fail, message: task,
      fncount: fcount
    };
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

  // Profile MLE over (mu, rho, tau) at a fixed (gamma0, gamma1): exactly the
  // optim() call copas() makes (analytic gradient, box [-Inf,-rho.bound,0] to
  // [Inf,rho.bound,Inf], default control). Throws where R's optim() throws.
  function profileMLE(TE, seTE, gamma, start, rhoBound) {
    var lower = [-Infinity, -rhoBound, 0], upper = [Infinity, rhoBound, Infinity];
    var fn = function (p) { return loglikWithoutBeta(p, gamma, TE, seTE); };
    var gr = function (p) { return gradientWithoutBeta(p, gamma, TE, seTE); };
    return optimLBFGSB(fn, gr, start, lower, upper);
  }

  /* ------------------- metagen()'s start values, bit for bit (k <= 250) */
  // metasens starts every profile fit at c(TE.random, rho0, tau), and R's
  // L-BFGS-B, given a start a few ulps away, takes a different path and stops
  // (factr = 1e7) somewhere else. That -- not the likelihood, not the optimiser
  // -- was the cause of every Tier-O failure in the validation archive (12 grid
  // points in 4 configurations, page objective above metasens's by up to 1.5e-6
  // at dat.raudenbush1985 C1 [370]); from R's own start all 12 are no worse.
  // So the start is reproduced as R computes it, not as the algebra says:
  //
  //   metafor 5.0.1 rma.uni (intercept-only X): ymci = scale(yi) (colMeans: a
  //   long-double mean); stXWX = .invcalc(X, W) = tcrossprod(qr.solve(sqrt(W)
  //   %*% X, diag(k))) -- LINPACK dqrdc2 / dqrsl on one column, with LAPACK
  //   3.12's dnrm2 (Blue's algorithm, mid-range accumulator) and BLAS dsyrk;
  //   P = W - W X stXWX X'W formed densely; crossprod(Ymc, M) %*% Ymc and
  //   P %*% P in reference-BLAS dgemv/dgemm loop order; .tr() = sum(diag()).
  //   DL: tau2 = (RSS - (k - p)) / tr(P). REML: Fisher scoring from the HE
  //   estimate exactly as rma.uni iterates it, then metafor's ll0check.
  //   meta 8.5.0 metagen: w = 1/(seTE^2 + tau2); TE.random = weighted.mean(TE, w)
  //   = sum((TE*w)[w != 0]) / sum(w); seTE.random = sqrt(1/sum(w)); tau = sqrt(tau2).
  //
  // Checked against R 4.6.0 on all 92 (input, method) cases of the archive's
  // corpus, k = 6..1653: tau2, tau, TE.random and seTE.random identical to the
  // last bit in 92 of 92 (copas/tests/copas-core-start.test.mjs holds the 90
  // with k <= 120). The REML step needs tr(P P) and Ymc' P P Ymc with P P formed
  // in dgemm's summation order -- O(k^3) -- so it is used for k <= 250 (well
  // under a second); above that metaforREML's O(k) closed form (the same
  // quantities, equal to ~1e-15 relative but not bit-identical) is used.
  var EXACT_REML_KMAX = 250;

  // LAPACK 3.12 dnrm2.f90 (incx = 1). Only the mid-range accumulator is
  // reproduced; for |x| outside [2^-511, 2^486] it returns null and the caller
  // falls back.
  function dnrm2Mid(x) {
    var amed = 0, lo = mPow(2, -511), hi = mPow(2, 486);
    for (var i = 0; i < x.length; i++) {
      var ax = mAbs(x[i]);
      if (ax > hi || ax < lo) return null;
      amed = amed + ax * ax;
    }
    return mSqrt(amed);
  }
  // metafor:::.invcalc(X = 1, W = diag(w)) -> the 1x1 (X'WX)^-1, as R computes it.
  function invcalcIntercept(w) {
    var k = w.length, x = new Array(k), i;
    for (i = 0; i < k; i++) x[i] = mSqrt(w[i]);           // sqrt(W) %*% X
    var nrmxl = dnrm2Mid(x);                              // dqrdc2, l = 1
    if (nrmxl === null || !(nrmxl > 0) || k < 2) return null;
    if (x[0] !== 0) nrmxl = x[0] < 0 ? -mAbs(nrmxl) : mAbs(nrmxl);
    var sc = 1.0 / nrmxl;
    for (i = 0; i < k; i++) x[i] = sc * x[i];             // dscal
    x[0] = 1.0 + x[0];
    var qraux = x[0], r11 = -nrmxl, s = 0;
    for (var j = 0; j < k; j++) {                         // dqrcf: dqrsl(job 100) on e_j
      var vj = j === 0 ? qraux : x[j];                    // ddot(v, e_j)
      var t = -vj / qraux;
      var b = ((j === 0 ? 1 : 0) + t * qraux) / r11;      // daxpy, then b(1)/x(1,1)
      if (b !== 0) s = s + b * b;                         // dsyrk(U, N): tcrossprod
    }
    return s;
  }
  // P[i,j] = (i == j ? w_i : 0) - w_j * (s * w_i): metafor's
  // W - W %*% X %*% stXWX %*% crossprod(X, W), element for element.
  function pElem(w, s, i, j) { var m = w[j] * (s * w[i]); return (i === j ? w[i] : 0) - m; }
  // c(crossprod(y, P) %*% y) with P generated on the fly (dgemv T, then dgemv N).
  function quadP(w, s, y) {
    var k = y.length, out = 0;
    for (var j = 0; j < k; j++) {
      var r = 0;
      for (var i = 0; i < k; i++) r = r + pElem(w, s, i, j) * y[i];
      out = out + y[j] * r;
    }
    return out;
  }
  function diagP(w, s) {
    var d = new Array(w.length);
    for (var i = 0; i < w.length; i++) d[i] = pElem(w, s, i, i);
    return d;
  }

  // tau^2 as metafor::rma.uni(yi, vi, method) returns it, or null when an input
  // is outside what is emulated (the caller then falls back).
  function metaforTau2Exact(TE, vi, method) {
    var k = TE.length, p = 1, i, j, l;
    if (!HAS_BIGINT || k < 2) return null;
    for (i = 0; i < k; i++) if (!(vi[i] > 0) || !isFin(vi[i]) || !isFin(TE[i])) return null;
    var ybar = ldmean(TE), ymc = new Array(k), w = new Array(k), s;
    for (i = 0; i < k; i++) ymc[i] = TE[i] - ybar;
    if (method === "DL") {
      for (i = 0; i < k; i++) w[i] = 1 / vi[i];
      s = invcalcIntercept(w);
      if (s === null) return null;
      var tauDL = (quadP(w, s, ymc) - (k - p)) / ldsum(diagP(w, s));
      return { tau2: mMax(0, tauDL), iterations: 0, converged: true };
    }
    // REML. HE start: P = I - X tcrossprod(stXX, X), tr(P %*% diag(vi)).
    for (i = 0; i < k; i++) w[i] = 1;
    var sI = invcalcIntercept(w);
    if (sI === null) return null;
    var rss0 = 0;
    for (j = 0; j < k; j++) {
      var r0 = 0;
      for (i = 0; i < k; i++) r0 = r0 + ((i === j ? 1 : 0) - sI) * ymc[i];
      rss0 = rss0 + ymc[j] * r0;
    }
    var dpv = new Array(k);
    for (i = 0; i < k; i++) dpv[i] = vi[i] * (1 - sI);
    var tau2 = (rss0 - ldsum(dpv)) / (k - p);
    tau2 = mMax(0, tau2, 0);                              // max(0, tau2, tau2.min)
    var threshold = 1e-5, maxiter = 100, iter = 0, change = threshold + 1, conv = true;
    var P = new Float64Array(k * k), col = new Float64Array(k), dPP = new Array(k);
    while (change > threshold) {
      iter++;
      var old2 = tau2;
      for (i = 0; i < k; i++) w[i] = 1 / (vi[i] + tau2);
      s = invcalcIntercept(w);
      if (s === null) return null;
      for (j = 0; j < k; j++) for (i = 0; i < k; i++) P[i + j * k] = pElem(w, s, i, j);
      // PP = P %*% P column by column in dgemm's order (for j, for l, for i),
      // folded straight into crossprod(Ymc, PP) %*% Ymc and diag(PP).
      var yPPy = 0;
      for (j = 0; j < k; j++) {
        for (i = 0; i < k; i++) col[i] = 0;
        for (l = 0; l < k; l++) {
          var temp = P[l + j * k], ao = l * k;
          for (i = 0; i < k; i++) col[i] = col[i] + temp * P[ao + i];
        }
        var rj = 0;
        for (i = 0; i < k; i++) rj = rj + col[i] * ymc[i];
        yPPy = yPPy + ymc[j] * rj;
        dPP[j] = col[j];
      }
      var adj = (yPPy - ldsum(diagP(w, s))) / ldsum(dPP);
      if (isNan(adj)) adj = 0;
      if (!isFin(adj)) { conv = false; break; }
      while (tau2 + adj < 0) adj = adj / 2;
      tau2 = tau2 + adj;
      change = mAbs(old2 - tau2);
      if (iter > maxiter) { conv = false; break; }
    }
    if (conv && tau2 > threshold) {
      // ll0check (con$tol = eps^0.25): a decision, not a reported number.
      var llAt = function (t2) {
        var ww = new Array(k), lv = new Array(k), rr = new Array(k), q;
        for (q = 0; q < k; q++) { ww[q] = 1 / (vi[q] + t2); lv[q] = mLog(vi[q] + t2); }
        var sw = invcalcIntercept(ww);
        if (sw === null) return NaN;
        var beta = 0, swsum = 0;
        for (q = 0; q < k; q++) { beta = beta + ymc[q] * (sw * ww[q]); swsum = swsum + ww[q]; }
        for (q = 0; q < k; q++) { var e = ymc[q] - beta; rr[q] = ww[q] * (e * e); }
        return -1 / 2 * (k - p) * mLog(2 * Math.PI) - 1 / 2 * ldsum(lv) -
          1 / 2 * mLog(mAbs(swsum)) - 1 / 2 * ldsum(rr);
      };
      if (llAt(0) - llAt(tau2) > crPow(DBL_EPSILON, 0.25)) tau2 = 0;
    }
    if (!conv) return { tau2: tau2, iterations: iter, converged: false };
    return { tau2: mMax(0, tau2), iterations: iter, converged: true };
  }
  // meta::metagen()'s random-effects pool given tau^2.
  function metagenPool(TE, seTE, tau2) {
    var k = TE.length, w = new Array(k), xw = [], i;
    for (i = 0; i < k; i++) {
      w[i] = 1 / (seTE[i] * seTE[i] + tau2);
      if (w[i] !== 0) xw.push(TE[i] * w[i]);
    }
    var sw = ldsum(w);
    return { TE_random: ldsum(xw) / sw, seTE_random: mSqrt(1 / sw), tau: mSqrt(tau2) };
  }
  function metaforStart(TE, seTE, method) {
    var vi = new Array(TE.length);
    for (var i = 0; i < TE.length; i++) vi[i] = seTE[i] * seTE[i];
    var t = metaforTau2Exact(TE, vi, method);
    if (t === null) return null;
    var m = metagenPool(TE, seTE, t.tau2);
    return { tau2: t.tau2, tau: m.tau, TE_random: m.TE_random, seTE_random: m.seTE_random,
             iterations: t.iterations, converged: t.converged, exact: true };
  }
  // metagen(..., method.tau = "DL"): metafor's closed-form DerSimonian-Laird
  // tau^2 in its P-matrix form -- O(k^2), so exact at every k.
  function metaforDL(TE, seTE) {
    var r = metaforStart(TE, seTE, "DL");
    if (r !== null) return r;
    // Outside the emulated range (BigInt unavailable, an extreme seTE, k = 1):
    // the textbook DL estimator, the same quantity to rounding. rma.uni sets
    // tau^2 = 0 for a single study.
    var k = TE.length, i, sw = 0, swy = 0, sw2 = 0;
    if (k === 1) {
      var m1 = metagenPool(TE, seTE, 0);
      return { tau2: 0, tau: 0, TE_random: m1.TE_random, seTE_random: m1.seTE_random,
               iterations: 0, converged: true, exact: false };
    }
    for (i = 0; i < k; i++) { var wi = 1 / (seTE[i] * seTE[i]); sw += wi; swy += wi * TE[i]; sw2 += wi * wi; }
    var mu0 = swy / sw, Q = 0;
    for (i = 0; i < k; i++) Q += (TE[i] - mu0) * (TE[i] - mu0) / (seTE[i] * seTE[i]);
    var tau2 = mMax(0, (Q - (k - 1)) / (sw - sw2 / sw));
    var m = metagenPool(TE, seTE, tau2);
    // Not a start metagen() can be said to give, so NOT converged (the page then
    // refuses instead of fitting from it):
    //  - any non-finite piece: a weight of Inf (seTE^2 underflows, seTE ~ 1e-160)
    //    leaves NaN, and R stops with "NA/NaN/Inf in foreign function call";
    //  - sum(w^2) overflowed (seTE ~ 1e-150). The formula above then returns 0.
    //    R does return a fit there, but warns its variances are too disparate
    //    for stable results, and its tau^2 is not the DL value either: for
    //    TE = c(.1,.2,.15,.3), seTE = c(1e-150,1e-3,1e-2,.1) R gives 0.00765625
    //    while the exact DL estimate (rational arithmetic) is 0.0049629, so no
    //    double-precision formula reproduces metagen() there (review MINOR-2).
    var ok = isFin(sw2) && isFin(tau2) && isFin(m.TE_random) && isFin(m.seTE_random);
    return { tau2: tau2, tau: m.tau, TE_random: m.TE_random, seTE_random: m.seTE_random,
             iterations: 0, converged: ok, exact: false };
  }

  /* --------------------------------------- metagen()'s REML start values */
  // metasens starts every optimisation at c(TE.random, rho0, tau), and
  // meta::metagen() takes tau^2 from metafor::rma.uni(method = "REML") with
  // its default control. That estimator is ITERATIVE: Fisher scoring from the
  // Hedges (HE) estimate, stopping as soon as |tau2_new - tau2_old| <= 1e-5
  // (absolute), with step-halving at the zero boundary and metafor's ll0check.
  // On flat likelihoods that stopping rule leaves tau^2 short of the REML
  // optimum by up to ~1e-3, and the whole Copas surface is computed from that
  // start, so reproducing metasens means reproducing metafor's stopping point,
  // not the exact REML solution. Ported from metafor 5.0.1 rma.uni (the same
  // code in 5.2.1), specialised to the intercept-only model, where
  //   P y = w (y - mu_w),  tr(P) = S1 - S2/S1,
  //   tr(PP) = S2 - 2 S3/S1 + S2^2/S1^2    (Sr = sum of w_i^r).
  // TE.random / seTE.random are then metagen's own weighted.mean pool.
  function metaforREML(TE, seTE) {
    if (TE.length <= EXACT_REML_KMAX) {
      var ex = metaforStart(TE, seTE, "REML");
      if (ex !== null) return ex;
    }
    var k = TE.length, i, vi = new Array(k), ymc = new Array(k), tmp = new Array(k);
    for (i = 0; i < k; i++) vi[i] = seTE[i] * seTE[i];
    var ybar = rsum(TE) / k;
    for (i = 0; i < k; i++) ymc[i] = TE[i] - ybar;          // scale(yi, scale = FALSE)
    // Hedges estimator (metafor's REML starting value): (RSS - tr(PV)) / (k - 1)
    var ymcbar = rsum(ymc) / k;
    for (i = 0; i < k; i++) tmp[i] = (ymc[i] - ymcbar) * (ymc[i] - ymcbar);
    var RSS = rsum(tmp), sv = rsum(vi);
    var tau2 = (RSS - (sv - sv / k)) / (k - 1);
    tau2 = mMax(0, tau2);
    var threshold = 1e-5, maxiter = 100, iter = 0, change = threshold + 1, conv = true;
    var w = new Array(k);
    // tr(P) and tr(PP) as sums of POSITIVE terms. With o_i = sum_{j!=i} w_j and
    // q_i = sum_{j!=i} w_j^2:  P_ii = w_i o_i / S1,  P_ij = -w_i w_j / S1, so
    //   tr(P)  = sum_i w_i o_i / S1,
    //   tr(PP) = sum_i (w_i o_i / S1)^2 + sum_i w_i^2 q_i / S1^2.
    // The expanded forms S1 - S2/S1 and S2 - 2 S3/S1 + S2^2/S1^2 cancel
    // catastrophically when one weight dominates (an SE of 2^-17 beside SEs near
    // 1 gave tr(PP) = 0, tau^2 = Inf and an endless step-halving loop), whereas
    // metafor forms P explicitly and does not cancel. o_i and q_i come from
    // prefix + suffix sums of positive numbers, so they never cancel either.
    var w2 = new Array(k), r2 = new Array(k), a1 = new Array(k), a2 = new Array(k);
    var pre1 = new Float64Array(k + 1), pre2 = new Float64Array(k + 1);
    var suf1 = new Float64Array(k + 1), suf2 = new Float64Array(k + 1);
    function sums(t2) {
      var j;
      for (j = 0; j < k; j++) { w[j] = 1 / (vi[j] + t2); tmp[j] = w[j] * ymc[j]; w2[j] = w[j] * w[j]; }
      var S1 = rsum(w), mu = rsum(tmp) / S1;
      for (j = 0; j < k; j++) { pre1[j + 1] = pre1[j] + w[j]; pre2[j + 1] = pre2[j] + w2[j]; }
      suf1[k] = 0; suf2[k] = 0;
      for (j = k - 1; j >= 0; j--) { suf1[j] = suf1[j + 1] + w[j]; suf2[j] = suf2[j + 1] + w2[j]; }
      for (j = 0; j < k; j++) {
        var o = pre1[j] + suf1[j + 1], q = pre2[j] + suf2[j + 1];
        var pii = w[j] * o / S1;
        a1[j] = pii; a2[j] = pii * pii + w2[j] * q / (S1 * S1);
        var e = w[j] * (ymc[j] - mu); r2[j] = e * e;
      }
      return { S1: S1, trP: rsum(a1), trPP: rsum(a2), yPPy: rsum(r2), mu: mu };
    }
    while (change > threshold) {
      iter++;
      var old2 = tau2, s = sums(tau2);
      var adj = (s.yPPy - s.trP) / s.trPP;
      if (isNan(adj)) adj = 0;
      // Defence in depth: a non-finite step cannot be halved into range (it
      // would loop forever); metafor would not produce one, so stop and report
      // non-convergence, which the page refuses.
      if (!isFin(adj)) { conv = false; break; }
      while (tau2 + adj < 0) adj = adj / 2;
      tau2 = tau2 + adj;
      change = mAbs(old2 - tau2);
      if (iter > maxiter) { conv = false; break; }
    }
    // ll0check: if tau^2 = 0 has the higher restricted likelihood (by more
    // than tol = eps^0.25), metafor resets tau^2 to 0.
    if (conv && tau2 > threshold) {
      var ll = function (t2) {
        var q = sums(t2), lsum = new Array(k);
        for (var j = 0; j < k; j++) {
          lsum[j] = mLog(vi[j] + t2);
          var e = ymc[j] - q.mu; tmp[j] = w[j] * e * e;
        }
        return -1 / 2 * (k - 1) * mLog(2 * Math.PI) - 1 / 2 * rsum(lsum) -
          1 / 2 * mLog(q.S1) - 1 / 2 * rsum(tmp);
      };
      if (ll(0) - ll(tau2) > crPow(DBL_EPSILON, 0.25)) tau2 = 0;
    }
    var wr = new Array(k), xw = new Array(k);
    for (i = 0; i < k; i++) { wr[i] = 1 / (vi[i] + tau2); xw[i] = TE[i] * wr[i]; }
    var sw = rsum(wr);
    return { tau2: tau2, tau: mSqrt(tau2), TE_random: rsum(xw) / sw,
             seTE_random: mSqrt(1 / sw), iterations: iter, converged: conv };
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
   * `refused` string, so test `if (!result || result.refused)`, never
   * `if (!result)`. The refusal reasons are:
   *   "k<3", "seTE.min==seTE.max", "seTE.near-degenerate",
   *   "TE_contour.length!=ngrid^2"   -- early returns, NO estimates present;
   *   "orthogonal-line.empty"        -- a LATE flag: every estimate is still
   *                                     present and still equals metasens's,
   *                                     because metasens does not refuse in
   *                                     this state and 5 of the validation
   *                                     archive's 138 configurations are in
   *                                     it. A renderer must refuse; a parity
   *                                     harness may read straight through.
   * On a successful fit `refused` is null, so the test above works either way.
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

    // Identification, continued. `seMin < seMax` above only excludes an EXACTLY
    // constant seTE; a near-constant one passes it and then detonates here,
    // because gamma1Range[1] = 1.29 / (1/seMin - 1/seMax) diverges as the two
    // converge. seTE = [0.1, 0.1, 0.1, 0.1, 0.1000001] gives
    // gamma1Range[1] ~ 129,000 and gamma0Range[0] ~ -1.29e6. At that corner of
    // the grid u = gamma0 + gamma1/seTE is about -1.29e6, both pnorm(u) and
    // dnorm(u) underflow, and lambda(u) = 0/0 = NaN -- deliberately, to match
    // R. The objective is then NaN at every such point, so optim() stops with
    // "L-BFGS-B needs finite values of 'fn'", copas()'s try() swallows it and
    // TE.contour silently takes the PREVIOUS grid point's value (or copas()
    // stops outright if the first point fails) -- a surface that is partly a
    // copy of itself, presented as a likelihood surface.
    //
    // The test is exact rather than a tuned threshold: refuse when the model's
    // own inverse Mills ratio is already not computable at the most extreme
    // corner of the grid metasens would scan (gamma0 = gamma0Range[0],
    // gamma1 = gamma1Range[0]). metasens does not refuse here -- it produces
    // the NaN-ridden surface -- so this is a deliberate, disclosed divergence:
    // a user-facing estimate is not the place to be faithful to an underflow.
    var uWorst = mMin(gamma0Range[0], gamma0Range[1]) +
                 mMin(gamma1Range[0], gamma1Range[1]) / seMax;
    var spread = (seMax - seMin) / seMax;
    if (!isFin(lambda(uWorst)))
      return { refused: "seTE.near-degenerate", k: k, dropped: dropped,
               seTE_min: seMin, seTE_max: seMax, seTE_spread: spread,
               gamma0_range: gamma0Range, gamma1_range: gamma1Range,
               u_worst: uWorst };

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
    var nonFinite = 0;
    var tryFailures = { contour: 0, slope: 0, rsb: 0 };
    var supplied = !!opts.TE_contour;
    if (supplied) {
      if (opts.TE_contour.length !== ngrid * ngrid)
        return { refused: "TE_contour.length!=ngrid^2", k: k, dropped: dropped };
      for (i = 0; i < ngrid * ngrid; i++) TEcontour[i] = opts.TE_contour[i];
      contourPar = null;
    } else {
      // copas(): try(junk0 <- optim(...), silent = TRUE); TE.contour[i, j] <-
      // junk0$par[1]. When optim() throws, junk0 keeps the PREVIOUS grid
      // point's fit and its value is stored again; when the very first fit
      // throws, junk0 does not exist and copas() stops. Both reproduced, and
      // every carried-forward point is counted (metasens reports none).
      var junk0 = null;
      for (i = 0; i < ngrid; i++) for (j = 0; j < ngrid; j++) {
        var carried0 = false;
        try { junk0 = profileMLE(TE, seTE, [gamma0[i], gamma1[j]], start, rhoBound); }
        catch (e0) { carried0 = true; tryFailures.contour++; }
        if (!junk0)
          return { refused: "optim-error", stage: "contour", k: k, dropped: dropped };
        TEcontour[i + j * ngrid] = junk0.par[0];
        contourPar.push({ i: i, j: j, par: junk0.par, value: junk0.value,
                          convergence: junk0.convergence, carried_forward: carried0 });
        if (!isFin(junk0.value)) nonFinite++;
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

    // The orthogonal line can collapse to the prepended (gamma0, gamma1) =
    // (10, 0) no-selection anchor alone, by either of two routes:
    //   - no contour line has adjRSquared > 0, so orthogonalLine() has nothing
    //     to pool, slope is NaN and every xSlope is NaN; or
    //   - the slope is finite but every x/y intersection rescales to a point
    //     OUTSIDE the gamma ranges, so the in-range filter drops them all.
    // Either way ng is 1, publprob is [pnorm(10)] = [1], and the single
    // "sensitivity" point is the profile MLE under NO SELECTION AT ALL.
    // metasens reports that point as TE.adjust without comment. This port
    // reports the same numbers (so it agrees with metasens) and sets
    // `warning` so a renderer can say what they are: the no-selection
    // estimate, not a selection-adjusted one. Earlier versions refused here;
    // that withheld a result metasens returns, so it was a disagreement with
    // the reference rather than a safety margin. See n_orthogonal_points.
    var collapsed = ng < 2;

    // stage 4 -- estimates down the line. copas() makes two identical optim()
    // calls per point, junk1 (the estimates) and junk2 (hessian = TRUE, for
    // seTE.slope), each in try(). They are deterministic and identical, so a
    // point where one throws is a point where both throw, and both then keep
    // the previous point's object. Reproduced, with the throw counted.
    var TEslope = [], seTEslope = [], rhoSlope = [], tauSlope = [], loglik1 = [];
    var seTEhessian = [], par1 = [], conv1 = [];
    var junk1 = null, junk2H = null;
    for (i = 0; i < ng; i++) {
      var g = [g0s[i], g1s[i]], f1 = null;
      try { f1 = profileMLE(TE, seTE, g, start, rhoBound); }
      catch (e1) { tryFailures.slope++; }
      if (f1) junk1 = f1;
      if (!junk1)
        return { refused: "optim-error", stage: "orthogonal-line", k: k, dropped: dropped };
      TEslope.push(junk1.par[0]); rhoSlope.push(junk1.par[1]); tauSlope.push(junk1.par[2]);
      loglik1.push(junk1.value); par1.push(junk1.par.slice()); conv1.push(junk1.convergence);
      // optim(hessian = TRUE): optimhess of the analytic gradient at junk2$par.
      if (f1) junk2H = optimHess((function (gq) {
        return function (p) { return gradientWithoutBeta(p, gq, TE, seTE); };
      })(g), f1.par);
      var se = NaN;
      if (junk2H) {
        // +1e-8 on EVERY element, not just the diagonal: metasens's own
        // `solve(junk2$hessian + 1e-08)`, where R recycles the scalar over all
        // n^2 entries. Faithful, not invented here.
        var Hreg = junk2H.map(function (row) { return row.map(function (v) { return v + 1e-8; }); });
        var inv00 = solveFirstDiag(Hreg);
        se = mSqrt(inv00);                    // sqrt of a negative is NaN, as in R
      }
      seTEhessian.push(se);
      // metasens's carry-forward chain (copas source lines 240-247).
      if (i > 0 && (isNan(se) || se === 0)) se = seTEslope[i - 1];
      if ((isNan(se) || se === 0) && junk2H) se = mSqrt(1 / junk2H[0][0]);
      seTEslope.push(se);
    }

    // stage 5 -- residual selection bias and the adjusted estimate. copas()
    // gives this optim() call NO gradient, so R differentiates by its own
    // central differences (ndeps = 1e-3, clipped at the bounds); optimLBFGSB
    // with gr = null is that code.
    var rhoLim = left ? [0, rhoBound] : [-rhoBound, 0];
    var loglik2 = [], par2 = [], conv2 = [], junk3 = null;
    for (i = 0; i < ng; i++) {
      var gg = [g0s[i], g1s[i]], f3 = null;
      var fnb = (function (gq) {
        return function (p) { return loglikWithBeta(p, gq, TE, seTE); };
      })(gg);
      try {
        f3 = optimLBFGSB(fnb, null, [TErandom, rho0, tau, 0],
                         [-Infinity, rhoLim[0], 0, -Infinity],
                         [Infinity, rhoLim[1], Infinity, Infinity]);
      } catch (e3) { tryFailures.rsb++; }
      if (f3) junk3 = f3;
      if (!junk3)
        return { refused: "optim-error", stage: "residual-selection-bias", k: k, dropped: dropped };
      loglik2.push(junk3.value); par2.push(junk3.par.slice()); conv2.push(junk3.convergence);
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
      refused: null,
      // Set in the collapsed-orthogonal-line case: every estimate below is
      // what metasens reports, but TE_adjust is the NO-SELECTION estimate and
      // a renderer must label it so. See `collapsed`.
      warning: collapsed ? "orthogonal-line.empty" : null,
      optim_try_failures: tryFailures,
      convergence_slope: conv1, convergence_rsb: conv2,
      n_contour_lines: cl.length,
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
      contour_nonfinite: nonFinite,
      contour_par: contourPar,
      n_orthogonal_points: ng,
      seTE_spread: spread,
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
    crmath: crmath,
    pnorm: pnorm, dnorm: dnorm, qnorm: qnorm, pchisq1Upper: pchisq1Upper,
    lambda: lambda, seqLen: seqLen, parseNumToken: parseNumToken,
    rPrettyCore: rPrettyCore, rPretty: rPretty, contourLines: contourLines,
    lmYX: lmYX, commonEffect: commonEffect, ci: ci,
    loglikWithoutBeta: loglikWithoutBeta, loglikWithBeta: loglikWithBeta,
    gradientWithoutBeta: gradientWithoutBeta,
    profileMLE: profileMLE, optimLBFGSB: optimLBFGSB, optimHess: optimHess,
    solveFirstDiag: solveFirstDiag, metaforREML: metaforREML, rsum: rsum,
    metaforDL: metaforDL, ldsum: ldsum, ldmean: ldmean,
    eggerEstimate: eggerEstimate, revOrder: revOrder,
    orthogonalLine: orthogonalLine, adjustSelection: adjustSelection,
    copas: copas
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmCopasCore = api;
})(typeof window !== "undefined" ? window : globalThis);
