import { readFileSync } from 'node:fs';
import { test, expect } from './multivariate-ma-fixture.mjs';

const controls = JSON.parse(readFileSync(new URL('../../../multivariate-ma/validate/diagnostic/mutation-controls.json', import.meta.url), 'utf8'));
const weak = controls.find(c => c.id === 'mutation-control:k6:E1e-5').studies;
const rows = studies => studies.map((s, i) => ['s' + i, s.y[0], s.S[0][0], s.y[1], s.S[1][1], s.S[0][1]].map(String).join(',')).join('\n');
const verdict = page => page.evaluate(() => window._almLastMultivariate()?.diagnostic?.verdict ?? null);

test('likelihood note and diagnostic exports follow current data', async ({ page }) => {
  await page.goto('/multivariate-ma/index.html');
  await page.waitForFunction(() => window._almLastMultivariate?.()?.diagnostic);
  const note = page.locator('#likelihood-diagnostic');
  await expect(note).toHaveAttribute('role', 'status');
  expect(await verdict(page)).toBe('interior maximum');
  await expect(note).toBeHidden();
  await page.locator('#f-mode').selectOption('cov');
  await page.locator('#f-data').fill('a,0,1,0,1,0\nb,0,1,0,1,0');
  await expect(note).toBeVisible();
  await expect(note).toContainText('covariance boundary');
  const exported = await page.evaluate(() => window.AlmMvPlusUI.resultsJSON());
  expect(exported.result.diagnostic.verdict).toBe('boundary maximum');
  expect(exported.result.diagnostic.startsRun).toBe(0);
  expect(exported.univariate.every(f => f.diagnostic)).toBe(true);
  await page.locator('#plus-run').click();
  const sweep = await page.evaluate(() => window.AlmMvPlusUI.resultsJSON().sweep);
  expect(sweep.filter(s => s.status === 'ok').every(s => s.diagnostic)).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#plus-dl-json').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const json = JSON.parse(Buffer.concat(chunks).toString());
  expect(json.result.diagnostic).toEqual(exported.result.diagnostic);
  // A refused fit (non-PD within-study covariance) must hide a note left by the previous fit.
  await page.locator('#f-data').fill('a,0,1,0,1,0\nb,0,1,0,1,0\nc,1,1,1,1,2');
  await expect(page.locator('#headline')).toContainText('Refused');
  await expect(note).toBeHidden();
  await expect(note).toHaveText('');
  await page.locator('#f-data').fill(rows(weak));
  await expect.poll(() => verdict(page)).toBe('multiple near-equal optima');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('Different between-study covariance estimates reach the same likelihood, so these covariance estimates are not unique. The pooled estimates may still be reliable.');
  // The hypertension example (mmHg) is an ordinary interior fit: the engine gives "interior maximum" and no note.
  await page.locator('#btn-ex-hyp').click();
  await expect.poll(() => verdict(page)).toBe('interior maximum');
  await expect(note).toBeHidden();
  await page.locator('#f-data').fill('a,0,1,0,1,0\nb,0,1,0,1,0');
  await expect(note).toBeVisible();
  await page.locator('#btn-clear').click();
  await expect(note).toBeHidden();
  expect(await page.evaluate(() => window.AlmMvPlusUI.resultsJSON().result)).toBeNull();
});
