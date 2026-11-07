import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const input = new URL('p20-csv-means-input.csv', import.meta.url);
const attributes = new URL('.gitattributes', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('p20-csv-means-reference.json', import.meta.url), 'utf8'));
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

test('planted P20-R2: the hashed CSV has an explicit LF checkout policy', () => {
  const policy = existsSync(attributes) ? readFileSync(attributes, 'utf8') : '';
  assert.match(policy, /^\/p20-csv-means-input\.csv[ \t]+text[ \t]+eol=lf[ \t]*\r?$/m,
    'pin only this immutable reference input to LF even on a CRLF checkout');
});

test('control P20-R2: the recorded raw-byte hash accepts LF and detects changed bytes', () => {
  const bytes = readFileSync(input);
  assert.equal(bytes.includes(13), false, 'the delivered fixture itself must use LF');
  assert.equal(md5(bytes), reference.provenance.input_md5);
  const crlf = Buffer.from(bytes.toString('utf8').replace(/\n/g, '\r\n'));
  assert.notEqual(md5(crlf), reference.provenance.input_md5, 'CRLF must still fail the unchanged raw-byte check');
  const altered = Buffer.from(bytes);
  const mean = altered.indexOf('52.5');
  assert.ok(mean >= 0);
  altered[mean] = '6'.charCodeAt(0);
  assert.notEqual(md5(altered), reference.provenance.input_md5, 'numeric edits must still fail provenance');
});
