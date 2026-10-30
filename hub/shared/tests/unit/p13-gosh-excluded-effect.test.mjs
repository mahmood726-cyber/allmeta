import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import E from '../../../../gosh/exact-enum.js';

// Keep the exact-mode contract: 1e-9 normalised error, with no relaxed tolerance.
const TOL = 1e-9;
const fields = ['estimate', 'I2', 'Q', 'tau2'];
function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual) &&
    Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) <= TOL,
  `${label}: ${actual} vs ${expected}`);
}
function sameFit(actual, expected, label) {
  // Diagnose Q first: lost Q also corrupts I2, DL tau2 and the DL estimate.
  for (const i of [2, 1, 3, 0]) close(actual[i], expected[i], `${label} ${fields[i]}`);
}
function input(members, remote = 10, values = [0, 4]) {
  const te = Array(16).fill(0), se = Array(16).fill(1);
  members.forEach((member, i) => { te[member] = values[i]; se[member] = i + 1; });
  te[15] = remote;
  return { te, se, mask: members.reduce((mask, i) => mask + 2 ** i, 0) };
}
function fit(data, model) {
  return E.createEngine(data.te, data.se, model).fit(data.mask);
}

const layouts = [['low', [0, 1]], ['high', [12, 13]], ['split', [0, 12]]];
for (const model of ['FE', 'DL']) {
  test(`P13-R1 control ${model}: ordinary subset in each table layout`, () => {
    // Direct two-study formula: w=(1,1/4), muFE=4/5, Q=16/5,
    // C=2/5 and tau2=(16/5-1)/(2/5)=11/2 for DL.
    const expected = [model === 'FE' ? 0.8 : 1.625, 68.75, 3.2, model === 'FE' ? 0 : 5.5];
    for (const [name, members] of layouts) sameFit(fit(input(members), model), expected, name);
  });

  for (const [name, members] of layouts) {
    test(`P13-R1 plant ${model}: excluded effect cannot change ${name} subset`, () => {
      const ordinary = fit(input(members), model);
      for (const remote of [1e10, 1e6, -1e10, 1e20]) {
        sameFit(fit(input(members, remote), model), ordinary, `${name}, excluded=${remote}`);
      }
    });
  }

  test(`P13-R1 plant ${model}: excluded effect cannot change a zero-tau2 subset`, () => {
    for (const [name, members] of layouts) {
      const ordinary = fit(input(members, 10, [0.1, 0.3]), model);
      assert.equal(ordinary[3], 0);
      sameFit(fit(input(members, 1e10, [0.1, 0.3]), model), ordinary, name);
    }
  });

  test(`P13-R1 plant ${model}: singleton retains its original effect`, () => {
    for (const member of [0, 12]) {
      const data = input([member], 1e10, [0.1]);
      sameFit(fit(data, model), [0.1, 0, 0, 0], `member ${member}`);
    }
  });

  test(`P13-R1 plant ${model}: streamed without-study means ignore excluded effect`, () => {
    const ordinary = input([0, 1]);
    const expected = E.run(ordinary.te.slice(0, 15), ordinary.se.slice(0, 15), model, { quantiles: false });
    const remote = input([0, 1], 1e10);
    const actual = E.run(remote.te, remote.se, model, { quantiles: false }).per_study[15];
    assert.equal(actual.without_n, expected.n_subsets);
    close(actual.without_i2, expected.mean_i2, 'streamed I2');
    close(actual.without_mean, expected.mean_est, 'streamed estimate');
  });

  test(`P13-R1 control ${model}: homogeneous and singleton subsets`, () => {
    const e = E.createEngine([0.25, 0.25, 0.25], [1, 2, 3], model);
    for (let mask = 1; mask < 8; mask++) sameFit(e.fit(mask), [0.25, 0, 0, 0], `mask ${mask}`);
  });
}

const reference = JSON.parse(readFileSync(new URL('../fixtures/p13-gosh-reference.json', import.meta.url), 'utf8'));
for (const row of reference.cases) {
  test(`P13-R1 R parity ${row.name}`, () => {
    const mask = row.members.reduce((value, i) => value + 2 ** (i - 1), 0);
    sameFit(fit({ ...row, mask }, row.model), row.expected, row.name);
  });
}
