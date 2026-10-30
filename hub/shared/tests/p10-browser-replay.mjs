// Run relevant existing browser assertions plus P10 regressions without npm writes in wt.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const localRequire = createRequire(import.meta.url);
function playwrightPackage() {
  try { return dirname(localRequire.resolve('@playwright/test/package.json')); } catch {}
  if (process.argv[2]) return resolve(process.argv[2]);
  // Discover an existing Windows installation from Playwright's own package links.
  // Read package paths only; never read a browser profile or environment variables.
  const links = join(homedir(), 'AppData', 'Local', 'ms-playwright', '.links');
  for (const entry of existsSync(links) ? readdirSync(links) : []) {
    let dir = readFileSync(join(links, entry), 'utf8').trim();
    while (dirname(dir) !== dir) {
      const candidate = join(dir, '@playwright', 'test', 'package.json');
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf8')).version === '1.59.1') {
        return dirname(candidate);
      }
      dir = dirname(dir);
    }
  }
  throw Error('Playwright 1.59.1 is unavailable. Install dependencies outside wt and pass the @playwright/test directory as argument.');
}

const pkg = playwrightPackage(), output = mkdtempSync(join(tmpdir(), 'p10-browser-'));
const tests = join(output, 'shared', 'tests');
mkdirSync(tests, { recursive: true });
const moduleURL = pathToFileURL(join(pkg, 'index.mjs')).href;
const names = ['results-export.spec.mjs', 'mh-peto-sanity.spec.mjs', 'p10-results-export.spec.mjs'];
for (const name of names) {
  // Change only dependency resolution; keep every existing assertion verbatim.
  const source = readFileSync(new URL(name, import.meta.url), 'utf8');
  writeFileSync(join(tests, name), source.replaceAll("from '@playwright/test'", `from ${JSON.stringify(moduleURL)}`));
}
writeFileSync(join(output, 'shared', 'results-export.js'), readFileSync(new URL('../results-export.js', import.meta.url)));
const config = join(output, 'playwright.config.mjs');
writeFileSync(config, `export default ${JSON.stringify({
  testDir: tests, testMatch: '*.spec.mjs', timeout: 30000, workers: 1, retries: 0,
  outputDir: join(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: join(output, 'results.json') }]],
  use: { baseURL: 'http://localhost:8088', browserName: 'chromium', headless: true },
})};\n`);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer((request, response) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) throw Error('outside root');
    if (statSync(path).isDirectory()) path = join(path, 'index.html');
    response.setHeader('Content-Type', types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream');
    response.end(readFileSync(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8088, resolve); });
console.log(`P10 browser evidence: ${output}; Playwright ${JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version}`);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(pkg, 'cli.js'), 'test', '--config', config], {
      cwd: output, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally { await new Promise(resolve => server.close(resolve)); }
