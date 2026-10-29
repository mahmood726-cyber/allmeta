// Keep test names and totals visible in the wrapper's truncated feedback.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
let failed = false;
for (const target of [
  'hub/shared/tests/unit/**/*.test.mjs',
  'gosh/tests/input-validation.test.cjs',
  'hub/shared/tests/unit/p13-gosh-plus-input.test.mjs'
]) {
  console.log('\nTEST ' + target);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', target], {
    cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  for (const line of (result.stdout || '').split(/\r?\n/)) {
    if ((line.startsWith('ok ') && !target.includes('*')) ||
        /^(?:not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line) ||
        /^\s+(?:error:|code:|failureType:|location:)/.test(line)) console.log(line);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  console.log('EXIT ' + result.status);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
