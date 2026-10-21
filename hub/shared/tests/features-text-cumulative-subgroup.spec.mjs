import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = 'cumulative-subgroup';
async function open(page) {
  await page.goto('/' + APP + '/index.html');
  await page.locator('#btn-example').click();
}

test('REVIEW: failing-first engine regressions including PLANTED import corruption', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-isolation=none',
    fileURLToPath(new URL('./fixtures/features/cumulative-subgroup/review-regressions.test.mjs', import.meta.url))], { encoding: 'utf8' });
  console.log(output);
});

test('ENTRY REVIEW: every source must be confirmed, edits revoke confirmation, and provenance reaches Methods', async ({ page }) => {
  await open(page);
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'entry'));
  const panel = page.locator('#alm-f-panel-entry');
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  const before = await page.locator('#f-data').inputValue();
  await expect(use).toBeDisabled();
  for (let i = 0; i < 2; i++) {
    await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill('MD -0.20, 95% CI -0.40 to 0.00');
    await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
    // The wrapping label contains the option text; select by its accessible name.
    await panel.getByRole('combobox', { name: 'Choose the source result to add', exact: true }).selectOption('0');
    await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
    const card = panel.getByRole('group', { name: 'Study source ' + (i + 1), exact: true });
    await card.getByLabel('Study label (author and year, e.g. Smith 2019)', { exact: true }).fill('Smith ' + (2020 + i));
    await card.getByLabel('Full reference', { exact: true }).fill('Synthetic report ' + (i + 1));
    await card.getByLabel('Location (table, figure or page)', { exact: true }).fill('Table 2');
    await card.getByLabel('Outcome measured', { exact: true }).fill('Symptom score');
    await card.getByLabel('Timepoint (or not stated)', { exact: true }).fill('not stated');
    await expect(card.locator('mark').first()).toBeVisible();
    await expect(use).toBeDisabled();
    await expect(page.locator('#f-data')).toHaveValue(before);
    await card.getByLabel('I confirm this row', { exact: true }).check();
  }
  await expect(use).toBeEnabled();
  const first = panel.getByRole('group', { name: 'Study source 1', exact: true });
  await first.getByLabel('Full reference', { exact: true }).fill('Corrected synthetic reference');
  await expect(first.getByLabel('I confirm this row', { exact: true })).not.toBeChecked();
  await expect(use).toBeDisabled();
  await first.getByLabel('I confirm this row', { exact: true }).check();
  await use.click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 confirmed rows.');
  const state = await page.evaluate(() => ({ provenance: AlmFeaturesState.provenance, k: _almLastCumSub().k }));
  expect(state.k).toBe(2);
  expect(state.provenance).toHaveLength(2);
  for (const row of state.provenance) {
    expect(row.confirmed).toBe(true);
    expect(row.confirmedAt).toBeTruthy();
    expect(row.location).toBe('Table 2');
    expect(row.pastedText).toBe('MD -0.20, 95% CI -0.40 to 0.00');
    for (const value of row.values) expect(row.pastedText.slice(...value.span)).toBe(value.text);
  }
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'text'));
  await expect(page.locator('[data-para=methods]')).toContainText('Data were extracted from 2 reports (source location recorded for each study)');
  console.log('ENTRYRT confirmation=2/2 revoked-on-edit=PASS provenance=PASS');
});

test('ENTRY REVIEW PLANTED: silent row loss restores the previous input and pooled analysis', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const before = { data: document.getElementById('f-data').value, results: _almLastCumSub() };
    let message;
    try {
      AlmCumSubFeatures.entry.apply([
        { study: '#1 Smith 2019', yi: -0.3, sei: 0.1 },
        { study: 'Jones', yi: 0.1, sei: 0.2 },
        { study: 'Lee', yi: 0.2, sei: 0.2 }
      ]);
    } catch (e) { message = e.message; }
    return { before, after: { data: document.getElementById('f-data').value, results: _almLastCumSub() }, message };
  });
  expect(result.message).toMatch(/preserve.*round trip/);
  expect(result.after).toEqual(result.before);
});

test('TEXT REVIEW: small p-values and singleton subgroups retain the DOM number audit', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('A, -2, 0.1, 2020, One\nB, -2, 0.1, 2021, One\nC, 2, 0.1, 2022, Two');
  await page.locator('#f-view').selectOption('subgroup');
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'text'));
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await expect(page.locator('[data-para=results]')).toContainText('p < 0.001');
  await expect(page.locator('[data-para=results]')).toContainText('τ² is not estimable');
  await page.locator('#f-data').fill('A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, One');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await expect(page.locator('[data-para=results]')).toContainText('No between-subgroup comparison is possible');
  await expect(page.locator('[data-para=plain]')).toContainText('not evidence of no effect');
});
