import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const load = require('../../../../gosh/tests/input-harness.cjs');
export const exact = require('../../../../gosh/exact-enum.js');
export const inputURL = new URL('../fixtures/gosh-r-parity-input.json', import.meta.url);
export const drawsURL = new URL('../fixtures/gosh-r-parity-draws.json', import.meta.url);
export const scriptURL = new URL('../r/gosh-reference.R', import.meta.url);
export const input = JSON.parse(readFileSync(inputURL));
export const reference = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-reference.json', import.meta.url)));
export const duplicateInputURL = new URL('../fixtures/gosh-r-parity-duplicates-input.json', import.meta.url);
export const duplicateDrawsURL = new URL('../fixtures/gosh-r-parity-duplicates-draws.json', import.meta.url);
export const duplicateScriptURL = new URL('../r/gosh-duplicates-reference.R', import.meta.url);
export const duplicateInput = JSON.parse(readFileSync(duplicateInputURL));
export const duplicateReference = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-duplicates-reference.json', import.meta.url)));
export const cases = [...input.cases, ...duplicateInput.cases];
export const fits = [...reference.fits, ...duplicateReference.fits];
export const tolerance = 1e-6; // Absolute for every field, including I2 in percentage points. No scaling.
const page = load(fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url)));
export function pageResult(c, model) {
  const text = c.te.map((y, i) => `${y},${c.se[i]},S${i + 1}`).join('\n');
  return page.window.__almGoshValidationRun(text, model, String(c.draws || 5000), {});
}
export function compare(actual, expected, fields, label) {
  const failures = [];
  for (const q of fields) {
    const a = actual[q], b = expected[q], difference = Math.abs(a - b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > tolerance) {
      failures.push({field:q, app:a, R:b, absolute_difference:difference});
    }
  }
  assert.deepEqual(failures, [], label);
}
export function pointFields(model, point) {
  // The page deliberately omits tau2 for FE and singleton DL fits.
  return ['mu','se','Q','I2', ...(model === 'DL' && point.k > 1 ? ['tau2'] : [])];
}
export function comparePoints(actual, expected, model) {
  assert.equal(actual.length, expected.length, 'subset/draw count');
  actual.forEach((p,i) => {
    assert.deepEqual(Array.from(p.members), expected[i].members, `membership/order ${i}`);
    assert.equal(p.k, expected[i].k);
    compare(p, expected[i], pointFields(model,p), `point ${i}, members ${p.members}`);
  });
}
export function exactPoints(c, model, points) {
  const engine = exact.createEngine(c.te, c.se, model);
  return points.map(p => {
    const mask = p.members.reduce((sum,j) => sum + 2 ** (j-1), 0);
    const [mu,I2,Q,tau2] = engine.fit(mask);
    return {mu,I2,Q,tau2};
  });
}
export const pageSummaryFields = ['median_est','median_i2','min_est','max_est','q25_est','q75_est'];
