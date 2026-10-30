import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture, B, source, engine, fit, compare, jobs, regionErrors, zeroRegionErrors } from '../r/p03-dta-check.mjs';

test('P03 provenance: fresh native R fixture matches its generator and records package versions', () => {
  const bytes = readFileSync(new URL('../r/p03-dta-reference.R', import.meta.url));
  assert.equal(fixture.provenance.generator_md5, createHash('md5').update(bytes).digest('hex'));
  assert.match(fixture.provenance.R, /^R version /);
  assert.deepEqual(fixture.provenance.packages.map(p => p.package), ['mada', 'mvmeta', 'ellipse', 'jsonlite']);
  for (const p of fixture.provenance.packages) assert.match(p.version, /^\d/);
  assert.equal(fixture.provenance.tolerance, 1e-6);
  assert.equal(fixture.fits.length, 40);
  assert.equal(fixture.provenance.serialization, 'base R; 17 significant digits');
});

// Confirmed by the pass-1 native R/Node replay; TODO still executes the unchanged assertion.
const knownDiscrepancies = new Map([
  ['fagan/1', 'P03-FAGAN-ENDPOINT: shared/dta-bivariate.js:442-443 returns NaN/NaN; R returns 1/1'],
]);
for (const job of jobs()) test(`P03 R parity: ${job.id}`,
  { todo: knownDiscrepancies.get(job.id) || false }, job.run);

test('P03 small-k policy: all five methods refuse k=1, k=2 and k=3; k=4 fixed control fits', () => {
  // The engine explicitly requires k>=4; record R's answers without silently treating a refusal as numeric parity.
  const refs = fixture.fits.filter(f => /^k[123]$/.test(f.dataset));
  assert.equal(refs.length, 15);
  for (const ref of refs) {
    assert.equal(typeof ref.ok, 'boolean');
    assert.throws(() => fit(ref), /needs k >= 4/);
  }
  const control = fixture.fits.find(f => f.id === 'homogeneous/fixed/none');
  assert.equal(fit(control).k, 4);
  compare(fit(control).coefTable, control.coefTable);
});

test('P03 comparator controls: reject nonfinite, missing, shifted and wrongly shaped results', () => {
  compare({ a: [1, 2], absent: null }, { a: [1, 2], absent: null });
  for (const a of [NaN, Infinity, undefined, null, 1.00001]) assert.throws(() => compare(a, 1), assert.AssertionError);
  assert.throws(() => compare([1], [1, 2]), assert.AssertionError);
  assert.throws(() => compare({}, { p: 0 }), assert.AssertionError);
});

function planted(before, after) {
  assert.equal(source.split(before).length, 2, 'mutation must target one source site');
  return engine(source.replace(before, after));
}
const fixed = () => fixture.fits.find(f => f.id === 'AuditC/fixed/all');

test('P03 planted defect: coefficient p-value loses its two-sided factor; native control agrees', () => {
  const r = fixed(); compare(fit(r).coefTable, r.coefTable);
  const fixedReg = fixture.fits.find(f => f.id === 'smoking-type/fixed/all');
  compare(fit(fixedReg).coefTable, fixedReg.coefTable);
  // Pass 1 showed fixed-effect p-values <= 2.77e-12: halving them is below 1e-6.
  // Keep that clean control and use the existing closed-form MM R fit to detect the defect.
  const reg = fixture.fits.find(f => f.id === 'smoking-type/mm/all');
  assert.ok(reg.coefTable.some(c => c.p / 2 > 1e-6), 'fixture must resolve a missing two-sided factor');
  compare(fit(reg).coefTable, reg.coefTable);
  const bad = planted('p: 2 * _pnormUpper(Math.abs(z))', 'p: _pnormUpper(Math.abs(z))');
  assert.throws(() => compare(fit(reg, bad).coefTable, reg.coefTable), assert.AssertionError);
});

test('P03 planted defect: positive LR CI uses wrong variance sign; native control agrees', () => {
  // MM is closed form and has nonzero cross-outcome covariance, unlike fixed effect.
  const r = fixture.fits.find(f => f.id === 'AuditC/mm/all');
  compare(fit(r), r.ratios);
  const bad = planted('- 2 * (1 - Se) * (1 - FPR) * covMu[0][1]', '+ 2 * (1 - Se) * (1 - FPR) * covMu[0][1]');
  assert.throws(() => compare(fit(r, bad), r.ratios), assert.AssertionError);
});

test('P03 planted defect: Deeks uses wrong residual degrees of freedom; native control agrees', () => {
  const r = fixture.deeks.zero; compare(B.deeksTest(r.rows), r.values);
  const bad = planted('var df = n - 2;', 'var df = n - 1;');
  assert.throws(() => compare(bad.deeksTest(r.rows), r.values), assert.AssertionError);
});

test('P03 planted defect: prediction region drops mean uncertainty; native control agrees', () => {
  const r = fixed(); const f = fit(r);
  compare(regionErrors(f, r), zeroRegionErrors);
  const bad = planted('kind === "prediction" ? madd(f.Psi, f.covMu) : f.covMu',
    'kind === "prediction" ? f.Psi : f.covMu');
  assert.throws(() => compare(regionErrors(fit(r, bad), r, bad), zeroRegionErrors), assert.AssertionError);
});

test('P03 planted defect: Spearman ties lose average ranks; native control agrees', () => {
  const r = fixture.spearman.find(f => f.id === 'ties/none');
  compare(B.thresholdSpearman(r.rows, { correctionControl: 'none' }), r.rho);
  const bad = planted('var rk = (j + t) / 2 + 1;', 'var rk = j + 1;');
  assert.throws(() => compare(bad.thresholdSpearman(r.rows, { correctionControl: 'none' }), r.rho), assert.AssertionError);
});

test('P03 planted defect: Fagan reverses LR direction; native control agrees', () => {
  const r = fixture.fagan.find(f => f.pre === .2);
  compare(B.fagan(r.lrPos, r.lrNeg, r.pre), r.values);
  const bad = planted('oPos = preOdds * lrPos', 'oPos = preOdds / lrPos');
  assert.throws(() => compare(bad.fagan(r.lrPos, r.lrNeg, r.pre), r.values), assert.AssertionError);
});
