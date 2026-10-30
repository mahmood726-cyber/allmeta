/* shared/sensitivity-v1.js - sensitivity numbers for the add-on panel (lane A5, wave A).
 *
 * Re-pools one set of (yi, vi) under other tau^2 estimators and CI methods, and
 * leave-one-out, using ONLY the audited shared/ma-core.js pool() (no edits to it).
 * Browser (window.AlmSensitivity, requires window.AlmMaCore) and Node (module.exports).
 * No UI. Numbers are on the analysis scale (log OR, SMD, ...); back-transform in the app.
 *
 * Tests: "z" (Wald, normal quantile), "knha" (Knapp-Hartung / HKSJ, t_{k-1}),
 * "adhoc" (Knapp-Hartung with q floored at 1, metafor test = "adhoc").
 * PI: t_{k-1} with the SE of the chosen test (ma-core predictionInterval); none for FE.
 * I2: tau^2-based (metafor rma default); null for FE (not estimated by a common-effect model).
 *
 * Which estimator x test x measure combinations may be SHOWN is decided by
 * shared/sensitivity-v1.manifest.json, built from the metafor 5.2-1 reference
 * (hub/shared/tests/_sensitivity_gen.R). fit() computes any combination ma-core supports;
 * the manifest filter (listed()/allowed()) is the gate a panel must apply.
 */
(function (global) {
  'use strict';
  var core = null;
  function getCore() {
    if (core) return core;
    if (global.AlmMaCore && typeof global.AlmMaCore.pool === 'function') return (core = global.AlmMaCore);
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') return (core = require('./ma-core.js'));
    throw new Error('AlmSensitivity requires shared/ma-core.js (AlmMaCore) to be loaded first');
  }

  var METHODS = ['DL', 'PM', 'REML', 'ML', 'HE', 'HS', 'SJ', 'EB', 'FE'];
  var TESTS = ['z', 'knha', 'adhoc'];
  var LOO_MAX = 500;

  function refuse(method, test, k, reason) {
    return { refused: true, reason: reason, method: method, test: test, k: k };
  }
  function checkInputs(yi, vi) {
    if (!Array.isArray(yi) || !Array.isArray(vi) || yi.length !== vi.length) throw new TypeError('yi and vi must be arrays of equal length');
    for (var i = 0; i < yi.length; i++) {
      if (typeof yi[i] !== 'number' || !isFinite(yi[i])) throw new TypeError('yi[' + i + '] must be a finite number');
      if (typeof vi[i] !== 'number' || !isFinite(vi[i]) || !(vi[i] > 0)) throw new TypeError('vi[' + i + '] must be a positive finite number');
    }
  }

  // One configuration. opts: {method, test, level (default 0.95)}.
  function fit(yi, vi, opts) {
    opts = opts || {};
    var method = opts.method, test = opts.test || 'z';
    if (METHODS.indexOf(method) < 0) throw new RangeError('Unknown estimator: ' + method);
    if (TESTS.indexOf(test) < 0) throw new RangeError('Unknown test: ' + test);
    checkInputs(yi, vi);
    var k = yi.length;
    if (k < 2) return refuse(method, test, k, 'At least two studies are needed');
    if (method === 'FE' && test !== 'z') return refuse(method, test, k, 'Knapp-Hartung adjustment is not provided for the common-effect model');
    var level = opts.level === undefined ? 0.95 : opts.level;
    if (!(level > 0 && level < 1)) throw new RangeError('level must lie in (0, 1)');
    var r = getCore().pool(yi, vi, { method: method, knha: test !== 'z', knhaFloor: test === 'adhoc', level: level, pi: method !== 'FE' });
    var warnings = [];
    if (method === 'DL' && k < 10) warnings.push('DerSimonian-Laird is biased for fewer than 10 studies');
    if (k < 5 && method !== 'FE') warnings.push('Fewer than 5 studies: tau^2 is imprecise');
    return {
      refused: false, method: method, test: test, level: level, k: k, df: k - 1,
      tau2: r.tau2, mu: r.mu, se: r.se, ciLo: r.ciLo, ciHi: r.ciHi, Q: r.Q,
      I2: method === 'FE' ? null : r.I2,
      piLo: method === 'FE' ? null : (r.piLo === undefined ? null : r.piLo),
      piHi: method === 'FE' ? null : (r.piHi === undefined ? null : r.piHi),
      warnings: warnings
    };
  }

  // combos: [{method, test}, ...] (default: every method x test). Returns rows in that order.
  function grid(yi, vi, opts) {
    opts = opts || {};
    var combos = opts.combos;
    if (!combos) { combos = []; METHODS.forEach(function (m) { TESTS.forEach(function (t) { combos.push({ method: m, test: t }); }); }); }
    return combos.map(function (c) { return fit(yi, vi, { method: c.method, test: c.test, level: opts.level }); });
  }

  // Leave-one-out under one configuration. Refuses (no work done) above LOO_MAX studies.
  function leaveOneOut(yi, vi, opts) {
    opts = opts || {};
    checkInputs(yi, vi);
    var k = yi.length, max = opts.max === undefined ? LOO_MAX : Math.min(opts.max, LOO_MAX);
    if (k > max) return { refused: true, reason: 'Leave-one-out is limited to ' + max + ' studies (this analysis has ' + k + ')', k: k, rows: [] };
    if (k < 3) return { refused: true, reason: 'Leave-one-out needs at least three studies', k: k, rows: [] };
    var rows = [];
    for (var i = 0; i < k; i++) {
      var y = yi.slice(0, i).concat(yi.slice(i + 1)), v = vi.slice(0, i).concat(vi.slice(i + 1));
      var row = fit(y, v, { method: opts.method, test: opts.test, level: opts.level });
      row.omitted = i;
      rows.push(row);
    }
    return { refused: false, k: k, method: opts.method, test: opts.test || 'z', rows: rows };
  }

  // Manifest gate. A combination is allowed only if listed for this measure family.
  function validManifest(manifest) {
    return !!(manifest && manifest.schemaVersion === 1 && manifest.module === 'sensitivity-v1' && Array.isArray(manifest.combos));
  }
  function listed(manifest, measure) {
    if (!validManifest(manifest)) throw new TypeError('Not a sensitivity-v1 manifest');
    return manifest.combos.filter(function (c) { return c.measures.indexOf(measure) >= 0; })
      .map(function (c) { return { method: c.method, test: c.test }; });
  }
  function allowed(manifest, measure, method, test) {
    return listed(manifest, measure).some(function (c) { return c.method === method && c.test === test; });
  }

  // Base-row identity guard: the module's row for the page's own configuration must equal
  // the page's displayed result (REL = |a-b|/max(1,|b|) <= tol on every supplied key).
  // A panel must refuse to show the table when this returns pass:false.
  var GUARD_KEYS = ['tau2', 'mu', 'se', 'ciLo', 'ciHi', 'piLo', 'piHi', 'Q', 'k'];
  function baseRowGuard(row, page, tol) {
    tol = tol === undefined ? 1e-9 : tol;
    var diffs = [], compared = 0;
    if (!row || row.refused) return { pass: false, compared: 0, diffs: [{ key: 'row', reason: 'base configuration refused' }] };
    GUARD_KEYS.forEach(function (key) {
      if (!page || page[key] === undefined || page[key] === null) return;
      compared++;
      var a = row[key], b = page[key];
      var d = (typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b)) ? Math.abs(a - b) / Math.max(1, Math.abs(b)) : Infinity;
      if (!(d <= tol)) diffs.push({ key: key, module: a, page: b, rel: d });
    });
    if (compared === 0) return { pass: false, compared: 0, diffs: [{ key: 'page', reason: 'no comparable page values supplied' }] };
    return { pass: diffs.length === 0, compared: compared, diffs: diffs };
  }

  var api = {
    version: 'sensitivity-v1', METHODS: METHODS.slice(), TESTS: TESTS.slice(), LOO_MAX: LOO_MAX,
    fit: fit, grid: grid, leaveOneOut: leaveOneOut, listed: listed, allowed: allowed, baseRowGuard: baseRowGuard
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.AlmSensitivity = api;
})(typeof window !== 'undefined' ? window : globalThis);
