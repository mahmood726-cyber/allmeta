import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');
const reference = JSON.parse(readFileSync(new URL('../fixtures/p07-variance-shares.json', import.meta.url), 'utf8'));
const start = html.indexOf('    function fit(rows) {');
const end = html.indexOf('    // ---- axis state', start);
assert.ok(start >= 0 && end > start, 'load the actual application fit function');
const source = html.slice(start, end);

function loadFit(code = source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(code, context);
  return context.fit;
}

const fit = loadFit();
const shares = f => [f.I2_study, f.I2_within, f.I2_sampling];
function rows(se, effects = se.map(() => 0)) {
  return se.map((value, i) => ({ study: String(1 + Math.floor(i / 2)), te: effects[i], se: value }));
}
function checkZeroEffects(fitFunction, se) {
  const result = fitFunction(rows(se));
  assert.equal(result.tau2_study, 0);
  assert.equal(result.tau2_within, 0);
  assert.deepEqual(shares(result), [0, 0, 1]);
}
function checkReference(name, effectScale) {
  const fixture = reference.cases[name];
  const result = fit(rows(fixture.se, [0, 10, 4, 16, 8, 22].map(y => y * effectScale)));
  assert.ok(result.tau2_study > 0 && result.tau2_within > 0, 'exercise nonzero heterogeneity shares');
  const total = result.tau2_study + result.tau2_within + fixture.sigma2_typical;
  const expected = [result.tau2_study / total, result.tau2_within / total, fixture.sigma2_typical / total];
  shares(result).forEach((value, i) => {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `share ${i}: ${value}`);
    assert.ok(Math.abs(value - expected[i]) <= 1e-12, `share ${i}: ${value} vs R ${expected[i]}`);
  });
  assert.ok(Math.abs(shares(result).reduce((a, b) => a + b, 0) - 1) <= 1e-12);
}

test('P07-R2 regression: six zero effects with SE=10000 have shares [0,0,1]', () => {
  checkZeroEffects(fit, reference.cases.equal_large.se);
});

test('P07-R2 control: the same three-cluster design with SE=1 has shares [0,0,1]', () => {
  checkZeroEffects(fit, reference.cases.equal_unit.se);
});

test('P07-R2 regression: unequal large SEs retain the R sampling-variance contribution', () => {
  checkReference('unequal_large', 10000);
});

test('P07-R2 control: unequal unit-scale SEs retain the R sampling-variance contribution', () => {
  checkReference('unequal_unit', 1);
});

test('P07-R2 regression: a dominant positive weight must not erase sampling variance', () => {
  checkZeroEffects(fit, reference.cases.dominant_weight.se);
});

// Keep the historical defect executable, so future changes cannot weaken the
// regression to merely checking that some result object was returned.
const historical = `      var wSamp = rows.map(function (r) { return 1 / (r.se * r.se); });
      var sumWsamp = wSamp.reduce(function (a, b) { return a + b; }, 0);
      var sumW2samp = wSamp.reduce(function (a, b) { return a + b * b; }, 0);
      var denomSig = sumWsamp * sumWsamp - sumW2samp;
      var sigma2_typical = denomSig > 1e-12 ? ((rows.length - 1) * sumWsamp) / denomSig : 0;
`;
const block = /      var wSamp = rows\.map[\s\S]*?(?=      var totalVar =)/;
assert.match(source, block);
const plantedFit = loadFit(source.replace(block, historical));

test('P07-R2 planted cutoff is rejected by the regression and accepted by the unit control', () => {
  assert.throws(() => checkZeroEffects(plantedFit, reference.cases.equal_large.se), assert.AssertionError);
  checkZeroEffects(plantedFit, reference.cases.equal_unit.se);
});

test('P07-R2 control: built-in example retains displayed shares and other fit quantities', () => {
  const csv = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const example = csv.trim().split(/\r?\n/).map(line => {
    const [study, effect, se] = line.split(',').map(s => s.trim());
    return { study, te: Number(effect), se: Number(se) };
  });
  const before = plantedFit(example), after = fit(example);
  assert.deepEqual(shares(after).map(v => (v * 100).toFixed(1)), shares(before).map(v => (v * 100).toFixed(1)));
  shares(after).forEach((value, i) => assert.ok(Math.abs(value - shares(before)[i]) <= 1e-15));
  for (const key of ['mu', 'seMu', 'seMuHK', 'tau2_study', 'tau2_within', 'tCrit']) {
    assert.equal(after[key], before[key], key);
  }
});
