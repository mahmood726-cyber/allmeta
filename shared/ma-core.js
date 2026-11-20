/* shared/ma-core.js — audited single-source meta-analysis core.
 *
 * The canonical, R-verified pooling routines (τ² estimators, inverse-variance
 * random/fixed-effect pool, Hartung-Knapp-Sidik-Jonkman adjustment, Q, I²) that
 * were previously re-implemented per app. Browser (window.AlmMaCore) and Node
 * (module.exports). Inputs are effect sizes yi with sampling variances vi (pool
 * on the analysis scale — logRR/logOR/logHR/SMD — and back-transform in the app).
 *
 * Verified vs metafor::rma to ≤1e-7 on a heterogeneous k=8 dataset
 * (yi=c(.10,.30,.50,.20,.90,.40,1.10,.05) sei=c(.20,.25,.18,.30,.22,.28,.35,.15)):
 *   DL   τ²=0.0734430866 μ=0.4059483675 se=0.1269421050 I²=59.811091
 *   PM   τ²=0.0740705629 μ=0.4061133078 se=0.1272650356 I²=60.015415
 *   REML τ²=0.0712971154 μ=0.4053720468 se=0.1258303793 I²=59.096236
 *   DL+KNHA se=0.1272434242 ;  FE μ=0.3541625626 se=0.0769232414
 * See ma-core-parity.spec.mjs. τ² gotchas (DL bias for k<10, HKSJ floor, t-df)
 * follow advanced-stats.md; the HKSJ floor is OPT-IN (knhaFloor) since metafor
 * does not floor by default.
 *
 * Reference: DerSimonian & Laird 1986; Paule & Mandel 1982; Viechtbauer 2005
 * (REML); Hartung-Knapp 2001 / Sidik-Jonkman 2002; Higgins-Thompson 2002 (I²).
 */
(function (global) {
  "use strict";

  function _wsums(yi, vi, t2) {
    var sw = 0, swy = 0, k = yi.length;
    for (var i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; swy += w * yi[i]; }
    var mu = swy / sw, Q = 0;
    for (var j = 0; j < k; j++) { var w2 = 1 / (vi[j] + t2); Q += w2 * (yi[j] - mu) * (yi[j] - mu); }
    return { sw: sw, mu: mu, Q: Q };
  }

  // DerSimonian-Laird moment estimator (closed form).
  function tau2DL(yi, vi) {
    var k = yi.length; if (k < 2) return 0;
    var w = vi.map(function (v) { return 1 / v; });
    var sw = 0, sw2 = 0, swy = 0;
    for (var i = 0; i < k; i++) { sw += w[i]; sw2 += w[i] * w[i]; swy += w[i] * yi[i]; }
    var muFE = swy / sw, Q = 0;
    for (var j = 0; j < k; j++) Q += w[j] * (yi[j] - muFE) * (yi[j] - muFE);
    var c = sw - sw2 / sw;
    if (c <= 0) return 0;
    return Math.max(0, (Q - (k - 1)) / c);
  }

  // Paule-Mandel: root of generalised Q(τ²) = k-1 (monotone decreasing).
  function tau2PM(yi, vi) {
    var k = yi.length, df = k - 1; if (df < 1) return 0;
    if (_wsums(yi, vi, 0).Q <= df) return 0;
    // Bracket by doubling until Q(hi) <= df. No absolute cap: the former `hi > 1e9` break returned
    // 2^30 for every PM tau2 above it (e.g. raw-scale outcomes). Bisection then runs until the
    // interval stops shrinking in floating point (a relative criterion), not a fixed step count;
    // for any bracket the old 200 steps already reached, the result is bit-for-bit the same.
    var lo = 0, hi = 1, guard = 0;
    while (_wsums(yi, vi, hi).Q > df) {
      hi *= 2;
      if (++guard > 1100 || !isFinite(hi)) throw new RangeError("Paule-Mandel tau2 could not be bracketed");
    }
    for (var i = 0; i < 2300; i++) {
      var m = (lo + hi) / 2;
      if (m <= lo || m >= hi) break;
      if (_wsums(yi, vi, m).Q > df) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  // (Restricted) profile log-likelihood of τ² for the normal-normal RE model,
  // up to an additive constant. restricted=true adds the −½ log Σw REML term.
  //   ℓ(τ²) = −½[ Σ log(v+τ²) + Σ (y−μ̂)²/(v+τ²) ]  (− ½ log Σw if restricted)
  function _tau2LogLik(yi, vi, t2, restricted) {
    var k = yi.length, sw = 0, swy = 0, slog = 0, i;
    for (i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; swy += w * yi[i]; slog += Math.log(vi[i] + t2); }
    var mu = swy / sw, rss = 0;
    for (i = 0; i < k; i++) { var w2 = 1 / (vi[i] + t2); rss += w2 * (yi[i] - mu) * (yi[i] - mu); }
    var ll = -0.5 * (slog + rss);
    if (restricted) ll -= 0.5 * Math.log(sw);
    return ll;
  }

  // ML's candidate iteration (REML uses the separate global search below).
  // (Restricted) maximum-likelihood τ² via the standard fixed-point update
  //   τ²_{n+1} = [ Σ w²((y−μ)² − v) (+ 1/Σw if restricted) ] / Σ w² ,  w=1/(v+τ²).
  // The bare iteration can boundary-trap (REML) or oscillate without converging
  // (ML) on dominant-precise-outlier data, returning a τ² far from the true
  // maximiser (→ a wildly over-narrow CI). We therefore keep the fast iteration
  // but return the (restricted) profile-likelihood argmax among the iterate and
  // robust fallbacks {PM, DL, 0}. On well-behaved data the iterate IS the max,
  // so the fallback is never chosen and the metafor-verified value is returned
  // unchanged (exact parity); only in the pathological cases does it escape to
  // the profile-LL-better PM estimate.
  function _tau2FixedPoint(yi, vi, restricted, iters) {
    var k = yi.length, t2 = tau2DL(yi, vi), i;
    for (var it = 0; it < iters; it++) {
      var sw = 0, sw2 = 0, swy = 0;
      for (i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; sw2 += w * w; swy += w * yi[i]; }
      var mu = swy / sw, num = 0;
      for (i = 0; i < k; i++) { var w2 = 1 / (vi[i] + t2); num += w2 * w2 * ((yi[i] - mu) * (yi[i] - mu) - vi[i]); }
      var next = num / sw2 + (restricted ? 1 / sw : 0);
      if (next < 0) next = 0;
      if (Math.abs(next - t2) < 1e-12) { t2 = next; break; }
      t2 = next;
    }
    return t2;
  }
  // Score of the (restricted) profile log-likelihood in tau^2; zero at an interior (RE)ML estimate.
  function _tau2Score(yi, vi, t2, restricted) {
    var k = yi.length, sw = 0, sw2 = 0, swy = 0, i;
    for (i = 0; i < k; i++) { var w = 1 / (vi[i] + t2); sw += w; sw2 += w * w; swy += w * yi[i]; }
    var mu = swy / sw, s = -0.5 * sw;
    for (i = 0; i < k; i++) { var w2 = 1 / (vi[i] + t2); s += 0.5 * w2 * w2 * (yi[i] - mu) * (yi[i] - mu); }
    return restricted ? s + 0.5 * sw2 / sw : s;
  }
  // Polish an interior estimate to machine precision by bisection on the score. The fixed-point iteration stops at an
  // ABSOLUTE change of 1e-12, which leaves a relative error of ~1e-7 when tau^2 is ~1e-5 (studies with tiny variances,
  // e.g. metadat::dat.hart1999); the polished root is kept only if its log-likelihood is at least as high.
  function _tau2Polish(yi, vi, t, restricted) {
    if (!(t > 0) || !isFinite(t)) return t;
    var lo = t, hi = t, sLo = _tau2Score(yi, vi, lo, restricted), sHi = sLo, guard = 0;
    if (sLo === 0) return t;
    if (sLo > 0) { while (sHi > 0 && guard++ < 200) { hi *= 2; sHi = _tau2Score(yi, vi, hi, restricted); } }
    else { while (sLo < 0 && lo > 1e-300 && guard++ < 2000) { lo /= 2; sLo = _tau2Score(yi, vi, lo, restricted); } }
    if (!(sLo > 0 && sHi <= 0)) return t;
    for (var i = 0; i < 400 && hi - lo > 0; i++) {
      var m = 0.5 * (lo + hi);
      if (m <= lo || m >= hi) break;
      if (_tau2Score(yi, vi, m, restricted) > 0) lo = m; else hi = m;
    }
    var r = 0.5 * (lo + hi);
    // a root of the score is the stationary point; the guard (with rounding-level slack) only stops a jump to another mode
    return _tau2LogLik(yi, vi, r, restricted) >= _tau2LogLik(yi, vi, t, restricted) - 1e-10 ? r : t;
  }
  function _tau2Guarded(yi, vi, restricted) {
    if (yi.length < 2) return 0;
    var fp = _tau2FixedPoint(yi, vi, restricted, restricted ? 200 : 300);
    var best = fp, bestLL = _tau2LogLik(yi, vi, fp, restricted);
    var cands = [tau2PM(yi, vi), tau2DL(yi, vi), 0];
    for (var j = 0; j < cands.length; j++) {
      var t = cands[j];
      if (t >= 0 && isFinite(t)) { var l = _tau2LogLik(yi, vi, t, restricted); if (l > bestLL + 1e-9) { bestLL = l; best = t; } }
    }
    return _tau2Polish(yi, vi, best, restricted);
  }

  // REML must compare competing interior modes even if the first estimate is
  // positive. A fixed log grid (or a single score bracket) cannot establish a
  // global maximum. Bound the score on each interval and subdivide whenever a
  // better likelihood remains possible. See docs/reml-global-validation.md.
  function tau2REML(yi, vi) {
    var k = yi.length, i, imin = 0, vmax = 0;
    if (vi.length !== k) throw new RangeError("REML needs equally sized yi and vi arrays");
    for (i = 0; i < k; i++) {
      if (typeof yi[i] !== "number" || !isFinite(yi[i]) ||
          typeof vi[i] !== "number" || !isFinite(vi[i]) || !(vi[i] > 0)) {
        throw new RangeError("REML needs finite effects and strictly positive finite variances");
      }
      if (vi[i] < vi[imin]) imin = i;
      if (vi[i] > vmax) vmax = vi[i];
    }
    if (k < 2) return 0;

    // Centre at the most precise study and scale both y and v. This avoids
    // overflow in squared weights and makes the search independent of units.
    var scale = Math.sqrt(vmax), y = [], v = [], ybar = 0;
    for (i = 0; i < k; i++) scale = Math.max(scale, Math.abs(yi[i] - yi[imin]));
    for (i = 0; i < k; i++) {
      y[i] = (yi[i] - yi[imin]) / scale;
      v[i] = (vi[i] / scale) / scale;
      if (!isFinite(y[i]) || !(v[i] > 0)) throw new RangeError("REML input range exceeds floating-point precision");
      ybar += y[i];
    }
    ybar /= k;
    var upper = 0, equalV = true;
    for (i = 0; i < k; i++) {
      upper += (y[i] - ybar) * (y[i] - ybar);
      if (v[i] !== v[0]) equalV = false;
    }
    if (upper === 0) return 0;
    function unscale(t) {
      var result = t * scale * scale;
      if (!isFinite(result)) throw new RangeError("REML variance exceeds floating-point range");
      return result;
    }
    // Exact closed forms also preserve very small positive boundary solutions.
    if (k === 2) return unscale(Math.max(0, ((y[0] - y[1]) * (y[0] - y[1]) - v[0] - v[1]) / 2));
    if (equalV) return unscale(Math.max(0, upper / (k - 1) - v[0]));

    // In orthogonal residual contrasts, the score is
    // 1/2 sum_j [z_j^2/(lambda_j+t)^2 - 1/(lambda_j+t)].
    // sum z_j^2 = upper; hence every term is negative for t >= upper.
    // No maximum outside [0, upper] can beat the endpoint.
    var evaluations = 0, weights = [], roundoff = 64 * Number.EPSILON * (k + 1);
    function at(t) {
      if (++evaluations > 100000) throw new RangeError("REML global likelihood search did not resolve");
      var r = v[imin] + t, sw = 0, swy = 0, cross = 0, logdet = 0, j;
      for (j = 0; j < k; j++) {
        var w = r / (v[j] + t); weights[j] = w;
        cross += sw * w; sw += w; swy += w * y[j];
        // Cancel the most precise study's log(r) analytically in the REML
        // determinant: sum log(v+t) + log(sum 1/(v+t)).
        if (j !== imin) logdet += Math.log(v[j] + t);
      }
      var mu = swy / sw, rss = 0, a = 0;
      for (j = 0; j < k; j++) {
        var d = y[j] - mu;
        rss += weights[j] * d * d;
        a += weights[j] * weights[j] * d * d;
      }
      // a/r^2 = y'P^2 y, b/r = trace(P). The pair sum avoids cancellation
      // in sum(w) - sum(w^2)/sum(w) for one overwhelmingly precise study.
      var b = 2 * cross / sw;
      return { t: t, ll: -0.5 * (logdet + Math.log(sw) + rss / r),
               a: a, b: b, r: r, sign: a - b * r };
    }
    // Curvature terms of the restricted profile log-likelihood at p.t, in
    // units of p.r: c3/r^3 = y'P^3 y and b2/r^2 = trace(P^2), so that
    // ll''(t) = trace(P^2)/2 - y'P^3 y. In orthogonal contrasts both are
    // sums of 1/(lambda_j+t)^2 and z_j^2/(lambda_j+t)^3, hence decreasing in
    // t. Both are formed from nonnegative terms only (no cancellation when one
    // study dominates). Computed lazily: only the interval test needs them.
    var pre = [];
    function curv(p) {
      if (p.c3 !== undefined) return p;
      var t = p.t, r = p.r, sw = 0, swy = 0, j;
      for (j = 0; j < k; j++) {
        var w = r / (v[j] + t); weights[j] = w; pre[j] = sw; sw += w; swy += w * y[j];
      }
      var mu = swy / sw, swu = 0, suf = 0, sq = 0, pair = 0, diag = 0, c3 = 0;
      for (j = 0; j < k; j++) swu += weights[j] * weights[j] * (y[j] - mu);
      var ubar = swu / sw;
      for (j = k - 1; j >= 0; j--) {
        var wj = weights[j], du = wj * (y[j] - mu) - ubar, others = pre[j] + suf, w2 = wj * wj;
        c3 += wj * du * du;
        diag += w2 * others * others;   // P_jj = w_j (sw - w_j) / sw
        pair += sq * w2; sq += w2;      // sum_{i<j} w_i^2 w_j^2
        suf += wj;
      }
      p.c3 = c3; p.b2 = (diag + 2 * pair) / (sw * sw);
      return p;
    }
    // ll'' <= trace(P(a)^2)/2 - y'P(b)^3 y < 0 certifies that ll is strictly
    // concave on [a, b]: it has at most one stationary point there, so a
    // bracketed score root is its maximum on the interval.
    function concave(a, b) {
      curv(a); curv(b);
      var q = b.r / a.r, lhs = 0.5 * a.b2 * q * q * b.r;
      return lhs * (1 + 1e-10) < b.c3 * (1 - 1e-10);
    }
    var boundary = at(0), best = boundary;
    function take(p) {
      if (p.ll > best.ll || (best.t === 0 && boundary.sign > 0 && p.t > 0 &&
          p.ll >= best.ll - roundoff * Math.max(1, Math.abs(best.ll)))) best = p;
    }
    function polish(a, b) {
      if (!(a.sign > 0 && b.sign < 0)) return;
      // This bracket might contain several roots. Polishing supplies a
      // candidate; the interval bounds still check the rest of the bracket.
      for (var j = 0; j < 200; j++) {
        var mid = a.t + (b.t - a.t) / 2;
        if (mid === a.t || mid === b.t) break;
        var m = at(mid);
        if (m.sign > 0) a = m; else b = m;
      }
      var root = at(a.t + (b.t - a.t) / 2); root.root = true; take(root);
    }
    function holdsRoot(a, b) { return best.root === true && a.t <= best.t && best.t <= b.t; }
    // Seed with the previous estimator (fixed point + score-root polish in
    // original units). On the usual unimodal input it already is the global
    // maximum, so the brackets around it need no polishing and the interval
    // bounds below prune quickly. It is a candidate only: the search below
    // still certifies (or overturns) it.
    var legacy = _tau2Guarded(yi, vi, true), lt = legacy / scale / scale;
    var lp = null;
    if (legacy > 0 && isFinite(legacy) && lt <= upper) { lp = at(lt); lp.root = true; take(lp); }
    // Initial partition: 0, min(v), the previous estimate and the upper end.
    // Wide intervals are later split at their geometric mean, so every
    // positive scale is still reached; this is an acceleration only, the
    // interval refinement below supplies the guard.
    var points = [boundary], t = Math.min(v[imin], upper), top = at(upper);
    take(top); points.push(top);
    if (t < upper) { var p0 = at(t); take(p0); points.push(p0); }
    if (lp !== null && lt > 0 && lt < upper && lt !== t) points.push(lp);
    points.sort(function (x, z) { return x.t - z.t; });
    var stack = [];
    for (i = 0; i < points.length - 1; i++) {
      if (!holdsRoot(points[i], points[i + 1])) polish(points[i], points[i + 1]);
      stack.push([points[i], points[i + 1], true]);
    }
    while (stack.length) {
      var interval = stack.pop(), a = interval[0], b = interval[1], width = b.t - a.t;
      // A(t)=y'P(t)^2 y and B(t)=trace(P(t)) both decrease. Thus
      // (A(b)-B(a))/2 <= score(t) <= (A(a)-B(b))/2.
      // Express both bounds in units of b.r^2 to avoid squared tiny weights.
      var ratio = b.r / a.r, neg = a.b * ratio * b.r, pos = a.a * ratio * ratio;
      var sLo = b.a - neg, sHi = pos - b.b * b.r;
      var slackLo = roundoff * (Math.abs(b.a) + Math.abs(neg));
      var slackHi = roundoff * (Math.abs(pos) + Math.abs(b.b * b.r));
      sLo -= slackLo; sHi += slackHi;
      if (sLo > 0 || sHi < 0) continue; // monotone: an endpoint is best
      var riseA = 0.5 * (width / b.r) * (Math.max(0, sHi) / b.r);
      var riseB = 0.5 * (width / b.r) * (Math.max(0, -sLo) / b.r);
      var bound = Math.min(a.ll + riseA + roundoff * (Math.abs(a.ll) + Math.abs(riseA)),
                           b.ll + riseB + roundoff * (Math.abs(b.ll) + Math.abs(riseB)));
      var tol = 1e-11 + roundoff * Math.max(k, Math.abs(best.ll));
      if (bound <= best.ll + tol) continue;
      if (concave(a, b)) {
        if (!interval[2] && a.sign > 0 && b.sign < 0 && !holdsRoot(a, b)) polish(a, b);
        continue;
      }
      // Polishing is only an acceleration (the bound above is the guard). A
      // bracket that holds the current best has already been polished to that
      // root; re-polishing it at every refinement level cost ~50 evaluations
      // per level for no new candidate.
      if (!interval[2] && !holdsRoot(a, b)) polish(a, b);
      var mid = (a.t > 0 && b.t > 4 * a.t) ? Math.sqrt(a.t) * Math.sqrt(b.t) : a.t + width / 2;
      if (mid === a.t || mid === b.t) continue; // adjacent representable values
      var m = at(mid); take(m);
      // Refine new brackets if the first polish selected a different mode.
      stack.push([a, m, false], [m, b, false]);
    }
    // The search above SELECTS the mode by log-likelihood, but the REML
    // likelihood is flat at its maximum (a relative change of 1e-8 in tau^2
    // moves ll by ~1e-15), so ll comparison cannot place tau^2 more precisely
    // than ~sqrt(eps): a refinement midpoint whose ll is higher only by
    // rounding can displace the polished root. Locate the estimate itself on
    // the score, which crosses zero linearly at the root: bracket the score
    // sign change tightly around the selected interior mode and bisect it.
    // The bracket grows from a relative 2^-40 and stops at the first sign
    // change, so it stays inside the selected mode; the root is kept only if
    // its ll is within the search's own tolerance of the selected point.
    // A boundary winner (t = 0) is left untouched.
    var tolEnd = 1e-11 + roundoff * Math.max(k, Math.abs(best.ll));
    // The search certified the previous estimator itself: nothing to polish.
    if (best === lp) return legacy;
    if (best.t > 0 && best.sign !== 0 && best.root !== true) {
      var lo = null, hi = null, dlt = best.t * Math.pow(2, -40), probe;
      if (best.sign > 0) {
        lo = best;
        for (i = 0; i < 80 && hi === null; i++, dlt *= 2) {
          probe = at(Math.min(best.t + dlt, upper));
          if (probe.sign <= 0) hi = probe; else lo = probe;
          if (probe.t === upper) break;
        }
      } else {
        hi = best;
        for (i = 0; i < 80 && lo === null; i++, dlt *= 2) {
          probe = at(Math.max(best.t - dlt, 0));
          if (probe.sign > 0) lo = probe; else hi = probe;
          if (probe.t === 0) break;
        }
      }
      if (lo !== null && hi !== null) {
        for (i = 0; i < 200; i++) {
          var mm = lo.t + (hi.t - lo.t) / 2;
          if (mm === lo.t || mm === hi.t) break;
          probe = at(mm);
          if (probe.sign > 0) lo = probe; else hi = probe;
        }
        var root = at(lo.t + (hi.t - lo.t) / 2);
        if (root.t > 0 && root.ll >= best.ll - tolEnd) best = root;
      }
    }
    if (best.t > 0) {
      // Near the root the score is evaluated with rounding noise, so two
      // correct bisections can stop on different adjacent floats (~1e-15
      // relative). When the previous estimator (fixed point + score-root
      // polish in original units) already lies on the selected mode, keep its
      // exact value: results that were right stay bit-identical, and only
      // inputs where it missed the global maximum change.
      if (legacy > 0 && isFinite(legacy) && Math.abs(lt - best.t) <= 1e-8 * best.t &&
          at(lt).ll >= best.ll - tolEnd) return legacy;
    }
    return unscale(best.t);
  }
  function tau2ML(yi, vi) { return _tau2Guarded(yi, vi, false); }

  // Hedges (a.k.a. variance-component / "HE"): unweighted moment estimator.
  //   τ² = Σ(y−ȳ)²/(k−1) − (1/k)Σv ,  ȳ = unweighted mean.
  function tau2HE(yi, vi) {
    var k = yi.length; if (k < 2) return 0;
    var ybar = 0, i; for (i = 0; i < k; i++) ybar += yi[i]; ybar /= k;
    var ss = 0, vbar = 0; for (i = 0; i < k; i++) { ss += (yi[i] - ybar) * (yi[i] - ybar); vbar += vi[i]; }
    vbar /= k;
    return Math.max(0, ss / (k - 1) - vbar);
  }

  // Hunter-Schmidt: τ² = (Q_FE − k) / Σw ,  w = 1/v.
  function tau2HS(yi, vi) {
    var k = yi.length; if (k < 1) return 0;
    var sw = 0, swy = 0, i; for (i = 0; i < k; i++) { var w = 1 / vi[i]; sw += w; swy += w * yi[i]; }
    var muFE = swy / sw, Q = 0; for (i = 0; i < k; i++) { var w2 = 1 / vi[i]; Q += w2 * (yi[i] - muFE) * (yi[i] - muFE); }
    return Math.max(0, (Q - k) / sw);
  }

  // Sidik-Jonkman (2005) "model-error variance" estimator.
  //   τ²_0 = (1/k)Σ(y−ȳ)²; r_i = v_i/τ²_0; q_i = 1/(r_i+1); μ_v = Σq_i y_i/Σq_i;
  //   τ²_SJ = (1/(k−1)) Σ q_i (y_i − μ_v)².
  function tau2SJ(yi, vi) {
    var k = yi.length; if (k < 2) return 0;
    var ybar = 0, i; for (i = 0; i < k; i++) ybar += yi[i]; ybar /= k;
    var t0 = 0; for (i = 0; i < k; i++) t0 += (yi[i] - ybar) * (yi[i] - ybar); t0 /= k;
    if (!(t0 > 0)) t0 = 1e-8;
    var sq = 0, sqy = 0; for (i = 0; i < k; i++) { var q = 1 / (vi[i] / t0 + 1); sq += q; sqy += q * yi[i]; }
    var muv = sqy / sq, num = 0; for (i = 0; i < k; i++) { var q2 = 1 / (vi[i] / t0 + 1); num += q2 * (yi[i] - muv) * (yi[i] - muv); }
    return Math.max(0, num / (k - 1));
  }

  // EB (Empirical Bayes) is identical to Paule-Mandel (metafor documents this).
  var _T = { DL: tau2DL, PM: tau2PM, REML: tau2REML, ML: tau2ML, HE: tau2HE, HS: tau2HS, SJ: tau2SJ, EB: tau2PM };

  // Inverse-variance pool. opts: { method: τ² estimator (default PM),
  //   knha:false, knhaFloor:false, level:0.95, tau2:<override> }.
  // method ∈ {DL, PM, REML, ML, HE, HS, SJ, EB, FE}; all validated vs
  //   metafor::rma to ≤1e-7 (EB ≡ PM, per metafor). FE forces τ²=0.
  // Returns { k, tau2, mu, se, ciLo, ciHi, Q, I2, method, knha }.
  function pool(yi, vi, opts) {
    opts = opts || {};
    var method = opts.method || "PM";
    var k = yi.length, df = k - 1, level = opts.level || 0.95, alpha = 1 - level;
    // Q and I2 use fixed-effect weights even for a random-effects fit or a
    // tau2 override. Check their squared reductions before any estimator runs.
    var sw0 = 0, sw0sq = 0;
    for (var a = 0; a < k; a++) { var w0 = 1 / vi[a]; sw0 += w0; sw0sq += w0 * w0; }
    if (!isFinite(sw0 * sw0) || !isFinite(sw0sq)) {
      var rangeError = new RangeError("Inverse-variance weights exceed the supported numerical range");
      rangeError.code = "ERR_MA_WEIGHT_RANGE";
      throw rangeError;
    }
    // 2026-11-05: FE fixes heterogeneity at zero even if the caller supplies a tau2 override.
    var t2 = method === "FE" ? 0
           : (typeof opts.tau2 === "number" && opts.tau2 >= 0) ? opts.tau2
           : (_T[method] || tau2PM)(yi, vi);
    var ws = _wsums(yi, vi, t2), mu = ws.mu, sw = ws.sw;
    var se = Math.sqrt(1 / sw);
    var fe = _wsums(yi, vi, 0), Q = fe.Q;
    // I² uses the τ²-based form (metafor's rma default): 100·τ²/(τ²+s²), where s² is
    // the Higgins-Thompson typical within-study variance. For DL this equals the
    // Q-based (Q−df)/Q; for PM/REML it is method-specific (as metafor reports).
    var s2 = (k - 1) * sw0 / (sw0 * sw0 - sw0sq);
    var I2 = (df > 0 && (t2 + s2) > 0) ? 100 * t2 / (t2 + s2) : 0;
    // FE fixes tau2 at zero; heterogeneity remains the Q-based diagnostic.
    if (method === "FE") I2 = (df > 0 && Q > 0) ? Math.max(0, 100 * (Q - df) / Q) : 0;

    var knha = !!opts.knha && method !== "FE" && df >= 1;
    if (knha) {
      // HKSJ: se² = q · (1/Σw),  q = (1/df) Σ w (y−μ)²  [= generalised Q / df].
      var q = _wsums(yi, vi, t2).Q / df;
      if (opts.knhaFloor) q = Math.max(1, q); // advanced-stats.md floor (opt-in)
      se = Math.sqrt(q / sw);
    }
    var crit;
    if (knha) crit = _qt(1 - alpha / 2, df);              // t_{k-1} for HKSJ
    else crit = _qnorm(1 - alpha / 2);                    // z otherwise
    var out = {
      k: k, tau2: t2, mu: mu, se: se,
      ciLo: mu - crit * se, ciHi: mu + crit * se,
      Q: Q, I2: I2, method: method, knha: knha,
    };
    if (opts.pi && method !== "FE") {
      var pi = predictionInterval({ mu: mu, se: se, tau2: t2, k: k }, level);
      if (pi) { out.piLo = pi.lo; out.piHi = pi.hi; }
    }
    return out;
  }

  // Prediction interval for the next study's true effect (Higgins-Thompson-Spiegelhalter
  // 2009): μ ± t_{k-1} · √(τ̂² + SE²). The t_{k-1} quantile follows the Cochrane Handbook
  // v6.5 (the repo standard; the older IntHout-2016 t_{k-2} is superseded, and metafor's
  // predict() default uses z which under-covers). Pass the model SE you report (plain RE
  // or HKSJ). Undefined for k < 2. Returns { lo, hi, t, sePred } or null.
  function predictionInterval(fit, level) {
    // df defaults to k-1 (simple pool); pass fit.df = k-p for meta-regression residual df.
    var df = (typeof fit.df === "number") ? fit.df : (fit.k - 1);
    if (!(df >= 1)) return null;
    var alpha = 1 - (level || 0.95);
    var sePred = Math.sqrt((fit.tau2 || 0) + fit.se * fit.se);
    var t = _qt(1 - alpha / 2, df);
    return { lo: fit.mu - t * sePred, hi: fit.mu + t * sePred, t: t, sePred: sePred };
  }

  // Standard-normal quantile: Wichura (1988) AS 241 (PPND16), the algorithm of R's qnorm();
  // relative error ~1e-16. (Acklam's approximation, used before, has relative error ~1e-9, which
  // moved Wald CI limits of large-scale effects, e.g. RMST differences in days, by >1e-9.)
  function _qnorm(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var q = p - 0.5, r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
        45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
        133.14166789178437745) * r + 3.387132872796366608) /
        (((((((r * 5226.495278852854561 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
    }
    var lp = Math.log(q < 0 ? p : 1 - p);
    r = Math.sqrt(-lp);
    if (r <= 5) {
      r -= 1.6;
      val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
        1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
        4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
        0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
    } else if (r <= 27) {
      r -= 5;
      val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
        0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
        5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
    } else {
      // r > 27, i.e. min(p, 1-p) < exp(-729) ~= 2.507972e-317 (subnormal p): R nmath/qnorm.c iterates the
      // asymptotic expansion instead of extending the r <= 27 rational approximation beyond its range.
      if (r >= 6.4e8) val = r * Math.SQRT2;
      else {
        var s2 = -2 * lp, x2 = s2 - Math.log(2 * Math.PI * s2);
        if (r < 36000) {
          x2 = s2 - Math.log(2 * Math.PI * x2) - 2 / (2 + x2);
          if (r < 840) {
            x2 = s2 - Math.log(2 * Math.PI * x2) + 2 * Math.log1p(-(1 - 1 / (4 + x2)) / (2 + x2));
            if (r < 109) {
              x2 = s2 - Math.log(2 * Math.PI * x2) + 2 * Math.log1p(-(1 - (1 - 5 / (6 + x2)) / (4 + x2)) / (2 + x2));
              if (r < 55) x2 = s2 - Math.log(2 * Math.PI * x2) + 2 * Math.log1p(-(1 - (1 - (5 - 9 / (8 + x2)) / (6 + x2)) / (4 + x2)) / (2 + x2));
            }
          }
        }
        val = Math.sqrt(x2);
      }
    }
    return q < 0 ? -val : val;
  }
  // log Γ (Lanczos) + regularised incomplete beta (Numerical Recipes) → exact
  // Student-t CDF, inverted by bisection. Self-contained so the t-quantile (and
  // hence the prediction interval) is exact without any external stats dependency.
  function _lnGammaMC(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6];
    var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    var s = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y++; s += c[j] / y; }
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function _betacf(a, b, x) {
    var FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d;
    for (var m = 1; m <= 300; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; var del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }
  function _betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(_lnGammaMC(a + b) - _lnGammaMC(a) - _lnGammaMC(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * _betacf(a, b, x) / a : 1 - bt * _betacf(b, a, 1 - x) / b;
  }
  function _tcdf(t, df) {
    var x = df / (df + t * t), ib = 0.5 * _betai(df / 2, 0.5, x);
    return t >= 0 ? 1 - ib : ib;
  }
  // Student-t quantile: prefer the shared AlmStats.qt if loaded; otherwise invert the
  // exact t-CDF by bisection (matches R qt to ~1e-10).
  function _qt(p, df) {
    if (global.AlmStats && typeof global.AlmStats.qt === "function") return global.AlmStats.qt(p, df);
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    if (Math.abs(p - 0.5) < 1e-15) return 0;
    // t is symmetric about 0: mirror the lower tail so the bracket expands
    // correctly (the old fixed [-4,0] bracket clamped any quantile below -4).
    if (p < 0.5) return -_qt(1 - p, df);
    var lo = 0, hi = 4, guard = 0;
    while (_tcdf(hi, df) < p && guard++ < 200) hi *= 2;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (_tcdf(m, df) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  var api = {
    tau2DL: tau2DL, tau2PM: tau2PM, tau2REML: tau2REML,
    tau2ML: tau2ML, tau2HE: tau2HE, tau2HS: tau2HS, tau2SJ: tau2SJ,
    pool: pool,
    predictionInterval: predictionInterval,
    _qnorm: _qnorm, _qt: _qt,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMaCore = api;
})(typeof window !== "undefined" ? window : globalThis);
