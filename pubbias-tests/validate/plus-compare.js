/* Comparison contract for the #alm-plus extras (shared by plus-adapter.js in the browser and check-plus.mjs in Node).
 * Tolerances: closed form |app-R|/max(1,|R|) <= 1e-9; trim-and-fill estimate (iterative REML) 1e-6;
 * p-values |app-R| <= 1e-9; counts, sides, branches, flags and refusal reasons exact. */
(function (g) {
  'use strict';
  const FULL = {
    pet: [['est', 'est'], ['se', 'se'], ['ciLo', 'ci_lb'], ['ciHi', 'ci_ub'], ['t', 't'], ['p', 'p'], ['slope', 'slope'], ['slopeT', 'slope_t'], ['slopeP', 'slope_p'], ['df', 'df']],
    peese: [['est', 'est'], ['se', 'se'], ['ciLo', 'ci_lb'], ['ciHi', 'ci_ub'], ['t', 't'], ['p', 'p'], ['slope', 'slope'], ['slopeT', 'slope_t'], ['slopeP', 'slope_p'], ['df', 'df']],
    conditional: [['branch', 'branch'], ['est', 'est'], ['ciLo', 'ci_lb'], ['ciHi', 'ci_ub']]
  };
  const LOO = {
    egger: [['statistic', 'statistic'], ['p', 'p'], ['limit', 'limit']],
    begg: [['tau', 'tau'], ['p', 'p']],
    trimfill: [['k0', 'k0'], ['side', 'side'], ['est', 'est']],
    pet: [['est', 'est']],
    peese: [['est', 'est']],
    conditional: [['branch', 'branch']],
    peters: [['statistic', 'statistic'], ['p', 'p']],
    harbord: [['statistic', 'statistic'], ['p', 'p']],
    thompson: [['statistic', 'statistic'], ['p', 'p'], ['limit', 'limit']]
  };
  const FLAGS = ['egger_flip', 'begg_flip', 'peters_flip', 'harbord_flip', 'thompson_flip', 'trimfill_k0_change', 'branch_change'];
  function kind(method, q) {
    if (['k0', 'side', 'branch', 'df'].includes(q)) return ['exact', 0];
    if (/^(p|slopeP)$/.test(q)) return ['abs', 1e-9];
    if (method === 'trimfill' && q === 'est') return ['rel', 1e-6];
    if (method === 'thompson') return ['rel', 1e-6]; // iterative REML, as compareTS
    return ['rel', 1e-9];
  }
  // R error text -> refusal reason (same vocabulary as plus-engine.js and the original adapter).
  function rReason(ref, method, binaryRows) {
    const e = String(ref.error || '');
    if (e.startsWith('Fisher scoring algorithm did not converge')) return 'reml-nonconvergence';
    if (e === 'Trim and fill algorithm did not converge.') return 'trimfill-nonconvergence';
    if (['loo-requires-k-4', 'loo-k-above-100', 'alpha-tie', 'k-below-3'].includes(e)) return e;
    if (['peters', 'harbord'].includes(method) && e === 'meta::metabias returned no statistic or p-value (insufficient informative rows)' &&
      Array.isArray(binaryRows) && binaryRows.filter(r => r.e1 + r.e2 > 0 && r.e1 + r.e2 < r.n1 + r.n2).length < 3) return 'insufficient-informative-rows';
    return 'r-error: ' + e;
  }
  function close(a, r, method, q) {
    const [k, tol] = kind(method, q);
    if (k === 'exact') { const pass = a === r && (typeof a === 'string' || Number.isInteger(a)); return { diff: pass ? 0 : 1, tol, pass }; }
    const ok = typeof a === 'number' && typeof r === 'number' && Number.isFinite(a) && Number.isFinite(r);
    const diff = ok ? Math.abs(a - r) / (k === 'rel' ? Math.max(1, Math.abs(r)) : 1) : Infinity;
    return { diff, tol, pass: ok && diff <= tol };
  }
  // Documented-class rule (generic; no dataset identifiers): R refused because the archive's parent REML model
  // did not converge, the app (closed form) returned a value, and R's fallback that needs no parent REML fit
  // agrees with the app at the stated tolerance. Such checks remain FAIL; this only classifies them.
  // Second class (trim-and-fill): R refuses because metafor's side-determining REML meta-regression
  // rma(yi, vi, mods=sqrt(vi)) does not converge with default controls; the app's side regression returns a value,
  // and R's trimfill with the side from that regression refitted with step halving (stepadj=0.5) agrees exactly.
  function fallbackAgrees(method, app, ref) {
    const fb = method === 'egger' ? ref.fallback_vector_form : method === 'trimfill' ? ref.fallback_side : ref.fallback_dl;
    if (!fb || fb.error || !app || app.status !== 'ok') return false;
    return LOO[method].every(([a, r]) => close(app.values[a], fb[r], method, a).pass);
  }
  // Compare one configuration. Returns {checks:[{id,quantity,app,ref,diff,tol,pass,cls}]}.
  function compareConfig(id, app, ref, binaryCounts) {
    const out = [];
    const push = (quantity, a, r, c, cls) => out.push({ id, quantity, app: a, ref: r, diff: c.diff, tol: c.tol, pass: c.pass, cls: cls || null });
    if (app.k !== ref.k) throw Error('Configuration size mismatch: ' + id);
    for (const [m, fields] of Object.entries(FULL)) {
      const a = app.full[m], r = ref.full[m];
      if (!a || !r) throw Error('Missing full-data record: ' + id + '/' + m);
      if (a.status !== 'ok' || r.error) {
        const ra = a.status === 'ok' ? null : a.reason, rr = r.error ? rReason(r, m) : null;
        push('full.' + m + '.refusal', ra, rr, { diff: ra && ra === rr ? 0 : 1, tol: 0, pass: !!ra && ra === rr });
        continue;
      }
      for (const [qa, qr] of fields) push('full.' + m + '.' + qa, a.values[qa], r[qr], close(a.values[qa], r[qr], m, qa));
    }
    const la = app.loo, lr = ref.loo;
    if (lr.error || la.status !== 'ok') {
      const ra = la.status === 'ok' ? null : la.reason, rr = lr.error ? rReason(lr, 'loo') : null;
      push('loo.refusal', ra, rr, { diff: ra && ra === rr ? 0 : 1, tol: 0, pass: !!ra && ra === rr });
      return out;
    }
    const rowsA = la.values.rows, rowsR = lr.rows;
    if (rowsA.length !== rowsR.length || rowsA.length !== app.k + 1) throw Error('Leave-one-out row coverage mismatch: ' + id);
    for (let i = 0; i < rowsA.length; i++) {
      const A = rowsA[i], R = rowsR[i], tag = 'loo.' + (A.omit === null ? 'none' : 'omit' + A.omit) + '.';
      if (A.omit !== (R.omit === null ? null : R.omit) || A.omit !== (i === 0 ? null : i)) throw Error('Omission order mismatch: ' + id);
      const sub = binaryCounts ? binaryCounts.filter((_, j) => j !== i - 1 || i === 0) : null;
      const docMethods = new Map();
      for (const [m, fields] of Object.entries(LOO)) {
        if (['peters', 'harbord'].includes(m) && !binaryCounts) { if (A[m] || R[m]) throw Error('Unexpected binary record: ' + id); continue; }
        const a = A[m]; let r = R[m];
        if (!a || !r) throw Error('Missing leave-one-out record: ' + id + '/' + m);
        // Same mapping as the original adapter: metabias without statistic and p is the insufficient-rows refusal.
        if (['peters', 'harbord'].includes(m) && !r.error && r.statistic == null && r.p == null) r = { error: 'meta::metabias returned no statistic or p-value (insufficient informative rows)' };
        if (a.status !== 'ok' || r.error) {
          const ra = a.status === 'ok' ? null : a.reason, rr = r.error ? rReason(r, m, sub) : null;
          const pass = !!ra && ra === rr;
          const cls = !pass && rr === 'reml-nonconvergence' && fallbackAgrees(m, a, r) ? (m === 'trimfill' ? 'side-regression-refusal' : ['egger', 'peters', 'harbord'].includes(m) ? 'parent-reml-refusal' : null) : null;
          if (cls) docMethods.set(m, cls);
          push(tag + m + '.refusal', ra || JSON.stringify(a.values), rr, { diff: pass ? 0 : 1, tol: 0, pass }, cls);
          continue;
        }
        for (const [qa, qr] of fields) push(tag + m + '.' + qa, a.values[qa], r[qr], close(a.values[qa], r[qr], m, qa));
      }
      if (i > 0) {
        for (const f of FLAGS) {
          if (!binaryCounts && /^(peters|harbord)/.test(f)) continue;
          const a = A.flags[f], r = R.flags[f];
          if (a === undefined || r === undefined) throw Error('Missing flag: ' + id + '/' + f);
          const pass = a === r, m = f.split('_')[0];
          // A flag is undefined (null) wherever R refused; it inherits the classification of that refusal.
          const cls = pass ? null : docMethods.get(m) || baseDoc(rowsA[0], rowsR[0], m, binaryCounts);
          push(tag + 'flag.' + f, a, r, { diff: pass ? 0 : 1, tol: 0, pass }, cls);
        }
      }
    }
    return out;
  }
  function baseDoc(A, R, m, binaryCounts) {
    if (!['egger', 'peters', 'harbord', 'trimfill'].includes(m) || !R[m] || !R[m].error) return null;
    if (rReason(R[m], m, binaryCounts) !== 'reml-nonconvergence' || !fallbackAgrees(m, A[m], R[m])) return null;
    return m === 'trimfill' ? 'side-regression-refusal' : 'parent-reml-refusal';
  }
  // Thompson-Sharp (page engine, fixed in this version) vs metafor regtest(rma(REML), model="rma", predictor="sei").
  // Iterative REML: 1e-6 relative (unit floor); p-value 1e-9 absolute; refusals exact.
  function compareTS(id, E, rows, ref) {
    const out = [], push = (q, a, r, c) => out.push({ id, quantity: 'thompson_sharp.' + q, app: a, ref: r, diff: c.diff, tol: c.tol, pass: c.pass, cls: null });
    if (!ref) throw Error('Missing Thompson-Sharp reference: ' + id);
    let a; try { a = E.thompsonSharp(rows); } catch (e) { a = { error: e.message }; }
    const reason = e => e.startsWith('Fisher scoring algorithm did not converge') ? 'reml-nonconvergence' : 'error: ' + e;
    if (a.error || ref.error) {
      const ra = a.error ? reason(a.error) : null, rr = ref.error ? reason(ref.error) : null;
      push('refusal', ra || JSON.stringify(a), rr, { diff: ra && ra === rr ? 0 : 1, tol: 0, pass: !!ra && ra === rr });
      return out;
    }
    for (const q of ['statistic', 'p', 'b0', 'limit', 'tau2']) {
      const r = ref[q], v = a[q], ok = Number.isFinite(v) && Number.isFinite(r), tol = q === 'p' ? 1e-9 : 1e-6;
      const diff = ok ? Math.abs(v - r) / (q === 'p' ? 1 : Math.max(1, Math.abs(r))) : Infinity;
      push(q, v, r, { diff, tol, pass: ok && diff <= tol });
    }
    return out;
  }
  const api = { FULL, LOO, FLAGS, kind, close, rReason, compareConfig, compareTS };
  g.AlmPubbiasPlusCompare = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
