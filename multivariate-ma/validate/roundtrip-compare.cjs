// C3 round trip, step 3: compare each exported R script's JSON (run by Rscript) with the page export.
// The exported script uses single-start mvmeta (BFGS, reltol 1e-13), so its accuracy is that of mvmeta:
// parameters are compared at 1e-6 relative to max(1,|R|); a fit whose parameters differ more passes only
// by REML logLik (page >= R - 1e-8) and is listed. Statuses/errors and k are exact.
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'roundtrip');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const rel = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) / Math.max(1, Math.abs(b)) : Infinity;
let checks = 0, passed = 0; const failed = [], adjudicated = [], missing = [];
const ok = (id, q, cond, extra) => { checks++; if (cond) passed++; else failed.push({ id, q, ...extra }); };
function fitPair(id, page, R) {
  // page: {mu, muSE, G, rho, logLik, z, p}; R: {mu, se, G, rho, logLik, z, p} or {error}
  ok(id, 'status', (page == null) === (R.error != null), { page: page == null ? 'refused' : 'ok', R: R.error || 'ok' });
  if (page == null || R.error != null) return;
  const pairs = [];
  for (let j = 0; j < 2; j++) { pairs.push(['mu', page.mu[j], R.mu[j]], ['se', page.muSE[j], R.se[j]], ['z', page.z[j], R.z[j]], ['p', page.p[j], R.p[j]]); for (let l = 0; l < 2; l++) pairs.push(['G', page.G[j][l], R.G[j][l]]); }
  const bad = pairs.filter(([, a, b]) => !(rel(a, b) <= 1e-6));
  const dll = page.logLik - R.logLik;
  ok(id, 'logLik_not_worse', dll >= -1e-8, { page: page.logLik, R: R.logLik });
  const adj = bad.length > 0 && dll >= -1e-8;
  if (adj) adjudicated.push({ id, dlogLik: dll, worst: bad.map(([q, a, b]) => q + ' ' + rel(a, b).toExponential(2)).slice(0, 3) });
  for (const [q, a, b] of pairs) ok(id, q, adj || rel(a, b) <= 1e-6, { page: a, R: b, diff: rel(a, b) });
}
for (const c of index) {
  const pf = path.join(dir, 'page', c.n + '.json'), rf = path.join(dir, 'scripts', c.n, 'multivariate-ma-results.json');
  if (!fs.existsSync(rf)) { missing.push(c.n + ' ' + c.id); checks++; failed.push({ id: c.id, q: 'R output missing' }); continue; }
  const page = JSON.parse(fs.readFileSync(pf, 'utf8')), R = JSON.parse(fs.readFileSync(rf, 'utf8'));
  ok(c.id, 'k', R.k === c.k, { page: c.k, R: R.k });
  const main = page.result && { ...page.result };
  fitPair(c.id + '#main', main && main.mu ? main : null, R.main);
  if (!R['rma.mv'].error && main && main.mu) { // rma.mv: logLik must not beat the page by >1e-8
    ok(c.id + '#rma.mv', 'logLik_not_worse', main.logLik - R['rma.mv'].logLik >= -1e-8, { page: main.logLik, R: R['rma.mv'].logLik });
  }
  for (let j = 0; j < 2; j++) {
    const u = page.univariate[j], r = R.univariate[j];
    for (const q of ['mu', 'se', 'tau2', 'logLik', 'z']) ok(c.id + '#uni' + j, 'uni_' + q, rel(u[q], r[q]) <= 1e-6, { page: u[q], R: r[q], diff: rel(u[q], r[q]) });
    ok(c.id + '#uni' + j, 'uni_p', Math.abs(u.p - r.p) <= 1e-6, { page: u.p, R: r.p });
  }
  ok(c.id, 'sweep_length', page.sweep.length === R.sweep.length, { page: page.sweep.length, R: R.sweep.length });
  page.sweep.forEach((s, i) => { const r = R.sweep[i]; ok(c.id + '#rhoW=' + s.rhoW, 'rhoW', s.rhoW === r.rhoW, { page: s.rhoW, R: r.rhoW }); fitPair(c.id + '#rhoW=' + s.rhoW, s.status === 'ok' ? s : null, r); });
}
const res = { schema: 'multivariate-ma-plus-roundtrip-v1', cases: index.length, checks, passed, failed, adjudicated, missing };
fs.writeFileSync(path.join(dir, 'roundtrip-result.json'), JSON.stringify(res, null, 1));
console.log('ROUNDTRIP', passed + '/' + checks, 'passed;', failed.length, 'failed;', adjudicated.length, 'fits passed by logLik adjudication;', missing.length, 'R outputs missing');
const byQ = {}; for (const f of failed) byQ[f.q] = (byQ[f.q] || 0) + 1; console.log('failed by quantity', JSON.stringify(byQ));
process.exit(failed.length ? 1 : 0);
