// Run from wt/: node hub/shared/tests/unit/p20-unit-gate.mjs
// Execute the job's exact combined gate through the file-only RUN.txt interface.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, ['--test', 'hub/shared/tests/unit/**/*.test.mjs'], {
  cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
