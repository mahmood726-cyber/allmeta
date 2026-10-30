import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const here = import.meta.url;
const read = path => readFileSync(new URL(path, root), 'utf8');
const lf = text => text.replace(/\r\n/g, '\n');
const crlf = text => lf(text).replace(/\n/g, '\r\n');
const reference = JSON.parse(read('hub/shared/tests/unit/p07-translation-reference.json'));

// Run the existing test/replay's byte-loading code with simulated checkout bytes.
// No fixture, recorded hash, or on-disk source is rewritten by these tests.
for (const [name, checkout] of [['LF control', lf], ['CRLF plant', crlf]]) {
  test(`P07 provenance ${name}: translation input retains its recorded MD5`, () => {
    const source = read('hub/shared/tests/unit/p07-translation.test.mjs');
    const statement = source.slice(source.indexOf('const inputBytes ='), source.indexOf('const input ='));
    assert.ok(statement.startsWith('const inputBytes ='));
    const bytes = vm.runInNewContext(statement.replaceAll('import.meta.url', 'here') + '\ninputBytes;', {
      URL, here, Buffer,
      readFileSync: () => Buffer.from(checkout(read('hub/shared/tests/unit/p07-translation-input.json'))),
    });
    assert.equal(createHash('md5').update(bytes).digest('hex'), reference.provenance.input_md5);
  });

  test(`P07 provenance ${name}: corpus replay retains all manifest byte counts and SHA-256 values`, () => {
    const source = read('hub/shared/tests/unit/p07-replay.mjs');
    const preflight = source.slice(source.indexOf('const root ='), source.indexOf('const corpus ='));
    assert.ok(preflight.includes('file.sha256'));
    vm.runInNewContext(preflight.replaceAll('import.meta.url', 'here'), {
      URL, here, Buffer, assert, createHash,
      readFileSync(url, encoding) {
        const text = checkout(readFileSync(url, 'utf8'));
        return encoding ? text : Buffer.from(text);
      },
    });
  });
}

test('P07 provenance control: a changed data byte still fails the recorded MD5', () => {
  const changed = lf(read('hub/shared/tests/unit/p07-translation-input.json')).replace('-1.25', '-1.26');
  assert.notEqual(createHash('md5').update(changed).digest('hex'), reference.provenance.input_md5);
});
