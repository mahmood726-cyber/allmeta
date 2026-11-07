// Run existing browser assertions in a disposable copy so fixture audit files,
// downloads and Playwright output never enter the checkout. Install the locked
// test dependencies there too; do not reuse unrelated lanes' package versions.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'p07-review-browser-'));
console.log('Browser evidence directory:', scratch);
for (const name of ['hub', 'shared', 'multilevel-ma', 'tests']) {
  cpSync(join(root, name), join(scratch, name), { recursive: true,
    filter: source => !/(?:^|[\\/])(?:node_modules|test-results|artifacts|integration-evidence)(?:[\\/]|$)/.test(source) });
}
const tests = join(scratch, 'hub/shared/tests');
const output = join(scratch, 'output');
mkdirSync(output);
const require = createRequire(join(tests, 'package.json'));
const nodeRequire = createRequire(process.execPath);
const npmCli = join(dirname(nodeRequire.resolve('npm/package.json')), 'bin/npm-cli.js');
const install = spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
  '--cache', join(scratch, 'npm-cache'), '--logs-dir', join(output, 'npm-logs')], {
  cwd: tests, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
});
writeFileSync(join(output, 'install.stdout.log'), install.stdout || '');
writeFileSync(join(output, 'install.stderr.log'), install.stderr || '');
if (install.status !== 0) {
  console.error(install.stdout || '', install.stderr || '', install.error?.message || '');
  throw new Error(`Locked browser dependency installation failed: ${install.status}`);
}
const lock = JSON.parse(readFileSync(join(tests, 'package-lock.json'), 'utf8'));
for (const name of ['@playwright/test', 'playwright', 'playwright-core', '@axe-core/playwright', 'axe-core']) {
  const version = JSON.parse(readFileSync(join(tests, 'node_modules', name, 'package.json'), 'utf8')).version;
  assert.equal(version, lock.packages[`node_modules/${name}`].version, name);
  console.log(`${name}: ${version}`);
}
const packageFile = require.resolve('@playwright/test/package.json');
const cli = join(dirname(packageFile), 'cli.js');
// The standard config supports installed browser channels. Prefer the bundled
// Chromium when present; otherwise use installed Edge without a browser download.
const channel = existsSync(require('@playwright/test').chromium.executablePath()) ? undefined : 'msedge';
console.log('Browser channel:', channel || 'bundled Chromium');
const config = join(tests, 'p07-review.config.mjs');
// Keep the diagnostic out of normal CI discovery; register it only in this
// disposable copy alongside the unchanged browser assertions.
writeFileSync(join(tests, 'p07-review-layout.spec.mjs'), "import './unit/p07-review-layout.mjs';\n");
// Use the standard config's supported browser channel, server, base URL and
// timeout, with the selected suites and temporary output destinations below.
writeFileSync(config, `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: [
    'multilevel-ma-usability.spec.mjs', 'multilevel-ma-sanity.spec.mjs',
    'multilevel-ma-pi.spec.mjs', 'multilevel-reml-parity.spec.mjs',
    'multilevel-ma-features.spec.mjs', 'validate-multilevel-ma.spec.mjs',
    'p07-review-layout.spec.mjs'
  ],
  grepInvert: /@slow/, workers: 1, timeout: 30000,
  outputDir: ${JSON.stringify(output)},
  reporter: [['line'], ['json', { outputFile: ${JSON.stringify(join(output, 'results.json'))} }]],
  use: { baseURL: 'http://localhost:8088' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: ${JSON.stringify(channel) ?? 'undefined'} } }],
  webServer: {
    command: 'python -m http.server 8088 --bind 127.0.0.1 --directory ../../../',
    port: 8088, cwd: '.', reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore'
  }
});
`);
const result = spawnSync(process.execPath, [cli, 'test', '--config', config], {
  cwd: tests, encoding: 'utf8', timeout: 900000, maxBuffer: 20 * 1024 * 1024,
  windowsHide: true,
});
writeFileSync(join(output, 'stdout.log'), result.stdout || '');
writeFileSync(join(output, 'stderr.log'), result.stderr || '');
console.log(result.stdout || '');
console.error(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
