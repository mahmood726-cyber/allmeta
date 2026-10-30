// Run existing in-scope browser specs without writing artifacts into the tree.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const testDir = path.join(root, 'hub/shared/tests');
const require = createRequire(path.join(testDir, 'package.json'));
let cli;
try { cli = require.resolve('@playwright/test/cli'); }
catch {
  console.error('UNVERIFIED: @playwright/test is unavailable in this checkout; existing browser specs could not run.');
  process.exitCode = 2;
}
if (cli) {
  const output = await mkdtemp(path.join(tmpdir(), 'rev-p02-browser-'));
  const config = path.join(output, 'playwright.config.mjs');
  await writeFile(config, 'export default ' + JSON.stringify({
    testDir, testMatch: [
      'ma-core-parity.spec.mjs', 'dose-response-parity.spec.mjs',
      'dose-response-spline-parity.spec.mjs', 'dose-response-rcs4-regression.spec.mjs',
      'dose-response-dosresmeta-parity.spec.mjs', 'dose-response-ui.spec.mjs',
      'usability-dose-response-ma.spec.mjs',
    ],
    timeout: 30000, workers: 1, reporter: 'line', outputDir: path.join(output, 'results'),
    use: { baseURL: 'http://localhost:8088', browserName: 'chromium' },
  }) + ';\n');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer(async (request, response) => {
    try {
      let name = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (!name.startsWith(root + path.sep) && name !== root) throw new Error('outside root');
      if ((await stat(name)).isDirectory()) name = path.join(name, 'index.html');
      response.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
      response.end(await readFile(name));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8088, resolve); });
  try {
    console.log('Browser artifacts: ' + pathToFileURL(output));
    const child = spawn(process.execPath, [cli, 'test', '--config', config], { stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  } finally { server.close(); }
}
