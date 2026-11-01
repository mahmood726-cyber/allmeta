// Run existing browser assertions on a byte-preserving TEMP copy. The fixture
// writes evidence relative to its tree, so running it in wt/ would violate the
// job's output policy. No spec, corpus, pin, tolerance or application is edited.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { replayEndpoint } from './p16-browser-port.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'p16-w1-browser-'));
const staged = join(scratch, 'tree');
cpSync(root, staged, { recursive: true });
const tests = join(staged, 'hub/shared/tests');
const npm = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npm) throw Error('Cannot locate npm beside Node for the locked browser dependencies');
const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browser) throw Error('No installed Chrome/Edge executable for this Windows wrapper');
const installed = spawnSync(process.execPath, [npm, 'ci', '--ignore-scripts',
  '--no-audit', '--no-fund', '--cache', join(scratch, 'cache')], {
  cwd: tests, stdio: 'inherit', windowsHide: true, timeout: 180000,
});
if (installed.error) throw installed.error;
if (installed.status !== 0) throw Error('Locked browser dependency installation failed');

const results = join(scratch, 'results.json');
const config = join(tests, 'p16-wrapper.config.mjs');
const outputDir = join(scratch, 'test-results');
mkdirSync(outputDir);
const { port, baseURL } = await replayEndpoint();
// Same test timeout, Desktop Chrome device and HTTP server as the
// repository configuration. One worker bounds memory; there are no exclusions,
// retries, changed expectations, or grep filters within these two P16 specs.
// Use a fresh loopback port; never reuse an unrelated server on port 8088.
writeFileSync(config, `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: ['validate-nma-inconsistency.spec.mjs', 'nma-inconsistency-plus.spec.mjs'],
  timeout: 30000, workers: 1, retries: 0,
  outputDir: ${JSON.stringify(outputDir)},
  reporter: [['line'], ['json', { outputFile: ${JSON.stringify(results)} }]],
  use: { baseURL: ${JSON.stringify(baseURL)} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'],
    launchOptions: { executablePath: ${JSON.stringify(browser)} } } }],
  webServer: {
    command: 'python -m http.server ${port} --bind 127.0.0.1 --directory ../../../',
    url: ${JSON.stringify(baseURL)}, cwd: '.', reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore'
  }
});
`);
const cli = join(tests, 'node_modules/@playwright/test/cli.js');
console.log('P16_BROWSER_REPLAY unchanged specs; installed browser: ' + browser);
console.log('P16_BROWSER_EVIDENCE ' + scratch);
console.log('P16_BROWSER_ORIGIN ' + baseURL);
const run = spawnSync(process.execPath, [cli, 'test', '--config', config], {
  cwd: tests, encoding: 'utf8', windowsHide: true, timeout: 1080000, maxBuffer: 16 * 1024 * 1024,
});
writeFileSync(join(scratch, 'browser-output.txt'), (run.stdout || '') + (run.stderr || ''));
console.log(((run.stdout || '') + (run.stderr || '')).split(/\r?\n/).slice(-180).join('\n'));
if (existsSync(results)) {
  const report = JSON.parse(readFileSync(results, 'utf8'));
  console.log('P16_BROWSER_COUNTS ' + JSON.stringify(report.stats));
  function outcomes(suites) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) for (const test of spec.tests || []) {
        console.log('P16_BROWSER_TEST ' + JSON.stringify({ file: spec.file, title: spec.title,
          status: test.status, errors: test.results.flatMap(result => result.errors || []) }));
      }
      outcomes(suite.suites);
    }
  }
  outcomes(report.suites);
}
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
