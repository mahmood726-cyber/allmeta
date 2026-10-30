// Read-only browser replay for the restricted RUN.txt wrapper. No installation,
// screenshots or evidence files; Playwright's transient profiles use its temp dir.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
for (const location of ['../../hub/shared/tests/package.json', '../../tests/playwright/package.json']) {
  const require = createRequire(new URL(location, import.meta.url));
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    try { chromium = require(name).chromium; break; } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  if (chromium) break;
}
// A partial worktree need not contain node_modules. Reuse a driver registered
// by an existing local Playwright installation; never install or copy packages.
if (!chromium) {
  const cache = process.platform === 'win32' ? ['AppData', 'Local', 'ms-playwright']
    : process.platform === 'darwin' ? ['Library', 'Caches', 'ms-playwright']
    : ['.cache', 'ms-playwright'];
  const registry = path.join(homedir(), ...cache, '.links');
  const links = await readdir(registry).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const require = createRequire(import.meta.url);
  for (const link of links.sort()) {
    try {
      const installation = (await readFile(path.join(registry, link), 'utf8')).trim();
      if (!path.isAbsolute(installation)) continue;
      const pkg = JSON.parse(await readFile(path.join(installation, 'package.json'), 'utf8'));
      if (pkg.name !== 'playwright-core') continue;
      chromium = require(installation).chromium;
      if (chromium) {
        console.log(`Using registered playwright-core ${pkg.version}`);
        break;
      }
    } catch (error) {
      // The browser cache may retain a link to an installation since removed.
      if (!['ENOENT', 'MODULE_NOT_FOUND'].includes(error.code)) throw error;
    }
  }
}
assert.ok(chromium, 'Browser replay unavailable: install the existing Playwright test dependencies outside this runner');
const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const errors = [];
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try { browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }); break; }
    catch (error) { errors.push(error.message); }
  }
  assert.ok(browser, 'Browser replay unavailable: ' + errors.join('\n'));
  const context = await browser.newContext();
  const external = [], pageErrors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
      external.push(url.href); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin + '/gosh/index.html');
  await page.waitForFunction(() => window.AlmGoshValidation && window.AlmGoshPlus);
  await page.evaluate(() => {
    document.getElementById('src').value = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
    document.getElementById('btn-run').click();
    AlmGoshPlus.refresh();
    for (const [id, value] of [['plus-study', '2'], ['plus-het', 'Q']]) {
      const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change'));
    }
    window.__p13ExtrasNodes = [...document.querySelectorAll('#alm-plus select, #plus-table button')];
  });
  const snapshot = () => ({
    main: __almGoshValidationSnapshot(), href: location.href, history: history.state,
    historyLength: history.length, storage: { ...localStorage }, extras: AlmGoshPlus.state,
    nodes: ['plus-status', 'plus-plot', 'plus-study', 'plus-het', 'plus-counts', 'plus-table']
      .map(id => { const el = document.getElementById(id); return [id, el.innerHTML, el.value ?? null]; })
  });
  const before = await page.evaluate(snapshot);
  assert.equal(before.extras.k, 3, 'Real extras must be populated before replay');
  assert.equal(before.nodes.find(row => row[0] === 'plus-study')[2], '2');
  const result = await page.evaluate(() => AlmGoshValidation.runCorpus());
  console.log(JSON.stringify({ test: 'full GOSH browser replay', checks: result.checks, passed: result.passed, failed: result.failed.slice(0, 5) }));
  assert.equal(result.checks, 876760);
  assert.equal(result.passed, result.checks);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(await page.evaluate(snapshot), before, 'Successful replay must preserve main and extras state');
  assert.equal(await page.evaluate(() => window.__p13ExtrasNodes.every((el, i) => el === document.querySelectorAll('#alm-plus select, #plus-table button')[i])), true, 'Extras nodes and their handlers must survive');

  const injected = await page.evaluate(async () => {
    const original = __almGoshValidationRun;
    window.__almGoshValidationRun = (...args) => {
      const a = original(...args);
      if (!a.summary) throw Error('P13 injected failure after over-cap validation');
      return a;
    };
    try { await AlmGoshValidation.runCorpus(); return 'UNSAFE'; }
    catch (error) { return error.message; }
    finally { window.__almGoshValidationRun = original; }
  });
  assert.match(injected, /P13 injected failure/);
  assert.deepEqual(await page.evaluate(snapshot), before, 'Failed replay must preserve main and extras state');
  console.log('PASS real extras survive successful and failed replay, including study selection and table handlers');

  for (const mutation of ['missing alert', 'wrong count']) {
    const bad = await page.evaluate(async mutation => {
      const original = __almGoshValidationRun;
      window.__almGoshValidationRun = (...args) => {
        const a = original(...args);
        if (!a.summary) {
          const alert = document.getElementById('input-error');
          alert.textContent = mutation === 'missing alert' ? '' : alert.textContent.replace(/found \d+/, 'found 999999');
        }
        return a;
      };
      try { return await AlmGoshValidation.runCorpus(); }
      finally { window.__almGoshValidationRun = original; }
    }, mutation);
    assert.equal(bad.checks, 876760);
    assert.equal(bad.failed.length, 28);
    assert.equal(bad.passed, bad.checks - 28);
    assert.ok(bad.failed.every(row => row.quantity === 'page_text'));
    assert.deepEqual(await page.evaluate(snapshot), before);
    console.log(`PASS ${mutation}: exactly 28 page_text failures, all other checks pass`);
  }
  await page.evaluate(() => {
    document.getElementById('src').value = Array.from({ length: 101 }, (_, i) => `${i / 100}, 0.2, S${i + 1}`).join('\n');
    document.getElementById('btn-run').click();
  });
  assert.equal(await page.evaluate(() => AlmGoshPlus.state), null);
  assert.equal(await page.locator('#plus-plot').innerHTML(), '');
  assert.equal(await page.locator('#input-error').textContent(), 'Enter at most 100 valid studies (effect, SE[, label]); found 101.');
  await page.evaluate(() => {
    document.getElementById('src').value = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
    document.getElementById('btn-run').click(); AlmGoshPlus.refresh();
  });
  assert.equal(await page.evaluate(() => AlmGoshPlus.state.k), 3);
  assert.equal(await page.locator('#input-error').textContent(), '');
  assert.deepEqual(external, []);
  assert.deepEqual(pageErrors, []);
  console.log('PASS ordinary over-cap refusal clears extras and valid input recovers; no external requests or page errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
