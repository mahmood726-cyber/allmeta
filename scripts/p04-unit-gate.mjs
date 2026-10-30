// Supported RUN.txt entrypoint for the exact recursive wildcard used by the wrapper.
import { fileURLToPath } from 'node:url';
import { runNode } from './p04-replay-support.mjs';
const run = runNode(fileURLToPath(new URL('../', import.meta.url)), [
  '--test', '--test-reporter=tap', 'hub/shared/tests/unit/**/*.test.mjs',
]);
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exitCode = run.status;
