import test from 'node:test';
import assert from 'node:assert/strict';
import { lfInput, withReplayTree, runExportSuite, setInput } from './p03-replay-support.mjs';

const provenanceTest = 'P03-R1 control: fresh R fixture records exact inputs and R/stats versions';
function checkInput(input) {
  return withReplayTree(directory => {
    setInput(directory, input);
    return runExportSuite(directory, provenanceTest);
  });
}

test('P03-R2 control: LF input retains the recorded provenance checksum', () => {
  const result = checkInput(lfInput);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /# pass 1\b/);
  assert.match(result.output, /# fail 0\b/);
});

test('P03-R2 plant: CRLF checkout retains the same LF provenance checksum', () => {
  const result = checkInput(lfInput.replace(/\n/g, '\r\n'));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /# pass 1\b/);
  assert.match(result.output, /# fail 0\b/);
});

test('P03-R2 control: a non-newline byte change still fails provenance', () => {
  // Leading zero preserves all parsed rows/numbers, so only the hash can
  // detect this change. Canonicalization must not reserialize parsed CSV.
  assert.ok(lfInput.includes(',85,'));
  const result = checkInput(lfInput.replace(',85,', ',085,'));
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /not ok \d+ - P03-R1 control: fresh R fixture/);
  assert.match(result.output, /ERR_ASSERTION/);
  assert.match(result.output, /# fail 1\b/);
});
