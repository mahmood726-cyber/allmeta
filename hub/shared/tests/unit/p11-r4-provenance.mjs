import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const record = JSON.parse(readFileSync(new URL('./p11-r4-provenance.json', import.meta.url), 'utf8'));

export function verifyOracle(provenance, source) {
  // Preserve the original fixture's digest; its verified LF equivalent is
  // recorded separately by p11-r4-provenance.py. Every checkout hashes LF.
  assert.equal(record.normalization, 'CRLF->LF');
  assert.equal(record.historical_eol, 'CRLF');
  assert.equal(provenance.oracle, record.oracle);
  assert.equal(provenance.oracle_md5, record.historical_oracle_md5);
  assert.equal(createHash('md5').update(source.replace(/\r\n/g, '\n')).digest('hex'), record.oracle_lf_md5);
}
