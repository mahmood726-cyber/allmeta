// Pure export adapters with synthetic completed/pending snapshots; no engine maths.
// node hub/shared/tests/results-export-snapshots.test.cjs [source-root]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.join(__dirname, '../../..');
function accessor(app, context) {
  const html = fs.readFileSync(path.join(root, app, 'index.html'), 'utf8');
  const match = html.match(/window\.__almResults = function \(\) \{[\s\S]*?\n    \};/);
  assert.ok(match, app + ' export accessor must exist');
  vm.runInNewContext(match[0], context);
  return context.window.__almResults;
}
function check(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}
check('DTA export never recomputes from pending controls', () => {
  const b = {
    method: 'fixed', Psi: [[0, 0], [0, 0]], vcov: [[1, 0], [0, 1]],
    sensCI: [0.6, 0.9], specCI: [0.7, 0.95], lrPosCI: [1, 2], lrNegCI: [0.1, 0.5]
  };
  const completed = { studies: [], opts: { correctionControl: 'single' }, bivar: b, errors: [] };
  const pending = { ...completed, opts: { correctionControl: 'all' }, bivar: { ...b, method: 'reml' } };
  let computations = 0;
  const getResults = accessor('dta-sroc', {
    window: {}, _lastAnalysis: completed, readState: () => ({ method: 'reml' }),
    analyse: () => { computations++; return pending; }
  });
  const result = getResults();
  assert.equal(result.bivariate.method, 'fixed');
  assert.equal(result.correction_control, 'single');
  assert.equal(computations, 0, 'Export must not run the engine');
});
check('meta-regression flag comes from the completed fitted object', () => {
  const fitted = { fit: { b0: 0.2, b1: 0.1 }, tau2: 0.02, location_scale: true };
  const context = { window: {
    _almLastFitted: () => fitted, _almLastStudies: () => [],
    _almLastHK: () => ({ df: 4, varB0: 0.01, varB1: 0.01, q: 1 }),
    __almLocScale: () => null
  } };
  const getResults = accessor('meta-regression', context);
  assert.equal(getResults().location_scale, true);
  fitted.location_scale = false;
  context.window.__almLocScale = () => ({});
  assert.equal(getResults().location_scale, false);
});
