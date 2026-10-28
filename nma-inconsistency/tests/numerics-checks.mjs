// Keep wrapper output below its tail limit while preserving every test name.
// Child output stays in memory; no environment reads or log files.
import { spawnSync } from 'node:child_process';
const runs = [
  ['ORIGINAL (expected failures)', ['nma-inconsistency/tests/numerics-original.mjs'], true],
  ['PATCHED regression suite', ['hub/shared/tests/unit/p16-numerics.test.mjs'], false],
  ['QUICK GATE', ['hub/shared/tests/unit/**/*.test.mjs'], false],
];
let failed = false;
for (const [label, files, expectFailure] of runs) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000,
  });
  console.log(`\n${label}: exit=${r.status}`);
  const lines = (r.stdout || '').split(/\r?\n/);
  const compact = lines.filter(s => /^(not ok|ok |# (tests|pass|fail|cancelled|skipped|todo)\b)/.test(s));
  console.log(compact.join('\n') || r.stdout);
  if (r.stderr) console.log(r.stderr);
  if (r.error) console.log(String(r.error));
  if (expectFailure ? r.status !== 1 || !lines.some(s => /^not ok .*tiny finite SE/.test(s)) : r.status !== 0) {
    failed = true;
    if (!expectFailure) console.log((r.stdout || '').slice(-18000));
  }
}
process.exitCode = failed ? 1 : 0;
