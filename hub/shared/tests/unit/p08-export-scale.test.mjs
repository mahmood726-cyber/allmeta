import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp, studies, close } from '../../../../meta-regression/tests/review-p08/harness.mjs';

const before = JSON.parse(readFileSync(new URL('../../../../meta-regression/tests/review-p08/export-before.json', import.meta.url), 'utf8'));

function absoluteExport(source) {
  const changed = source.replace('const smallVariances = minVariance < 1e-6;', 'const smallVariances = false;');
  assert.notEqual(changed, source, 'plant the original absolute export tolerance');
  return changed;
}

// A root-finder must be instructed to resolve variance in the outcome's units.
// The integration replay separately executes the complete script in real R.
function checkTolerance(app, scale) {
  const script = app.rScript(studies(scale), {});
  const match = script.match(/control = list\(tol = ([\deE+.-]+)/);
  assert.ok(match, 'export an explicit numerical root tolerance');
  const tol = Number(match[1]);
  assert.ok(tol > 0 && Number.isFinite(tol), 'positive finite root tolerance');
  assert.ok(tol / (scale * scale) <= 1e-6, 'resolve variance within the existing iterative export accuracy');
}

for (const scale of [1e-4, 1e-8, 1e-15]) {
  test(`P08 export plant: ${scale} outcome units resolve PM variance and reject absolute tolerance`, () => {
    checkTolerance(loadApp(), scale);
    const old = loadApp({ transformEngine: absoluteExport });
    assert.throws(() => checkTolerance(old, scale), { code: 'ERR_ASSERTION' });
  });
}

test('P08 export plant: recorded old tiny R output fails parity; mutant reproduces its script', () => {
  const old = before.cases.find(c => c.id === 'tiny');
  assert.ok(old.R && old.packages.metafor && old.packages.stats && old.packages.utils);
  const rows = studies(1e-15);
  assert.equal(loadApp({ transformEngine: absoluteExport }).rScript(rows, {}), old.script);
  assert.throws(() => close(old.expected.tau2_pm / 1e-30,
    loadApp().fitPM(rows).tau2 / 1e-30, 'observed old export tau2', 1e-6), { code: 'ERR_ASSERTION' });
});

test('P08 export control: ordinary export retains the observed R script and fit', () => {
  const ref = before.cases.find(c => c.id === 'ordinary');
  for (const app of [loadApp(), loadApp({ transformEngine: absoluteExport })]) {
    assert.equal(app.rScript(studies(), {}), ref.script);
    checkTolerance(app, 1);
    close(app.fitPM(studies()).tau2, ref.expected.tau2_pm, 'ordinary R tau2');
  }
});

// Independent full-precision observations from the successful real-R replay.
// Keep the defective observation above: this fixture supplements, not replaces,
// the before-fix evidence and the original reference-metafor.json oracle.
const after = JSON.parse(readFileSync(new URL('../../../../meta-regression/tests/review-p08/export-after.json', import.meta.url), 'utf8'));
const dimension = key => key === 'tau2_pm' ? 2 :
  /^(intercept|slope)(_|$)/.test(key) || /^(pred|pred_se|pi_lo|pi_hi)$/.test(key) ? 1 : 0;

for (const ref of after.cases) {
  test(`P08 actual-export R parity: ${ref.id} exact script and all 17 normalized fields`, () => {
    assert.equal(ref.status, 'ok');
    assert.ok(ref.R && ref.packages.metafor && ref.packages.stats && ref.packages.utils);
    assert.equal(Object.keys(ref.expected).length, 17);
    const app = loadApp();
    assert.equal(app.rScript(ref.rows, {}), ref.script, 'the script actually run by R');
    const actual = app.renderRows(ref.rows), pi = app.window._almLastPI();
    Object.assign(actual, { pred: pi.pred, pred_se: pi.se, pi_lo: pi.lo, pi_hi: pi.hi });
    const tolerance = ref.expected.tau2_pm === 0 ? 1e-9 : 1e-6;
    for (const [key, expected] of Object.entries(ref.expected)) {
      const unit = ref.scale ** dimension(key);
      close(actual[key] / unit, expected / unit, `${ref.id}: ${key}`, tolerance);
    }
  });
}
