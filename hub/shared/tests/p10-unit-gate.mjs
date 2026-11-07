// Run CXTASK's exact final unit gate through an allowed `node <file>` request.
// No shell, environment-variable reads, output files, or test selection changes.
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  '--test',
  'hub/shared/tests/unit/**/*.test.mjs'
], {
  cwd: new URL('../../../', import.meta.url),
  stdio: 'inherit'
});

if (result.error) console.error(result.error.message);
if (result.signal) console.error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
