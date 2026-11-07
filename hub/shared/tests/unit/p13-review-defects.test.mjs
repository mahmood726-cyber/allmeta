import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPreview } from './p13-preview-harness.mjs';

const repeated = (effect, se, k = 3) => Array.from({ length: k }, (_, i) => `${effect}, ${se}, S${i + 1}`).join('\n');
const zero = repeated(0, 1);

function accepted(h, result, expectedCount) {
  assert.ok(result, h.nodes['input-error'].textContent);
  assert.equal(result.n_subsets, expectedCount);
  for (const key of ['median_est', 'median_i2', 'min_est', 'max_est', 'q25_est', 'q75_est']) {
    assert.ok(Number.isFinite(result[key]), `${key} must be finite`);
  }
  assert.equal(h.nodes['analysis-status'].hidden, false);
  assert.equal(h.nodes['input-error'].textContent, '');
  assert.equal(h.nodes['plot-error'].textContent, '');
  assert.equal((h.nodes.plot.innerHTML.match(/<circle /g) || []).length, expectedCount);
  assert.equal(h.exported(), result);
}

function refused(h) {
  assert.equal(h.window._almLastGosh(), null, 'unsupported arithmetic must not produce successful results');
  assert.equal(h.exported(), null, 'no nonfinite or stale JSON export');
  assert.equal(h.nodes['analysis-status'].hidden, true);
  assert.match(h.nodes['input-error'].textContent, /numerical range|representable|nonfinite/i);
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(h.nodes[id].textContent, '\u2014');
  assert.equal(h.nodes.plot.innerHTML, '');
  assert.equal(h.exactRequests.at(-1), null, 'refusal cancels any pending exact result');
}

const unsupported = [
  ['SE square underflows', repeated(0, '1e-200')],
  ['inverse variance overflows', repeated(0, '1e-160')],
  ['SE square overflows', repeated(0, '1e200')],
  ['weight sum overflows', repeated(0, '1e-154')],
  ['weighted effect overflows', repeated('1e308', '0.1')],
  ['Q overflows', '1e200, 1, A\n-1e200, 1, B\n0, 1, C'],
  ['I2 arithmetic overflows', '7e153, 1, A\n-7e153, 1, B\n0, 1, C'],
];

for (const model of ['FE', 'DL']) {
  for (const [name, text] of unsupported) {
    test(`plant P13-R2 ${model}: ${name} is refused and clears prior results`, () => {
      const h = loadPreview();
      accepted(h, h.run(zero, model), 7);
      assert.doesNotThrow(() => h.run(text, model), 'numerical refusal must be handled by the page');
      refused(h);
      accepted(h, h.run(zero, model), 7);
    });
  }

  test(`plant P13-R2 ${model}: sampled preview refuses tiny SE and cancels pending exact work`, () => {
    const h = loadPreview();
    accepted(h, h.run(repeated(0, 1, 16), model), 32);
    assert.ok(h.exactRequests.at(-1)?.rows, 'control schedules ordinary exact work');
    assert.doesNotThrow(() => h.run(repeated(0, '1e-200', 16), model));
    refused(h);
    accepted(h, h.run(repeated(0, 1, 16), model), 32);
  });

  test(`control P13-R2 ${model}: ordinary zero effects retain finite fits and true zero I2`, () => {
    const h = loadPreview();
    const result = h.run(zero, model);
    accepted(h, result, 7);
    assert.equal(result.median_est, 0);
    assert.equal(result.median_i2, 0);
    assert.equal(h.nodes['m-est'].textContent, '0.000');
    assert.equal(h.nodes['m-i2'].textContent, '0.0%');
    const captured = h.window.__almGoshValidationRun(zero, model);
    assert.equal(captured.points.length, 7);
    for (const point of captured.points) {
      assert.equal(point.mu, 0);
      assert.equal(point.Q, 0);
      assert.equal(point.I2, 0);
      assert.ok(Number.isFinite(point.se) && point.se > 0);
      if (model === 'DL' && point.k > 1) assert.equal(point.tau2, 0);
    }
  });

  test(`control P13-R2 ${model}: ordinary heterogeneous input retains positive heterogeneity`, () => {
    const h = loadPreview();
    accepted(h, h.run('0, 1, A\n2, 1, B\n4, 1, C', model), 7);
    assert.ok(h.exported().median_i2 > 0);
    const captured = h.window.__almGoshValidationRun();
    const full = captured.points.find(point => point.k === 3);
    assert.equal(full.mu, 2);
    assert.equal(full.Q, 8);
    assert.equal(full.I2, 75);
    if (model === 'DL') assert.equal(full.tau2, 3);
  });

  test(`control P13-R2 ${model}: representable small and large SEs remain supported`, () => {
    const h = loadPreview();
    for (const se of ['1e-70', '1e70']) accepted(h, h.run(repeated(0, se), model), 7);
  });
}

test('plant P13-R2 DL: overflowing squared weights cannot silently clamp tau2 to zero', () => {
  const h = loadPreview();
  assert.doesNotThrow(() => h.run('0, 1e-80, A\n2e-80, 1e-80, B\n4e-80, 1e-80, C', 'DL'));
  refused(h);
});

test('plant P13-R2 DL: unrepresentable positive denominator cannot silently clamp tau2 to zero', () => {
  const h = loadPreview();
  assert.doesNotThrow(() => h.run('0, 1e-10, A\n0, 1, B\n0, 1, C', 'DL'));
  refused(h);
});
