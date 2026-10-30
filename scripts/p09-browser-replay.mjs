// Wrapper-compatible entry point: run the existing usability suite without git.
// All generated config, browser output and reports live in the system temp dir.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = path.join(root, 'hub/shared/tests');
const require = createRequire(path.join(tests, 'package.json'));
let cli, playwright;
try {
  cli = require.resolve('@playwright/test/cli');
  playwright = require('@playwright/test');
  require.resolve('@axe-core/playwright');
} catch {
  console.error('Browser replay unavailable: @playwright/test and @axe-core/playwright must be installed for hub/shared/tests.');
  process.exit(1);
}
const channel = existsSync(playwright.chromium.executablePath()) ? undefined : 'msedge';
const output = mkdtempSync(path.join(tmpdir(), 'p09-usability-'));
const config = path.join(output, 'playwright.config.mjs');
writeFileSync(config, 'export default ' + JSON.stringify({
  testDir: tests,
  testMatch: 'proportion-ma-usability.spec.mjs',
  outputDir: path.join(output, 'test-results'),
  reporter: [['line'], ['json', { outputFile: path.join(output, 'results.json') }]],
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://localhost:8088' },
  projects: [{ name: 'chromium', use: { ...playwright.devices['Desktop Chrome'], channel } }],
  webServer: {
    command: 'python -m http.server 8088 --bind 127.0.0.1 --directory ' + '"' + root + '"',
    cwd: output,
    port: 8088,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
}, null, 2) + ';\n');
console.log('Browser replay: original proportion-ma-usability.spec.mjs; artifacts: ' + output);
const child = spawn(process.execPath, [cli, 'test', '--config', config], {
  cwd: output, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
