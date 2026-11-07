// Run the existing CI browser checks that exercise this app, keeping all
// runtime output in the OS temporary directory. No dependency installation.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../tests/playwright/package.json', import.meta.url));
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error('UNVERIFIED: @playwright/test is unavailable; browser assertions did not run.');
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'p08-axis-browser-'));
const config = join(dir, 'playwright.config.cjs');
writeFileSync(config, 'module.exports = ' + JSON.stringify({
  testDir: join(root, 'tests/playwright'),
  testMatch: ['catalog-svg-plots.spec.mjs', 'every-app-plots.spec.ts', 'verify-touched-apps.spec.ts'],
  grep: undefined,
  timeout: 45000,
  expect: { timeout: 5000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: join(dir, 'results'),
  use: { baseURL: 'http://127.0.0.1:8080', headless: true },
  webServer: {
    command: 'python -m http.server 8080 --bind 127.0.0.1',
    cwd: root,
    url: 'http://127.0.0.1:8080/meta-regression/',
    reuseExistingServer: false,
    timeout: 30000,
  },
}, null, 2) + ';\n');
const run = spawnSync(process.execPath, [cli, 'test', '--config', config, '--grep', 'meta-regression'], {
  cwd: root, stdio: 'inherit', timeout: 300000, windowsHide: true,
});
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
