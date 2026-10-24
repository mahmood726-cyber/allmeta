import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const apps = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).flatMap(e => {
  try { return /\bshare\s*:\s*\{/.test(readFileSync(root + e.name + '/alm-features.js', 'utf8')) ? [e.name] : []; }
  catch { return []; }
});
expect(apps).toContain('proportion-ma');
const openedContexts = [];
async function freshPage(browser, baseURL) {
  const context = await browser.newContext({ baseURL, acceptDownloads: true });
  openedContexts.push(context);
  return context.newPage();
}
test.afterEach(async () => {
  await Promise.all(openedContexts.splice(0).map(context => context.close()));
});
const provenance = [{ label: 'Unicode \u00c9tude \u65e5\u672c', reference: 'Example study', location: 'Table 2',
  pastedText: '5/40', confirmed: true, values: [{ field: 'xi', value: 5, span: [0, 1], text: '5' }] }];

async function ready(page, app) {
  await page.goto('/' + app + '/index.html');
  await page.waitForFunction(a => !!window.AlmFeatures?.get(a)?.share, app);
  // This branch's only registered app runs the built-in example on load.
  // Any future share adapter must provide a working built-in example too.
  const run = page.getByRole('button', { name: 'Run analysis', exact: true });
  if (await run.count()) await run.click();
  await expect(page.locator('#forest')).toBeVisible();
}
async function showShare(page, app) {
  await page.evaluate(a => AlmFeatures.open(a, 'share'), app);
  await expect(page.getByRole('button', { name: 'Share this analysis', exact: true })).toBeVisible();
}
async function snapshot(page, app) {
  return page.evaluate(a => {
    const spec = AlmFeatures.get(a);
    let result;
    if (spec.text) result = spec.text.results();
    else if (typeof window._almLastPropMA === 'function') result = window._almLastPropMA();
    else throw new Error('Add the app last-results accessor for ' + a);
    const regions = [document.querySelector('#res-body')?.closest('section')].filter(Boolean);
    if (!regions.length) throw new Error('No main results region for ' + a);
    const text = regions.map(n => n.innerText).join('\n');
    const svg = document.querySelector('#forest');
    if (!svg) throw new Error('No main plot for ' + a);
    const clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    return { state: spec.share.get(), result: JSON.parse(JSON.stringify(result)),
      numbers: text.match(/[-+\u2212]?(?:\d+(?:[.,]\d+)*|\.\d+)(?:e[-+]?\d+)?/gi) || [],
      svg: clone.outerHTML, provenance: AlmFeaturesState.provenance };
  }, app);
}
async function share(page, app) {
  await showShare(page, app);
  await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link ready');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  expect(link).toMatch(/#a2=[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  return link;
}
async function custom(page, app) {
  await page.evaluate(({ a, p }) => {
    const b = AlmFeatures.get(a).share;
    b.set({ ...b.get(), src: '5,40,Alpha \u00c9tude\n9,60,Beta\n14,75,Gamma\n2,30,Delta', trans: 'ft', tau: 'DL', axis: { x: [0, 0.8], xLog: false } });
    AlmFeaturesState.provenance = p;
  }, { a: app, p: provenance });
}
for (const app of apps) {
  test('SHARE2 ' + app + ': built-in example round-trip preserves every result and SVG', async ({ page, browser, baseURL }) => {
    await ready(page, app);
    const before = await snapshot(page, app);
    expect(before.numbers.length).toBeGreaterThan(10);
    expect(before.svg).toContain('<');
    const link = await share(page, app);
    const restored = await freshPage(browser, baseURL);
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await snapshot(restored, app)).toEqual(before);
    console.log('SHARE2 ' + app + ' ok');
  });
  test('SHARE2 ' + app + ': nondefault options, unicode and provenance round-trip', async ({ page, browser, baseURL }) => {
    await ready(page, app); await custom(page, app);
    const before = await snapshot(page, app), link = await share(page, app);
    const restored = await freshPage(browser, baseURL); await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await snapshot(restored, app)).toEqual(before);
    expect(await restored.evaluate(() => location.hash)).toBe(new URL(link).hash);
  });
  test('SHARE2 ' + app + ': PLANTED corrupt link refuses and leaves a fresh analysis', async ({ page, browser, baseURL }) => {
    await ready(page, app);
    const fresh = await snapshot(page, app);
    await custom(page, app);
    const link = await share(page, app);
    const index = link.indexOf('#a2=') + 4;
    const corrupted = link.slice(0, index) + (link[index] === '0' ? '1' : '0') + link.slice(index + 1);
    for (const bad of [corrupted, link.slice(0, -12), link + '!']) {
      const restored = await freshPage(browser, baseURL); await restored.goto(bad);
      await expect(restored.locator('[data-testid=share-status]')).toContainText('could not be opened');
      await expect(restored.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await snapshot(restored, app)).toEqual(fresh);
      await restored.close();
    }
    console.log('SHARE2 ' + app + ' planted corruption refused');
  });
  test('SHARE2 ' + app + ': version mismatch pauses before restore; archive URL and explicit consent', async ({ page, browser, baseURL }) => {
    await ready(page, app);
    const fresh = await snapshot(page, app);
    await custom(page, app);
    const expected = await snapshot(page, app);
    const link = await page.evaluate(async a => {
      const p = AlmShare.payload(a, AlmFeatures.get(a).share.get(), AlmFeaturesState.provenance);
      p.build.sha = 'f'.repeat(40);
      return AlmShare.makeLinkV2(location.href, await AlmShare.encodeV2(p));
    }, app);
    const restored = await freshPage(browser, baseURL); await restored.goto(link);
    await expect(restored.locator('[data-testid=share-version]')).toContainText('This link was made with allmeta');
    await expect(restored.locator('[data-testid=share-version]')).toContainText('Results may differ.');
    expect(await snapshot(restored, app)).toEqual(fresh);
    const version = await page.evaluate(() => AlmBuildInfo.version);
    await expect(restored.getByRole('link', { name: 'Open the archived version' })).toHaveAttribute('href',
      'https://github.com/mahmood726-cyber/allmeta/releases/tag/' + version);
    await restored.getByRole('button', { name: 'Restore anyway', exact: true }).click();
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await snapshot(restored, app)).toEqual(expected);
  });
  test('SHARE2 ' + app + ': 1000-row state downloads JSON and imports identical results', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000);
    await ready(page, app);
    await page.evaluate(a => {
      let seed = 773;
      function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
      const rows = Array.from({ length: 1000 }, (_, i) => {
        const n = 100 + rnd() % 900, x = 1 + rnd() % (n - 1);
        const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
        return x + ',' + n + ',Study ' + i + ' ' + label;
      });
      const b = AlmFeatures.get(a).share; b.set({ ...b.get(), src: rows.join('\n') });
    }, app);
    const expected = await snapshot(page, app);
    await showShare(page, app);
    await page.getByRole('button', { name: 'Share this analysis', exact: true }).click();
    await expect(page.locator('[data-testid=share-status]')).toContainText('8,000-character link limit');
    await expect(page.getByLabel('Share link', { exact: true })).toHaveValue('');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download analysis file (.json)', exact: true }).click()]);
    expect(dl.suggestedFilename()).toMatch(new RegExp('^' + app + '-analysis-\\d{8}\\.json$'));
    const path = await dl.path(), text = readFileSync(path, 'utf8'), p = JSON.parse(text);
    expect(p.v).toBe(2); expect(text).toContain('\n  "app"');
    expect(p.state.src.split('\n')).toHaveLength(1000);
    await expect(page.getByLabel('Reproduce this analysis', { exact: true })).toHaveValue(new RegExp(dl.suggestedFilename().replaceAll('.', '\\.')));
    const restored = await freshPage(browser, baseURL); await ready(restored, app); await showShare(restored, app);
    await restored.getByLabel('Open analysis file', { exact: true }).setInputFiles(path);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the analysis file.');
    expect(await snapshot(restored, app)).toEqual(expected);
    // The file path shares the same version guard.
    p.build.sha = 'e'.repeat(40);
    const fresh = await freshPage(browser, baseURL); await ready(fresh, app);
    const original = await snapshot(fresh, app); await showShare(fresh, app);
    await fresh.getByLabel('Open analysis file', { exact: true }).setInputFiles({ name: 'mismatch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
    await expect(fresh.locator('[data-testid=share-version]')).toBeVisible();
    expect(await snapshot(fresh, app)).toEqual(original);
    await fresh.getByRole('button', { name: 'Restore anyway', exact: true }).click();
    await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the analysis file.');
    expect(await snapshot(fresh, app)).toEqual(expected);
    console.log('SHARE2 ' + app + ' file 1000 rows ok');
  });
  test('SHARE2 ' + app + ': offline codec, explicit creation and clipboard textarea fallback', async ({ page, browser, baseURL }) => {
    await page.addInitScript(() => { window.CompressionStream = undefined; window.DecompressionStream = undefined; });
    await ready(page, app); await showShare(page, app);
    await expect(page.getByLabel('Share link', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Open analysis file', { exact: true })).toBeVisible();
    const original = await snapshot(page, app), link = await share(page, app);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
      document.execCommand = action => { window.__copied = document.activeElement.value; return action === 'copy'; };
    });
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
    await expect(page.locator('[data-testid=share-status]')).toContainText('copied');
    expect(await page.evaluate(() => window.__copied)).toBe(link);
    await page.getByRole('button', { name: 'Copy reproduction text', exact: true }).click();
    expect(await page.evaluate(() => window.__copied)).toBe(await page.getByLabel('Reproduce this analysis', { exact: true }).inputValue());
    const restored = await freshPage(browser, baseURL);
    await restored.addInitScript(() => { window.CompressionStream = undefined; window.DecompressionStream = undefined; });
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await snapshot(restored, app)).toEqual(original);
  });
}

for (const app of apps) {
  test('SHARE2 ' + app + ': PLANTED invalid analysis files preserve the current analysis', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page, app);
    await custom(page, app);
    const before = await snapshot(page, app);
    const payload = await page.evaluate(a =>
      AlmShare.payload(a, AlmFeatures.get(a).share.get(), AlmFeaturesState.provenance), app);
    await showShare(page, app);
    const files = [
      '{',
      JSON.stringify({ ...payload, app: 'unknown-app' }),
      JSON.stringify({ ...payload, v: 99 }),
      JSON.stringify({ ...payload, provenance: [1] }),
      JSON.stringify({ ...payload, state: { ...payload.state, trans: 'unknown-transform' } }),
      JSON.stringify({ ...payload, state: { ...payload.state, axis: { x: [1, 0], xLog: false } } })
    ];
    for (const contents of files) {
      const input = page.getByLabel('Open analysis file', { exact: true });
      await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
      // Clearing the input marks completion, including when consecutive refusals have the same text.
      await expect(input).toHaveValue('');
      await expect(page.locator('[data-testid=share-status]')).toContainText('analysis file could not be opened');
      await expect(page.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      await expect(page.locator('[data-testid=share-version]')).toBeHidden();
      expect(await snapshot(page, app)).toEqual(before);
    }
    expect(errors).toEqual([]);
    console.log('SHARE2 ' + app + ' planted invalid files refused');
  });
}
