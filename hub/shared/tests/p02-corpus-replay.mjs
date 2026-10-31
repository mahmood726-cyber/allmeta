// Read-only replay of the authoritative frozen corpus using its existing adapter/tolerances.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const context = vm.createContext({ setTimeout, document: { getElementById: () => ({}) } });
context.window = context;
vm.runInContext(read('shared/dose-response.js'), context);
const originalFit = context.AlmDoseResponse.fitDR;
const digest = createHash('sha256');
context.AlmDoseResponse.fitDR = (...args) => {
  const result = originalFit(...args);
  digest.update(JSON.stringify(result));
  if (result.ok) {
    const predict = result.predict;
    result.predict = (...input) => {
      const predictions = predict(...input);
      digest.update(JSON.stringify(predictions));
      return predictions;
    };
  }
  return result;
};
vm.runInContext(read('dose-response-ma/validate/adapter.js'), context);
const manifest = JSON.parse(read('dose-response-ma/validate/MANIFEST.json'));
const files = {};
for (const file of manifest.files) {
  const bytes = read('dose-response-ma/' + file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  files[file.path] = JSON.parse(bytes);
}
const result = await context.AlmDoseValidate.corpus.run(files);
const paper = files['validate/corpus/paper_values.json'].values;
assert.equal(result.checks, paper.grid_fits.value);
assert.equal(result.passed, paper.grid_within_tolerance.value, JSON.stringify(result.failed));
assert.equal(result.failed.length, 0);
assert.equal(result.refusals.reference, paper.grid_R_refused.value);
assert.equal(result.refusals.app, paper.grid_R_refused.value);
assert.equal(result.refusals.matched, paper.grid_refusals_matched.value);
console.log(JSON.stringify({ checks: result.checks, passed: result.passed, refusals: result.refusals,
  failed: result.failed, resultAndPredictionSHA256: digest.digest('hex') }));
