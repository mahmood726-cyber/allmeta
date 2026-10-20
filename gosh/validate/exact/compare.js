/* Comparator for the GOSH exact-enumeration references (gosh/validate/exact/).
 * compare(app, ref, opts) -> {checks, passed, failures[]}
 *   app: result of AlmGoshExactEngine.run(te, se, model)
 *   ref: one entry of reference-r.json (independent R) or reference-metafor.json (metafor::gosh forced enumeration)
 * Rules: counts (n_subsets, zero_i2, tau2_positive, per-study with/without counts) and all 100 x 100 grid cells exact;
 * every other quantity |app - ref| / max(1, |ref|) <= 1e-9. Grid cells are compared as a full dense vector, so a
 * subset that moves between cells fails two checks. Usable in the browser (window.AlmGoshExactCompare) and in node.
 */
(function (root) {
  'use strict';
  var TOL = 1e-9;
  var SCALARS = ['mean_est', 'min_est', 'max_est', 'mean_i2', 'min_i2', 'max_i2', 'mean_q', 'min_q', 'max_q',
    'q25_est', 'median_est', 'q75_est', 'q25_i2', 'median_i2', 'q75_i2'];
  var DL_SCALARS = ['mean_tau2', 'min_tau2', 'max_tau2'];
  var PER = ['with_mean', 'without_mean', 'with_i2', 'without_i2'];

  function compare(app, ref, opts) {
    opts = opts || {};
    var tol = opts.tol === undefined ? TOL : opts.tol;
    var checks = 0, failures = [], quantities = {}, maxDiff = 0;
    var id = (ref.id || '?') + ' ' + ref.model;
    function record(name, pass, diff, abs) {
      var group = name.replace(/^grid\[\d+\]$/, 'grid_cell').replace(/^per_study\[\d+\]\./, 'per_study.');
      var q = quantities[group] || (quantities[group] = {checks:0,passed:0,maxNormDiff:0,maxAbsDiff:0});
      checks++; q.checks++; if (pass) q.passed++;
      q.maxNormDiff = Math.max(q.maxNormDiff, diff || 0); q.maxAbsDiff = Math.max(q.maxAbsDiff, abs || 0);
    }
    function exact(name, a, b) { record(name, a === b); if (a !== b) failures.push({ id: id, quantity: name, app: a, ref: b }); }
    function near(name, a, b) {
      var d = Math.abs(a - b) / Math.max(1, Math.abs(b));
      var pass = Number.isFinite(a) && Number.isFinite(b) && d <= tol;
      record(name, pass, Number.isFinite(d) ? d : Infinity, Math.abs(a-b));
      maxDiff = Math.max(maxDiff, Number.isFinite(d) ? d : Infinity);
      if (!pass) failures.push({ id: id, quantity: name, app: a, ref: b, diff: d });
      return d;
    }
    exact('exact', app.exact, true);
    exact('expected_subsets', app.expected_subsets, Math.pow(2, ref.k) - 1);
    exact('k', app.k, ref.k);
    exact('model', app.model, ref.model);
    exact('n_subsets', app.n_subsets, ref.n_subsets);
    exact('zero_i2', app.zero_i2, ref.zero_i2);
    SCALARS.concat(ref.model === 'DL' ? DL_SCALARS : []).forEach(function (q) {
      if (opts.skip && opts.skip.indexOf(q) >= 0) return;
      maxDiff = Math.max(maxDiff, near(q, app[q], ref[q]) || 0);
    });
    if (ref.model === 'DL' && ref.tau2_positive !== undefined) exact('tau2_positive', app.tau2_positive, ref.tau2_positive);
    // grid: rebuild the dense reference from sparse [cell, count] pairs
    var nx = 100, ny = 100, dense = new Array(nx * ny).fill(0);
    exact('grid_nx', app.grid.nx, nx); exact('grid_ny', app.grid.ny, ny);
    exact('grid_length', app.grid.counts.length, nx * ny);
    exact('grid_y0', app.grid.y0, 0); exact('grid_y1', app.grid.y1, 100);
    (ref.grid_cells || []).forEach(function (p) { dense[p[0]] = p[1]; });
    near('grid_x0', app.grid.x0, ref.grid_x0); near('grid_x1', app.grid.x1, ref.grid_x1);
    var moved = 0;
    for (var c = 0; c < nx * ny; c++) { exact('grid[' + c + ']', app.grid.counts[c], dense[c]); if (app.grid.counts[c] !== dense[c]) moved += Math.abs(app.grid.counts[c] - dense[c]); }
    exact('per_study_length', app.per_study.length, ref.k);
    (ref.per_study || []).forEach(function (r, i) {
      var a = app.per_study[i] || {};
      exact('per_study[' + (i + 1) + '].study', a.study, r.study);
      exact('per_study[' + (i + 1) + '].with_n', a.with_n, r.with_n);
      exact('per_study[' + (i + 1) + '].without_n', a.without_n, r.without_n);
      PER.forEach(function (q) { maxDiff = Math.max(maxDiff, near('per_study[' + (i + 1) + '].' + q, a[q], r[q]) || 0); });
    });
    return { id: id, checks: checks, passed: checks - failures.length, failures: failures, maxNormDiff: maxDiff, gridMoved: moved, quantities: quantities };
  }

  var api = { compare: compare, TOL: TOL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AlmGoshExactCompare = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
