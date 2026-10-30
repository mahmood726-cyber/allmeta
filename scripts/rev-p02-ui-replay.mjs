// Wrapper-compatible focused rerun; keeps the spec, assertions and timeout intact.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./rev-p02-browser-replay.mjs', import.meta.url));
const result = spawnSync(process.execPath, [runner, '--ui-only'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
