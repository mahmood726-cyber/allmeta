import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('tests/fixtures/reml_reference.json', root), 'utf8'));
const sources = [
  ...Object.entries(reference.input_sha256),
  ['tests/reml_reference.R', reference.source_sha256],
].map(([filename, expected]) => ({ filename, expected, bytes: readFileSync(new URL(filename, root)) }));

// The existing pins describe LF source bytes. Match tests/test_reml_global.py's
// checkout normalization; never regenerate the digests or numerical references.
const lf = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('P10 provenance control: LF source bytes match all recorded R digests', () => {
  for (const { filename, expected, bytes } of sources) {
    assert.equal(digest(lf(bytes)), expected, filename);
  }
});

test('P10 provenance plant: CRLF checkout matches the same LF digests', () => {
  for (const { filename, expected, bytes } of sources) {
    const crlf = Buffer.from(lf(bytes).toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    // Plant the unnormalized-byte hash defect against the unchanged assertion.
    // This is synthetic evidence, not an execution of a historical checkout.
    assert.throws(() => assert.equal(digest(crlf), expected, filename), assert.AssertionError);
    assert.equal(digest(lf(crlf)), expected, filename);
  }
});

test('P10 provenance control: edited source content fails the recorded digest', () => {
  for (const { filename, expected, bytes } of sources) {
    const edited = Buffer.concat([lf(bytes), Buffer.from('# planted content edit\n')]);
    assert.throws(() => assert.equal(digest(lf(edited)), expected, filename), assert.AssertionError);
  }
});
