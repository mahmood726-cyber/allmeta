// Run the converter suite with the repository's locked dependencies.
// Only its copied transport URL changes; assertions and references stay intact.
// Dependencies, npm cache, configuration, copied spec and results stay in temp.
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { browserTransport } from './p20-r2-browser-transport.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'p20-r2-browser-'));
console.log(`Browser artifacts: ${scratch}`);
for (const file of ['package.json', 'package-lock.json']) {
  copyFileSync(new URL(file, import.meta.url), join(scratch, file));
}
// Standard Node installers place npm next to node (Windows) or in ../lib (Unix).
const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npmCli) throw new Error('npm CLI is unavailable; locked Playwright dependencies cannot be installed');
const install = spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts',
  '--no-audit', '--no-fund', '--cache', join(scratch, 'npm-cache')], {
  cwd: scratch, encoding: 'utf8', timeout: 180_000,
});
writeFileSync(join(scratch, 'npm-ci.log'), (install.stdout ?? '') + (install.stderr ?? ''));
if (install.error) throw install.error;
if (install.status !== 0) throw new Error(`npm ci failed (exit ${install.status}); see ${join(scratch, 'npm-ci.log')}`);

const require = createRequire(join(scratch, 'package.json'));
const cli = require.resolve('@playwright/test/cli');
const { chromium } = require('playwright');
const use = { browserName: 'chromium' };
// Match the repository config's supported system-browser fallback, without
// reading environment variables or installing browsers into a user profile.
if (!existsSync(chromium.executablePath())) {
  const executablePath = process.platform === 'win32' && [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!executablePath) throw new Error('No bundled Chromium or supported system browser is installed');
  use.launchOptions = { executablePath };
  console.log(`Browser executable: ${executablePath}`);
}
console.log(`Playwright version: ${require('@playwright/test/package.json').version}`);
const config = join(scratch, 'playwright.config.mjs');
const testDir = join(scratch, 'tests');
mkdirSync(testDir);
const transport = await browserTransport(readFileSync(new URL('evalue-parity.spec.mjs', import.meta.url), 'utf8'));
writeFileSync(join(testDir, 'evalue-parity.spec.mjs'), transport.source);
use.baseURL = transport.origin;
console.log(`Browser origin: ${transport.origin}`);
const root = fileURLToPath(new URL('../../../', import.meta.url));
writeFileSync(config, `export default ${JSON.stringify({
  testDir,
  testMatch: 'evalue-parity.spec.mjs',
  outputDir: join(scratch, 'results'),
  reporter: 'line',
  workers: 1,
  timeout: 30_000,
  use,
  webServer: {
    command: `python -B -m http.server ${transport.port} --bind 127.0.0.1`,
    cwd: root,
    url: `${transport.origin}/effect-size-converter/index.html`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
}, null, 2)};\n`);
const result = spawnSync(process.execPath, [cli, 'test', '--config', config], {
  cwd: testDir, stdio: 'inherit', timeout: 180_000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
