// The wrapper accepts a file entry point, but refuses a wildcard RUN.txt line.
// Invoke the exact required combined gate without filtering any test files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
  stdio: 'inherit',
  timeout: 120000,
});
if (result.error) throw result.error;
assert.equal(result.signal, null, 'Combined unit gate must finish without a signal');
assert.equal(result.status, 0, 'Combined unit gate must have zero failures');
