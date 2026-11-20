/**
 * The signed TruthCert receipt and the bus "Save" must carry the studies the page analysed
 * (lane rcpt2, 2026-11-13; follow-up to lane rcpt / PR #551).
 *
 * Root cause pinned here: gosh-metareg and pet-peese wired the receipt button with
 * { textarea: "#src", format: ... } and MaStudies.attachButtons with the same pair, so
 * shared/truthcert-ui.js and shared/ma-studies-v1.js re-read the input with
 * MaStudies.studiesFromTextarea, a different reader from the page's own parse:
 *  - gosh-metareg reads "effect, SE, moderator, label" but was wired as "est-se-label-mod"
 *    (effect, SE, label, moderator): every receipt and every bus save signed the moderator as
 *    the label and dropped the moderator; "Load from bus" wrote label into the moderator
 *    column, so the page dropped every loaded row.
 *  - pet-peese splits on commas OR whitespace and labels rows "Study i"; the shared reader
 *    splits on commas only, so a tab- or space-delimited paste the page analysed gave no
 *    receipt and saved nothing, and labels the page never read were signed.
 * Deliberately artificial fixtures, not research observations.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test truthcert-receipt-page-studies-2.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const KEY = 'unit-test-signing-key-32bytes-min!!';

async function open(page, app) {
  await page.goto('/' + app + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.TruthCertUI && window.MaStudies && document.getElementById('btn-truthcert'),
    { timeout: 15_000 });
  await page.evaluate((k) => { window.TruthCertUI.setKey(k); window.MaStudies.clear(); }, KEY);
}
async function runWith(page, input, waitFor) {
  await page.fill('#src', input);
  await page.locator('#btn-run').click();
  await page.waitForFunction(waitFor, null, { timeout: 30_000 });
}
async function receipt(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45_000 }),
    page.locator('#btn-truthcert').click(),
  ]);
  const r = JSON.parse(readFileSync(await download.path(), 'utf-8'));
  const ok = await page.evaluate((x) => window.MaStudies.verifyTruthCert(x, { key: 'unit-test-signing-key-32bytes-min!!' }), r);
  expect(ok.valid).toBe(true);
  return r.studies;
}
async function noReceipt(page) {
  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  await page.locator('#btn-truthcert').click();
  await page.waitForTimeout(1500);
  expect(downloaded).toBe(false);
}
async function busSave(page) {
  await page.evaluate(() => window.MaStudies.clear());
  await page.locator('#btn-bus-save').click();
  await page.waitForTimeout(300);
  return page.evaluate(() => window.MaStudies.read());
}

test.describe('gosh-metareg: receipt and bus carry effect, SE, moderator, label as the page reads them', () => {
  test.setTimeout(120_000);
  const INPUT = '0.22, 0.11, 1, Smith\n-0.31, 0.14, 2, Jones\n0.04, 0.19, 3, Trial C\n0.10, 0.20, 4, Trial D\n-0.05, 0.12, 5, Trial E';
  const WANT = [['Smith', 0.22, 0.11, 1], ['Jones', -0.31, 0.14, 2], ['Trial C', 0.04, 0.19, 3], ['Trial D', 0.10, 0.20, 4], ['Trial E', -0.05, 0.12, 5]];
  const done = () => window.__almLastMetaregGosh && window.__almLastMetaregGosh() && window.__almLastMetaregGosh().k === 5;
  const rows = (s) => s.map(x => [x.label, x.est, x.se, x.moderator]);

  test('the receipt signs the moderator as the moderator, not as the label', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT, done);
    const analysed = await page.evaluate(() => window.__almValidatorStudies().map(s => [s.label, s.est, s.se, s.mod]));
    expect(analysed).toEqual(WANT);
    const signed = await receipt(page);
    expect(rows(signed)).toEqual(WANT);
    expect(signed.every(s => s.year === null)).toBe(true);
  });

  test('a row the page refuses is not signed, and an input the page refuses gives no receipt', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT + '\n0.30, abc, 6, Bad row', done);
    expect(rows(await receipt(page))).toEqual(WANT);
    // Refused RUN (k < 3), not just an un-run edit (lane fix556, agy finding on PR #556).
    await page.fill('#src', '0.22, 0.11, 1, Smith\n-0.31, 0.14, 2, Jones');
    await page.locator('#btn-run').click();
    await noReceipt(page);
  });

  // Lane fix556: the receipt signed a live re-parse of #src, so an edit that was never run
  // (3..18 valid rows) was signed against the earlier analysis.
  test('an edit that was never run is not signed: the receipt is the analysed set', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT, done);
    await page.fill('#src', '0.50, 0.10, 9, New A\n0.40, 0.10, 8, New B\n0.30, 0.10, 7, New C\n0.20, 0.10, 6, New D');
    expect(rows(await receipt(page))).toEqual(WANT);
  });

  test('a run the page refuses (no subset meets min k) gives no receipt', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT, done);
    await page.fill('#min-k', '10');
    await page.fill('#src', INPUT + '\n0.01, 0.10, 6, Trial F');
    await page.locator('#btn-run').click();
    await page.waitForFunction(() => /No subsets/.test(document.getElementById('m-n').textContent), null, { timeout: 30_000 });
    await noReceipt(page);
  });

  // Lane fix556 (agy finding on PR #556): bus studies that all lack a moderator wiped #src
  // and re-ran on an empty box, destroying the current analysis while loading nothing.
  test('load from a bus with no usable moderator leaves the current input and analysis alone', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT, done);
    await page.evaluate(() => window.MaStudies.write([{ label: 'P', est: 0.1, se: 0.1 }, { label: 'Q', est: 0.2, se: 0.1 }, { label: 'R', est: 0.3, se: 0.1 }]));
    await page.locator('#btn-bus-load').click();
    await page.waitForTimeout(500);
    expect(await page.inputValue('#src')).toBe(INPUT);
    const analysed = await page.evaluate(() => window.__almValidatorStudies().map(s => [s.label, s.est, s.se, s.mod]));
    expect(analysed).toEqual(WANT);
  });

  test('bus save stores what the page read, and load from bus gives the page those rows back', async ({ page }) => {
    await open(page, 'gosh-metareg');
    await runWith(page, INPUT, done);
    const saved = await busSave(page);
    expect(rows(saved)).toEqual(WANT);
    await page.fill('#src', '');
    await page.locator('#btn-bus-load').click();
    await page.waitForFunction(done, null, { timeout: 30_000 });
    const analysed = await page.evaluate(() => window.__almValidatorStudies().map(s => [s.label, s.est, s.se, s.mod]));
    expect(analysed).toEqual(WANT);
  });
});

test.describe('pet-peese: receipt and bus carry the rows the page fitted', () => {
  test.setTimeout(120_000);
  const WANT = [['Study 1', 0.22, 0.11], ['Study 2', -0.31, 0.14], ['Study 3', 0.04, 0.19], ['Study 4', 0.10, 0.20], ['Study 5', -0.05, 0.12]];
  const done = () => window.__almValidatorStudies && window.__almValidatorStudies().length === 5;
  const rows = (s) => s.map(x => [x.label, x.est, x.se]);

  test('a tab-delimited paste the page analysed is signed and saved', async ({ page }) => {
    await open(page, 'pet-peese');
    await runWith(page, '0.22\t0.11\n-0.31\t0.14\n0.04\t0.19\n0.10\t0.20\n-0.05\t0.12', done);
    expect(rows(await receipt(page))).toEqual(WANT);
    expect(rows(await busSave(page))).toEqual(WANT);
  });

  test('ordinary comma input: the receipt is the fitted rows', async ({ page }) => {
    await open(page, 'pet-peese');
    await runWith(page, '0.22, 0.11\n-0.31, 0.14\n0.04, 0.19\n0.10, 0.20\n-0.05, 0.12\n0.30, abc', done);
    const analysed = await page.evaluate(() => window.__almValidatorStudies().map(s => [s.label, s.est, s.se]));
    expect(analysed).toEqual(WANT);
    expect(rows(await receipt(page))).toEqual(WANT);
  });

  test('fewer than 3 studies (the page refuses): no receipt', async ({ page }) => {
    await open(page, 'pet-peese');
    await page.fill('#src', '0.22, 0.11\n-0.31, 0.14');
    await page.locator('#btn-run').click();
    await noReceipt(page);
  });
});
