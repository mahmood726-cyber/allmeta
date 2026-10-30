// Run existing in-scope browser suites with artifacts confined to TEMP.
// No package installation, environment-variable reads or historical git calls.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.error('UNVERIFIED: @playwright/test is unavailable in this supplied tree. No browser tests ran.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [cli, 'test', '--config',
  fileURLToPath(new URL('./p09-browser.config.mjs', import.meta.url))], {
  cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
  stdio: 'inherit', windowsHide: true
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
