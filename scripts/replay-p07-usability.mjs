// Focused replay without git, npm, or writes to the source tree.
// Requires the existing hub/shared/tests Playwright dependencies and Chromium.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const testDir = join(root, 'hub/shared/tests');
const require = createRequire(join(testDir, 'package.json'));
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
  require.resolve('@axe-core/playwright');
} catch {
  console.error('P07 browser replay unavailable: the existing Playwright/axe dependencies are not installed.');
  process.exitCode = 1;
}
if (cli && !process.exitCode) {
  const artifacts = await mkdtemp(join(tmpdir(), 'p07-usability-'));
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) {
        response.writeHead(403).end(); return;
      }
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const bytes = await readFile(path);
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  try {
    const config = join(artifacts, 'playwright.config.cjs');
    await writeFile(config, 'module.exports = ' + JSON.stringify({
      testDir, testMatch: 'multilevel-ma-usability.spec.mjs',
      outputDir: join(artifacts, 'results'), reporter: [['line']], workers: 1,
      use: { baseURL: 'http://127.0.0.1:' + server.address().port, browserName: 'chromium' },
    }) + ';\n');
    console.log('P07 browser artifacts: ' + dirname(config));
    const child = spawn(process.execPath, [cli, 'test', '--config', config,
      '--grep', '4 input error:|4 refusal does not leave|3 core output'],
    { cwd: testDir, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('exit', code => done(code ?? 1));
    });
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}
