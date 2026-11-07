// Run the existing, in-scope browser assertions in a temporary copy.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'p18-browser-'));
const work = path.join(out, 'tree');
const tests = path.join(work, 'hub/shared/tests');
const statuses = [];
console.log('P18 browser artifacts:', out);
console.log('Node:', process.version);

function run(label, args, cwd, timeout = 1800000) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '');
  fs.writeFileSync(path.join(out, label + '.log'), output);
  console.log(label + ': exit ' + result.status);
  console.log(output);
  statuses.push({ label, status: result.status, signal: result.signal, error: result.error?.message });
  return result.status === 0;
}

async function main() {
fs.mkdirSync(work);
for (const folder of ['multivariate-ma', 'shared', 'hub']) {
  fs.cpSync(path.join(root, folder), path.join(work, folder), { recursive: true });
}
const specs = ['multivariate-ma-parity.spec.mjs', 'multivariate-ma-sanity.spec.mjs',
  'multivariate-ma-diagnostic.spec.mjs', 'multivariate-ma-plus.spec.mjs'];
const hashes = {};
for (const file of ['multivariate-ma/index.html', 'multivariate-ma/plus-ui.js',
  ...specs.map(spec => 'hub/shared/tests/' + spec)]) {
  const bytes = fs.readFileSync(path.join(root, file));
  if (!bytes.equals(fs.readFileSync(path.join(work, file)))) throw new Error('Copy mismatch: ' + file);
  hashes[file] = createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}
fs.writeFileSync(path.join(out, 'source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const userConfig = path.join(out, 'empty-user.npmrc'), globalConfig = path.join(out, 'empty-global.npmrc');
fs.writeFileSync(userConfig, ''); fs.writeFileSync(globalConfig, '');
if (run('install-playwright-dependencies', [npm, 'ci', '--prefix', tests,
  '--cache', path.join(out, 'npm-cache'), '--userconfig', userConfig, '--globalconfig', globalConfig,
  '--registry', 'https://registry.npmjs.org', '--ignore-scripts', '--no-audit', '--no-fund'], tests, 180000)) {
  // Ask the OS for an available loopback port. Playwright still refuses to use
  // an existing server if another process takes it after the probe closes.
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const available = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(available));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  // One legacy spec has an absolute URL. Change only that URL in the TEMP copy
  // so it follows baseURL; every assertion and all reviewed files stay intact.
  const parityPath = path.join(tests, 'multivariate-ma-parity.spec.mjs');
  const parity = fs.readFileSync(parityPath, 'utf8');
  const absolute = "const URL = 'http://localhost:8088/multivariate-ma/index.html';";
  const relative = "const URL = '/multivariate-ma/index.html';";
  assert.equal(parity.split(absolute).length, 2, 'exactly one legacy page URL');
  const adapted = parity.replace(absolute, relative);
  assert.equal(adapted.replace(relative, absolute), parity, 'only the page URL changes');
  fs.writeFileSync(parityPath, adapted);
  fs.writeFileSync(path.join(out, 'server-adaptation.json'), JSON.stringify({
    origin, file: 'hub/shared/tests/multivariate-ma-parity.spec.mjs',
    before: absolute, after: relative,
    adaptedSha256: createHash('sha256').update(adapted.replace(/\r\n/g, '\n')).digest('hex')
  }, null, 2) + '\n');
  console.log('P18 isolated server:', origin);
  // Preserve the shared config's timeout and device. Use an exclusive server
  // and an explicit bundled Chromium selection, without reading env vars.
  // The installed browser is reused; a missing browser is a real runner failure.
  const config = path.join(tests, 'p18-review.config.mjs');
  fs.writeFileSync(config, `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', timeout: 30000, workers: 1,
  outputDir: ${JSON.stringify(path.join(out, 'test-results'))},
  reporter: [['list'], ['json', { outputFile: ${JSON.stringify(path.join(out, 'results.json'))} }]],
  use: { baseURL: ${JSON.stringify(origin)} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python -m http.server ${port} --bind 127.0.0.1 --directory ../../../',
    url: ${JSON.stringify(origin + '/multivariate-ma/index.html')},
    cwd: '.', reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore'
  }
});
`);
  run('multivariate-browser-specs', [path.join(tests, 'node_modules/@playwright/test/cli.js'),
    'test', '--config', config, ...specs], tests);
}
fs.writeFileSync(path.join(out, 'statuses.json'), JSON.stringify(statuses, null, 2) + '\n');
console.log('P18 BROWSER STATUS', JSON.stringify(statuses));
process.exitCode = statuses.every(result => result.status === 0) ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  statuses.push({ label: 'browser-harness', status: 1, error: error.message });
  fs.writeFileSync(path.join(out, 'statuses.json'), JSON.stringify(statuses, null, 2) + '\n');
  process.exitCode = 1;
});
