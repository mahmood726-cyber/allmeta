import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { root, read } from '../fixtures/p09-harness.mjs';

// Exercise the replay's actual manifest verification, using its unchanged
// published byte counts and SHA-256 pins. Supply checkout variants in memory;
// never rewrite a corpus or substitute a newly calculated reference hash.
const source = read('hub/shared/tests/fixtures/p09-replay.mjs');
const start = source.indexOf('const manifest =');
const end = source.indexOf('const digest =', start);
assert.ok(start >= 0 && end > start, 'Locate the replay manifest verification');
const verification = source.slice(start, end);
const manifest = JSON.parse(read('proportion-ma/validate/MANIFEST.json'));
const corpus = new Map(manifest.files.map(file => {
  const url = new URL('proportion-ma/' + file.path, root);
  return [url.href, readFileSync(url, 'utf8').replaceAll('\r\n', '\n')];
}));
function verify(transform) {
  vm.runInNewContext(verification, {
    assert, createHash, root, read, URL, Buffer,
    readFileSync(url, encoding) {
      assert.ok(corpus.has(url.href), 'Only the pinned corpus files may be read');
      const value = Buffer.from(transform(corpus.get(url.href)), 'utf8');
      return encoding ? value.toString(encoding) : value;
    }
  }, { filename: 'p09-replay.mjs:manifest-verification' });
}

test('P09 provenance control: LF corpus bytes match the published pins', () => {
  assert.doesNotThrow(() => verify(text => text));
});

test('P09 provenance plant: CRLF checkout verifies against the same LF pins', () => {
  assert.doesNotThrow(() => verify(text => text.replaceAll('\n', '\r\n')));
});

test('P09 provenance control: same-length content corruption still fails SHA-256', () => {
  assert.throws(() => verify(text => text.replace(/[0-9]/, digit => digit === '9' ? '8' : '9')),
    assert.AssertionError);
});

test('P09 provenance control: appended whitespace is not normalized away', () => {
  assert.throws(() => verify(text => text + ' '), assert.AssertionError);
});
