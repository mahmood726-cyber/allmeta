/* Standalone three-treatment Bucher input validation and independent fixed-effect summaries.
 * TE is defined as treatment1 minus treatment2 on an additive analysis scale
 * (log ratio for OR/RR/HR). Exact treatment labels are required.
 */
(function (root) {
  'use strict';
  function requireNumber(raw, name) {
    if (raw == null || (typeof raw === 'string' && !raw.trim())) {
      throw new RangeError(name + ' is missing');
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new RangeError(name + ' must be a finite number');
    return n;
  }
  function summary(rows, name) {
    if (!rows.length) throw new RangeError('No ' + name + ' direct trials were supplied');
    let sw = 0, swy = 0;
    for (const r of rows) {
      const v = r.se * r.se, w = 1 / v;
      if (!(v > 0 && Number.isFinite(w) && Number.isFinite(r.te * w))) {
        throw new RangeError(name + ': invalid or unrepresentable variance');
      }
      sw += w;
      swy += w * r.te;
    }
    const mu = swy / sw, se = Math.sqrt(1 / sw);
    if (!(Number.isFinite(mu) && Number.isFinite(se) && se > 0)) {
      throw new RangeError(name + ': fixed-effect pooling is numerically undefined');
    }
    return {mu, se, n: rows.length};
  }
  function compute(rows, opts) {
    opts = opts || {};
    const A = String(opts.A || '').trim();
    const B = String(opts.B || '').trim();
    const C = String(opts.C || '').trim();
    if (!A || !B || !C || new Set([A, B, C]).size !== 3) {
      throw new RangeError('Select three distinct nonempty treatments: A, B, and common comparator C');
    }
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new RangeError('At least two independent direct study contrasts are required');
    }
    const byPair = { AC: [], BC: [], AB: [] };
    const observedIds = new Set();
    let missingIds = 0;
    rows.forEach(function (r, i) {
      const prefix = 'CSV/network row ' + (i + 1);
      if (!r || typeof r !== 'object') throw new RangeError(prefix + ': invalid record');
      const t1 = String(r.treat1 == null ? '' : r.treat1).trim();
      const t2 = String(r.treat2 == null ? '' : r.treat2).trim();
      if (!t1 || !t2 || t1 === t2) throw new RangeError(prefix + ': two distinct treatments required');
      if (![A, B, C].includes(t1) || ![A, B, C].includes(t2)) {
        throw new RangeError(prefix + ': treatment outside chosen A/B/C comparison');
      }
      const te = requireNumber(r.TE != null ? r.TE : (r.te != null ? r.te : r.yi), prefix + ' TE');
      const se = requireNumber(r.seTE != null ? r.seTE : (r.se != null ? r.se : r.sei), prefix + ' SE');
      if (!(se > 0 && Number.isFinite(se * se) && Number.isFinite(1 / (se * se)))) {
        throw new RangeError(prefix + ': SE must be strictly positive and its variance representable');
      }
      const study = r.study == null ? '' : String(r.study).trim();
      if (study) {
        if (observedIds.has(study)) {
          throw new RangeError(prefix + ': study ' + study + ' appears in multiple contrasts (possible multi-arm dependence)');
        }
        observedIds.add(study);
      } else missingIds++;
      let key, first;
      if ((t1 === A && t2 === C) || (t1 === C && t2 === A)) { key = 'AC'; first = A; }
      else if ((t1 === B && t2 === C) || (t1 === C && t2 === B)) { key = 'BC'; first = B; }
      else { key = 'AB'; first = A; }
      byPair[key].push({ te: t1 === first ? te : -te, se, study });
    });
    const ac = summary(byPair.AC, A + ' vs ' + C);
    const bc = summary(byPair.BC, B + ' vs ' + C);
    const mu = ac.mu - bc.mu;
    const se = Math.hypot(ac.se, bc.se);
    if (!(Number.isFinite(mu) && Number.isFinite(se) && se > 0)) {
      throw new RangeError('Indirect estimate is numerically undefined');
    }
    return {
      A, B, C, AC: ac, BC: bc, indirect: {mu, se},
      excludedDirectAB: byPair.AB.length,
      independentStudyIdsUnverified: missingIds > 0,
      contributingTrials: ac.n + bc.n,
    };
  }
  const api = Object.freeze({ compute });
  root.AlmBucherCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
