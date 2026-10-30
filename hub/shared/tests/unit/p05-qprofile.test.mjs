import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import HetCI from '../../../../shared/heterogeneity-ci.js';
import MaCore from '../../../../shared/ma-core.js';

const read = name => readFileSync(new URL(name, import.meta.url));
const inputs = JSON.parse(read('p05-qprofile-input.json'));
// Read inside each parity test so independent controls/refusal still run if R fails.
const oracle = () => JSON.parse(read('p05-qprofile-reference.json'));
const studies = input => input.yi.map((est, i) => ({ est, v: input.vi[i] }));
const near = (actual, expected, label, kind = 'relative') => {
  const diff = Math.abs(actual - expected) / (kind === 'relative' ? Math.max(1, Math.abs(expected)) : 1);
  assert.ok(Number.isFinite(actual) && diff <= 1e-9,
    `${label}: actual=${actual}, R=${expected}, ${kind} difference=${diff}, tolerance=1e-9`);
};

test('control: Q-profile oracle records matching inputs, script and R/package versions', () => {
  const ref = oracle();
  for (const key of ['R', 'metafor', 'jsonlite']) assert.ok(ref.provenance[key]);
  for (const [key, name] of [['input', 'p05-qprofile-input.json'], ['script', 'p05-qprofile-reference.R']]) {
    assert.equal(createHash('md5').update(read(name)).digest('hex'), ref.provenance[`${key}_md5`]);
  }
  for (const [name, input] of Object.entries(inputs)) {
    assert.deepEqual(ref.cases[name].yi, input.yi, name);
    assert.deepEqual(ref.cases[name].vi, input.vi, name);
  }
});

test('control P05-R1: PM estimate and Q-profile lower bound match R for the ceiling case', () => {
  const input = inputs.ceiling, ref = oracle().cases.ceiling.values;
  assert.ok(ref.tau2PM < 2 ** 30);
  assert.ok(ref.tau2Lo < 2 ** 30);
  near(MaCore.tau2PM(input.yi, input.vi), ref.tau2PM, 'PM point estimate');
  near(HetCI.qProfileCI(studies(input)).tau2Lo, ref.tau2Lo, 'lower bound');
});

test('plant P05-R1: Q-profile upper bound beyond 2^30 matches fresh metafor', () => {
  const ref = oracle().cases.ceiling.values;
  assert.ok(ref.tau2Hi > 2 ** 30, 'oracle exercises the old search ceiling');
  const actual = HetCI.qProfileCI(studies(inputs.ceiling));
  near(actual.tau2Hi, ref.tau2Hi, 'upper bound');
  near(actual.I2Hi, ref.I2Hi, 'upper I2', 'absolute');
  // Independent Q equation for this symmetric pair: Q(tau2) = 2000000/(1+tau2).
  near(2e6 / (1 + actual.tau2Hi), HetCI.chiSqQuantile(0.025, 1), 'upper-tail Q target', 'absolute');
});

test('plant P05-R1: exhausted Q-profile search explicitly refuses an unbracketed bound', () => {
  // Finite input/Q, but the root is beyond the retained 200-doubling safety guard.
  assert.throws(() => HetCI.qProfileCI([{ est: -1e40, v: 1 }, { est: 1e40, v: 1 }]),
    { name: 'RangeError', message: /Q-profile.*bracket/i });
});

for (const name of ['ordinary', 'heterogeneous', 'homogeneous', 'identical']) {
  test(`control: ${name} Q-profile bounds match fresh metafor`, () => {
    const input = inputs[name], ref = oracle().cases[name].values;
    const actual = HetCI.qProfileCI(studies(input));
    for (const key of ['tau2Lo', 'tau2Hi']) near(actual[key], ref[key], `${name} ${key}`);
    for (const key of ['I2Lo', 'I2Hi']) near(actual[key], ref[key], `${name} ${key}`, 'absolute');
    const viaSE = HetCI.qProfileCI(input.yi.map((est, i) => ({ est, se: Math.sqrt(input.vi[i]) })));
    for (const key of ['tau2Lo', 'tau2Hi', 'I2Lo', 'I2Hi']) near(viaSE[key], actual[key], `SE input ${key}`);
  });
}

test('control: Q-profile remains unavailable for fewer than two studies', () => {
  assert.equal(HetCI.qProfileCI([]), null);
  assert.equal(HetCI.qProfileCI([{ est: 1, v: 1 }]), null);
});
