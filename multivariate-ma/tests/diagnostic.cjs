'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const engine = require('../../shared/multivariate-ma.js');
const baseline = require('../validate/diagnostic/baseline-engine.cjs');
const { compare } = require('../validate/diagnostic/compare.cjs');
const hard = require('../validate/diagnostic/hard.json');
const app = path.resolve(__dirname, '..');
function page() {
  const { window, document } = parseHTML(fs.readFileSync(path.join(app, 'index.html'), 'utf8'));
  window.matchMedia = () => ({ matches: false });
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  const ctx = vm.createContext({ window, document, console, matchMedia: window.matchMedia,
    setTimeout, clearTimeout, URL, Blob, navigator: {}, performance: { now: () => Date.now() } });
  for (const s of document.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (src && /alm-validate\.js$|a11y-landmarks\.js$/.test(src)) continue;
    vm.runInContext(src ? fs.readFileSync(path.join(app, src), 'utf8') : s.textContent, ctx);
  }
  return { window, document };
}
test('exact two-study zero: no starts, no fictitious default gap, both variances flagged', () => {
  const s = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [0, 0], S: [[1, 0], [0, 1]] }];
  const { diagnostic: d, ...fit } = engine.fit(s);
  assert.deepEqual(fit, baseline.fit(s));
  assert.equal(d.startsRun, 0); assert.equal(d.bestVsDefaultStartLogLikGap, null);
  assert.equal(d.boundary.zeroVariances.length, 2); assert.deepEqual(d.boundary.correlations, []);
  assert.equal(d.verdict, 'boundary maximum');
  assert.equal(d.profiles.length, 2);
  assert.ok(d.profiles.every(p => p.points.length === 1 && p.points[0].variance > 0));
});
test('rank-one and interior flat hard fits are distinguished with finite profiles', () => {
  const rank = engine.fit(hard[0].studies).diagnostic;
  assert.equal(rank.startsRun, 5); assert.equal(rank.verdict, 'boundary maximum');
  assert.equal(rank.boundary.correlations.length, 1);
  const f = engine.fit(hard.find(f => f.reason.startsWith('Distinct estimates')).studies);
  assert.equal(f.diagnostic.verdict, 'flat likelihood: estimates not unique');
  assert.ok(f.diagnostic.profiles.some(p => p.flat));
  for (const p of f.diagnostic.profiles) for (const q of p.points) {
    assert.equal(q.status, 'finite-search');
    assert.ok(Math.abs(q.logLik - f.logLik - q.deltaLogLik) < 1e-10);
  }
});
test('univariate profile matches independently evaluated likelihood and keeps old fields', () => {
  const y = [-2, -1, 0, 1, 2], v = y.map(() => 0.2);
  const f = engine.fitUnivariate(y, v), old = baseline.fitUnivariate(y, v);
  const { diagnostic: d, ...rest } = f;
  assert.deepEqual(rest, old); assert.equal(d.startsRun, 3);
  const studies = y.map((y, i) => ({ y: [y], S: [[v[i]]] }));
  const base = engine._objG(studies, [[f.tau2]]);
  for (const q of d.profiles[0].points) assert.ok(Math.abs(q.deltaLogLik - (base - engine._objG(studies, [[q.variance]]))) < 1e-12);
});
test('three-outcome engine returns a profile for each variance without changing numbers', () => {
  const studies = [[-2, 1, 0], [2, -1, 1], [1, 3, -2], [-1, -3, 2], [0, 0, -1]].map(y => ({ y, S: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }));
  const { diagnostic, ...rest } = engine.fit(studies);
  assert.deepEqual(rest, baseline.fit(studies));
  assert.equal(diagnostic.profiles.length, 3);
  assert.ok(diagnostic.profiles.every(p => p.points.length > 0));
});
test('UI note follows real results and clears on invalid input; JSON includes all fit diagnostics', () => {
  const { window: w, document: d } = page();
  const note = d.getElementById('likelihood-diagnostic');
  assert.equal(note.getAttribute('role'), 'status');
  assert.equal(w._almLastMultivariate().diagnostic.verdict, 'unique interior maximum');
  assert.equal(note.hidden, true);
  w.AlmMvPage.setMode('cov');
  d.getElementById('f-data').value = 'a,0,1,0,1,0\nb,0,1,0,1,0';
  w.AlmMvPage.run();
  assert.equal(note.hidden, false); assert.match(note.textContent, /covariance boundary/);
  const out = w.AlmMvPlusUI.resultsJSON();
  assert.equal(out.result.diagnostic.startsRun, 0);
  assert.ok(out.univariate.every(u => u.diagnostic));
  w.AlmMvPlusUI.runSweep();
  assert.ok(w.AlmMvPlusUI.resultsJSON().sweep.every(s => s.status !== 'ok' || s.diagnostic));
  d.getElementById('f-data').value = ''; w.AlmMvPage.run();
  assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  assert.equal(w.AlmMvPlusUI.resultsJSON().result, null);
});
test('comparison rejects dropped, duplicate, unexpected and wrong-verdict records', () => {
  const expected = Array.from({ length: 99 }, (_, i) => ({ id: String(i), expected: ['unique interior maximum'] }));
  const actual = expected.map(f => ({ id: f.id, diagnostic: { verdict: f.expected[0] } }));
  assert.equal(compare(expected, actual).passed, true);
  assert.equal(compare(expected, actual.slice(1)).passed, false);
  assert.equal(compare(expected, actual.concat(actual[0])).passed, false);
  assert.equal(compare(expected, [{ id: 'foreign', diagnostic: actual[0].diagnostic }, ...actual.slice(1)]).passed, false);
  assert.equal(compare(expected, [{ id: '0', diagnostic: { verdict: 'boundary maximum' } }, ...actual.slice(1)]).agreement, 98);
});
