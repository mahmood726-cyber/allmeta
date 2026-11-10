// Compact native test replay: preserve child exit status and show every targeted
// result plus gate failures/totals so long TODO diagnostics cannot hide counts.
// All child output is captured in memory; no logs or caches are written to wt/.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../../../', import.meta.url));
for (const [label, pattern] of [
  ['P02 targeted', 'hub/shared/tests/unit/p02-dose-response-parity.test.mjs'],
  ['Full quick gate', 'hub/shared/tests/unit/**/*.test.mjs'],
]) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', pattern], {
    cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    // Print details first so the final compact totals survive feedback truncation.
    process.stdout.write(result.stdout ?? '');
    process.exitCode = result.status || 1;
  }
  console.log(label);
  for (const line of (result.stdout ?? '').split(/\r?\n/)) {
    if (/^(not ok|# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line)
        || (label === 'P02 targeted' && /^ok\b/.test(line))) console.log(line);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  console.log(`Native exit=${result.status}; signal=${result.signal ?? 'none'}`);
}
