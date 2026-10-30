import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { app, plain } from './p09-proportion-harness.mjs';
import { replayLegacyTests, root } from './p09-defect-replay.mjs';

test('P09 evidence: all 23 plants fail and all six controls pass with reconstructed legacy defects', t => {
  const evidence = replayLegacyTests();
  for (const row of evidence.outcomes) t.diagnostic(`${row.passed ? 'PASS' : 'FAIL (expected plant)'}: ${row.name}`);
  t.diagnostic('Raw TAP: ' + evidence.log);
});

test('P09 evidence control: every archived proportion corpus row satisfies the strict parser', () => {
  const corpus = JSON.parse(readFileSync(new URL('proportion-ma/validate/corpus/corpus.json', root), 'utf8'));
  assert.equal(corpus.length, 240);
  const a = app();
  for (const item of corpus) {
    const text = item.rows.map(row => [row.x, row.n, row.label].join(',')).join('\n');
    const parsed = plain(a.parse(text));
    assert.equal(parsed.length, item.rows.length, item.id);
    assert.deepEqual(parsed.map(({ x, n }) => ({ x, n })),
      item.rows.map(({ x, n }) => ({ x, n })), item.id);
  }
});
