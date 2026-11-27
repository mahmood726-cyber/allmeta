'use strict';
// P18 parity batch 1: heterogeneity, fixed-effect fit, fit statistics, joint tests, prediction intervals.
// Reference values: mvmeta 1.0.3 / mixmeta 1.2.2 / metafor 5.2-1 on berkey98 (lane p18par reference-batch1.R).
const { test } = require('node:test'), assert = require('node:assert/strict');
const engine = require('../../shared/multivariate-ma.js');
const inf = require('../inference.js');
const rows = [[0.47, 0.0075, -0.32, 0.0077, 0.0030], [0.20, 0.0057, -0.60, 0.0008, 0.0009], [0.40, 0.0021, -0.12, 0.0014, 0.0007],
  [0.26, 0.0029, -0.31, 0.0015, 0.0009], [0.56, 0.0148, -0.39, 0.0304, 0.0072]].map(r => ({ y: [r[0], r[2]], v: [r[1], r[3]], cov: r[4] }));
const fit = engine.fit(rows.map(r => ({ y: r.y, S: [[r.v[0], r.cov], [r.cov, r.v[1]]] })));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), what + ': ' + a + ' vs ' + b);
test('fixed-effect fit, Q and I2 match mvmeta/mixmeta (1e-9)', () => {
  const r = inf.compute(rows, fit, 95);
  assert.equal(r.status, 'ok');
  near(r.fe.mu[0], 0.307218608490711, 1e-9, 'FE mu1'); near(r.fe.mu[1], -0.394377007899451, 1e-9, 'FE mu2');
  near(r.fe.se[0], 0.0285751524401803, 1e-9, 'FE se1'); near(r.fe.lo[1], -0.430928817309857, 1e-9, 'FE lo2');
  near(r.fe.cor, 0.388820367923553, 1e-9, 'FE cor');
  near(r.het.Q[0], 128.226716212968, 1e-9, 'Q all'); near(r.het.Q[1], 14.7353696859399, 1e-9, 'Q PD'); near(r.het.Q[2], 112.089789595777, 1e-9, 'Q AL');
  assert.deepEqual(r.het.df, [8, 4, 4]); near(r.het.p[1], 0.00528275467519168, 1e-9, 'p PD');
  near(r.het.I2[0], 93.7610505546184, 1e-9, 'I2 all'); near(r.het.I2[1], 72.8544306301544, 1e-9, 'I2 PD');
});
test('fit statistics match metafor fitstats (1e-6)', () => {
  const s = inf.compute(rows, fit, 95).fitstats;
  near(s.deviance, -7.38353538874064, 1e-6, 'dev'); near(s.AIC, 2.61646461125936, 1e-6, 'AIC');
  near(s.BIC, 3.01367231965854, 1e-6, 'BIC'); near(s.AICc, 32.6164646112594, 1e-6, 'AICc');
  assert.equal(s.parms, 5); assert.equal(s.dfRes, 8);
});
test('joint tests, contrast, PI (t, k-1 df) and level choice match metafor (1e-6)', () => {
  const r = inf.compute(rows, fit, 95);
  near(r.omnibus.QM, 108.861584072377, 1e-6, 'QM'); assert.equal(r.omnibus.df, 2);
  near(r.contrast.est, 0.692643348096194, 1e-6, 'contrast'); near(r.contrast.se, 0.0743815611759667, 1e-6, 'contrast se');
  near(r.contrast.lo, 0.546858167077437, 1e-6, 'contrast lo');
  near(r.pi.lo[0], 0.0111679678392737, 1e-6, 'PI lo1'); near(r.pi.hi[1], 0.218695871546586, 1e-6, 'PI hi2'); assert.equal(r.pi.df, 4);
  near(r.re.cor, 0.546854019988421, 1e-6, 'RE cor');
  const r90 = inf.compute(rows, fit, 90);
  near(r90.re.lo[0], 0.256630784689621, 1e-6, 'RE lo1 90'); near(r90.fe.hi[0], 0.354220551622633, 1e-9, 'FE hi1 90');
  const r99 = inf.compute(rows, fit, 99);
  near(r99.re.hi[1], -0.112786552979591, 1e-6, 'RE hi2 99');
});
test('invalid confidence levels are refused', () => {
  for (const L of [0, 100, -5, 150, NaN, 'abc', null]) {
    const r = inf.compute(rows, fit, L);
    assert.equal(r.status, 'refused', String(L)); assert.match(r.reason, /confidence level/i);
  }
});
// ---- review fixes (lane p18fix) ----
const fs = require('node:fs'), path = require('node:path');
const active = s => s.split('\n').filter(l => !/^\s*#/.test(l)).map(l => l.replace(/\s+#.*$/, ''));
test('P2-1 exported R script uses the page\'s fitted G as a full-precision literal, never an R re-fit', () => {
  const s = inf.rScript(rows, 95, fit);
  const m = s.match(/^G <- matrix\(c\(([^)]*)\), 2, 2\)/m);
  assert.ok(m, 'G literal line');
  const g = m[1].split(',').map(Number);
  assert.deepEqual(g, [fit.G[0][0], fit.G[1][0], fit.G[0][1], fit.G[1][1]]);
  const a = active(s);
  assert.ok(!a.some(l => /re\$Psi/.test(l)), 'no active G <- re$Psi');
  assert.ok(!a.some(l => /method = "reml"/.test(l)), 'no active mvmeta REML re-fit');
  assert.ok(a.filter(l => /rma\.mv\(/.test(l)).every(l => /tau2 = diag\(G\), rho = rho/.test(l)), 'every active rma.mv fixes G');
  assert.ok(s.split('\n').some(l => /^#.*re\$Psi/.test(l)), 'commented re-fit cross-check kept');
  assert.throws(() => inf.rScript(rows, 95), /fit/);
});
test('P2-2 confidence level: UI range and compute agree (1 to 99.9, decimals allowed)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tag = html.match(/<input[^>]*id="inf-level"[^>]*>/)[0];
  assert.match(tag, /min="1"/); assert.match(tag, /max="99\.9"/); assert.match(tag, /step="any"/);
  for (const L of [1, 99.9, 97.5, '92.5', 50.25]) assert.equal(inf.compute(rows, fit, L).status, 'ok', String(L));
  for (const L of [0.5, 0.999, 99.95, 99.99, 1e-9]) {
    const r = inf.compute(rows, fit, L);
    assert.equal(r.status, 'refused', String(L)); assert.match(r.reason, /from 1 to 99\.9/);
  }
});
test('P2-4 compute refuses rows that are not the rows the fit used (same k)', () => {
  const other = rows.map(r => ({ y: [r.y[0] + 1, r.y[1]], v: r.v, cov: r.cov }));
  const r = inf.compute(other, fit, 95);
  assert.equal(r.status, 'refused'); assert.match(r.reason, /not the studies this fit used/);
  const small = rows.map(r => ({ y: [r.y[0] + 1e-6, r.y[1]], v: r.v, cov: r.cov }));
  assert.equal(inf.compute(small, fit, 95).status, 'refused');
  const scaled = rows.map(r => ({ y: [r.y[0] * 100, r.y[1] * 100], v: [r.v[0] * 1e4, r.v[1] * 1e4], cov: r.cov * 1e4 }));
  const fs100 = engine.fit(scaled.map(r => ({ y: r.y, S: [[r.v[0], r.cov], [r.cov, r.v[1]]] })));
  assert.equal(inf.compute(scaled, fs100, 95).status, 'ok', 'consistency check is unit-free');
  assert.equal(inf.compute(rows.slice().reverse(), fit, 95).status, 'ok', 'same studies in another order');
});
