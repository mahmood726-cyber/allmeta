// Run the existing spec with its assertions and test.fail annotations intact.
// Outputs and browser profiles stay in the OS temporary directory. No git.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const testDir = path.join(root, 'hub/shared/tests');
const require = createRequire(path.join(testDir, 'package.json'));
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
  require.resolve('@axe-core/playwright');
} catch (error) {
  console.error('UNVERIFIED: existing browser suite could not start: ' + error.message);
  process.exitCode = 2;
}
if (cli) {
  const directory = mkdtempSync(path.join(tmpdir(), 'p09-browser-'));
  const server = createServer((request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
      const filename = path.resolve(root, relative || 'index.html');
      if (!filename.startsWith(root)) { response.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
      response.end(readFileSync(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const config = {
    testDir, testMatch: 'proportion-ma-usability.spec.mjs', workers: 1,
    outputDir: path.join(directory, 'test-results'),
    reporter: [['list'], ['json', { outputFile: path.join(directory, 'results.json') }]],
    use: { baseURL: `http://127.0.0.1:${server.address().port}`, browserName: 'chromium',
      ...(edge ? { launchOptions: { executablePath: edge } } : {}) },
  };
  const configPath = path.join(directory, 'playwright.config.mjs');
  writeFileSync(configPath, 'export default ' + JSON.stringify(config, null, 2) + ';\n');
  console.log('Browser evidence directory: ' + directory);
  try {
    const child = spawn(process.execPath, [cli, 'test', '--config', configPath], { cwd: testDir, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => resolve(code ?? 1));
    });
  } finally { server.close(); }
}
