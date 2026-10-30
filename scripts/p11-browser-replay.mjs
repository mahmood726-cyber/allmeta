// Run the three unchanged Influence suites through the real Playwright CLI.
// No dependency installation and no browser artifacts inside the source tree.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = join(root, 'hub/shared/tests');
const require = createRequire(join(tests, 'package.json'));
let cli;
try {
  cli = join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
} catch (error) {
  console.error(`UNVERIFIED: Influence browser replay cannot start: ${error.code}: @playwright/test is not installed for hub/shared/tests.`);
  process.exit(2);
}
const scratch = mkdtempSync(join(tmpdir(), 'p11-playwright-'));
const config = join(scratch, 'playwright.config.mjs');
writeFileSync(config, `export default ${JSON.stringify({
  testDir: tests,
  testMatch: ['influence-v2.spec.mjs', 'influence-sanity.spec.mjs', 'validate-influence.spec.mjs'],
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: join(scratch, 'results'),
  use: { baseURL: 'http://localhost:8088', browserName: 'chromium', headless: true },
  webServer: {
    command: `python -m http.server 8088 --bind 127.0.0.1 --directory "${root.replace(/[\\/]$/, '')}"`,
    port: 8088,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
}, null, 2)};\n`);
console.log(`Playwright output: ${scratch}`);
const result = spawnSync(process.execPath, [cli, 'test', '--config', config], {
  cwd: tests, encoding: 'utf8', timeout: 1200000, maxBuffer: 16 * 1024 * 1024,
});
writeFileSync(join(scratch, 'stdout.txt'), result.stdout || '');
writeFileSync(join(scratch, 'stderr.txt'), result.stderr || '');
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 2);
