// Real-browser follow-up; requires the existing shared Playwright dependency
// and an installed Chromium. It never installs packages or writes in the tree.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../hub/shared/tests/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const work = mkdtempSync(join(tmpdir(), 'p19-r2-browser-'));
const server = createServer((request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const path = resolve(root, '.' + pathname);
    assert.ok(!relative(root, path).startsWith('..'));
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
    response.end(readFileSync(path));
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  // Run the existing parity/refusal/label assertions unchanged first.
  const config = join(work, 'playwright.config.cjs');
  writeFileSync(config, `module.exports = ${JSON.stringify({
    testDir: join(root, 'hub/shared/tests'), testMatch: 'component-nma-parity.spec.mjs',
    timeout: 30000, workers: 1, reporter: 'line', outputDir: join(work, 'results'),
    use: { baseURL, headless: true, browserName: 'chromium' },
  })};\n`);
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', config],
      { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', resolve);
  });
  assert.equal(status, 0, 'unchanged component-nma browser parity suite');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/component-nma/`);
  await page.waitForFunction(() => typeof window.__almCnmaLoad === 'function' && window.Toast);
  const refs = JSON.parse(readFileSync(join(root, 'hub/shared/tests/unit/p19-r2-reference.json'), 'utf8'));
  const capture = text => page.evaluate(text => {
    document.querySelectorAll('.toast-item').forEach(t => t.remove());
    window.__almCnmaLoad(text);
    return { result: window._almLastCnma(),
      markup: ['comp-body', 'int-body', 'forest'].map(id => document.getElementById(id).innerHTML),
      toasts: [...document.querySelectorAll('.toast-item')].map(t => t.textContent),
      coordinates: [...document.querySelectorAll('#forest [x], #forest [x1], #forest [x2]')]
        .flatMap(element => ['x', 'x1', 'x2'].filter(a => element.hasAttribute(a)).map(a => Number(element.getAttribute(a)))),
    };
  }, text);
  const accepted = async name => {
    const ref = refs.cases[name], got = await capture(ref.text);
    assert.ok(got.result, name);
    assert.equal(got.result.df, ref.df);
    assert.equal(got.result.tau2, ref.tau2);
    for (const kind of ['components', 'combinations']) for (const [label, value] of Object.entries(ref[kind])) {
      for (const key of ['est', 'se']) assert.ok(Math.abs(got.result[kind][label][key] / value[key] - 1) <= 1e-12);
    }
    assert.ok(got.markup.every(html => html.length && !/NaN|Infinity/.test(html)));
    assert.ok(got.coordinates.length && got.coordinates.every(x => Number.isFinite(x) && x >= 0 && x <= 600));
    assert.deepEqual(got.toasts, []);
    console.log(`PASS browser control: ${name}`);
  };
  await accepted('saturated');
  await accepted('tiny_saturated');
  for (const [name, text] of [
    ['combination overflow', 'a+b | b | 1e308 | 1\nb | control | 1e308 | 1'],
    ['forest span overflow', 'a | control | 1e308 | 1\nb | control | -1e308 | 1'],
    ['forest padding overflow', 'a | control | 1.7e308 | 1\nb | control | 1.7e308 | 1'],
  ]) {
    const got = await capture(text);
    assert.equal(got.result, null, name);
    assert.deepEqual(got.markup, ['', '', '']);
    assert.ok(got.toasts.some(t => /numerical range/i.test(t)));
    console.log(`PASS browser plant: ${name}`);
    await accepted('ordinary');
  }
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed; artifacts: ${work}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
