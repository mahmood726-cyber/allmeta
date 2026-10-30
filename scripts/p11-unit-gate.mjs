// File entry point for wrappers that accept `node <file>` but not test globs.
// Run the exact quick gate; inherit its output and preserve its exit status.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = ['--test', 'hub/shared/tests/unit/**/*.test.mjs'];
console.log('Quick gate:', JSON.stringify([process.execPath, ...args]));
const run = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
});
if (run.error) throw run.error;
if (run.signal || run.status === null) {
  throw new Error(`Quick gate did not exit normally: ${run.signal ?? 'missing status'}`);
}
process.exitCode = run.status;
