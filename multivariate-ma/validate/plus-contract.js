/* multivariate-ma plus: comparison contract between the page (AlmMvPlus over shared/multivariate-ma.js)
 * and the stored R reference (validate/generate-plus.R). Pure; used by the browser validation panel
 * (plus-adapter.js) and by the Node/linkedom replay (run-plus-node.cjs). The check count is derived
 * from the REFERENCE structure only, so a missing or refused app result is a failed check, never a
 * smaller denominator.
 *
 * Tolerances (relative to max(1,|ref|) unless stated):
 *   iterative REML quantities 1e-6 (both sides report convergence: app optimizer.polish / boundary,
 *   R rGradMax + refinement); two-study exact solutions 1e-9; p-values: absolute, 1e-6 iterative /
 *   1e-9 for the closed-form p(z) grid; counts, statuses, refusal reasons, undefined-rho status and
 *   displayed strings exact.
 *   Boundary adjudication: when a bivariate fit's parameter checks fail and the fit is at a boundary
 *   (R adjudication, app boundary zero/rank-one, or |rho_ref| > 1 - 1e-6), the fit passes iff
 *   recomputed app logLik >= ref logLik - 1e-8 and the reported fit is internally consistent.
 *   Every adjudicated fit is listed. Status, k, logLik, z, p and undefined-rho status
 *   are never adjudicated.
 */
(function (g) {
  'use strict';
  var TOL_IT = 1e-6, TOL_EXACT = 1e-9, TOL_LL_ADJ = 1e-8;
  function rel(a, r) { return typeof a === 'number' && typeof r === 'number' && Number.isFinite(a) && Number.isFinite(r) ? Math.abs(a - r) / Math.max(1, Math.abs(r)) : Infinity; }
  function abs(a, r) { return typeof a === 'number' && typeof r === 'number' && Number.isFinite(a) && Number.isFinite(r) ? Math.abs(a - r) : Infinity; }
  // Rebuild GLS and REML from the actual G and input covariances, without optimizing
  // or trusting reported means, uncertainty or likelihood. Also used by the R comparator.
  function fitIntegrity(rows, app, tests, rhoW, tol) {
    var fail = { ok: false, logLik: -Infinity };
    if (!rows || rows.length < 2 || !app || !app.G) return fail;
    var G = app.G, a = G[0][0], b = G[0][1], c = G[1][1];
    if (![a, b, c, G[1][0]].every(Number.isFinite) || a < 0 || c < 0 ||
        b !== G[1][0] || Math.abs(b) > Math.sqrt(a) * Math.sqrt(c) * (1 + 8 * Number.EPSILON)) return fail;
    var s00 = 0, s01 = 0, s11 = 0, h0 = 0, h1 = 0, ld = 0, weights = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], cov = rhoW == null ? row.cov : rhoW * Math.sqrt(row.v[0] * row.v[1]);
      var v0 = row.v[0] + a, v1 = row.v[1] + c, v01 = cov + b, det = v0 * v1 - v01 * v01;
      if (!(v0 > 0 && det > 0)) return fail;
      var w0 = v1 / det, w1 = v0 / det, w01 = -v01 / det;
      weights.push([w0, w01, w1]); ld += Math.log(det);
      s00 += w0; s01 += w01; s11 += w1;
      h0 += w0 * row.y[0] + w01 * row.y[1]; h1 += w01 * row.y[0] + w1 * row.y[1];
    }
    var sd = s00 * s11 - s01 * s01;
    if (!(sd > 0)) return fail;
    var V = [[s11 / sd, -s01 / sd], [-s01 / sd, s00 / sd]];
    var mu = [V[0][0] * h0 + V[0][1] * h1, V[1][0] * h0 + V[1][1] * h1], q = 0;
    rows.forEach(function (row, i) { var d0 = row.y[0] - mu[0], d1 = row.y[1] - mu[1], w = weights[i]; q += d0 * (w[0] * d0 + w[1] * d1) + d1 * (w[1] * d0 + w[2] * d1); });
    var ll = -0.5 * (ld + Math.log(sd) + q) - (rows.length - 1) * Math.log(2 * Math.PI) + Math.log(rows.length);
    var valid = rel(app.logLik, ll) <= tol;
    for (var j = 0; j < 2; j++) {
      var se = Math.sqrt(V[j][j]), t = g.AlmMultivariate.zTest(app.mu[j], app.muSE[j]);
      valid = valid && rel(app.mu[j], mu[j]) <= tol && rel(app.muSE[j], se) <= tol &&
        t.status === 'ok' && rel(tests[j].z, t.z) <= tol && abs(tests[j].p, t.p) <= tol;
      if (app.muVcov) for (var l = 0; l < 2; l++) valid = valid && rel(app.muVcov[j][l], V[j][l]) <= tol;
    }
    var rho = a > 0 && c > 0 ? b / Math.sqrt(a * c) : null;
    valid = valid && (rho === null ? app.rho === null : rel(app.rho, rho) <= tol);
    return { ok: valid, logLik: ll };
  }
  function parsedFrom(c) {
    return { mode: 'cov', rhoW: null, outcomes: c.outcomes.slice(), omitted: [],
      rows: c.rows.map(function (r) { return { line: r.source_row, label: r.label, y: r.y.slice(), v: r.v.slice(), cov: r.cov, r: r.cov / Math.sqrt(r.v[0] * r.v[1]) }; }) };
  }
  function validateInputs(corpus, ref) {
    if (!corpus || corpus.schema !== 'multivariate-ma-plus-corpus-v1' || !Array.isArray(corpus.configurations)) throw new Error('Invalid plus corpus');
    if (!ref || ref.schema !== 'multivariate-ma-plus-reference-v1' || !Array.isArray(ref.configurations)) throw new Error('Invalid plus reference');
    if (corpus.configurations.length !== ref.configurations.length) throw new Error('Corpus/reference length mismatch');
    if (JSON.stringify(corpus.grid) !== JSON.stringify(ref.grid)) throw new Error('Grid mismatch');
    var ids = {};
    corpus.configurations.forEach(function (c, i) {
      if (typeof c.id !== 'string' || ids[c.id] || ref.configurations[i].id !== c.id) throw new Error('Invalid identifiers at ' + i); ids[c.id] = 1;
      var r = ref.configurations[i];
      if (!Array.isArray(r.sweep) || r.sweep.length !== corpus.grid.length || !Array.isArray(r.univariate) || r.univariate.length !== 2 || !r.supplied) throw new Error('Malformed reference row ' + c.id);
      r.sweep.forEach(function (s, j) { if (s.rhoW !== corpus.grid[j] || (s.status !== 'ok' && s.status !== 'refused')) throw new Error('Malformed sweep entry ' + c.id + ' #' + j); });
      [r.supplied].concat(r.sweep).forEach(function (s) {
        if (s.status === 'ok' && !(Number.isFinite(s.logLik) && s.mu.length === 2 && s.muSE.length === 2 && s.G.length === 2 && s.z.length === 2 && s.p.length === 2 && s.mu.concat(s.muSE, s.z, s.p, s.G[0], s.G[1], s.muVcov[0], s.muVcov[1]).every(Number.isFinite))) throw new Error('Non-finite reference values ' + c.id);
        if (s.status === 'ok' && !(s.rho === null || Number.isFinite(s.rho))) throw new Error('Invalid reference rho ' + c.id);
      });
    });
    if (!Array.isArray(ref.pnormGrid) || !ref.pnormGrid.length || !Array.isArray(ref.metaforBerkeySweep) || ref.metaforBerkeySweep.length !== corpus.grid.length) throw new Error('Malformed reference extras');
  }
  // Count of checks implied by the reference alone.
  function expectedChecks(corpus, ref, withDisplay) {
    var n = 0, fit = function (s) { return s.status === 'ok' ? 20 : 2; };
    ref.configurations.forEach(function (r) {
      n += fit(r.supplied); r.sweep.forEach(function (s) { n += fit(s); });
      r.univariate.forEach(function (u) { n += u.status === 'ok' ? 9 : 1; });
      if (withDisplay) {
        if (r.supplied.status === 'ok') n += 22;
        r.sweep.forEach(function (s) { n += s.status === 'ok' ? 8 : 3; });
      }
    });
    return n + ref.pnormGrid.length + ref.metaforBerkeySweep.length * 9;
  }

  function replay(corpus, ref, P, opts) {
    opts = opts || {}; validateInputs(corpus, ref);
    var checks = 0, passed = 0, failed = [], maxima = {}, adjudicated = [], polish = { converged: 0, other: 0 }, appBetterLL = 0, refBetterLL = 0, llDiffMax = 0;
    function rec(id, q, ok, app, refv, diff, tol, extra) {
      checks++; if (ok) passed++; else failed.push(Object.assign({ id: id, quantity: q, app: app, ref: refv, diff: diff, tol: tol }, extra || {}));
      if (Number.isFinite(diff)) maxima[q] = Math.max(maxima[q] || 0, diff);
    }
    function exact(id, q, a, r) { rec(id, q, a === r, a, r, a === r ? 0 : Infinity, 0); }
    function fitChecks(id, app, appTests, appStatus, appReason, r, rows, rhoW) {
      exact(id, 'status', appStatus, r.status);
      if (r.status !== 'ok') { exact(id, 'refusal_reason', appStatus === 'refused' ? appReason : null, r.reason); return; }
      var ok = appStatus === 'ok', tol = /^two-study exact/.test(r.adjudication) ? TOL_EXACT : TOL_IT;
      exact(id, 'k', ok ? app.k : null, r.k);
      var llDiff = ok ? app.logLik - r.logLik : -Infinity;
      rec(id, 'logLik', ok && rel(app.logLik, r.logLik) <= tol, ok ? app.logLik : null, r.logLik, ok ? rel(app.logLik, r.logLik) : Infinity, tol);
      if (ok) { llDiffMax = Math.max(llDiffMax, Math.abs(llDiff)); if (llDiff > 1e-10) appBetterLL++; else if (llDiff < -1e-10) refBetterLL++; if (app.optimizer && app.optimizer.polish) { if (app.optimizer.polish.stop === 'converged') polish.converged++; else polish.other++; } }
      if (r.rho === null) exact(id, 'rho_undefined', ok ? app.rho === null : null, true);
      var pending = [];
      function num(q, a, rv, t, absolute) { var d = absolute ? abs(a, rv) : rel(a, rv); pending.push({ q: q, a: a, r: rv, d: d, t: t }); }
      for (var j = 0; j < 2; j++) {
        num('mu', ok ? app.mu[j] : null, r.mu[j], tol); num('muSE', ok ? app.muSE[j] : null, r.muSE[j], tol);
        num('z', ok ? appTests[j].z : null, r.z[j], tol); num('p', ok ? appTests[j].p : null, r.p[j], tol, true);
        for (var l = 0; l < 2; l++) { num('G', ok ? app.G[j][l] : null, r.G[j][l], tol); num('muVcov', ok ? app.muVcov[j][l] : null, r.muVcov[j][l], tol); }
      }
      if (r.rho !== null) num('rho', ok ? app.rho : null, r.rho, tol);
      var anyFail = pending.some(function (x) { return x.q !== 'z' && x.q !== 'p' && !(x.d <= x.t); });
      var atBoundary = ok && (r.adjudication !== 'none' || /zero|rank-one/.test(app.optimizer && app.optimizer.boundary || '') || (r.rho !== null && Math.abs(r.rho) > 1 - 1e-6) || app.rho === null);
      var integrity = ok ? fitIntegrity(rows, app, appTests, rhoW, tol) : { ok: false };
      var adj = anyFail && atBoundary && integrity.ok && integrity.logLik - r.logLik >= -TOL_LL_ADJ;
      if (adj) adjudicated.push({ id: id, logLikApp: app.logLik, logLikRef: r.logLik, diff: llDiff, boundaryApp: app.optimizer && app.optimizer.boundary, adjudicationRef: r.adjudication, worst: pending.filter(function (x) { return x.q !== 'z' && x.q !== 'p' && !(x.d <= x.t); }).map(function (x) { return x.q + ' ' + x.d.toExponential(2); }).slice(0, 4) });
      pending.forEach(function (x) {
        var waived = adj && x.q !== 'z' && x.q !== 'p';
        rec(id, x.q, integrity.ok && (waived || x.d <= x.t), x.a, x.r, x.d, x.t,
          !integrity.ok ? { inconsistentFit: true } : waived && !(x.d <= x.t) ? { adjudicated: true } : null);
      });
    }
    var display = opts.display || null, grid = corpus.grid;
    for (var i = 0; i < corpus.configurations.length; i++) {
      var c = corpus.configurations[i], r = ref.configurations[i], parsed = parsedFrom(c);
      var res = P.compute(parsed);
      fitChecks(c.id + '#supplied', res.fit, res.tests, res.status, res.reason, r.supplied, parsed.rows, null);
      var sw = P.sweep(parsed, grid);
      sw.forEach(function (s, j) { fitChecks(c.id + '#rhoW=' + grid[j], s.fit, s.tests, s.status, s.reason, r.sweep[j], parsed.rows, grid[j]); });
      [0, 1].forEach(function (j) {
        var id = c.id + '#univariate' + j, u = res.univariate ? res.univariate[j] : { status: res.status }, ru = r.univariate[j];
        exact(id, 'uni_status', u.status, ru.status); if (ru.status !== 'ok') return;
        var ok = u.status === 'ok';
        exact(id, 'uni_k', ok ? u.k : null, ru.k);
        [['mu', 'mu'], ['se', 'se'], ['tau2', 'tau2'], ['logLik', 'logLik'], ['z', 'z']].forEach(function (q) { var d = ok ? rel(u[q[0]], ru[q[1]]) : Infinity; rec(id, 'uni_' + q[0], d <= TOL_IT, ok ? u[q[0]] : null, ru[q[1]], d, TOL_IT); });
        var dp = ok ? abs(u.p, ru.p) : Infinity; rec(id, 'uni_p', dp <= TOL_IT, ok ? u.p : null, ru.p, dp, TOL_IT);
        var refRatio = r.supplied.status === 'ok' ? (r.supplied.muSE[j] * r.supplied.muSE[j]) / (ru.se * ru.se) : null;
        var ar = res.varRatio ? res.varRatio[j] : null, dr = refRatio === null ? (ar === null ? 0 : Infinity) : rel(ar, refRatio);
        rec(id, 'varRatio', dr <= TOL_IT, ar, refRatio, dr, TOL_IT);
      });
      if (display) display(c, r, parsed, res, sw).forEach(function (d) { rec(c.id + '#display', 'display:' + d.key, d.shown === d.expected, d.shown, d.expected, d.shown === d.expected ? 0 : Infinity, 0); });
      if (opts.progress) opts.progress(i + 1, corpus.configurations.length, checks);
      if (i === 0) {
        // metafor::rma.mv second oracle on Berkey over the same sweep
        ref.metaforBerkeySweep.forEach(function (m, j) {
          var s = sw[j], id = c.id + '#rma.mv#rhoW=' + m.rhoW, ok = s && s.status === 'ok';
          for (var q = 0; q < 2; q++) {
            var d1 = ok ? rel(s.fit.mu[q], m.mu[q]) : Infinity; rec(id, 'rma.mv_mu', d1 <= TOL_IT, ok ? s.fit.mu[q] : null, m.mu[q], d1, TOL_IT);
            var d2 = ok ? rel(s.fit.muSE[q], m.muSE[q]) : Infinity; rec(id, 'rma.mv_muSE', d2 <= TOL_IT, ok ? s.fit.muSE[q] : null, m.muSE[q], d2, TOL_IT);
            for (var l = 0; l < 2; l++) { var d3 = ok ? rel(s.fit.G[q][l], m.G[q][l]) : Infinity; rec(id, 'rma.mv_G', d3 <= TOL_IT, ok ? s.fit.G[q][l] : null, m.G[q][l], d3, TOL_IT); }
          }
          var d4 = ok ? rel(s.fit.logLik, m.logLik) : Infinity; rec(id, 'rma.mv_logLik', d4 <= TOL_IT, ok ? s.fit.logLik : null, m.logLik, d4, TOL_IT);
        });
      }
    }
    ref.pnormGrid.forEach(function (x) { var t = g.AlmMultivariate.zTest(x.z, 1), d = abs(t.p, x.p); rec('pnorm#z=' + x.z, 'p_closed_form', d <= TOL_EXACT, t.p, x.p, d, TOL_EXACT); });
    var expected = expectedChecks(corpus, ref, !!display);
    if (checks !== expected) throw new Error('Check cardinality mismatch: ' + checks + ' != ' + expected);
    return { checks: checks, passed: passed, failed: failed, failedChecks: failed.length, maxima: maxima, adjudicated: adjudicated,
      appPolish: polish, logLikComparison: { appHigherBy1e10: appBetterLL, refHigherBy1e10: refBetterLL, maxAbsDiff: llDiffMax } };
  }
  g.AlmMvPlusContract = { replay: replay, expectedChecks: expectedChecks, validateInputs: validateInputs, parsedFrom: parsedFrom, fitIntegrity: fitIntegrity, TOL: { iterative: TOL_IT, exact: TOL_EXACT, llAdjudication: TOL_LL_ADJ } };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.AlmMvPlusContract;
})(typeof window !== 'undefined' ? window : globalThis);
