import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const input = readFileSync(new URL('./p07-translation-input.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const recorded = JSON.parse(readFileSync(new URL('./p07-translation-reference.json', import.meta.url), 'utf8'));
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const readers = [
  ['P07 fixture', 'hub/shared/tests/unit/p07-translation.test.mjs', 'inputBytes'],
  ['P07 corpus', 'hub/shared/tests/unit/p07-replay.mjs', 'bytes'],
  ['P04 corpus', 'scripts/p04-paper-replay.mjs', 'bytes'],
];

// Exercise the actual byte-reading declaration from each provenance check with
// controlled filesystem bytes. No assertion, expected digest or corpus changes.
function bytesFromReader(path, variable, content) {
  const url = new URL(path, root);
  const source = readFileSync(url, 'utf8');
  const declaration = source.match(new RegExp(`const ${variable} = [^\\n]+;`))?.[0];
  assert.ok(declaration, `${path}: provenance byte reader exists`);
  return vm.runInNewContext(declaration.replaceAll('import.meta.url', JSON.stringify(url.href)) + `\n${variable};`, {
    Buffer, URL, root, file: { path: 'fixture.json' }, f: { path: 'fixture.json' },
    readFileSync(_path, encoding) { return encoding ? content.toString(encoding) : Buffer.from(content); },
  });
}

for (const [label, path, variable] of readers) {
  test(`P13 LF control: ${label} preserves the recorded LF bytes and digest`, () => {
    const actual = bytesFromReader(path, variable, Buffer.from(input));
    assert.deepEqual(actual, Buffer.from(input));
    assert.equal(md5(actual), recorded.provenance.input_md5);
  });
  test(`P13 LF plant: ${label} hashes CRLF checkouts as LF bytes`, () => {
    const actual = bytesFromReader(path, variable, Buffer.from(input.replace(/\n/g, '\r\n')));
    assert.deepEqual(actual, Buffer.from(input));
    assert.equal(md5(actual), recorded.provenance.input_md5);
  });
  test(`P13 LF control: ${label} retains content tampering and lone CR`, () => {
    for (const suffix of [' ', '\r']) {
      const actual = bytesFromReader(path, variable, Buffer.from(input + suffix));
      assert.deepEqual(actual, Buffer.from(input + suffix));
      assert.notEqual(md5(actual), recorded.provenance.input_md5);
    }
  });
}
