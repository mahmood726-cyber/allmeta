import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const app = new URL('../../../../influence/', import.meta.url);
const read = path => readFileSync(new URL(path, app));
const corpus = JSON.parse(read('validate/corpus/corpus.json'));
const manifest = JSON.parse(read('validate/MANIFEST.json'));

test('P11-D13 disclosure: published replay documents the usable nested data it omits', () => {
  const readme = read('validate/README.md').toString('utf8');
  // A passing historical replay must not imply that it covers all usable data.
  assert.match(readme, /P11-D13/);
  assert.match(readme, /dat\.metap\$cholest/);
  assert.match(readme, /dat\.metap\$validity/);
  assert.match(readme, /coverage omission/i);
  assert.match(readme, /p-value-only.*(?:incorrect|inaccurate)|(?:incorrect|inaccurate).*p-value-only/i);
  assert.match(readme, /separate versioned release/i);
});

test('P11-D13 control: the historical reference bytes and paper denominator remain pinned', () => {
  for (const file of manifest.files) {
    const bytes = read(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  assert.equal(corpus.length, 142);
  assert.equal(manifest.configurations, 142);
  const rows = corpus.reduce((sum, x) => sum + x.data.yi.length, 0);
  assert.equal(rows, 9594);
  assert.equal(17 * rows + 12 * corpus.length, 164802);
  assert.equal(manifest.checks, 164802);
  assert.ok(corpus.some(x => x.id === 'dat.bcg::RR'));
});
