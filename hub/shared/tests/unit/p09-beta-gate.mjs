// The wrapper accepts a script path but rejected the quoted unit-test glob.
// Discover the entire unit tree and run every *.test.mjs without name filters.
// Detailed test output and timing observations stay in the OS temp directory.
import { run } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { kernel, kernelSource, read } from './p09-beta-harness.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? discover(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = discover(directory).sort();
assert.ok(files.includes(join(directory, 'p09-beta.test.mjs')));
console.log('Unit files: ' + files.map(path => relative(directory, path)).join(', '));
const results = [], diagnostics = [];
const started = performance.now();
for await (const event of run({ files })) {
  if (event.type === 'test:diagnostic' || event.type === 'test:stdout' || event.type === 'test:stderr') {
    diagnostics.push({ type: event.type, ...event.data });
  }
  if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
  const { name, file, details, skip, todo } = event.data;
  const error = details?.error?.cause || details?.error;
  const row = { name, file, status: event.type === 'test:pass' ? 'PASS' : 'FAIL',
    skip: Boolean(skip), todo: Boolean(todo), durationMs: details?.duration_ms,
    message: error?.message || '', stack: error?.stack || '' };
  results.push(row);
  if (row.status === 'FAIL') console.log(`FAIL ${file || ''}: ${name}: ${row.message}`);
}
const summary = { files: files.map(path => relative(directory, path)),
  passes: results.filter(row => row.status === 'PASS').length,
  failures: results.filter(row => row.status === 'FAIL').length,
  skipped: results.filter(row => row.skip).length,
  todo: results.filter(row => row.todo).length,
  durationMs: performance.now() - started,
  sourceSHA256: createHash('sha256').update(kernelSource).digest('hex') };
writeFileSync(join(tmpdir(), 'rev2-p09-f5-unit-gate.json'),
  JSON.stringify({ ...summary, results, diagnostics }, null, 2));
console.log('Full unit gate: ' + JSON.stringify(summary));
assert.ok(results.length >= 50, 'Expected at least the 50 P09 regression/control results');
assert.equal(summary.failures, 0, 'Every discovered unit-test file must pass');

// Observe the remaining large-count runtime concern on the actual shipped
// kernel, without instrumentation, timing thresholds, or a browser-speed claim.
const app = kernel(), input = JSON.parse(read('hub/shared/tests/unit/p09-beta-input.json'));
app.clopperPearson(5, 100);
const timings = [];
for (const name of ['ordinary', 'balanced-million', 'balanced-billion', 'balanced-trillion', 'balanced-safe-limit']) {
  const row = input.intervals.find(item => item.name === name);
  const start = performance.now();
  const interval = Array.from(app.clopperPearson(row.x, row.n));
  timings.push({ name, interval, durationMs: performance.now() - start });
}
for (const row of input.cdfs) {
  const start = performance.now();
  const value = app.betaIncReg(row.x, row.a, row.b);
  timings.push({ name: row.name + '-cdf', value, durationMs: performance.now() - start });
}
writeFileSync(join(tmpdir(), 'rev2-p09-f5-beta-timings.json'), JSON.stringify(timings, null, 2));
console.log('Kernel timing observations (single calls, milliseconds): ' + JSON.stringify(timings));
