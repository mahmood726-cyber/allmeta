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

test('revman-importer lists elements the reader does not read and impossible dichotomous counts at read time', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  await page.goto(origin() + '/revman-importer/index.html');
  const status = page.locator('#status'), box = page.locator('#skipped-rows');

  // Gap 1: an OTHER_OUTCOME and an unrecognised element inside the comparison are reported, not dropped.
  await page.locator('#picker').setInputFiles(fixture('./fixtures/revman-gaps/unknown-element.rm5'));
  await expect(status).toHaveText('Parsed: 1 comparisons, 2 study rows. 3 rows not imported (listed under Review metadata).');
  await expect(status).toHaveClass('err');
  await expect(box.locator('li')).toHaveText([
    'Synthetic unknown-element comparison › Synthetic other data table, row 1, study Synthetic Unk Beta: OTHER_OUTCOME is not an outcome type this importer reads',
    'Synthetic unknown-element comparison › Synthetic other data table, row 2, study Synthetic Unk Gamma: OTHER_OUTCOME is not an outcome type this importer reads',
    'Synthetic unknown-element comparison › SYNTHETIC_NOTE: SYNTHETIC_NOTE element is not read by this importer',
  ]);
  await expect(page.locator('#preview-host tbody tr')).toHaveCount(2);
  await page.locator('#btn-push').click();
  await expect(page.locator('#push-status')).toContainText('2 studies pushed');
  await expect(page.locator('#push-status')).not.toContainText('skipped');

  // Gap 2: events > n, negative and non-whole counts are listed when the file is read; the push has nothing left to drop.
  await page.locator('#picker').setInputFiles(fixture('./fixtures/revman-gaps/dich-counts.rm5'));
  await expect(status).toHaveText('Parsed: 1 comparisons, 2 study rows. 5 rows not imported (listed under Review metadata).');
  await expect(box.locator('li')).toHaveText([
    'Synthetic count comparison › Synthetic dichotomous events, row 3, study Synthetic Cnt Gamma: EVENTS_1 exceeds TOTAL_1 (31 > 30)',
    'Synthetic count comparison › Synthetic dichotomous events, row 4, study Synthetic Cnt Delta: EVENTS_2 must be a whole number >= 0 (is -2)',
    'Synthetic count comparison › Synthetic dichotomous events, row 5, study Synthetic Cnt Epsilon: EVENTS_1 must be a whole number >= 0 (is 2.5)',
    'Synthetic count comparison › Synthetic dichotomous events, row 6, study Synthetic Cnt Zeta: TOTAL_2 must be a whole number > 0 (is 0)',
    'Synthetic count comparison › Synthetic dichotomous events, row 7, study Synthetic Cnt Eta: TOTAL_1 must be a whole number > 0 (is 40.5); EVENTS_2 exceeds TOTAL_2 (45 > 44)',
  ]);
  await expect(page.locator('#preview-host tbody tr')).toHaveCount(2);
  await page.locator('#btn-push').click();
  await expect(page.locator('#push-status')).toContainText('2 studies pushed');
  await expect(page.locator('#push-status')).toContainText('5 rows of this outcome not imported from the file');
  await expect(page.locator('#push-status')).not.toContainText('skipped (incomplete or impossible counts)');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ma-comparisons-v1') || 'null'));
  expect(stored.studies.map(s => [s.id, s.arms.map(a => [a.events, a.n])])).toEqual([
    ['STD-Cnt-A', [[4, 40], [9, 42]]], ['STD-Cnt-B', [[0, 55], [13, 53]]]]);
  expect(errors).toEqual([]);
});

test('PLANTED: file text in the O-E/IPD "Not pushed" message is shown literally and never parsed as HTML', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  await page.goto(origin() + '/revman-importer/index.html');
  // <EFFECT_MEASURE> child text is read from the file (and upper-cased); numeric character references survive upper-casing.
  const handler = [...'window.__rv249xss=1'].map(c => '&amp;#' + c.charCodeAt(0) + ';').join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><COCHRANE_REVIEW><STUDIES><STUDY ID="x1" NAME="Synthetic X" YEAR="2020"/></STUDIES>' +
    '<ANALYSES_AND_DATA><COMPARISON ID="c1" NAME="Synthetic IPD only"><IPD_OUTCOME NAME="Synthetic time to event">' +
    '<EFFECT_MEASURE>&lt;img src=x onerror=' + handler + '&gt;</EFFECT_MEASURE><IPD_DATA STUDY_ID="x1" O_E="-1" VAR="4"/>' +
    '</IPD_OUTCOME></COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>';
  await page.locator('#picker').setInputFiles({ name: 'planted-markup.rm5', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.locator('#status')).toHaveText('Parsed: 1 comparisons, 1 study rows.');
  await page.locator('#btn-push').click();
  const push = page.locator('#push-status');
  await expect(push).toContainText('Not pushed.');
  await expect(push).toContainText('(<IMG SRC=X ONERROR=&#119;&#105;&#110;');
  await expect(push.locator('img')).toHaveCount(0);
  expect(await push.evaluate(n => n.querySelectorAll('[onerror]').length)).toBe(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__rv249xss)).toBeUndefined();
  expect(errors).toEqual([]);
});
