import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const adapter = readFileSync(new URL('proportion-ma/validate/adapter.js', root), 'utf8');
const files = JSON.parse(adapter.match(/const files = (\[.*\]);/)[1]);
const replay = readFileSync(new URL('../p09-dictate-replay.mjs', import.meta.url), 'utf8');
// Exercise the replay's actual provenance check without running its full corpus.
const start = replay.indexOf('const loaded = {};');
const end = replay.indexOf('const result = await adapter.corpus.run');
assert.ok(start >= 0 && end > start, 'replay provenance block found');
const verify = replay.slice(start, end) + '\nObject.keys(loaded);';

for (const spec of files) {
  const lf = readFileSync(new URL('proportion-ma/' + spec.path, root), 'utf8')
    .replace(/\r\n/g, '\n');
  function load(text) {
    const bytes = Buffer.from(text, 'utf8');
    return vm.runInNewContext(verify, {
      adapter: { corpus: { files: [spec] } }, root, URL, createHash, assert,
      readFileSync: (_path, encoding) => encoding ? bytes.toString(encoding) : bytes
    });
  }

  test(`P09 provenance control: LF ${spec.path} matches the recorded hash`, () => {
    assert.equal(load(lf).length, 1);
  });

  test(`P09 provenance plant: CRLF ${spec.path} matches the same recorded LF hash`, () => {
    assert.ok(lf.includes('\n'), 'fixture exercises line endings');
    assert.equal(load(lf.replace(/\n/g, '\r\n')).length, 1);
  });

  test(`P09 provenance control: changed content in ${spec.path} is rejected`, () => {
    const changed = lf.replace(/[0-9]/, digit => digit === '0' ? '1' : '0');
    assert.notEqual(changed, lf, 'plant changes a digit');
    for (const text of [changed, changed.replace(/\n/g, '\r\n'), lf + ' ']) {
      assert.throws(() => load(text), assert.AssertionError);
    }
  });
}
