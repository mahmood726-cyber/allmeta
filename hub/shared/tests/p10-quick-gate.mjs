import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// RUN.txt accepts a script path; replay the exact CXTASK aggregate gate.
const result = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
