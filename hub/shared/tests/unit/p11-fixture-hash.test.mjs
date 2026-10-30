import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtureMD5 } from './p11-fixture-hash.mjs';

const reference = JSON.parse(readFileSync(new URL('./p11-plot-reference.json', import.meta.url), 'utf8'));
const lf = readFileSync(new URL('./p11-plot-input.csv', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const crlf = lf.replace(/\n/g, '\r\n');

test('control P11 provenance: LF bytes match the immutable native-R input hash', () => {
  assert.equal(fixtureMD5(Buffer.from(lf)), reference.provenance.input_md5);
});

test('plant P11 provenance: CRLF checkout preserves the recorded LF input hash', () => {
  assert.notEqual(crlf, lf, 'the line-ending plant must change the bytes');
  assert.equal(fixtureMD5(Buffer.from(crlf)), reference.provenance.input_md5);
});

test('control P11 provenance: changed numerical input is rejected with either line ending', () => {
  for (const input of [lf, crlf]) {
    const changed = input.replace('0.25', '0.26');
    assert.notEqual(changed, input, 'the value plant must change the CSV');
    assert.notEqual(fixtureMD5(Buffer.from(changed)), reference.provenance.input_md5);
  }
});

test('control P11 provenance: lone CR and missing final newline are not normalized away', () => {
  assert.notEqual(fixtureMD5(Buffer.from(lf.replace(/\n/g, '\r'))), reference.provenance.input_md5);
  assert.notEqual(fixtureMD5(Buffer.from(lf.slice(0, -1))), reference.provenance.input_md5);
});
