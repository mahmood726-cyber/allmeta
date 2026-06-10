/* shared/sequential-ma.js — sequential meta-analysis with α-spending.
 *
 * Adaptive-design TSA: instead of comparing the cumulative Z-statistic at
 * each look against a fixed naive threshold (which inflates type-I error
 * over multiple looks), spend α gradually over the information fraction
 * trajectory. Two boundary families:
 *
 *   - O'BRIEN-FLEMING: a(t) = 2 - 2·Φ(z_{α/2}/√t)
 *     conservative early, ~standard threshold at the planned final look
 *
 *   - POCOCK: a(t) = α · ln(1 + (e − 1)·t)
 *     more aggressive early, smaller penalty later
 *
 *   - LINEAR (sanity reference): a(t) = α·t
 *
 * At each look k with information fraction t_k ∈ (0, 1], the boundary
 * is z_k = Φ⁻¹(1 − a(t_k)/2 + a(t_{k-1})/2 / […])  — i.e. spend the
 * incremental α between look k-1 and k.
 *
 * Optional futility: a β-spending INNER (lower) boundary anchored on the
 * alternative hypothesis. A valid futility boundary must reference the design
 * drift θ (without it, you cannot say what "unlikely to reach significance"
 * means). Under the canonical statistic Z_k ~ N(θ√t_k, 1), spending incremental
 * β_k at look k gives P_{H1}(Z_k ≤ l_k) = β_k, i.e.
 *     l_k = θ·√t_k − Φ⁻¹(1 − β_k),     θ = Φ⁻¹(1−α/sided) + Φ⁻¹(1−β).
 * This rises monotonically from very negative early (no early futility — the
 * inner/outer boundaries form a wedge that closes toward t=1) up to ≈ the
 * efficacy boundary at t=1. Stop for futility when |z_k| < l_k. (The previous
 * implementation used Φ⁻¹(1−β_k) with NO drift term, which is non-monotonic and
 * declares futility on a positive-trend z at the very first look — fixed.)
 *
 * Reference: Lan KK, DeMets DL 1983 (Biometrika 70(3):659-663) on α-
 * spending; O'Brien-Fleming 1979 (Biometrics 35:549-556); Wetterslev,
 * Thorlund, Brok, Gluud 2008 (Clin Epidemiol 1:215-242) on TSA;
 * Pampallona & Tsiatis 1994 (J Stat Plan Inf 42:19-35) on β-spending.
 */
(function (global) {
  "use strict";

  // ---- Standard normal CDF/quantile (BSM short form, accurate to ~1e-9) -

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
  function pnorm(z) {
    // 1 − Φ(z) via the erfc approximation (Abramowitz 26.2.17).
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  // ---- α-spending functions ---------------------------------------------

  function _spend(family, alpha, t) {
    if (t <= 0) return 0;
    if (t >= 1) return alpha;
    family = (family || "OBF").toUpperCase();
    if (family === "OBF" || family === "O'BRIEN-FLEMING") {
      var z = qnorm(1 - alpha / 2);
      // a(t) = 2 * (1 - Φ(z/√t))
      return 2 * (1 - pnorm(z / Math.sqrt(t)));
    }
    if (family === "POCOCK") {
      return alpha * Math.log(1 + (Math.E - 1) * t);
    }
    if (family === "LINEAR") {
      return alpha * t;
    }
    throw new Error("Unknown spending family: " + family);
  }

  // ---- Compute boundary at each look ------------------------------------
  //
  // looks: array of { t, z } where t is information fraction ∈ (0, 1]
  // and z is the cumulative Z-statistic at that look.
  // Returns per-look { t, z, spend_α, alpha_boundary, futility_boundary?,
  //                    decision: "continue" | "reject-H0" | "futility" }.

  function computeBoundary(looks, opts) {
    opts = opts || {};
    var alpha = isFinite(opts.alpha) ? opts.alpha : 0.05;
    var beta = isFinite(opts.beta) ? opts.beta : 0.20;
    var family = opts.family || "OBF";
    var sided = opts.sided || 2;   // two-sided by default
    var includeFutility = !!opts.futility;
    var futilityFamily = opts.futilityFamily || family;
    // Design drift θ under H1: the standardised effect the trial is powered to
    // detect at the final look. Caller may override; default = the value that
    // gives power 1−β against the two-/one-sided efficacy boundary at t=1.
    var drift = isFinite(opts.drift)
      ? opts.drift
      : qnorm(1 - alpha / (sided === 1 ? 1 : 2)) + qnorm(1 - beta);

    if (!Array.isArray(looks) || !looks.length) {
      throw new Error("looks must be a non-empty array");
    }
    // Sort by t.
    var sorted = looks.slice().sort(function (a, b) { return a.t - b.t; });

    var prevAlpha = 0, prevBeta = 0;
    var decisionTaken = null;
    var out = [];
    for (var k = 0; k < sorted.length; k++) {
      var lk = sorted[k];
      var tk = Math.max(0, Math.min(1, lk.t));
      var aCum = _spend(family, alpha, tk);
      var incrAlpha = Math.max(0, aCum - prevAlpha);
      // Per-look two-sided critical Z: spend incrAlpha now ⇒ boundary = z_{1-incrAlpha/2}.
      // (Strictly the boundary should solve the conditional rejection
      // probability under the spending function; this is the standard
      // single-look approximation used in TSA.)
      var aBoundary;
      if (sided === 2) aBoundary = qnorm(1 - incrAlpha / 2);
      else aBoundary = qnorm(1 - incrAlpha);
      var bBoundary = null;
      if (includeFutility) {
        var bCum = _spend(futilityFamily, beta, tk);
        var incrBeta = Math.max(0, bCum - prevBeta);
        // β-spending inner boundary anchored on the H1 drift (see header):
        //   l_k = θ·√t_k − Φ⁻¹(1 − β_k).  Stop for futility when |z| < l_k.
        // incrBeta==0 ⇒ Φ⁻¹(1)=+∞ ⇒ l_k=−∞ ⇒ never futile (correct: nothing was
        // spent this look). Rises monotonically toward the efficacy boundary.
        bBoundary = drift * Math.sqrt(tk) - qnorm(1 - incrBeta);
        prevBeta = bCum;
      }
      prevAlpha = aCum;

      var decision = "continue";
      if (!decisionTaken) {
        if (Math.abs(lk.z) >= aBoundary) {
          decision = "reject-H0";
          decisionTaken = decision;
        } else if (includeFutility && bBoundary != null && Math.abs(lk.z) < bBoundary) {
          decision = "futility";
          decisionTaken = decision;
        }
      } else {
        decision = "after-stop";
      }
      out.push({
        t: tk, z: lk.z,
        spend_alpha: incrAlpha,
        alpha_boundary: aBoundary,
        futility_boundary: bBoundary,
        decision: decision,
      });
    }
    return { alpha: alpha, beta: beta, family: family, sided: sided, drift: includeFutility ? drift : null, looks: out, decision: decisionTaken || "continue" };
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
    _spend: _spend,
    _qnorm: qnorm, _pnorm: pnorm,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmSequentialMA = api;
})(typeof window !== "undefined" ? window : globalThis);
