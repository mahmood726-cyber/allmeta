import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
// revman-importer (legacy reader shared/revman-reader.js): rows the reader cannot use are shown to the user by name,
// RevMan 5 CONT_OUTCOME / IV_OUTCOME and child-element names are imported, and valid input renders as before.
const fixture = rel => fileURLToPath(new URL(rel, import.meta.url));
const origin = () => 'http://127.0.0.1:' + (process.env.ALM_FEATURES_PORT || 8089);
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('revman-importer lists every row the reader skipped, imports CONT/IV outcomes, and leaves valid input unchanged', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  await page.goto(origin() + '/revman-importer/index.html');
  await page.locator('#picker').setInputFiles(fixture('./fixtures/revman-legacy/legacy.rm5'));
  const status = page.locator('#status');
  await expect(status).toHaveText('Parsed: 1 comparisons, 10 study rows. 7 rows not imported (listed under Review metadata).');
  await expect(status).toHaveClass('err');
  const box = page.locator('#skipped-rows');
  await expect(box).toBeVisible();
  await expect(box.locator('li')).toHaveText([
    'Synthetic legacy comparison › Synthetic dichotomous events, row 3, study Synthetic Leg Zeta: TOTAL_2 missing',
    'Synthetic legacy comparison › Synthetic continuous score, row 4, study Synthetic Leg Delta: SD_1 must be > 0 (is 0)',
    'Synthetic legacy comparison › Synthetic continuous score, row 5, study Synthetic Leg Epsilon: MEAN_2 missing',
    'Synthetic legacy comparison › Synthetic continuous score, row 6, study Synthetic Leg Zeta: SD_2 must be > 0 (is -1.6); TOTAL_2 must be > 0 (is 0)',
    'Synthetic legacy comparison › Synthetic time to event, row 2, study Synthetic Leg Gamma: VAR must be > 0 (is 0)',
    'Synthetic legacy comparison › Synthetic generic inverse variance, row 3, study Synthetic Leg Gamma: SE must be > 0 (is 0)',
    'Synthetic legacy comparison › Synthetic generic inverse variance, row 5, study Synthetic Leg Epsilon: SE missing',
  ]);
  await expect(page.locator('#comparison-pick option')).toHaveText(['Synthetic legacy comparison']);
  const preview = page.locator('#preview-host tbody tr');
  await expect(preview).toHaveCount(10);
  await expect(page.locator('#preview-host')).toContainText('Synthetic treatment: 12.5±3.1 (n=40) vs Synthetic control: 14.25±2.9 (n=42)');
  await expect(page.locator('#preview-host')).toContainText('Synthetic treatment: estimate -0.2231 (SE 0.1187)');
  await page.locator('#btn-push').click();
  await expect(page.locator('#push-status')).toContainText('2 studies pushed');
  await expect(page.locator('#push-status')).toContainText('1 row of this outcome not imported from the file');

  // Valid legacy-layout input: no skipped list and the status line exactly as before.
  await page.locator('#picker').setInputFiles(fixture('../../../tests/fixtures/revman/tiny.rm5'));
  await expect(status).toHaveText('Parsed: 2 comparisons, 6 study rows.');
  await expect(status).not.toHaveClass('err');
  await expect(page.locator('#skipped-rows')).toHaveCount(0);
  expect(errors).toEqual([]);
});
