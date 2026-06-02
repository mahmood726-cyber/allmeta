/**
 * workbench "Verify in R" spec.
 *
 * workbench is a pairwise IV meta-analysis workbench that writes study-level
 * {label, est, se} to the ma-studies-v1 bus. It now has a "Verify in R" button
 * that pushes the current studies to the bus and opens WebR Validator. This spec
 * stubs window.open (so no real tab) and asserts the bus receives exactly the
 * studies parsed from the data box.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test workbench-verify-in-r.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/workbench/';

const INPUT = [
  'Trial A, -0.22, 0.11',
  'Trial B, -0.31, 0.14',
  'Trial C, 0.04, 0.19',
].join('\n');

async function ready(page) {
  await page.addInitScript(() => {
    // Stub window.open so "Verify in R" doesn't spawn a real tab; record calls.
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return { closed: false, focus() {} }; };
  });
  await page.goto(URL);
  await page.waitForFunction(
    () => window.MaStudies && typeof window.MaStudies.read === 'function'
       && document.getElementById('btn-verify-in-r') && document.getElementById('f-data'),
    { timeout: 10_000 }
  );
}

test.describe('workbench → Verify in R', () => {

  test('button is present', async ({ page }) => {
    await ready(page);
    await expect(page.locator('#btn-verify-in-r')).toBeVisible();
  });

  test('Verify in R pushes the current studies to the bus and opens WebR Validator', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));
    await page.fill('#f-data', INPUT);

    await page.locator('#btn-verify-in-r').click();

    // Bus received exactly the parsed studies.
    const env = await page.evaluate(() => {
      const raw = localStorage.getItem('ma-studies-v1');
      return raw ? JSON.parse(raw) : null;
    });
    expect(env, 'bus envelope missing').not.toBeNull();
    expect(env._schema).toBe('ma-studies-v1');
    expect(env.studies.length).toBe(3);
    expect(env.studies[0].label).toBe('Trial A');
    expect(env.studies[0].est).toBeCloseTo(-0.22, 10);
    expect(env.studies[0].se).toBeCloseTo(0.11, 10);
    const v = await page.evaluate((e) => window.MaStudies.validate(e), env);
    expect(v.ok, 'validator errors: ' + JSON.stringify(v.errors)).toBe(true);

    // A WebR Validator tab was opened with the fromBus marker.
    const opened = await page.evaluate(() => window.__opened || []);
    expect(opened.length).toBe(1);
    expect(opened[0]).toContain('webr-validator');
    expect(opened[0]).toContain('fromBus');
  });

  test('empty data box does not open a tab', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => localStorage.removeItem('ma-studies-v1'));
    await page.fill('#f-data', '');
    await page.locator('#btn-verify-in-r').click();
    const opened = await page.evaluate(() => window.__opened || []);
    expect(opened.length).toBe(0); // openInWebR refuses with no studies on the bus
  });

});
