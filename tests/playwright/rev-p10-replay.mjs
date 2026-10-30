// Replay the supplied apps' existing CI assertions without writing artifacts
// into the source tree. Run from the tree root: node tests/playwright/rev-p10-replay.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error('UNVERIFIED: @playwright/test is unavailable to tests/playwright. No browser assertions ran.');
  process.exit(2);
}
const output = await mkdtemp(path.join(tmpdir(), 'rev-p10-browser-'));
console.log('Browser artifacts:', output);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let filename = path.resolve(root, '.' + pathname);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found in supplied tree');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(8080, '127.0.0.1', resolve);
});
try {
  const config = path.join(output, 'playwright.config.mjs');
  await writeFile(config, 'export default ' + JSON.stringify({
    testDir: fileURLToPath(new URL('./', import.meta.url)),
    testMatch: ['catalog-svg-plots.spec.mjs', 'mh-peto-rd.spec.mjs', 'nma-core-review.spec.mjs',
      'every-app-plots.spec.ts', 'verify-touched-apps.spec.ts'],
    timeout: 45000,
    expect: { timeout: 5000 },
    workers: 1,
    retries: 0,
    outputDir: path.join(output, 'artifacts'),
    reporter: [['list'], ['json', { outputFile: path.join(output, 'report.json') }]],
    use: { baseURL: 'http://127.0.0.1:8080', browserName: 'chromium',
      trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  }, null, 2) + ';\n');
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'test', '--config', config,
      '--grep', '(mh-peto|component-nma|copas|/gosh/)'], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  await new Promise(resolve => server.close(resolve));
}
