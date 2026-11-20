/**
 * The signed TruthCert receipt must sign the studies the page analysed (lane rcpt, 2026-11-13).
 *
 * Root cause pinned here: bayesian-ma, tsa and cumulative-subgroup wired the receipt button with
 * { textarea: "#f-data", format: "label-est-se" }, so shared/truthcert-ui.js re-read the textarea
 * with MaStudies.studiesFromTextarea, a different splitter from the page's own parseStudies():
 * it splits on every comma and reads est/se from columns 2 and 3. A row the page reads as
 * label "Smith, 2020", est 0.22, se 0.11 was signed as label "Smith", est 2020, se 0.22,
 * year 0.11; a row "Jones, J, -0.31, 0.14" was silently left out of the receipt.
 * Deliberately artificial fixtures, not research observations.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test truthcert-receipt-page-studies.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const KEY = 'unit-test-signing-key-32bytes-min!!';
const WANT = [['Smith, 2020', 0.22, 0.11], ['Jones, J', -0.31, 0.14], ['Trial C', 0.04, 0.19]];
const ORDINARY = 'Trial A, -0.22, 0.11\nTrial B, -0.31, 0.14\nTrial C, 0.04, 0.19';
const ORDINARY_WANT = [['Trial A', -0.22, 0.11], ['Trial B', -0.31, 0.14], ['Trial C', 0.04, 0.19]];

// bayesian-ma and tsa read the last two fields as est, se, so a label may hold unquoted commas.
// cumulative-subgroup has optional trailing year / group columns, so its labels with commas
// are quoted (as its own bus loader writes them).
const CASES = [
  { app: 'bayesian-ma', input: 'Smith, 2020, 0.22, 0.11\nJones, J, -0.31, 0.14\nTrial C, 0.04, 0.19' },
  { app: 'tsa', input: 'Smith, 2020, 0.22, 0.11\nJones, J, -0.31, 0.14\nTrial C, 0.04, 0.19' },
  { app: 'cumulative-subgroup', input: '"Smith, 2020", 0.22, 0.11\n"Jones, J", -0.31, 0.14\nTrial C, 0.04, 0.19' },
];

async function receiptFor(page, app, input) {
  await page.goto('/' + app + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.TruthCertUI && window.MaStudies && document.getElementById('btn-truthcert'),
    { timeout: 15_000 });
  await page.evaluate((k) => window.TruthCertUI.setKey(k), KEY);
  await page.fill('#f-data', input);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45_000 }),
    page.locator('#btn-truthcert').click(),
  ]);
  const receipt = JSON.parse(readFileSync(await download.path(), 'utf-8'));
  const ok = await page.evaluate((r) => window.MaStudies.verifyTruthCert(r, { key: 'unit-test-signing-key-32bytes-min!!' }), receipt);
  expect(ok.valid).toBe(true);
  return receipt;
}

for (const { app, input } of CASES) {
  test.describe(app + ' TruthCert receipt', () => {
    test.setTimeout(120_000);

    test('a label containing a comma: the receipt signs the numbers the page analysed', async ({ page }) => {
      const receipt = await receiptFor(page, app, input);
      expect(receipt.studies.map(s => [s.label, s.est, s.se])).toEqual(WANT);
      expect(receipt.studies.some(s => s.est === 2020)).toBe(false);
      // The page's own analysed set (what "Verify in R" hands on) is the same.
      const analysed = await page.evaluate(() => window.__almValidatorStudies().map(s => [s.label, s.est, s.se]));
      expect(analysed).toEqual(WANT);
    });

    test('ordinary input: the receipt is unchanged', async ({ page }) => {
      const receipt = await receiptFor(page, app, ORDINARY);
      expect(receipt.studies.map(s => [s.label, s.est, s.se, s.year, s.group])).toEqual(ORDINARY_WANT.map(r => [...r, null, null]));
    });
  });
}
