// File-based entry point for the CXTASK wrapper, which rejects the glob command.
// Run the exact quick gate with the same Node executable and propagate failures.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
