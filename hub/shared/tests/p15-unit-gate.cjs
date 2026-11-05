// CXTASK's run wrapper accepts a script path but rejected the quoted gate glob.
// Run the exact required gate, preserving all tests, output and the exit status.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, [
  '--test', 'hub/shared/tests/unit/**/*.test.mjs',
], {
  cwd: path.resolve(__dirname, '../../..'),
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) console.error(result.error);
if (result.signal) console.error(`Unit gate terminated by ${result.signal}`);
process.exitCode = result.status === null ? 1 : result.status;
