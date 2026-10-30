import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lfBytes } from '../p08-lf-bytes.mjs';

const base = new URL('../../../../meta-regression/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST-plus.json', base), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const crlf of [true, false]) test(`${crlf ? 'plant' : 'control'} P08 review: ${crlf ? 'CRLF' : 'LF'} checkout preserves pinned LF provenance and rejects content changes`, () => {
  for (const file of manifest.files) {
    const canonical = readFileSync(new URL(file.path, base), 'utf8').replaceAll('\r\n', '\n');
    const bytes = Buffer.from(crlf ? canonical.replaceAll('\n', '\r\n') : canonical);
    const normalized = lfBytes(bytes);
    assert.equal(normalized.length, file.bytes, file.path);
    assert.equal(hash(normalized), file.sha256, file.path);
    const bad = Buffer.from(bytes);
    bad[20] ^= 1;
    assert.notEqual(hash(lfBytes(bad)), file.sha256, file.path);
  }
});
