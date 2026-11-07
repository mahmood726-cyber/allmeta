// The job wrapper accepts a script path, but refuses a direct wildcard command.
// Run its exact required gate without enumerating, filtering or changing tests.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath,
  ['--test', 'hub/shared/tests/unit/**/*.test.mjs'],
  { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
