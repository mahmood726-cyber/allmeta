// Wrapper-compatible entrypoint: node hub/shared/tests/unit/p10-check-browser.mjs
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', '--config',
  fileURLToPath(new URL('./p10-browser.config.mjs', import.meta.url))], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
