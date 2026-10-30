// Run from wt/. Reconstruct only the reviewed raw-byte hash in a temporary copy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lfInput, unit, withReplayTree, runExportSuite, setInput } from './p03-replay-support.mjs';

const testName = 'P03-R1 control: fresh R fixture records exact inputs and R/stats versions';
withReplayTree(directory => {
  const path = join(directory, unit, 'p03-results-export.test.mjs');
  const current = readFileSync(path, 'utf8');
  const canonical = "createHash('md5').update(inputBytes.toString().replace(/\\r\\n/g, '\\n')).digest('hex')";
  const original = "createHash('md5').update(inputBytes).digest('hex')";
  assert.equal(current.split(canonical).length, 2, 'Canonical hash must match exactly once');
  assert.ok(lfInput.includes(',85,'));

  for (const [label, source, crlfStatus] of [
    ['RECONSTRUCTED RAW HASH', current.replace(canonical, original), 1],
    ['CURRENT LF HASH', current, 0],
  ]) {
    writeFileSync(path, source);
    for (const [variant, bytes, expectedStatus] of [
      ['LF control', lfInput, 0],
      ['CRLF plant', lfInput.replace(/\n/g, '\r\n'), crlfStatus],
      ['non-newline change control', lfInput.replace(',85,', ',085,'), 1],
    ]) {
      setInput(directory, bytes);
      const result = runExportSuite(directory, testName);
      assert.equal(result.status, expectedStatus, result.output);
      if (expectedStatus === 1) {
        assert.match(result.output, /not ok \d+ - P03-R1 control: fresh R fixture/);
        assert.match(result.output, /ERR_ASSERTION/);
        assert.match(result.output, /# fail 1\b/);
      } else {
        assert.match(result.output, /# pass 1\b/);
        assert.match(result.output, /# fail 0\b/);
      }
      console.log(`${label}: ${variant} ${expectedStatus ? 'FAIL (expected)' : 'PASS'}`);
    }
  }
  console.log('Verified: original CRLF hash FAIL -> canonical LF hash PASS; both controls preserved.');
});
