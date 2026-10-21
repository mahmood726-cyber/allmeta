/* shared/rve.js — Robust Variance Estimation (Hedges, Tipton, Johnson 2010)
 *
 * Closes a methodological gap vs robumeta / clubSandwich: when effect sizes
 * are dependent (multiple outcomes per study, multi-arm trials, repeated
 * measures), inverse-variance pooling underestimates SEs. RVE uses a
 * cluster-robust sandwich with a small-sample correction so β̂ has correct
 * coverage even when the working correlation ρ is misspecified.
 *
 * CORR (correlated effects working model): each cluster's effects share a
 * constant working correlation ρ, with per-effect weight
 *   w_ij = 1 / (k_j · (v̄_j + τ²))
 * where k_j is the cluster size and v̄_j the cluster's mean sampling variance.
 *
 * τ² is the Hedges-Tipton-Johnson moment estimator for the CORR model (NOT a
 * plain DerSimonian-Laird across rows — that ignores the clustering): a
 * first-pass FE fit gives residuals, then
 *   τ² = max(0, (Qe − N + termA)/denom + ρ · termB/denom).
 *
 * Small-sample correction (default CR2, Tipton 2015 / Pustejovsky-Tipton 2018):
 * because the CORR weights are constant within a cluster, W_j = w_j·I, so the
 * within-cluster annihilator block ImHii_j = I − w_j·X_j Q X_jᵀ is SYMMETRIC
 * and A_j = ImHii_j^(−1/2) is a true symmetric inverse-square-root (eigenvalues
 * < 1e-10 zeroed, exactly as robumeta). Degrees of freedom are per-coefficient
 * Satterthwaite. CR1 (a single scalar correction, anticonservative at small m)
 * remains available via opts.method = "CR1".
 *
 * R parity: robumeta::robu(modelweights="CORR", small=TRUE) 2.1 and
 * clubSandwich::coef_test(vcov="CR2", test="Satterthwaite") 0.7.0, at 1e-9
 * (relative to max(1,|R|); absolute for p and CI) on every reported quantity of
 * the 16,270-configuration corpus, apart from the documented residuals in the
 * rve-reproducible archive (https://github.com/mahmood726-cyber/rve-reproducible).
 * Reference platform and locale: R 4.6.0, Windows x64 (80-bit x87 long double,
 * 64-bit significand, in sum()/mean()), LC_COLLATE=C. The extended sum/mean
 * and the factor order below emulate exactly that. On builds whose long double
 * is binary64 (e.g. macOS arm64) R's sum()/mean() round differently, and under
 * a non-C collation R orders character cluster labels differently, so results
 * there can differ from this engine at the 1e-9 level.
 * CR2 needs shared/rve-eigen.js (R's LAPACK DSYEVR/DGEEV via WebAssembly).
 * Browser checks: hub/shared/tests/rve-meta-wasm-render.spec.mjs (rendered
 * page, multi-row clusters, R fixture) and rve-meta-cr2-parity.spec.mjs.
 *
 * Reference: Hedges, Tipton & Johnson (2010), Research Synth Methods 1(1):39-65;
 * Tipton (2015), Psych Methods 20(3):375-393; Pustejovsky & Tipton (2018),
 * J Bus Econ Stat 36(4):672-683. R package robumeta (Fisher, Tipton, Zhipeng).
 */
(function (global) {
  "use strict";

  // ----- Matrix utilities (mini, no external deps) -----------------------

  function zeros(n, m) {
    var out = new Array(n);
    for (var i = 0; i < n; i++) { out[i] = new Array(m); for (var j = 0; j < m; j++) out[i][j] = 0; }
    return out;
  }
  function identity(n) {
    var I = zeros(n, n);
    for (var i = 0; i < n; i++) I[i][i] = 1;
    return I;
  }
  function transpose(A) {
    var n = A.length, m = A[0].length;
    var T = zeros(m, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) T[j][i] = A[i][j];
    return T;
  }
  function matMul(A, B) {
    var n = A.length, m = B[0].length, k = B.length;
    var C = zeros(n, m);
    for (var i = 0; i < n; i++)
      for (var j = 0; j < m; j++) {
        var s = 0;
        for (var t = 0; t < k; t++) s += A[i][t] * B[t][j];
        C[i][j] = s;
      }
    return C;
  }
  function matVec(A, v) {
    var n = A.length, m = v.length;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var j = 0; j < m; j++) s += A[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }
  function trace(A) { var s = 0; for (var i = 0; i < A.length; i++) s += A[i][i]; return s; }

  // Gauss-Jordan inverse; small p ≤ ~20 is fine for meta-regression designs.
  // Partial-pivot LU, followed by triangular solves (R solve.default/dgesv order).
  function invert(A) {
    var n=A.length, LU=A.map(r=>r.slice()), piv=[];
    for(var k=0;k<n;k++) {
      var pivot=k;
      for(var i=k+1;i<n;i++) if(Math.abs(LU[i][k])>Math.abs(LU[pivot][k])) pivot=i;
      if(LU[pivot][k]===0 || !Number.isFinite(LU[pivot][k])) throw new Error("RVE: singular X'WX");
      piv.push(pivot);
      if(pivot!==k) {var tmp=LU[k];LU[k]=LU[pivot];LU[pivot]=tmp;}
      for(var i=k+1;i<n;i++) LU[i][k]*=(1/LU[k][k]);
      for(var j=k+1;j<n;j++) for(var i=k+1;i<n;i++) LU[i][j]-=LU[i][k]*LU[k][j];
    }
    var out=identity(n);
    for(var k=0;k<n;k++) if(piv[k]!==k) {var tmp=out[k];out[k]=out[piv[k]];out[piv[k]]=tmp;}
    for(var col=0;col<n;col++) {
      for(var k=0;k<n;k++) for(var i=k+1;i<n;i++) out[i][col]-=out[k][col]*LU[i][k];
      for(var k=n-1;k>=0;k--) {
        out[k][col]/=LU[k][k];
        for(var i=0;i<k;i++) out[i][col]-=out[k][col]*LU[i][k];
      }
    }
    // solve.default uses machine epsilon as its computational-singularity tolerance.
    // The explicit inverse is already available, so use its one-norm condition bound.
    var normA=0,normInv=0;
    for(var j=0;j<n;j++) {
      var sa=0,si=0;
      for(var i=0;i<n;i++){sa+=Math.abs(A[i][j]);si+=Math.abs(out[i][j]);}
      normA=Math.max(normA,sa);normInv=Math.max(normInv,si);
    }
    var reciprocalCondition=(1/normA)/normInv;
    if(!(reciprocalCondition>=Number.EPSILON)) throw new Error("RVE: computationally singular X'WX");
    return out;
  }

  // Symmetric eigendecomposition via cyclic Jacobi rotations (Numerical Recipes
  // formulation). Not used by the CR2 fit (which calls R's LAPACK through
  // rve-eigen.js); kept for rve-extras.js's condition number. Returns
  // { values: [...], vectors } where vectors[i][c] is component i of eigvec c.
  function symEig(Ain) {
    var n = Ain.length;
    var A = Ain.map(function (r) { return r.slice(); });
    var V = identity(n);
    for (var sweep = 0; sweep < 100; sweep++) {
      var off = 0;
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-30) break;
      for (var pp = 0; pp < n; pp++) {
        for (var qq = pp + 1; qq < n; qq++) {
          var apq = A[pp][qq];
          if (Math.abs(apq) < 1e-300) continue;
          var theta = (A[qq][qq] - A[pp][pp]) / (2 * apq);
          var tt = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          var cc = 1 / Math.sqrt(tt * tt + 1), ss = tt * cc;
          // Apply Givens rotation G' A G (rows/cols pp,qq).
          for (var r = 0; r < n; r++) {
            var arp = A[r][pp], arq = A[r][qq];
            A[r][pp] = cc * arp - ss * arq;
            A[r][qq] = ss * arp + cc * arq;
          }
          for (var c = 0; c < n; c++) {
            var apc = A[pp][c], aqc = A[qq][c];
            A[pp][c] = cc * apc - ss * aqc;
            A[qq][c] = ss * apc + cc * aqc;
          }
          for (var v = 0; v < n; v++) {
            var vrp = V[v][pp], vrq = V[v][qq];
            V[v][pp] = cc * vrp - ss * vrq;
            V[v][qq] = ss * vrp + cc * vrq;
          }
        }
      }
    }
    var vals = new Array(n);
    for (var d = 0; d < n; d++) vals[d] = A[d][d];
    return { values: vals, vectors: V };
  }

  // Symmetric inverse square root: V diag(λ^{-1/2}) Vᵀ, with λ < 1e-10 → 0
  // (matches robumeta's eigenval thresholding for rank-deficient leverage blocks).
  function invSqrtSym(A) {
    var rEigen = global.AlmRVEEigen;
    if (!rEigen && typeof require === "function") rEigen = require("./rve-eigen.js");
    if (!rEigen) throw new Error("RVE: LAPACK eigen dependency unavailable");
    var n = A.length, eig = rEigen(A), V = eig.vectors;
    var d = eig.values.map(function (l) { return l < 1e-10 ? 0 : 1 / Math.sqrt(l); });
    var out = zeros(n, n);
    for (var i = 0; i < n; i++)
      for (var j = 0; j < n; j++) {
        var s = 0;
        for (var c = 0; c < n; c++) s += V[i][c] * d[c] * V[j][c];
        out[i][j] = s;
      }
    return out;
  }

  // ----- CORR-model fit ---------------------------------------------------
  // R 4.6 (Windows x64) summary.c uses a 64-significand-bit LDOUBLE.
  // Represent finite extended values as n * 2^e; round every operation to
  // nearest/even, not just the final sum. This also preserves mean's extended
  // subtraction/correction before its single conversion back to binary64.
  var reductionBits = new DataView(new ArrayBuffer(8));
  function ldFromDouble(x) {
    reductionBits.setFloat64(0, x);
    var hi = reductionBits.getUint32(0), lo = reductionBits.getUint32(4);
    var exp = (hi >>> 20) & 2047;
    var n = (BigInt(hi & 1048575) << 32n) | BigInt(lo);
    if (exp) n |= 1n << 52n;
    return { n: hi >>> 31 ? -n : n, e: exp ? exp - 1075 : -1074 };
  }
  function roundQuotient(n, d) {
    var q = n / d, r = n % d;
    return q + (2n * r > d || (2n * r === d && (q & 1n)) ? 1n : 0n);
  }
  function ldRound(n, e, precision) {
    var negative = n < 0n;
    if (negative) n = -n;
    var shift = Math.max(0, n.toString(2).length - precision);
    if (shift) n = roundQuotient(n, 1n << BigInt(shift));
    return { n: negative ? -n : n, e: e + shift };
  }
  function ldAdd(a, b) {
    var e = Math.min(a.e, b.e);
    return ldRound((a.n << BigInt(a.e - e)) + (b.n << BigInt(b.e - e)), e, 64);
  }
  function ldDivide(a, count) {
    if (!a.n) return a;
    var negative = a.n < 0n, n = negative ? -a.n : a.n, d = BigInt(count);
    var shift = 64 + d.toString(2).length - n.toString(2).length;
    var numerator = n << BigInt(Math.max(0, shift));
    var denominator = d << BigInt(Math.max(0, -shift));
    // Choose the scale so the quotient has exactly 64 significant bits.
    if (numerator / denominator >= (1n << 64n)) { denominator <<= 1n; shift--; }
    var q = roundQuotient(numerator, denominator);
    return { n: negative ? -q : q, e: a.e - shift };
  }
  function ldToDouble(a) {
    var n = a.n, negative = n < 0n;
    if (negative) n = -n;
    var shift = Math.max(0, n.toString(2).length - 53, -1074 - a.e);
    n = roundQuotient(n, 1n << BigInt(shift));
    var value = Number(n) * Math.pow(2, a.e + shift);
    return negative ? -value : value;
  }
  function rSum(xs) {
    var s = { n: 0n, e: 0 };
    for (var i = 0; i < xs.length; i++) {
      if (!Number.isFinite(xs[i])) return xs.reduce(function(a, b) { return a + b; }, 0);
      s = ldAdd(s, ldFromDouble(xs[i]));
    }
    return ldToDouble(s);
  }
  function rMean(xs) {
    if (xs.length === 1) return xs[0];
    var values = xs.map(ldFromDouble), s = { n: 0n, e: 0 };
    values.forEach(function(x) { s = ldAdd(s, x); });
    var finiteSum = Number.isFinite(ldToDouble(s));
    if (finiteSum) s = ldDivide(s, xs.length);
    else {
      s = { n: 0n, e: 0 };
      xs.forEach(function(x) { s = ldAdd(s, ldFromDouble(x / xs.length)); });
    }
    var t = { n: 0n, e: 0 };
    values.forEach(function(x) {
      var delta = ldAdd(x, { n: -s.n, e: s.e });
      t = ldAdd(t, finiteSum ? delta : ldDivide(delta, xs.length));
    });
    return ldToDouble(ldAdd(s, finiteSum ? ldDivide(t, xs.length) : t));
  }
  // The archived v1 reference pins LC_COLLATE/LC_CTYPE=C. R's native
  // conversion escapes unrepresentable Unicode before bytewise collation.
  function rFactorKey(label) {
    return String(label).replace(/[^\x00-\x7f]/gu, function(ch) {
      var hex = ch.codePointAt(0).toString(16).toUpperCase();
      return '<U+' + hex.padStart(hex.length > 4 ? 8 : 4, '0') + '>';
    });
  }
  // R 4.6.0 as.character(<double>) for finite x (Windows x64): StringFromReal
  // = formatReal() with 15 digits and scipen = 0, then EncodeRealDrop0
  // (src/main/format.c, printutils.c). Values are exact rationals num/den.
  //  - scientific(): kp = floor(log10 r) - 14; r_prec = r scaled by 10^-kp in
  //    64-bit long double (table power when |kp| <= 27, else powl), times
  //    10 again if below 1e14; alpha = nearbyintl(r_prec) (half-to-even).
  //    nsig drops alpha's trailing zeros.
  //  - fixed when its width is <= the E width; it then prints the value's own
  //    digits to rgt decimals, so 1e15 + 6 is "1000000000000006" while
  //    1e15 + 4 is "1e+15".
  //  - snprintf ties, measured on R 4.6.0: "%.0f" rounds half away from zero
  //    (1e15 + 6.5 -> "...007"); "%.Nf" (N >= 1) and "%e" round half-to-even.
  //  Assumed, and checked against R from 1e-300 to 1e300: powl(10, kp) is
  //  correctly rounded and Math.log10 floors as C's log10 does.
  function pow10(k) { return 10n ** BigInt(k); }
  function bitLength(n) { return n.toString(2).length; }
  function ldOf(num, den) { // num/den > 0 rounded to a 64-bit significand
    var shift = 64 - bitLength(num) + bitLength(den);
    var N = shift > 0 ? num << BigInt(shift) : num, D = shift < 0 ? den << BigInt(-shift) : den;
    if (N / D >= (1n << 64n)) { if (shift > 0) N >>= 1n; else D <<= 1n; shift--; }
    return { n: roundQuotient(N, D), e: -shift };
  }
  function fracOf(a) { // { num, den } of a positive n * 2^e
    return { num: a.n << BigInt(Math.max(a.e, 0)), den: 1n << BigInt(Math.max(-a.e, 0)) };
  }
  function roundHalfAway(n, d) { var q = n / d; return 2n * (n % d) >= d ? q + 1n : q; }
  function rAsCharacterDouble(x) {
    if (x === 0) return "0";
    var neg = x < 0 ? 1 : 0, r = fracOf(ldFromDouble(Math.abs(x)));
    var kp = Math.floor(Math.log10(Math.abs(x))) - 14, rp;
    if (kp === 0) rp = ldOf(r.num, r.den);
    else if (Math.abs(kp) <= 27) { // tbl[] holds double literals: 1e23..1e27 are inexact
      var t = fracOf(ldFromDouble(Number("1e" + Math.abs(kp))));
      rp = kp > 0 ? ldOf(r.num * t.den, r.den * t.num) : ldOf(r.num * t.num, r.den * t.den);
    } else {
      var p = fracOf(kp > 0 ? ldOf(pow10(kp), 1n) : ldOf(1n, pow10(-kp)));
      rp = ldOf(r.num * p.den, r.den * p.num);
    }
    var f = fracOf(rp);
    if (f.num < pow10(14) * f.den) { rp = ldOf(f.num * 10n, f.den); kp--; f = fracOf(rp); }
    var alpha = roundQuotient(f.num, f.den);
    var digits = alpha.toString().replace(/0+$/, ""), nsig = digits.length;
    if (alpha === pow10(15)) kp++;
    var kpower = kp + 14;
    // roundingwidens: r < 10^kpower - 0.5 / 10^rgt, rgt = 15 - kpower in [0, 27].
    var rgtW = Math.min(Math.max(15 - kpower, 0), 27);
    var widens = kpower > 0 && kpower <= 27 &&
      2n * r.num * pow10(rgtW) < r.den * (2n * pow10(kpower + rgtW) - 1n);
    var left = kpower + 1 - (widens ? 1 : 0);
    var rgt = Math.max(nsig - left, 0);
    var wF = (left < 0 ? 1 + neg : neg + (left <= 0 ? 1 : left)) + rgt + (rgt ? 1 : 0);
    var e = (left > 100 || left <= -99) ? 2 : 1;
    var wE = neg + (nsig > 1 ? 1 : 0) + (nsig - 1) + 4 + e;
    var sign = neg ? "-" : "", s;
    if (wF <= wE) { // "%.{rgt}f", then drop trailing zeros
      s = (rgt ? roundQuotient(r.num * pow10(rgt), r.den) : roundHalfAway(r.num, r.den)).toString();
      if (rgt) {
        s = s.padStart(rgt + 1, "0");
        s = (s.slice(0, -rgt) + "." + s.slice(-rgt)).replace(/\.?0+$/, "");
      }
      return sign + s;
    }
    // "%#.{nsig - 1}e" on the exact value, then drop trailing zeros.
    var ex = kpower, m;
    for (;;) {
      var d = ex - nsig + 1;
      m = roundQuotient(r.num * pow10(Math.max(-d, 0)), r.den * pow10(Math.max(d, 0)));
      if (m >= pow10(nsig)) { ex++; continue; }
      if (m < pow10(nsig - 1)) { ex--; continue; }
      break;
    }
    s = m.toString().replace(/0+$/, "");
    return sign + s[0] + (s.length > 1 ? "." + s.slice(1) : "") +
      "e" + (ex < 0 ? "-" : "+") + String(Math.abs(ex)).padStart(2, "0");
  }
  // as.factor() follows the column type. Numeric levels sort by value, and
  // values with the same as.character() label share a level; factor() keeps
  // the first label in sorted order, so a level is a contiguous run of values.
  // Character levels use the C-locale key above. Returns, per row,
  // { key: sort key, group: level identity }.
  function rFactorLevels(clusters) {
    var numeric = clusters.every(function(c) { return typeof c === "number"; });
    if (!numeric && clusters.some(function(c) { return typeof c === "number"; }))
      throw new Error("RVE: cluster IDs must be all numbers or all strings");
    return clusters.map(function(c) {
      if (!numeric) return { key: rFactorKey(c), group: String(c) };
      return { key: c, group: rAsCharacterDouble(c) };
    });
  }
  // The refusal carries the fitted cluster count, so a page reports the same m.
  function tooFewClusters(m) {
    var e = new Error("RVE: m<=p; insufficient clusters for inference");
    e.m_clusters = m;
    return e;
  }
  //
  // Input rows: { cluster, yi, vi, X: [...predictors including intercept] }
  // opts: { rho (0–1, default 0.8), tau2 (override), method ("CR2" default | "CR1") }
  //
  // Returns: { beta, cov_robust, se_robust, df (per-coefficient array),
  //   m_clusters, k_total, p, tau2, rho, method, weights }

  function fitCORR(rows, opts) {
    opts = opts || {};
    var rho = (typeof opts.rho === "number" && opts.rho >= 0 && opts.rho <= 1) ? opts.rho : 0.8;
    if (opts.rho !== undefined && (!Number.isFinite(opts.rho) || opts.rho < 0 || opts.rho > 1)) throw new Error("RVE: rho must be in [0, 1]");
    var method = (opts.method === "CR1") ? "CR1" : "CR2";
    var k = rows.length;
    if (!k) throw new Error("RVE: no rows");
    var p = rows[0].X.length; // includes intercept (robumeta's p+1)

    rows.forEach(function(r) {
      if (!r.X || r.X.length !== p || !r.X.every(Number.isFinite) || !Number.isFinite(r.yi) || !Number.isFinite(r.vi) || r.vi <= 0 || r.cluster == null || String(r.cluster).trim() === "" || (typeof r.cluster === "number" && !Number.isFinite(r.cluster))) throw new Error("RVE: invalid row or predictor count");
    });

    // robumeta 2.1 robu.R:37-39: as.factor(), then order(study).
    // Keep observations stable within factors and return weights in caller order.
    var levels = rFactorLevels(rows.map(function(r) { return r.cluster; }));
    var inputOrder = rows.map(function(r, i) { return { row: r, index: i, key: levels[i].key, group: levels[i].group }; });
    inputOrder.sort(function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index; });
    // order() on the factor codes: rows of one level (which may hold several
    // doubles, e.g. 1e15 + 4 and 1e15 + 5) stay in input order.
    var levelRank = Object.create(null), nLevels = 0;
    inputOrder.forEach(function(x) { if (!(x.group in levelRank)) levelRank[x.group] = nLevels++; });
    inputOrder.sort(function(a, b) { return levelRank[a.group] - levelRank[b.group] || a.index - b.index; });
    rows = inputOrder.map(function(x) { return x.row; });
    // Group by cluster in factor-level order.
    var clusterOrder = [];
    var byCluster = Object.create(null);
    for (var i = 0; i < k; i++) {
      var c = inputOrder[i].group;
      if (!byCluster[c]) { byCluster[c] = []; clusterOrder.push(c); }
      byCluster[c].push(i);
    }
    var m = clusterOrder.length; // N in robumeta (number of studies/clusters)


    // Per-cluster size k_j and mean sampling variance v̄_j.
    var clKj = Object.create(null), clVbar = Object.create(null);
    for (var ci = 0; ci < m; ci++) {
      var key = clusterOrder[ci], idx = byCluster[key];
      // robu.R:42 stats::ave -> mean.default -> summary.c real_mean.
      clKj[key] = idx.length;
      clVbar[key] = rMean(idx.map(function(i) { return rows[i].vi; }));
    }

    var X = rows.map(function (r) { return r.X.slice(); });
    var y = rows.map(function (r) { return r.yi; });

    // Weighted IV fit for a per-row weight vector. Returns {M=(X'WX)^{-1}, beta}.
    function fitW(weights) {
      var XtWX = zeros(p,p), Xty = new Array(p).fill(0);
      clusterOrder.forEach(function(key) {
        var idx=byCluster[key], Xj=idx.map(function(i) { return X[i]; });
        var XtW=transpose(Xj).map(function(col) { return col.map(function(v,j) {return v*weights[idx[j]];}); });
        var lhs=matMul(XtW,Xj), rhs=matVec(XtW,idx.map(function(i) {return y[i];}));
        for(var i=0;i<p;i++) { Xty[i]+=rhs[i]; for(var j=0;j<p;j++) XtWX[i][j]+=lhs[i][j]; }
      });
      var Minv = invert(XtWX);
      return { M: Minv, beta: matVec(Minv, Xty) };
    }
    function residuals(beta) {
      var e = new Array(k);
      for (var i2 = 0; i2 < k; i2++) { var fi = 0; for (var j = 0; j < p; j++) fi += X[i2][j] * beta[j]; e[i2] = y[i2] - fi; }
      return e;
    }
    function clusterWeights(tau2) {
      var w = new Array(k);
      for (var ci2 = 0; ci2 < m; ci2++) {
        var key2 = clusterOrder[ci2], idx2 = byCluster[key2];
        var wj = 1 / (clKj[key2] * (clVbar[key2] + tau2));
        for (var a2 = 0; a2 < idx2.length; a2++) w[idx2[a2]] = wj;
      }
      return w;
    }

    // ---- τ² via the HTJ CORR moment estimator (unless overridden) --------
    var tau2;
    if (typeof opts.tau2 === "number" && opts.tau2 >= 0) {
      tau2 = opts.tau2;
    } else {
      // First-pass FE weights w_ij = 1/(k_j · v̄_j); residuals from that fit.
      var wFE = clusterWeights(0);
      var f0 = fitW(wFE);
      var e0 = residuals(f0.beta);
      // robu.R:134 sumW <- sum(data.full$weights), summary.c rsum.
      var Qe = 0, sumW = rSum(wFE);
      for (var i3 = 0; i3 < k; i3++) { Qe += wFE[i3] * e0[i3] * e0[i3]; }
      // Within W_j = w_j·I and J_j = ones(k_j): build the three trace terms.
      //   sumXWJWX_j = w_j² (Σ_a X_a)(Σ_a X_a)ᵀ
      //   Matrx_WKXX_j = (w_j/k_j) Σ_a X_a X_aᵀ
      //   Matrx_wk_XJX_XX_j = (w_j/k_j)[ (Σ X)(Σ X)ᵀ − Σ X_a X_aᵀ ]
      var sumXWJWX = zeros(p, p), MWKXX = zeros(p, p), MwkXJ = zeros(p, p);
      for (var cj = 0; cj < m; cj++) {
        var keyj = clusterOrder[cj], idxj = byCluster[keyj], wj0 = wFE[idxj[0]], kj0 = idxj.length;
        var Xj=idxj.map(function(i) {return X[i];}), Xt=transpose(Xj);
        var XtW=Xt.map(function(row) {return row.map(function(v) {return v*wj0;});});
        var XtWJ=XtW.map(function(row) {var sum=0;for(var a=0;a<row.length;a++)sum+=row[a];return new Array(kj0).fill(sum);});
        var XWJWX=matMul(XtWJ.map(function(row) {return row.map(function(v) {return v*wj0;});}),Xj);
        var WKXX=matMul(Xt.map(function(row) {return row.map(function(v) {return v*(wj0/kj0);});}),Xj);
        var XtJ=Xt.map(function(row) {var sum=0;for(var a=0;a<row.length;a++)sum+=row[a];return new Array(kj0).fill(sum);});
        var XJX=matMul(XtJ,Xj), XX=matMul(Xt,Xj);
        for(var rr=0;rr<p;rr++)for(var c2=0;c2<p;c2++) {
          sumXWJWX[rr][c2]+=XWJWX[rr][c2];
          MWKXX[rr][c2]+=WKXX[rr][c2];
          MwkXJ[rr][c2]+=(wj0/kj0)*(XJX[rr][c2]-XX[rr][c2]);
        }
      }
      var denom = sumW - trace(matMul(f0.M, sumXWJWX));
      var termA = trace(matMul(f0.M, MWKXX));
      var termB = trace(matMul(f0.M, MwkXJ));
      var term1 = (Qe - m + termA) / denom;
      var term2 = termB / denom;
      tau2 = Math.max(0, term1 + rho * term2);
    }

    if (m <= p && method === "CR1") throw tooFewClusters(m);

    // ---- Re-weighted fit with the RVE weights ----------------------------
    var weights = clusterWeights(tau2);
    var fit = fitW(weights);
    var beta = fit.beta, Q = fit.M; // Q = bread = (X'WX)^{-1}
    var resid = residuals(beta);

    var cov, dfArr;
    if (method === "CR1") {
      // CR0 meat Σ_c u_c u_cᵀ with u_c = X_cᵀ W_c r_c, then scalar CR1 factor.
      var meat1 = zeros(p, p);
      for (var cc1 = 0; cc1 < m; cc1++) {
        var idxC1 = byCluster[clusterOrder[cc1]];
        var u = new Array(p);
        for (var j3 = 0; j3 < p; j3++) { var su = 0; for (var a3 = 0; a3 < idxC1.length; a3++) { var r4 = idxC1[a3]; su += X[r4][j3] * weights[r4] * resid[r4]; } u[j3] = su; }
        for (var i4 = 0; i4 < p; i4++) for (var j4 = 0; j4 < p; j4++) meat1[i4][j4] += u[i4] * u[j4];
      }
      var cr1 = (m > 1) ? (m / (m - 1)) * ((k - 1) / Math.max(1, k - p)) : 1;
      for (var ii2 = 0; ii2 < p; ii2++) for (var jj2 = 0; jj2 < p; jj2++) meat1[ii2][jj2] *= cr1;
      cov = matMul(matMul(Q, meat1), Q);
      var df1 = Math.max(1, m - p);
      dfArr = []; for (var z = 0; z < p; z++) dfArr.push(df1);
    } else {
      // ---- CR2 bias-reduced sandwich -------------------------------------
      // Per cluster: A_j = (I − w_j X_j Q X_jᵀ)^{-1/2}, g_j = w_j X_jᵀ A_j e_j,
      // meat = Σ_j g_j g_jᵀ, cov = Q meat Q.
      var XQ = matMul(X, Q); // k × p  (row α = X_α Q)
      var meat = zeros(p, p);
      var Alist = [], idxList = [];
      for (var cc = 0; cc < m; cc++) {
        var idxC = byCluster[clusterOrder[cc]], kj = idxC.length, wj = weights[idxC[0]];
        // ImHii = I − w_j X_j Q X_jᵀ  (k_j × k_j, symmetric)
        var ImHii = zeros(kj, kj);
        for (var a4 = 0; a4 < kj; a4++) for (var b4 = 0; b4 < kj; b4++) {
          var dot = 0; for (var l = 0; l < p; l++) dot += XQ[idxC[a4]][l] * X[idxC[b4]][l];
          ImHii[a4][b4] = (a4 === b4 ? 1 : 0) - wj * dot;
        }
        var Aj = invSqrtSym(ImHii);
        Alist.push(Aj); idxList.push(idxC);
        var Xj = idxC.map(function(i) { return X[i]; });
        var XtWj = transpose(Xj).map(function(row) { return row.map(function(v) { return v * wj; }); });
        var Sj = idxC.map(function(i) { return idxC.map(function(j) { return resid[i]*resid[j]; }); });
        var block = matMul(matMul(matMul(XtWj, Aj), Sj), Aj);
        block = block.map(function(row) { return row.map(function(v) { return v*wj; }); });
        block = matMul(block, Xj);
        for (var i6=0;i6<p;i6++) for(var j6=0;j6<p;j6++) meat[i6][j6]+=block[i6][j6];
      }
      // robumeta's eigenvalue comparison precedes the reference's m<=p guard.
      if (m <= p) throw tooFewClusters(m);
      cov = matMul(matMul(Q, meat), Q);

      // ---- Satterthwaite df per coefficient ------------------------------
      // Full ImH (k×k): ImH[α][γ] = δ − (X_α Q X_γᵀ) w_γ.
      var ImH = zeros(k, k);
      for (var aF = 0; aF < k; aF++) for (var gF = 0; gF < k; gF++) {
        var dt = 0; for (var lF = 0; lF < p; lF++) dt += XQ[aF][lF] * X[gF][lF];
        ImH[aF][gF] = (aF === gF ? 1 : 0) - dt * weights[gF];
      }
      var sqrtW = weights.map(function (wv) { return Math.sqrt(wv); });
      dfArr = [];
      for (var ic = 0; ic < p; ic++) {
        // v_{j} (length k): v_j[γ] = (1/√w_γ) Σ_{α∈j} ImH[α][γ] · P_j[α][ic],
        //   P_j = w_j A_j X_j Q.
        var vList = [];
        for (var cj2 = 0; cj2 < m; cj2++) {
          var idxC2 = idxList[cj2], Aj2 = Alist[cj2], kj2 = idxC2.length, wj2 = weights[idxC2[0]];
          // P_j[:,ic] (length k_j) = w_j · A_j · (X_j Q)[:,ic]
          var Pcol = new Array(kj2);
          for (var a7 = 0; a7 < kj2; a7++) { var sp = 0; for (var b7 = 0; b7 < kj2; b7++) sp += Aj2[a7][b7] * XQ[idxC2[b7]][ic]; Pcol[a7] = wj2 * sp; }
          var v = new Array(k);
          for (var gC = 0; gC < k; gC++) {
            var sv = 0; for (var a8 = 0; a8 < kj2; a8++) sv += ImH[idxC2[a8]][gC] * Pcol[a8];
            v[gC] = sv / sqrtW[gC];
          }
          vList.push(v);
        }
        // dfs = (Σ_j v_j·v_j)² / Σ_{j,j'} (v_j·v_{j'})²
        var traceB = 0, sumSq = 0;
        for (var jA = 0; jA < m; jA++) {
          for (var jB = 0; jB < m; jB++) {
            var dotv = 0; for (var gD = 0; gD < k; gD++) dotv += vList[jA][gD] * vList[jB][gD];
            sumSq += dotv * dotv;
            if (jA === jB) traceB += dotv;
          }
        }
        dfArr.push(sumSq > 0 ? (traceB * traceB) / sumSq : Math.max(1, m - p));
      }
    }

    var se = new Array(p);
    for (var i7 = 0; i7 < p; i7++) se[i7] = Math.sqrt(Math.max(0, cov[i7][i7]));

    var callerWeights = new Array(k);
    inputOrder.forEach(function(x, i) { callerWeights[x.index] = weights[i]; });
    return {
      beta: beta, cov_robust: cov, se_robust: se,
      df: dfArr, m_clusters: m, k_total: k, p: p,
      tau2: tau2, rho: rho, method: method, weights: callerWeights,
    };
  }

  // Plain DL across all rows (ignores clustering) — retained for callers that
  // want a quick τ² approximation; the CORR fit uses the HTJ estimator above.
  function tau2_DL_simple(yi, vi) {
    var k = yi.length;
    var w = vi.map(function (v) { return 1 / v; });
    var sw = w.reduce(function (a, b) { return a + b; }, 0);
    var muFE = w.reduce(function (a, b, i) { return a + b * yi[i]; }, 0) / sw;
    var Q = 0;
    for (var i = 0; i < k; i++) Q += w[i] * (yi[i] - muFE) * (yi[i] - muFE);
    var sw2 = w.reduce(function (a, b) { return a + b * b; }, 0);
    var denom = sw - sw2 / sw;
    if (denom <= 1e-12) return 0;
    return Math.max(0, (Q - (k - 1)) / denom);
  }

  // ----- Inference --------------------------------------------------------

  function summary(fit, opts) {
    opts = opts || {};
    var qt = (global.AlmStats && global.AlmStats.qt) ? global.AlmStats.qt : null;
    if (!qt || !global.AlmStats.pt) throw new Error("RVE: Student-t inference dependency unavailable");
    var out = [];
    for (var j = 0; j < fit.p; j++) {
      var dfj = Array.isArray(fit.df) ? fit.df[j] : fit.df;
      var crit = qt(0.975, dfj);
      var est = fit.beta[j];
      var sej = fit.se_robust[j];
      var tval = est / sej;
      var pval;
      pval = 2 * global.AlmStats.pt(-Math.abs(tval), dfj);
      out.push({ coef_index: j, estimate: est, se: sej, t: tval, df: dfj, ci_lo: est - crit * sej, ci_hi: est + crit * sej, p: pval });
    }
    return out;
  }
  function _erfApprox(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }

  var api = {
    fitCORR: fitCORR,
    summary: summary,
    tau2_DL_simple: tau2_DL_simple,
    _invert: invert,
    _matMul: matMul,
    // Jacobi eigen; no longer used by the fit, still used by rve-extras.js
    // for the reported condition number kappa(X'WX).
    _symEig: symEig,
    _invSqrtSym: invSqrtSym,
    // R-reduction and factor-order helpers, exposed for the regression tests.
    _reductions: { rSum: rSum, rMean: rMean, rFactorKey: rFactorKey, rFactorLevels: rFactorLevels, rAsCharacterDouble: rAsCharacterDouble },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRVE = api;
})(typeof window !== "undefined" ? window : globalThis);
