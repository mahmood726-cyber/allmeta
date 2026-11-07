// File-based invocation of the complete Node unit gate for RUN.txt wrappers
// that accept a script path but refuse a command containing a glob.
// Read-only: no reports, test logs or caches are written to the repository.
import { run } from 'node:test';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./unit/', import.meta.url));
function collect(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collect(child)
      : entry.isFile() && entry.name.endsWith('.test.mjs') ? [child] : [];
  });
}
const files = collect(directory).sort();
if (!files.length) throw new Error('No unit test files discovered');
console.log(`Node ${process.version}; running all ${files.length} unit test files`);
const totals = { pass: 0, fail: 0, todo: 0, skip: 0 };
const byFile = new Map();
let summaries = 0;
let failedSuites = 0;
let cancellations = 0;
for await (const { type, data } of run({ files, concurrency: false })) {
  if (type === 'test:pass' || type === 'test:fail') {
    const status = data.todo ? 'todo' : data.skip ? 'skip'
      : type === 'test:pass' ? 'pass' : 'fail';
    // Do not double-count suites, but a failed suite hook must still fail the gate.
    if (data.details?.type === 'suite') {
      if (status === 'fail') failedSuites++;
    } else {
      totals[status]++;
      const file = data.file ? relative(directory, data.file) : '(file unavailable)';
      if (!byFile.has(file)) byFile.set(file, { pass: 0, fail: 0, todo: 0, skip: 0 });
      byFile.get(file)[status]++;
    }
    if (type === 'test:fail' || data.todo) {
      // node:test wraps assertion failures in ERR_TEST_FAILURE.cause. Keep
      // exact first/worst numerical witnesses without verbose duplicate diffs.
      let error = data.details?.error;
      while (error?.cause) error = error.cause;
      const actual = error?.actual;
      const numeric = Array.isArray(actual) && actual.length > 0
        && actual.every(row => row && typeof row.error === 'number');
      const detail = numeric ? {
        mismatchCount: actual.length,
        fields: actual.map(row => row.name),
        first: actual[0],
        worst: actual.reduce((a, b) => a.error >= b.error ? a : b)
      } : { error: String(error?.message ?? '').slice(0, 700) };
      console.log(JSON.stringify({ status, assertion: type === 'test:fail' ? 'FAIL' : 'PASS',
        test: data.name, reason: data.todo || undefined, ...detail }));
    }
  } else if (type === 'test:summary') {
    summaries++;
    cancellations += data.counts?.cancelled ?? 0;
    // The runner's own counts supplement the event counts below.
    console.log('NODE_SUMMARY ' + JSON.stringify(data));
  } else if (type === 'test:stderr') {
    console.log('TEST_STDERR ' + String(data.message).slice(0, 1000));
  }
}
for (const [file, counts] of byFile) console.log(JSON.stringify({ file, ...counts }));
console.log('GATE ' + JSON.stringify({ files: files.length, ...totals, failedSuites, cancellations, summaries }));
// TODO failures remain visible and execute normally; any ordinary failure,
// cancellation (test:fail), or empty run makes this script fail.
process.exitCode = totals.fail > 0 || failedSuites > 0 || cancellations > 0
  || Object.values(totals).every(n => n === 0) ? 1 : 0;
