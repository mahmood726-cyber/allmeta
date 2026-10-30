import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputPath, readSource, runDiagnostics } from '../../../../rve-meta/tests/p15-r5-test-copy.mjs';

const lf = readSource(inputPath).replace(/\r\n/g, '\n');
const provenanceTest = 'control: fresh R fixture records the inputs, versions and refused designs';

test('P15 provenance control: LF input passes all original diagnostic assertions', () => {
  const result = runDiagnostics({ [inputPath]: lf });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 16\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('P15 provenance plant: CRLF packaging preserves the recorded LF input digest', () => {
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.notEqual(crlf, lf);
  assert.deepEqual(JSON.parse(crlf), JSON.parse(lf));
  const result = runDiagnostics({ [inputPath]: crlf });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 16\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('P15 provenance control: non-newline byte changes still fail the original digest assertion', () => {
  // Valid JSON with identical parsed values: only the checksum can reject it.
  const changed = lf + ' ';
  assert.deepEqual(JSON.parse(changed), JSON.parse(lf));
  const result = runDiagnostics({ [inputPath]: changed });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(result.failures, [provenanceTest]);
  assert.match(result.stdout, /# pass 15\b/);
  assert.match(result.stdout, /# fail 1\b/);
  assert.ok(result.stdout.includes(JSON.parse(readSource('hub/shared/tests/unit/p15-r5-reference.json')).provenance.input_md5));
});
