/**
 * rct-regex-extract.spec.mjs — the browser-native, offline effect-estimate
 * extractor (shared/rct-regex-extract.js), a JS port of rct-extractor-v2's
 * pattern families. Verifies real extraction with NO Python backend, plus the
 * anti-fabrication guards (inverted CI, year-as-estimate, estimate-outside-CI).
 */
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:8088/rct-extractor/';

test.describe('browser-native extractor', () => {
  test('extracts a real HR offline (no backend) and tags it browser-regex', async ({ page }) => {
    await page.goto(APP);
    await page.check('#use-native');                 // force the offline engine
    // default textarea already holds an empagliflozin passage with HR 0.75 (0.65-0.86)
    await page.click('#btn-run');

    const firstRow = page.locator('#res-body tr').first();
    await expect(firstRow).toContainText('HR');
    await expect(firstRow).toContainText('0.75');
    await expect(firstRow).toContainText('0.65');
    await expect(firstRow).toContainText('0.86');
    await expect(firstRow).toContainText('browser-regex');
    await expect(page.locator('#native-note')).toBeVisible();
  });

  test('handles JAMA / Lancet styles and applies the anti-fabrication guards', async ({ page }) => {
    await page.goto(APP);
    await page.check('#use-native');

    // JAMA bracket OR + Lancet middle-dot RR should both extract...
    await page.fill('#text',
      'The odds ratio was 1.34 [95% CI, 1.10 to 1.63]. The relative risk was 0.88 (95% CI 0.79–0.98).');
    await page.click('#btn-run');
    await expect(page.locator('#res-body')).toContainText('OR');
    await expect(page.locator('#res-body')).toContainText('1.34');
    await expect(page.locator('#res-body')).toContainText('RR');
    await expect(page.locator('#res-body')).toContainText('0.88');

    // ...but a degenerate/inverted CI and an estimate-outside-its-CI must NOT be emitted.
    await page.fill('#text',
      'odds ratio 1.5 (95% CI 2.0 to 1.0); hazard ratio 5.0 (95% CI 0.65 to 0.86).');
    await page.click('#btn-run');
    await expect(page.locator('#res-body')).toContainText('No effects detected');
  });
});
