// Run existing meta-regression browser suites without writing CI artifacts to wt.
// If dependencies are missing, install the existing lockfile in a TEMP copy.
// No dependency manifests, test assertions or fixtures in wt are changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'p08-browser-'));
console.log(`Browser artifacts: ${output}`);
let testDir = join(root, 'hub/shared/tests');
let require = createRequire(join(testDir, 'package.json'));
let browserEnvironment;
let playwright;
function setup(label, executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: output, encoding: 'utf8', timeout: 300_000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  writeFileSync(join(output, `${label}.stdout`), result.stdout || '');
  writeFileSync(join(output, `${label}.stderr`), result.stderr || '');
  console.log(`${label}: exit ${result.status}; logs in ${output}`);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${label} failed; see the retained TEMP logs`);
}
try {
  playwright = require.resolve('@playwright/test');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  const copyRoot = join(output, 'source');
  testDir = join(copyRoot, 'hub/shared/tests');
  mkdirSync(dirname(testDir), { recursive: true });
  cpSync(join(root, 'hub/shared/tests'), testDir, { recursive: true });
  mkdirSync(join(copyRoot, 'shared'), { recursive: true });
  // The feature suite imports this module relative to its own source location.
  cpSync(join(root, 'shared/permutest.js'), join(copyRoot, 'shared/permutest.js'));
  require = createRequire(join(testDir, 'package.json'));
  const npm = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ...(process.platform === 'win32' ? ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'] : []),
  ].find(existsSync);
  assert.ok(npm, 'npm-cli.js must be installed beside Node to prepare locked TEMP dependencies');
  setup('npm-ci', process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(output, 'npm-cache')], { cwd: testDir });
  playwright = require.resolve('@playwright/test');
  // An explicit child environment confines browser downloads/caches to TEMP;
  // do not inspect, copy or print the caller's environment variables.
  browserEnvironment = {
    TEMP: output, TMP: output, TMPDIR: output,
    PLAYWRIGHT_BROWSERS_PATH: join(output, 'browsers'),
    ...(process.platform === 'win32' ? { SystemRoot: 'C:\\Windows' } : {}),
  };
  const installCli = join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  setup('chromium-install', process.execPath, [installCli, 'install', 'chromium'], { env: browserEnvironment });
}
const cli = join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
const config = join(output, 'playwright.config.mjs');
writeFileSync(config, `import playwrightTest from ${JSON.stringify(pathToFileURL(playwright).href)};
const { defineConfig } = playwrightTest;
export default defineConfig({
  testDir: ${JSON.stringify(testDir)},
  testMatch: ['meta-regression-features.spec.mjs', 'meta-regression-sanity.spec.mjs', 'meta-regression-permtest.spec.mjs', 'meta-regression-pi.spec.mjs'],
  workers: 1, retries: 0, timeout: 30000,
  outputDir: ${JSON.stringify(join(output, 'test-results'))},
  reporter: [['list'], ['json', { outputFile: ${JSON.stringify(join(output, 'report.json'))} }]],
  use: { baseURL: 'http://localhost:8088', browserName: 'chromium', trace: 'retain-on-failure' }
});\n`);

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost:8088').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) {
      response.writeHead(403).end(); return;
    }
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    response.setHeader('Content-Type', mime[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream');
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((ok, fail) => { server.once('error', fail); server.listen(8088, ok); });
try {
  const code = await new Promise((ok, fail) => {
    const child = spawn(process.execPath, [cli, 'test', '--config', config], {
      cwd: output, stdio: 'inherit', ...(browserEnvironment ? { env: browserEnvironment } : {}),
    });
    child.once('error', fail);
    child.once('exit', (code, signal) => signal ? fail(new Error(`Playwright terminated: ${signal}`)) : ok(code));
  });
  process.exitCode = code;
} finally {
  await new Promise(ok => server.close(ok));
}
