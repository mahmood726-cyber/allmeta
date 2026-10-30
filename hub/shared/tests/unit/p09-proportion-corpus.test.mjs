import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { harness, read } from './p09-proportion-harness.mjs';

test('P09-R5 immutable corpus: original adapter, hashes, tolerances and all 298116 checks', async t => {
  const h = harness();
  h.run();
  vm.runInContext(read('shared/alm-validate.js'), h.context);
  // Mounting the validation widget is outside this Node DOM contract.
  h.context.AlmValidate.mount = () => ({});
  vm.runInContext(read('proportion-ma/validate/adapter.js'), h.context);
  const adapter = h.context.AlmProportionValidationAdapter;
  const loaded = {};
  for (const file of adapter.corpus.files) {
    const bytes = read('proportion-ma/' + file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal(Buffer.byteLength(bytes), file.bytes);
    loaded[file.path] = JSON.parse(bytes);
  }
  const result = await adapter.corpus.run(loaded, () => {});
  t.diagnostic(JSON.stringify({ checks: result.checks, passed: result.passed, refusals: result.refusals.length, maxima: result.maxima, failed: result.failed.slice(0, 10) }));
  assert.equal(result.checks, 298116);
  assert.equal(result.passed, 298116);
  assert.equal(result.failed.length, 0);
  assert.equal(result.refusals.length, 198);
});
