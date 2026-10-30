import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyOracle } from './p11-r4-provenance.mjs';

const ref = JSON.parse(readFileSync(new URL('./p11-r4-reference.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../../../tests/reml_reference.R', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('P11-R4 provenance plant: LF checkout retains the historical oracle identity', () => {
  verifyOracle(ref.provenance, source);
});
test('P11-R4 provenance control: CRLF checkout has the same canonical digest', () => {
  verifyOracle(ref.provenance, source.replace(/\n/g, '\r\n'));
});
test('P11-R4 provenance control: changed oracle content or historical digest is rejected', () => {
  assert.throws(() => verifyOracle(ref.provenance, source + '# changed\n'), assert.AssertionError);
  assert.throws(() => verifyOracle({ ...ref.provenance, oracle_md5: 'changed' }, source), assert.AssertionError);
});
