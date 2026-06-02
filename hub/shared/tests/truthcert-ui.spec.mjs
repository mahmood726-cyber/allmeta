/**
 * TruthCert UI spec (shared/truthcert-ui.js), driven through workbench.
 *
 * Covers the shared key-management panel and the receipt-download button:
 *   - settings panel: open, generate a 64-hex key, save -> persisted
 *   - receipt: with a key set, downloading produces a schema-valid, HMAC-signed
 *     receipt of the current studies that re-verifies under the same key
 *   - fail-closed: no key -> no download, the key panel opens instead
 *
 * Run from hub/shared/tests/:
 *   npx playwright test truthcert-ui.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/workbench/';
const KEY = 'unit-test-signing-key-32bytes-min!!';
const INPUT = 'Trial A, -0.22, 0.11\nTrial B, -0.31, 0.14';

async function ready(page) {
  await page.goto(URL);
  await page.waitForFunction(
    () => window.TruthCertUI && window.MaStudies
       && document.getElementById('btn-truthcert') && document.getElementById('btn-truthcert-key'),
    { timeout: 10_000 }
  );
}

test.describe('TruthCert UI (via workbench)', () => {

  test('key panel: open, generate, save persists a 64-hex key', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.TruthCertUI.setKey(''));

    await page.locator('#btn-truthcert-key').click();
    await expect(page.locator('#truthcert-overlay')).toBeVisible();

    await page.locator('#truthcert-gen').click();
    const gen = await page.inputValue('#truthcert-key-input');
    expect(gen).toMatch(/^[0-9a-f]{64}$/);

    await page.locator('#truthcert-save').click();
    await expect(page.locator('#truthcert-overlay')).toHaveCount(0); // closed
    const stored = await page.evaluate(() => window.TruthCertUI.getKey());
    expect(stored).toBe(gen);
  });

  test('receipt: downloads a signed, re-verifiable receipt of the current studies', async ({ page }) => {
    await ready(page);
    await page.evaluate((k) => window.TruthCertUI.setKey(k), KEY);
    await page.fill('#f-data', INPUT);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#btn-truthcert').click(),
    ]);
    expect(download.suggestedFilename()).toBe('workbench-truthcert.json');

    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const receipt = JSON.parse(readFileSync(path, 'utf-8'));

    expect(receipt._schema).toBe('ma-studies-v1');
    expect(receipt.alg).toBe('HMAC-SHA-256');
    expect(receipt.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.studies.length).toBe(2);
    expect(receipt.studies[0].label).toBe('Trial A');
    expect(receipt.studies[0].est).toBeCloseTo(-0.22, 10);

    // Re-verify the receipt under the same key (and reject a wrong key).
    const ok = await page.evaluate((r) => window.MaStudies.verifyTruthCert(r, { key: 'unit-test-signing-key-32bytes-min!!' }), receipt);
    expect(ok.ok).toBe(true);
    expect(ok.valid).toBe(true);
    const bad = await page.evaluate((r) => window.MaStudies.verifyTruthCert(r, { key: 'wrong-key' }), receipt);
    expect(bad.valid).toBe(false);
  });

  test('fail-closed: no key opens the panel and downloads nothing', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.TruthCertUI.setKey(''));
    await page.fill('#f-data', INPUT);

    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('#btn-truthcert').click();

    // The key panel opens instead of producing a receipt.
    await expect(page.locator('#truthcert-overlay')).toBeVisible();
    expect(downloaded).toBe(false);
  });

});

// The TruthCert receipt button is wired identically into the flagship pairwise
// poolers (same #f-data "label, est, se" format). Confirm each emits a valid,
// app-named receipt of its current studies.
// Cover all three getStudies paths the receipt button uses:
//  - parseStudies(#f-data)  : forest-plot (in-IIFE getStudies)
//  - studiesFromTextarea(#f-data, "label-est-se") : meta-regression (swept)
//  - studiesFromTextarea(#src,    "est-se-label") : pet-peese (swept)
//  - custom producer getter : mh-peto (computes per-study effects from 2x2)
const POOLERS = [
  { name: 'forest-plot',     fill: { sel: '#f-data', val: INPUT },                                count: 2 },
  { name: 'meta-regression', fill: { sel: '#f-data', val: INPUT },                                count: 2 },
  { name: 'pet-peese',       fill: { sel: '#src',    val: '0.25, 0.08, S1\n0.18, 0.10, S2' },     count: 2 },
  { name: 'mh-peto',         fill: null,                                                          count: 5 }, // default 2x2 fixture
];

for (const app of POOLERS) {
  test.describe(`TruthCert receipt — ${app.name}`, () => {
    test('downloads an app-named, schema-valid signed receipt of the current studies', async ({ page }) => {
      await page.goto(`http://localhost:8088/${app.name}/`);
      await page.waitForFunction(
        () => window.TruthCertUI && window.MaStudies && document.getElementById('btn-truthcert'),
        { timeout: 10_000 }
      );
      await page.evaluate((k) => window.TruthCertUI.setKey(k), KEY);
      if (app.fill) await page.fill(app.fill.sel, app.fill.val);

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        page.locator('#btn-truthcert').click(),
      ]);
      expect(download.suggestedFilename()).toBe(`${app.name}-truthcert.json`);

      const path = await download.path();
      const { readFileSync } = await import('node:fs');
      const receipt = JSON.parse(readFileSync(path, 'utf-8'));
      expect(receipt._schema).toBe('ma-studies-v1');
      expect(receipt.alg).toBe('HMAC-SHA-256');
      expect(receipt.studies.length).toBe(app.count);
      const ok = await page.evaluate((r) => window.MaStudies.verifyTruthCert(r, { key: 'unit-test-signing-key-32bytes-min!!' }), receipt);
      expect(ok.valid).toBe(true);
    });
  });
}
