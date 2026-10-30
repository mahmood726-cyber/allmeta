// Replay the page's existing browser contracts without the evidence-writing test fixture.
// Playwright's ephemeral browser profile stays in the operating-system temp directory.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = ['@playwright/test', 'playwright', 'playwright-core'];
  // This job copy omits node_modules. Reuse an existing Windows browser-cache
  // registration when local resolution fails; no installation or environment reads.
  for (let directory = root; ; directory = dirname(directory)) {
    const links = join(directory, 'AppData', 'Local', 'ms-playwright', '.links');
    if (existsSync(links)) for (const name of readdirSync(links).sort()) {
      const packageRoot = readFileSync(join(links, name), 'utf8').trim();
      candidates.push(join(packageRoot, 'index.js'));
    }
    if (dirname(directory) === directory) break;
  }
  for (const candidate of candidates) {
    let entry;
    try { entry = require.resolve(candidate); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; continue; }
    console.log('P07-R2 browser driver', entry);
    return require(entry);
  }
  throw Error('Browser replay requires an installed Playwright package; none resolved.');
}
const { chromium } = loadPlaywright();
const input = JSON.parse(readFileSync(new URL('./p07-extras-input.json', import.meta.url), 'utf8'));
const reason = 'CR2 unavailable: zero residual variance';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + pathname);
    if (!path.startsWith(resolve(root) + sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  try { browser = await chromium.launch({ headless: true }); }
  catch {
    console.log('Bundled Chromium unavailable; trying installed Microsoft Edge.');
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(1800000);
  await page.goto(origin + '/multilevel-ma/index.html');
  await page.waitForFunction(() => window.AlmMultilevelPlusValidation && window.AlmMultilevelValidation);
  console.log('P07-R2 browser', await page.evaluate(() => navigator.userAgent));

  // Exercise the new partial-result path in a real DOM, in addition to the unit plants.
  for (const effect of input.ties) {
    const csv = input.rows.map(row => [row.cluster, effect, Math.sqrt(row.v)].join(',')).join('\n');
    await page.locator('#src').fill(csv);
    await page.locator('#alm-plus-run').click();
    await page.waitForFunction(() => !document.getElementById('alm-plus-export').disabled);
    const actual = await page.evaluate(() => ({
      notice: document.querySelector('[data-robust-unavailable]')?.textContent,
      status: document.getElementById('alm-plus-status').textContent,
      profiles: document.querySelectorAll('#alm-plus-output svg').length,
      robustCells: document.querySelectorAll('#alm-plus-output [data-quantity^="robust."]').length,
      exported: JSON.parse(AlmMultilevelPlus.exportText())
    }));
    assert.equal(actual.notice, reason);
    assert.ok(actual.status.includes(reason));
    assert.equal(actual.profiles, 2);
    assert.equal(actual.robustCells, 0);
    assert.deepEqual(actual.exported.robust, { status: 'unavailable', reason });
    assert.equal(actual.exported.inference, reason);
    assert.ok(actual.exported.profiles.every(profile => Number.isFinite(profile.upper)));
    console.log(`P07-R2 browser ties_${effect}: PASS`);
  }

  // Load a regular example, clearing the partial result before the unchanged replay.
  await page.evaluate(rows => {
    document.getElementById('src').value = rows.map(row => [row.cluster, row.y, Math.sqrt(row.v)].join(',')).join('\n');
    document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true }));
    AlmMultilevelPlus.calculate();
  }, input.rows);
  const before = await page.locator('#src').inputValue();
  const navigation = await page.evaluate(() => ({ href: location.href, state: history.state, length: history.length }));
  const original = await page.evaluate(() => AlmMultilevelValidation.runCorpus());
  console.log('P07-R2 original browser contract', JSON.stringify(original));
  assert.equal(original.checks, 528);
  assert.equal(original.passed, 528);
  assert.deepEqual(original.failed, []);
  const extras = await page.evaluate(() => AlmMultilevelPlusValidation.runCorpus());
  console.log('P07-R2 extras browser contract', JSON.stringify(extras));
  assert.equal(extras.checks, 10749);
  assert.equal(extras.passed, 10749);
  assert.deepEqual(extras.failed, []);
  assert.match(await page.locator('#alm-plus-validate [role=status]').innerText(), /10749\/10749 passed; 0 failed/);
  // Check input and navigation restoration after both corpus runs.
  assert.equal(await page.locator('#src').inputValue(), before);
  assert.deepEqual(await page.evaluate(() => ({ href: location.href, state: history.state, length: history.length })), navigation);
  console.log('P07-R2 browser input and navigation restoration: PASS');
  console.log('P07-R2 browser heading diagnostic', JSON.stringify(await page.locator('#alm-plus-validate h2').evaluate(element => ({
    textContent: element.textContent, innerText: element.innerText, textTransform: getComputedStyle(element).textTransform
  }))));
  // Match the existing spec's DOM-text contract; CSS uppercases only rendered innerText.
  assert.equal(await page.locator('#alm-plus-validate h2').textContent(), 'Validate the extras in R');
  console.log('P07-R2 browser contracts: original 528/528, extras 10749/10749');
} finally {
  try { if (browser) await browser.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
