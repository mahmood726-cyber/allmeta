// Wrapper-compatible runner for the unchanged main-app browser assertions.
// Dependencies, copied tests, profiles, caches and output stay in system temp.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), 'p08-r5-browser-'));
const staged = join(scratch, 'tree');
const relativeTests = 'hub/shared/tests';
const tests = join(staged, relativeTests);
const specs = ['meta-regression-sanity.spec.mjs', 'meta-regression-features.spec.mjs',
  'meta-regression-pi.spec.mjs', 'meta-regression-permtest.spec.mjs',
  'p08-r5-bubble-accessibility.spec.mjs'];

// All staged files are text. Match CI's LF checkout without changing source
// files, any assertion, or any numerical reference in the working tree.
function stage(path) {
  const target = join(staged, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n'));
}
function stageDirectory(path) {
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) stageDirectory(child);
    else stage(child);
  }
}
for (const name of [...specs, 'features-helpers.mjs', 'plot-export-reader.mjs', 'package.json', 'package-lock.json']) {
  stage(join(relativeTests, name));
}
stage(join(relativeTests, 'meta-regression-usability-walkthrough.spec.mjs'));
stage('shared/permutest.js');
stageDirectory(join(relativeTests, 'fixtures/features/meta-regression'));

function run(args, label, timeout) {
  const result = spawnSync(process.execPath, args, { cwd: tests, encoding: 'utf8',
    windowsHide: true, timeout, maxBuffer: 20 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(scratch, label + '.log'), output);
  console.log(output);
  console.log(label + ' log: ' + join(scratch, label + '.log'));
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Use the installed Node distribution's npm, with the repository's exact lock.
// No install hooks run and neither dependencies nor npm caches enter wt/.
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npm)) throw Error('npm CLI missing beside Node; browser dependencies cannot be installed');
run([npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
  '--cache', join(scratch, 'npm-cache')], 'npm-ci', 180_000);
const require = createRequire(join(tests, 'package.json'));
const cli = require.resolve('@playwright/test/cli');

// Same timeouts, device and server port as the repository config. The system
// Edge channel avoids a global browser download. Serve the original wt app.
const server = 'python -m http.server 8088 --bind 127.0.0.1 --directory "' + root + '"';
writeFileSync(join(tests, 'playwright.config.mjs'), `
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', timeout: 30_000,
  use: { baseURL: 'http://localhost:8088' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }],
  webServer: { command: ${JSON.stringify(server)}, port: 8088, cwd: '.',
    reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore' }
});
`);
console.log('Running unchanged tests from an LF staging tree with system Edge (Chromium).');
run([cli, 'test', ...specs, '--reporter=line', '--workers=1',
  '--output=' + join(scratch, 'results')], 'browser', 900_000);
// Run the existing whole-page accessibility assertion unchanged. The rest of
// this walkthrough covers unrelated known defects and file:// installation.
run([cli, 'test', 'meta-regression-usability-walkthrough.spec.mjs', '--grep', '5a axe-core',
  '--reporter=line', '--workers=1', '--output=' + join(scratch, 'axe-results')], 'browser-axe', 180_000);
