import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { input, inputBytes, readReference, loadEngine, engineSource,
  near, compareFit, compareIntervals } from './component-nma-p19-harness.mjs';

test('P19 provenance control: native R versions, exact inputs, and generator hash', () => {
  const ref = readReference();
  assert.match(ref.provenance.R, /^R version /);
  for (const p of ['netmeta', 'meta', 'metafor', 'jsonlite']) assert.ok(ref.provenance.packages[p], p);
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
  assert.match(ref.provenance.packages.jsonlite, /\(not used\)$/);
  const md5 = data => createHash('md5').update(data).digest('hex');
  assert.equal(ref.provenance.input_md5, md5(inputBytes));
  assert.equal(ref.provenance.script_md5, md5(readFileSync(
    new URL('../r/component-nma-p19-reference.R', import.meta.url))));
  assert.deepEqual(ref.input, input);
  assert.deepEqual(Object.keys(ref.cases).sort(), input.cases.map(c => c.id).sort());
  assert.equal(ref.provenance.tolerance, 1e-6);
});

for (const c of input.cases) {
  test(`P19 R parity: ${c.id} DL, Q, df, effects, SE, and covariance`, () => {
    const ref = readReference().cases[c.id];
    assert.equal(ref.error, undefined, 'R generation succeeded');
    assert.deepEqual(ref.input, c);
    const engine = loadEngine();
    const { result, messages } = engine.run(c);
    assert.deepEqual(messages, []);
    assert.equal(result.inactive, c.inactive);
    compareFit(result, ref);
    const raw = engine.fit(c);
    const order = Array.isArray(ref.covariance_order) ? ref.covariance_order : [ref.covariance_order];
    for (let i = 0; i < order.length; i++) for (let j = 0; j < order.length; j++) {
      near(raw.cov[raw.comps.indexOf(order[i])][raw.comps.indexOf(order[j])], ref.covariance[i][j],
        `${c.id}.covariance.${order[i]}.${order[j]}`);
    }
  });
  test(`P19 R parity: ${c.id} normal 95% component and combination CIs`, () => {
    compareIntervals(loadEngine().run(c).forest, readReference().cases[c.id]);
  });
}

test('P19 regime controls: positive DL, zero DL, saturated null, and zero effects', () => {
  const ref = readReference().cases;
  for (const id of ['heterogeneous', 'two_positive', 'disconnected']) assert.ok(ref[id].tau2 > 0, id);
  for (const id of ['tiny_zero', 'two_zero', 'null_effects']) assert.equal(ref[id].tau2, 0, id);
  assert.equal(ref.saturated.df, 0);
  assert.equal(ref.saturated.tau2, null);
  for (const value of Object.values(ref.null_effects.components)) near(value.est, 0, 'null estimate');
  for (const id of ['two_positive', 'two_zero', 'saturated']) assert.equal(ref[id].k, 2, id);
});

test('P19 k=1 scope control: clear a prior fit and refuse, despite an R FE estimate', () => {
  const engine = loadEngine();
  assert.ok(engine.run(input.cases[0]).result);
  assert.deepEqual(readReference().single.input, input.single);
  assert.ok(Number.isFinite(readReference().single.est));
  const got = engine.run(input.single);
  assert.equal(got.result, null);
  assert.deepEqual(got.messages, ['At least 2 valid contrasts are required.']);
  assert.equal(got.componentTable, ''); assert.equal(got.combinationTable, '');
  assert.equal(got.forestMarkup, ''); assert.deepEqual(got.forest, []);
});

// These plants mutate an in-memory copy only. The same R assertions must pass
// the untouched source and reject each defect, with no test/oracle relaxation.
const plants = [
  {name: 'rounded 1.96 CI multiplier', id: 'heterogeneous',
    from: 'var Z975 = 1.959963984540054;', to: 'var Z975 = 1.96;', intervals: true},
  {name: 'omit combination cross-covariance', id: 'tiny_zero',
    from: 'varSum += 2 * f.cov[ia][ib];', to: 'varSum += 0 * f.cov[ia][ib];'},
  {name: 'common weights replace random weights', id: 'heterogeneous',
    from: 'const res2 = wls(wRE);', to: 'const res2 = wls(w);'},
  {name: 'univariate df replaces component df', id: 'disconnected',
    from: 'const df = rows.length - p;', to: 'const df = rows.length - 1;'},
  {name: 'saturated tau2 zero replaces null', id: 'saturated',
    from: 'const tau2 = df === 0 ? null :', to: 'const tau2 = df === 0 ? 0 :'},
  {name: 'reverse comparator sign', id: 'shared_component',
    from: 'X[i][comps.indexOf(c)] -= 1;', to: 'X[i][comps.indexOf(c)] += 1;'},
];
for (const plant of plants) {
  test(`P19 planted-defect control: ${plant.name}`, () => {
    const c = input.cases.find(c => c.id === plant.id), ref = readReference().cases[plant.id];
    const check = engine => {
      const got = engine.run(c);
      if (plant.intervals) compareIntervals(got.forest, ref);
      else compareFit(got.result, ref);
    };
    check(loadEngine());
    assert.equal(engineSource.split(plant.from).length, 2, 'plant hits exactly once');
    assert.throws(() => check(loadEngine(engineSource.replace(plant.from, plant.to))),
      { name: 'AssertionError' }, 'R parity assertion detects planted numerical defect');
  });
}
