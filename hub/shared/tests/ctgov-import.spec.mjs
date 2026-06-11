/**
 * ctgov-import.spec.mjs — offline ClinicalTrials.gov results JSON import in the
 * rct-extractor (shared/ctgov-extract.js, vendored from ctgov-v2-extractor).
 * Pure, no network: the user pastes the API JSON and it is parsed in-browser.
 */
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:8088/rct-extractor/';

const FIXTURE = JSON.stringify({
  protocolSection: { identificationModule: { nctId: 'NCT01234567' } },
  resultsSection: { outcomeMeasuresModule: { outcomeMeasures: [{
    title: 'All-cause mortality', type: 'PRIMARY', unitOfMeasure: 'Participants', timeFrame: '36 months',
    groups: [{ id: 'OG000', title: 'Drug' }, { id: 'OG001', title: 'Placebo' }],
    classes: [{ categories: [{ measurements: [
      { groupId: 'OG000', value: '386' }, { groupId: 'OG001', value: '451' }
    ] }] }]
  }] } }
});

test.describe('ClinicalTrials.gov offline import', () => {
  test('parses pasted CT.gov results JSON into per-arm outcome measures', async ({ page }) => {
    await page.goto(APP);
    await page.click('.ctgov-import summary');   // open the collapsible import panel
    await page.fill('#ctgov-json', FIXTURE);
    await page.click('#btn-ctgov');

    const out = page.locator('#ctgov-out');
    await expect(out).toContainText('NCT01234567');
    await expect(out).toContainText('All-cause mortality');
    await expect(out).toContainText('Drug');
    await expect(out).toContainText('386');
    await expect(out).toContainText('Placebo');
    await expect(out).toContainText('451');
  });

  test('reports bad input without throwing', async ({ page }) => {
    await page.goto(APP);
    await page.click('.ctgov-import summary');   // open the collapsible import panel
    await page.fill('#ctgov-json', '{ not json');
    await page.click('#btn-ctgov');
    await expect(page.locator('#ctgov-out')).toContainText('Not valid JSON');

    await page.fill('#ctgov-json', '{"foo":1}');
    await page.click('#btn-ctgov');
    await expect(page.locator('#ctgov-out')).toContainText('Not a ClinicalTrials.gov');
  });
});
