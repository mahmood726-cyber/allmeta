// Compact node:test output so the wrapper retains every result, not just stacks.
// Preserve pre-fix evidence in the OS temp directory before applying the repair.
import { run } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { kernel, kernelSource, read } from './p09-beta-harness.mjs';

const results = [];
for await (const event of run({ files: [fileURLToPath(new URL('./p09-beta.test.mjs', import.meta.url))] })) {
  if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
  const { name, details } = event.data;
  const error = details?.error?.cause || details?.error;
  const row = { name, status: event.type === 'test:pass' ? 'PASS' : 'FAIL',
    message: error?.message || '' };
  results.push(row);
  console.log(`${row.status} ${name}${row.message ? ': ' + row.message : ''}`);
}
const summary = { passes: results.filter(r => r.status === 'PASS').length,
  failures: results.filter(r => r.status === 'FAIL').length,
  sourceSHA256: createHash('sha256').update(kernelSource).digest('hex') };
assert.ok(results.length >= 50, 'All regression/control tests must execute');
const oldSource = kernelSource.includes('var MAX = 200,');
if (oldSource) {
  const oracle = JSON.parse(read('hub/shared/tests/unit/p09-beta-reference.json'));
  const app = kernel(), expanded = kernel(kernelSource.replace(/var MAX = \d+/, 'var MAX = 2000000'));
  summary.rootCause = oracle.cdfs.map(row => ({ name: row.name, nativeR: row.value,
    oldCDF: app.betaIncReg(row.x, row.a, row.b),
    capOnlyCDF: expanded.betaIncReg(row.x, row.a, row.b),
    oldLogPrefactor: -app.logBeta(row.a, row.b) + row.a * Math.log(row.x) + row.b * Math.log(1-row.x),
    nativeRLogPrefactor: row.log_prefactor }));
  writeFileSync(join(tmpdir(), 'rev2-p09-f5-beta-old-kernel.txt'), kernelSource);
}
writeFileSync(join(tmpdir(), `rev2-p09-f5-beta-${oldSource ? 'before' : 'after'}.json`),
  JSON.stringify({ ...summary, results }, null, 2));
console.log(JSON.stringify(summary));
process.exitCode = summary.failures ? 1 : 0;
