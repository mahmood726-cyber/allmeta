import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { harness, root, read } from './p09-harness.mjs';

// Run the unchanged published adapter and comparator over all archived inputs.
// Four rendered-markup checks use the minimal DOM, not a browser layout engine.
const h = harness();
h.evaluate('shared/alm-validate.js');
h.window.AlmValidate.mount = () => ({});
h.context.AlmValidate = h.window.AlmValidate;
h.evaluate('proportion-ma/validate/adapter.js');
const manifest = JSON.parse(read('proportion-ma/validate/MANIFEST.json'));
const loaded = {};
for (const file of manifest.files) {
  const bytes = readFileSync(new URL('proportion-ma/' + file.path, root));
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  loaded[file.path] = JSON.parse(bytes);
}
const digest = createHash('sha256');
const snapshot = h.window.__almPropValidation.snapshot;
h.window.__almPropValidation.snapshot = () => {
  const value = snapshot();
  digest.update(JSON.stringify(value) + '\n');
  return value;
};
const report = await h.window.AlmProportionValidationAdapter.corpus.run(loaded, () => {});
console.log(JSON.stringify({
  runtime: process.version,
  checks: report.checks, passed: report.passed, failed: report.failed,
  refusals: report.refusals.length, maxima: report.maxima,
  snapshotSha256: digest.digest('hex')
}, null, 2));
assert.equal(report.checks, 298116);
assert.equal(report.passed, 298116);
assert.equal(report.failed.length, 0);
assert.equal(report.refusals.length, 198);
