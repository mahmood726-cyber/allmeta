import { test, expect } from './validation-fixture.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('dose-response-ma/validate/MANIFEST.json', root), 'utf8'));
const blobs = Object.fromEntries(manifest.files.map(f => [f.path, readFileSync(new URL('dose-response-ma/' + f.path, root), 'utf8')]));
const corpus = JSON.parse(blobs['validate/corpus/reference.json']);
const framework = existsSync(new URL('shared/alm-validate.js', root));
const coffee = corpus.datasets.find(ds => ds.dataset === 'coffee_mort');
const coffeeCSV = '# study,dose,cases,n,logRR,SE,type,covariate\n' + coffee.rows.map(r =>
  [r.id, r.dose, r.cases, r.n, r.logrr, r.se == null ? '' : r.se, r.type, r.mod].join(',')).join('\n');
const countLine = '724 combinations: 576 fits within tolerance + 148 identical refusals (paper 2)';

function requests(page, origin) {
  const outside = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) outside.push(request.url());
  });
  return outside;
}
async function open(page, baseURL) {
  const url = new URL('dose-response-ma/index.html', baseURL).href;
  const outside = requests(page, new URL(url).origin);
  await page.goto(url);
  await page.waitForFunction(() => !!window.AlmDoseValidate);
  return outside;
}
const corpusButton = page => page.locator('#alm-validate').getByRole('button', { name: /full validation|corpus|paper|published|tier\s*2/i }).first();
const liveButton = page => page.locator('#alm-validate').getByRole('button', { name: /this analysis in R|live|current|tier\s*1|with R|against R/i }).first();

test('dose corpus hashes and direct offline replay reproduce every paper combination', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  for (const f of manifest.files) expect(createHash('sha256').update(blobs[f.path]).digest('hex')).toBe(f.sha256);
  const outside = await open(page, baseURL);
  await context.setOffline(true);
  const result = await page.evaluate(async ({ blobs, files }) => {
    const parsed = {};
    for (const f of files) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(blobs[f.path]));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== f.sha256) throw new Error('Corpus hash mismatch');
      parsed[f.path] = JSON.parse(blobs[f.path]);
    }
    return window.AlmDoseValidate.corpus.run(parsed);
  }, { blobs, files: manifest.files });
  expect(result.checks).toBe(724);
  expect(result.passed).toBe(724);
  expect(result.refusals).toEqual({ reference: 148, app: 148, matched: 148 });
  expect(result.failed).toEqual([]);
  expect(result.summaryLines).toContain(countLine);
  expect(outside).toEqual([]);
});

test('dose corpus detects changed engine results rather than replaying stored app outputs', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const outside = await open(page, baseURL);
  const result = await page.evaluate(async blobs => {
    const engine = window.AlmDoseResponse.fitDR;
    window.AlmDoseResponse.fitDR = (...args) => {
      const result = engine(...args);
      if (result.ok) result.coef[0] += 1;
      return result;
    };
    try { return await window.AlmDoseValidate.corpus.run(Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, JSON.parse(v)]))); }
    finally { window.AlmDoseResponse.fitDR = engine; }
  }, blobs);
  expect(result.checks).toBe(724);
  expect(result.passed).toBe(148);
  expect(result.failed.some(f => f.quantity === 'coef')).toBe(true);
  expect(outside).toEqual([]);
});

test('dose validation buttons render; corpus widget works offline', async ({ page, context, baseURL }) => {
  test.skip(!framework, 'Shared AlmValidate widget belongs to the framework integration lane.');
  test.setTimeout(120_000);
  const outside = await open(page, baseURL);
  await expect(corpusButton(page)).toBeVisible();
  await expect(liveButton(page)).toBeVisible();
  // Same-origin cached bytes only, with networking disabled. No HTTP oracle is involved.
  await context.route('**/dose-response-ma/validate/corpus/*.json', route => {
    const path = new URL(route.request().url()).pathname.split('/dose-response-ma/')[1];
    return route.fulfill({ contentType: 'application/json', body: blobs[path] });
  });
  await context.setOffline(true);
  await corpusButton(page).click();
  await expect(page.locator('#alm-validate')).toContainText(countLine, { timeout: 100_000 });
  await expect(page.locator('#alm-validate')).toContainText('0 failures');
  expect(outside).toEqual([]);
});

test('dose widget refuses changed corpus bytes before invoking the engine', async ({ page, baseURL }) => {
  test.skip(!framework, 'Shared hash verification belongs to the framework integration lane.');
  const outside = await open(page, baseURL);
  await page.route('**/dose-response-ma/validate/corpus/reference.json', route => route.fulfill({
    contentType: 'application/json', body: blobs['validate/corpus/reference.json'] + ' '
  }));
  await page.evaluate(() => {
    window.__doseValidationCalls = 0;
    const original = window.AlmDoseResponse.fitDR;
    window.AlmDoseResponse.fitDR = (...args) => { window.__doseValidationCalls++; return original(...args); };
  });
  await corpusButton(page).click();
  await expect(page.locator('#alm-validate')).toContainText(/hash|sha.?256/i);
  await expect(page.locator('#alm-validate')).toContainText(/mismatch|refus|integrity|failed/i);
  expect(await page.evaluate(() => window.__doseValidationCalls)).toBe(0);
  await expect(page.locator('#alm-validate')).not.toContainText(countLine);
  expect(outside).toEqual([]);
});

for (const shape of ['linear', 'spline3']) {
  test(`dose live R coffee mortality ${shape} @slow`, async ({ page, baseURL }) => {
    test.skip(!framework, 'Requires integrated widget and same-origin vendored webR repository.');
    test.setTimeout(180_000);
    const outside = await open(page, baseURL);
    await page.locator('#f-data').fill(coffeeCSV);
    await page.locator('#f-shape').selectOption(shape);
    await liveButton(page).click();
    const panel = page.locator('#alm-validate');
    await expect(panel).toContainText(/PASS|R check available via the reproducible repo/, { timeout: 165_000 });
    const rows = panel.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThan(10);
    for (const row of await rows.all()) await expect(row.locator('td').last()).toHaveText('PASS');
    await expect(panel).toContainText('2.2.0');
    expect(outside).toEqual([]);
  });
}
