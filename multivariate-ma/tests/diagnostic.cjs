'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const engine = require('../../shared/multivariate-ma.js');
const baseline = require('../validate/diagnostic/baseline-engine.cjs');
const { compare, N, ALLOWED } = require('../validate/diagnostic/compare.cjs');
const oracle = require('../validate/diagnostic/oracle-verdicts.json').fits;
const { controls: mutationControls } = require('../validate/diagnostic/mutation-controls.cjs');
const hard = require('../validate/diagnostic/hard.json');
const app = path.resolve(__dirname, '..');
const MULTIPLE_NOTE = 'Different between-study covariance estimates reach likelihoods within 10⁻⁸ of each other, so these covariance estimates are not well determined by these data. The pooled estimates may still be reliable.';
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
const rows = studies => studies.map((s, i) => ['s' + i, s.y[0], s.S[0][0], s.y[1], s.S[1][1], s.S[0][1]].map(String).join(',')).join('\n');
test('exact two-study zero: no starts, no fictitious default gap, both variances flagged', () => {
  const s = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [0, 0], S: [[1, 0], [0, 1]] }];
  const { diagnostic: d, ...fit } = engine.fit(s);
  assert.deepEqual(fit, baseline.fit(s));
  assert.equal(d.startsRun, 0); assert.equal(d.bestVsDefaultStartLogLikGap, null);
  assert.equal(d.boundary.zeroVariances.length, 2); assert.deepEqual(d.boundary.correlations, []);
  assert.equal(d.verdict, 'boundary maximum');
  assert.equal(d.profiles, undefined); assert.equal(d.flat, undefined);
});
test('rank-one hard fit is a boundary; the old "distinct estimates" hard fit is an interior maximum with one cluster', () => {
  const rank = engine.fit(hard[0].studies).diagnostic;
  assert.equal(rank.startsRun, 5); assert.equal(rank.verdict, 'boundary maximum');
  assert.equal(rank.boundary.correlations.length, 1);
  const f = engine.fit(hard.find(f => f.reason.startsWith('Distinct estimates')).studies).diagnostic;
  assert.equal(f.verdict, 'interior maximum'); assert.equal(f.distinctOptimaWithinTolerance, 1);
});
test('weakly identified interior fit: distinct candidates at the same likelihood give "multiple near-equal optima"', () => {
  const c = mutationControls.find(c => c.id === 'mutation-control:k6:E1e-5');
  const { diagnostic: d, ...fit } = engine.fit(c.studies);
  assert.deepEqual(fit, baseline.fit(c.studies));
  assert.equal(d.verdict, 'multiple near-equal optima');
  assert.ok(d.distinctOptimaWithinTolerance > 1); assert.ok(d.nearBestCandidates >= d.distinctOptimaWithinTolerance);
  assert.deepEqual(d.boundary, { zeroVariances: [], correlations: [] });
});
test('distinctness is scale-free: SDs relative 1e-4, correlations absolute 1e-4, logLik 1e-8', () => {
  const studies = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [1, 1], S: [[1, 0], [0, 1]] }, { y: [2, 0], S: [[1, 0], [0, 1]] }];
  const G = c => [[c * c, 0.5 * c * c * 2], [0.5 * c * c * 2, 4 * c * c]];
  for (const c of [1e-3, 1, 1e3]) {
    const g = G(c), sd = [c, 2 * c];
    const cand = (s0, r) => ({ G: [[s0 * s0, r * s0 * sd[1]], [r * s0 * sd[1], sd[1] * sd[1]]], f: 1 });
    const verdict = cs => engine._diagnostic(studies, g, 1, cs, 1, 5).verdict;
    assert.equal(verdict([cand(sd[0] * (1 + 5e-5), 0.5)]), 'interior maximum');
    assert.equal(verdict([cand(sd[0] * (1 + 2e-4), 0.5)]), 'multiple near-equal optima');
    assert.equal(verdict([cand(sd[0], 0.5 + 5e-5)]), 'interior maximum');
    assert.equal(verdict([cand(sd[0], 0.5 + 2e-4)]), 'multiple near-equal optima');
    assert.equal(verdict([{ ...cand(sd[0] * 2, 0.5), f: 1 + 2e-8 }]), 'interior maximum');
  }
});
test('boundary takes precedence over multiple near-equal optima', () => {
  const studies = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [1, 1], S: [[1, 0], [0, 1]] }, { y: [2, 0], S: [[1, 0], [0, 1]] }];
  const g = [[0, 0], [0, 1]], other = { G: [[0, 0], [0, 2]], f: 1 };
  const d = engine._diagnostic(studies, g, 1, [other], 1, 5);
  assert.equal(d.distinctOptimaWithinTolerance, 2); assert.equal(d.verdict, 'boundary maximum');
});
test('default-start gap is null when either value is the failure sentinel', () => {
  const studies = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [1, 1], S: [[1, 0], [0, 1]] }, { y: [2, 0], S: [[1, 0], [0, 1]] }];
  const g = [[1, 0], [0, 1]];
  assert.equal(engine._diagnostic(studies, g, 1, [], 1e12, 5).bestVsDefaultStartLogLikGap, null);
  assert.equal(engine._diagnostic(studies, g, 1, [], 1e11, 5).bestVsDefaultStartLogLikGap, null);
  assert.equal(engine._diagnostic(studies, g, 1e12, [], 1e12, 5).bestVsDefaultStartLogLikGap, null);
  assert.equal(engine._diagnostic(studies, g, 1, [], 3, 5).bestVsDefaultStartLogLikGap, 2);
});
test('a failed fit (best objective at the sentinel, nothing near it) is "no valid fit", not an interior maximum', () => {
  const studies = [{ y: [0, 0], S: [[1, 0], [0, 1]] }, { y: [1, 1], S: [[1, 0], [0, 1]] }, { y: [2, 0], S: [[1, 0], [0, 1]] }];
  const g = [[1, 0], [0, 1]];
  for (const bestF of [1e12, 1e11, Infinity, NaN]) {
    const d = engine._diagnostic(studies, g, bestF, [], null, 5);
    assert.equal(d.verdict, 'no valid fit'); assert.equal(d.nearBestCandidates, 0); assert.equal(d.distinctOptimaWithinTolerance, 0);
  }
  assert.equal(engine._diagnostic(studies, g, 1, [], null, 5).verdict, 'interior maximum');
});
test('univariate fit keeps old fields and gives an interior maximum', () => {
  const y = [-2, -1, 0, 1, 2], v = y.map(() => 0.2);
  const { diagnostic: d, ...rest } = engine.fitUnivariate(y, v);
  assert.deepEqual(rest, baseline.fitUnivariate(y, v)); assert.equal(d.startsRun, 3);
  assert.equal(d.verdict, 'interior maximum');
});
test('three-outcome fixture gives an interior maximum without changing numbers', () => {
  const studies = [[-2, 1, 0], [2, -1, 1], [1, 3, -2], [-1, -3, 2], [0, 0, -1]].map(y => ({ y, S: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }));
  const { diagnostic, ...rest } = engine.fit(studies);
  assert.deepEqual(rest, baseline.fit(studies));
  assert.equal(diagnostic.verdict, 'interior maximum');
});
test('UI note: none for interior, boundary and multiple-optima texts, cleared on refused and empty input', () => {
  const { window: w, document: d } = page();
  const note = d.getElementById('likelihood-diagnostic');
  assert.equal(note.getAttribute('role'), 'status');
  assert.match(d.querySelector('style').textContent, /#likelihood-diagnostic\[hidden\]\{display:none\}/);
  assert.equal(w._almLastMultivariate().diagnostic.verdict, 'interior maximum');
  assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  w.AlmMvPage.setMode('cov');
  const set = text => { d.getElementById('f-data').value = text; w.AlmMvPage.run(); };
  set('a,0,1,0,1,0\nb,0,1,0,1,0');
  assert.equal(note.hidden, false); assert.match(note.textContent, /covariance boundary/);
  const out = w.AlmMvPlusUI.resultsJSON();
  assert.equal(out.result.diagnostic.startsRun, 0);
  assert.ok(out.univariate.every(u => u.diagnostic));
  w.AlmMvPlusUI.runSweep();
  assert.ok(w.AlmMvPlusUI.resultsJSON().sweep.every(s => s.status !== 'ok' || s.diagnostic));
  set('a,0,1,0,1,2\nb,1,1,1,1,2\nc,2,1,0,1,2');
  assert.match(d.getElementById('headline').textContent, /^Refused/);
  assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  set(rows(mutationControls.find(c => c.id === 'mutation-control:k6:E1e-5').studies));
  assert.equal(w._almLastMultivariate().diagnostic.verdict, 'multiple near-equal optima');
  assert.equal(note.hidden, false); assert.equal(note.textContent, MULTIPLE_NOTE);
  set('a,0,1,0,1,0\nb,0,1,0,1,0'); set('a,0,1,0,1,0\nb,0,1,0,1,0\nc,1,1,1,1,2');
  assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  set(rows(mutationControls[0].studies)); set('');
  assert.equal(note.hidden, true); assert.equal(note.textContent, '');
  assert.equal(w.AlmMvPlusUI.resultsJSON().result, null);
});
test('comparison rejects dropped, duplicate, unexpected and wrong-verdict records and needs one exact verdict each', () => {
  const expected = Array.from({ length: N }, (_, i) => ({ id: String(i), verdict: 'interior maximum' }));
  const actual = expected.map(f => ({ id: f.id, diagnostic: { verdict: f.verdict } }));
  assert.equal(compare(expected, actual).passed, true);
  assert.equal(compare(expected, actual.slice(1)).passed, false);
  assert.equal(compare(expected, actual.concat(actual[0])).passed, false);
  assert.equal(compare(expected, [{ id: 'foreign', diagnostic: actual[0].diagnostic }, ...actual.slice(1)]).passed, false);
  assert.equal(compare(expected, [{ id: '0', diagnostic: { verdict: 'boundary maximum' } }, ...actual.slice(1)]).agreement, N - 1);
  assert.throws(() => compare(expected.map((f, i) => i ? f : { ...f, verdict: ['boundary maximum', 'interior maximum'] }), actual));
});
test('named allowance: only the two craft2003 disagreements pass; a third disagreement fails', () => {
  assert.equal(ALLOWED.size, 2);
  const agree = oracle.map(f => ({ id: f.id, diagnostic: { verdict: f.verdict } }));
  const withPair = agree.map(f => ALLOWED.has(f.id) ? { id: f.id, diagnostic: { verdict: ALLOWED.get(f.id).actual } } : f);
  const pair = compare(oracle, withPair);
  assert.equal(pair.passed, true); assert.equal(pair.agreement, N - 2); assert.equal(pair.unexplained, 0);
  assert.deepEqual(pair.failures.map(f => f.id).sort(), [...ALLOWED.keys()].sort());
  const i = withPair.findIndex(f => !ALLOWED.has(f.id));
  const third = withPair.map((f, j) => j === i ? { id: f.id, diagnostic: { verdict: f.diagnostic.verdict === 'interior maximum' ? 'boundary maximum' : 'interior maximum' } } : f);
  const r = compare(oracle, third);
  assert.equal(r.passed, false); assert.equal(r.agreement, N - 3); assert.equal(r.unexplained, 1);
  assert.deepEqual(r.failures.filter(f => !f.allowed).map(f => f.id), [withPair[i].id]);
  // An allowed id with any verdict other than the documented one is not allowed either.
  const id = [...ALLOWED.keys()][0];
  const other = withPair.map(f => f.id === id ? { id, diagnostic: { verdict: 'interior maximum' } } : f);
  assert.equal(compare(oracle, other).passed, false);
  assert.equal(compare(oracle, withPair.filter(f => f.id !== id)).passed, false);
});
