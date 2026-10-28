import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp, close } from '../../../../meta-regression/tests/review-p08/harness.mjs';

// Keep fixture availability a hard gate, in its own module so a generator
// failure does not prevent the independent planted-defect tests from running.
const fixture = JSON.parse(readFileSync(new URL('../../../../meta-regression/tests/review-p08/reference-metafor.json', import.meta.url), 'utf8'));
assert.ok(fixture.R && fixture.packages.metafor && fixture.packages.stats && fixture.packages.utils, 'record real R/package versions');
for (const ref of fixture.cases) {
  test(`P08-R1 R parity: ${ref.id} coefficients, SEs, CIs, tau2, null tau2, QE, R2 and prediction`, () => {
    const app = loadApp();
    const rows = ref.yi.map((est, i) => ({ label: `R${i}`, est, se: Math.sqrt(ref.vi[i]), v: ref.vi[i], x: ref.x[i] }));
    const result = app.renderRows(rows), pi = app.window._almLastPI();
    const actual = { ...result, tau2_null: app.fitPMNull(rows), pred: pi.pred, pred_se: pi.se, pi_lo: pi.lo, pi_hi: pi.hi };
    for (const [key, value] of Object.entries(ref.expected)) close(actual[key], value, `${ref.id}.${key}`);
  });
}

test('P08-R1 R fixture control: all original example inputs are preserved', () => {
  const configs = JSON.parse(readFileSync(new URL('../fixtures/features/meta-regression/rscript/configs.json', import.meta.url), 'utf8'));
  assert.equal(fixture.cases.length, configs.length + 3);
  for (const cfg of configs) {
    const ref = fixture.cases.find(c => c.id === cfg.id);
    assert.ok(ref, `missing R fixture for ${cfg.id}`);
    const rows = loadApp().parseStudies(cfg.data).studies;
    assert.deepEqual(ref.yi, Array.from(rows, s => s.est), `${cfg.id}: outcomes`);
    assert.deepEqual(ref.vi, Array.from(rows, s => s.v), `${cfg.id}: variances`);
    assert.deepEqual(ref.x, Array.from(rows, s => s.x), `${cfg.id}: moderators`);
  }
});
