// The job has no base/ tree. Reconstruct ONLY the documented old refusal branch
// in memory; this is a planted defect, not a claim to replay a historical checkout.
import assert from 'node:assert/strict';
import { unitCases } from './p07-review-harness.mjs';

let substitutions = 0;
const current = unitCases('./p07-dictate-stale.test.mjs');
const planted = unitCases('./p07-dictate-stale.test.mjs', (url, bytes) => {
  if (!url.pathname.endsWith('/multilevel-ma/index.html')) return bytes;
  const source = bytes.toString('utf8');
  const branch = /if \(rows\.length < 3\) \{[\s\S]*?\n      \}/g;
  assert.equal([...source.matchAll(branch)].length, 1);
  substitutions++;
  return Buffer.from(source.replace(branch,
    'if (rows.length < 3) { _lastResults = null; _lastReml = null; return; }'));
});
assert.equal(substitutions, 1);
assert.equal(current.length, 10);
assert.equal(planted.length, 10);
let failed = 0, controls = 0;
for (let i = 0; i < current.length; i++) {
  assert.equal(current[i].name, planted[i].name);
  current[i].run();
  if (planted[i].name.includes(' plant:')) {
    assert.throws(planted[i].run, error => error.code === 'ERR_ASSERTION' &&
      error.message.includes('No previous analysis display may survive a refused Run'));
    failed++;
    console.log(`OLD REFUSAL PLANT FAIL / CURRENT PASS: ${current[i].name}`);
  } else {
    planted[i].run();
    controls++;
    console.log(`CONTROL PASS BOTH: ${current[i].name}`);
  }
}
assert.equal(failed, 4);
assert.equal(controls, 6);
console.log('Documented old-branch reconstruction: 4 expected failures, 6 passing controls; current: 10 pass.');
