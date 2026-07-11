/* shared/cluster-deff.js — design-effect adjustment for cluster RCTs.
 *
 * Cluster RCTs randomise GROUPS (clinics, schools) rather than individuals.
 * Standard inverse-variance pooling that treats them as if individuals were
 * randomised overstates the effective sample size — by a factor of the
 * design effect DEFF = 1 + (m̄ − 1) · ICC, where m̄ is the average cluster
 * size and ICC the intra-cluster correlation.
 *
 * Cochrane Handbook §23.1.4: inflate v_i by DEFF (or equivalently, divide
 * n_i_effective = n_i / DEFF), then pool as usual. This module returns:
 *
 *   computeDeff({ m_bar, icc })       → DEFF scalar
 *   adjustSE({ se, m_bar, icc })       → SE × √DEFF (inflated)
 *   adjustN({ n, m_bar, icc })         → n / DEFF (effective N)
 *   adjustVi({ vi, m_bar, icc })       → vi * DEFF
 *
 * Per the advanced-stats.md rule: DEFF REDUCES N_eff (N/DEFF), not inflates.
 */
(function (global) {
  "use strict";

  function _validate(o) {
    if (!o || typeof o !== "object") throw new Error("opts must be an object");
    var m = +o.m_bar, icc = +o.icc;
    if (!isFinite(m) || m < 1) throw new Error("m_bar must be >= 1");
    if (!isFinite(icc) || icc < 0 || icc > 1) throw new Error("icc must be in [0, 1]");
    return { m: m, icc: icc };
  }

  function computeDeff(opts) {
    var p = _validate(opts);
    return 1 + (p.m - 1) * p.icc;
  }

  function adjustSE(opts) {
    if (!isFinite(opts.se) || opts.se <= 0) throw new Error("se must be > 0");
    return opts.se * Math.sqrt(computeDeff(opts));
  }

  function adjustN(opts) {
    if (!isFinite(opts.n) || opts.n <= 0) throw new Error("n must be > 0");
    return opts.n / computeDeff(opts);
  }

  function adjustVi(opts) {
    if (!isFinite(opts.vi) || opts.vi <= 0) throw new Error("vi must be > 0");
    return opts.vi * computeDeff(opts);
  }

  /**
   * Apply DEFF adjustment to a row-list of { yi, vi, m_bar?, icc? }.
   * Rows with m_bar < 2 are left unadjusted. A row with a MISSING icc is left
   * unadjusted UNLESS an explicit `defaultIcc` is passed (no silent default —
   * substituting an assumed icc inflates vi ~45% without the caller's consent).
   * Returns a new array with vi inflated where appropriate; original yi unchanged.
   */
  function adjustRows(rows, defaultIcc) {
    var hasDefault = isFinite(defaultIcc);
    return rows.map(function (r) {
      var icc = isFinite(r.icc) ? r.icc : (hasDefault ? defaultIcc : NaN);
      var mBar = isFinite(r.m_bar) ? r.m_bar : 1;
      if (mBar < 2 || !isFinite(icc) || icc <= 0) return Object.assign({}, r);
      var deff = 1 + (mBar - 1) * icc;
      return Object.assign({}, r, {
        vi_unadjusted: r.vi, vi: r.vi * deff, deff: deff,
      });
    });
  }

  var api = {
    computeDeff: computeDeff,
    adjustSE: adjustSE,
    adjustN: adjustN,
    adjustVi: adjustVi,
    adjustRows: adjustRows,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmClusterDeff = api;
})(typeof window !== "undefined" ? window : globalThis);
