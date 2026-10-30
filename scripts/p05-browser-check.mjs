// Run the existing, available Heterogeneity CI specs; all artifacts stay in temp.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
let cli;
for (const manifest of ['tests/playwright/package.json', 'hub/shared/tests/package.json']) {
  try {
    const require = createRequire(join(root, manifest));
    cli = join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
    break;
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
}
if (!cli) {
  console.log('BROWSER_NOT_RUN: @playwright/test is unavailable in the supplied tree; no browser verification claimed.');
} else {
  const output = mkdtempSync(join(tmpdir(), 'allmeta-p05-browser-'));
  const config = join(output, 'playwright.config.mjs');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = createServer((request, response) => {
    try {
      let file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) throw Error('Outside root');
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(readFileSync(file));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  // Existing specs contain this fixed URL, matching the CI server.
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(8080, '127.0.0.1', accept); });
  writeFileSync(config, 'export default ' + JSON.stringify({
    testDir: join(root, 'tests/playwright'),
    testMatch: ['heterogeneity-pi.spec.mjs', 'heterogeneity-qprofile.spec.mjs', 'reml-global.spec.mjs'],
    timeout: 45000, expect: { timeout: 5000 }, workers: 1, retries: 0,
    reporter: [['list']], outputDir: join(output, 'artifacts'),
    use: { baseURL: 'http://127.0.0.1:8080', browserName: 'chromium', headless: true },
  }, null, 2));
  try {
    const child = spawn(process.execPath, [cli, 'test', '--config', config], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', data => { log += data; process.stdout.write(data); });
    child.stderr.on('data', data => { log += data; process.stderr.write(data); });
    const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
    writeFileSync(join(output, 'run.log'), log);
    console.log('BROWSER_OUTPUT: ' + output);
    process.exitCode = code === 0 ? 0 : 1;
  } finally { await new Promise(accept => server.close(accept)); }
}
