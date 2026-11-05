// Run unchanged browser assertions in a temporary checkout so request evidence,
// dependencies, downloads, traces and profiles stay outside wt/.
import { cpSync, existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'p07-browser-'));
for (const name of ['multilevel-ma', 'shared', 'hub/shared']) {
  cpSync(join(root, name), join(workspace, name), {
    recursive: true,
    filter: path => !/(?:^|[\\/])(?:node_modules|test-results|artifacts|integration-evidence)(?:[\\/]|$)/.test(path),
  });
}
const tests = join(workspace, 'hub/shared/tests');
mkdirSync(tests, {recursive: true});
let require = createRequire(new URL('../package.json', import.meta.url));
let packageFile;
try { packageFile = require.resolve('@playwright/test/package.json'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  // The supplied source copy has no node_modules. Use its unchanged lockfile,
  // keep the install/cache in TEMP, and refuse to silently skip browser checks.
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  assert.ok(existsSync(npm), 'npm must be installed beside Node to install test dependencies');
  console.log('P07 installing locked browser test dependencies in:', tests);
  const install = spawnSync(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', join(workspace, 'npm-cache'), '--fetch-retries=0', '--fetch-timeout=60000'], {
    cwd: tests, stdio: 'inherit', timeout: 240000,
  });
  if (install.error) throw install.error;
  assert.equal(install.status, 0, 'locked browser dependencies must install successfully');
  require = createRequire(join(tests, 'package.json'));
  packageFile = require.resolve('@playwright/test/package.json');
}
if (!existsSync(join(tests, 'node_modules'))) {
  symlinkSync(dirname(dirname(dirname(packageFile))), join(tests, 'node_modules'), 'junction');
}
const cli = require.resolve('@playwright/test/cli');
// Use an existing system Chromium browser when available, as the repository's
// Playwright config permits. This avoids downloading another browser or cache.
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(path => existsSync(path));
// Ask the OS for an available loopback port instead of assuming 8088 is free.
// Playwright still refuses to reuse a server if another process wins the bind.
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const selected = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(selected));
  });
});
const baseURL = `http://127.0.0.1:${port}`;
const config = join(tests, 'p07-browser.config.mjs');
writeFileSync(config, `export default {
  testDir: ${JSON.stringify(tests)},
  testMatch: 'multilevel-ma-plus.spec.mjs',
  grep: /original 528 replay|clean table and plots|every numerical, display and export|extra cells, altered labels|one-click example/,
  workers: 1,
  reporter: 'line',
  outputDir: ${JSON.stringify(join(workspace, 'browser-results'))},
  use: {baseURL: ${JSON.stringify(baseURL)}, browserName: 'chromium', launchOptions: ${JSON.stringify(executablePath ? {executablePath} : {})}},
  webServer: {
    command: 'python -m http.server ${port} --bind 127.0.0.1',
    cwd: ${JSON.stringify(workspace)},
    url: ${JSON.stringify(baseURL)},
    reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore'
  }
};\n`);
console.log('P07 browser evidence directory:', workspace);
console.log('P07 browser executable:', executablePath || 'Playwright bundled Chromium');
console.log('P07 private server:', baseURL);
const run = spawnSync(process.execPath, [cli, 'test', '--config', config], {
  cwd: tests, stdio: 'inherit', timeout: 2400000,
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
