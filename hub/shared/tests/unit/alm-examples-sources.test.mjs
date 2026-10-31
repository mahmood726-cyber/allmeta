import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = new URL('../../../../validation/examples/', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const digest = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const gitBlob = bytes => digest('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));

test('R source snapshots preserve the original package version and exact upstream blob', () => {
  const index = readFileSync(new URL('source-data/index.csv', root), 'utf8').trim().split(/\r?\n/);
  assert.equal(index.shift(), 'source_package,version,dataset,source_blob,file,md5');
  const pins = index.map(line => line.split(','));
  for (const item of manifest) {
    const data = JSON.parse(readFileSync(new URL(`${item.app}/${item.dataset}.json`, root), 'utf8'));
    const pin = pins.find(p => p[0] === data.source_package && p[1] === data.version && p[2] === data.dataset);
    assert.ok(pin, `${item.app}: exact source version pin`);
    const source = sources.find(s => s.dataset === data.dataset);
    const bytes = readFileSync(new URL(`source-data/${pin[4]}`, root));
    assert.deepEqual(bytes, Buffer.from(source.content, 'base64'));
    assert.equal(gitBlob(bytes), data.source_blob);
    assert.equal(pin[3], data.source_blob);
    assert.equal(digest('md5', bytes), pin[5]);
  }
});

test('a planted altered source byte fails the immutable blob identity control', () => {
  for (const source of sources) {
    const raw = Buffer.from(source.content, 'base64');
    assert.equal(gitBlob(raw), source.sha);
    const corrupt = Buffer.from(raw); corrupt[corrupt.length - 1] ^= 1;
    assert.notEqual(gitBlob(corrupt), source.sha);
  }
});
