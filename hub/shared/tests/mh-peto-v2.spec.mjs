// mh-peto v2 requirement tests: input integrity, not-estimable rows, zero-cell statement,
// heterogeneity / CMH / Tarone / Breslow-Day panel (against the archived metafor 5.2-1 reference),
// forest x-axis, one-click example, self-checking R-script export, phone width and accessibility.
//
// Plant-the-defect: set MH_PETO_INDEX_UNDER_TEST to a copy of the pre-v2 mh-peto/index.html; the
// requirement tests below must then FAIL (silent drop, truncation, no axis, no panel, no export).
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const url = '/mh-peto/index.html';
const require = createRequire(import.meta.url);
const reference = JSON.parse(await readFile(new URL('../../../mh-peto/validate/corpus/reference.json', import.meta.url), 'utf8'));
const ref = id => reference.find(r => r.id === id);
const close = (a, b, tol = 1e-9, absolute = false) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) / (absolute ? 1 : Math.max(1, Math.abs(b))) <= tol);

test.beforeEach(async ({ page }) => {
  if (process.env.MH_PETO_INDEX_UNDER_TEST) {
    const body = await readFile(process.env.MH_PETO_INDEX_UNDER_TEST, 'utf8');
    await page.route('**/mh-peto/index.html', route => route.fulfill({ contentType: 'text/html', body }));
  }
});

async function enter(page, text) {
  await page.locator('#src').fill(text);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
}

test.describe('input integrity (no silent drop, no truncation)', () => {
  const cases = [
    ['non-numeric count', 'A, x, 100, 5, 100\nB,1,10,2,10\nC,1,10,2,10', /Line 1 \(A\): e1 = "x" is not a whole number/],
    ['decimal count is refused, not truncated', 'A,2.7,100,5,100\nB,1,10,2,10', /Line 1 \(A\): e1 = "2\.7" is not a whole number \(decimals are not rounded or truncated\)/],
    ['events larger than total', 'A,1,10,2,10\nB,11,10,2,10', /Line 2 \(B\): e1 \(11\) is larger than n1 \(10\)/],
    ['zero total', 'A,0,0,2,10\nB,1,10,2,10', /Line 1 \(A\): n1 must be at least 1/],
    ['negative count', 'A,-1,10,2,10\nB,1,10,2,10', /e1 = "-1" is not a whole number \(negative\)/],
    ['wrong number of fields', 'A,1,10,2\nB,1,10,2,10\nC,1,10,2,10', /Line 1: expected 5 values .* found 4/],
    ['unclosed quote', '"Smith, 2001, 1, 10, 2, 10\nB,1,10,2,10', /Line 1: line has an opening double quote with no closing quote/],
  ];
  for (const [name, text, message] of cases) {
    test(name, async ({ page }) => {
      await page.goto(url);
      await enter(page, text);
      const box = page.locator('#input-errors');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('role', 'alert');
      await expect(box).toContainText('No analysis was run');
      await expect(box).toContainText(message);
      await expect(page.locator('#src')).toHaveAttribute('aria-invalid', 'true');
      expect(await page.evaluate(() => window._almLastMhPeto())).toBeNull();
      await expect(page.locator('#pooled-body tr')).toHaveCount(0);
      await expect(page.locator('#analysis-status')).toBeHidden();
    });
  }
  test('every invalid line is listed; fixing the input clears the error state', async ({ page }) => {
    await page.goto(url);
    await enter(page, 'A,1,10,2,10\nB,1.5,10,2,10\nC,1,10,2,10\nD,5,4,2,10');
    await expect(page.locator('#input-errors li')).toHaveCount(2);
    await expect(page.locator('#input-errors')).toContainText('Line 2 (B)');
    await expect(page.locator('#input-errors')).toContainText('Line 4 (D)');
    await enter(page, 'A,1,10,2,10\nB,1,10,2,10\nC,1,10,2,10');
    await expect(page.locator('#input-errors')).toBeHidden();
    await expect(page.locator('#src')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#k-note')).toContainText('3 tables entered and pooled');
    expect((await page.evaluate(() => window._almLastMhPeto())).k).toBe(3);
  });
  test('header row, tab/semicolon delimiters and quoted labels are read, and the header is reported', async ({ page }) => {
    await page.goto(url);
    await enter(page, 'study,e1,n1,e2,n2\n"Smith, 2001"\t3\t50\t4\t50\nJones;1;10;2;10');
    await expect(page.locator('#input-errors')).toBeHidden();
    await expect(page.locator('#k-note')).toContainText('2 tables entered and pooled (Line 1 looks like a header row and was ignored.)');
    await expect(page.locator('#per-body')).toContainText('Smith, 2001');
    const r = await page.evaluate(() => window._almLastMhPeto());
    expect(r.k).toBe(2);
    // Hand-computed MH OR for these two tables: (3*46/100 + 1*8/20) / (47*4/100 + 9*2/20).
    expect(Math.abs(r.mh_est - (3 * 46 / 100 + 1 * 8 / 20) / (47 * 4 / 100 + 9 * 2 / 20))).toBeLessThan(1e-12);
  });
});

test.describe('estimability and zero cells are stated, never silent', () => {
  test('MH OR not estimable is a row with a reason; Peto still shown; export keeps null', async ({ page }) => {
    await page.goto(url);
    await enter(page, 'A,0,10,3,10\nB,0,10,4,10');
    const mhRow = page.locator('#pooled-body tr', { hasText: 'MH OR' });
    await expect(mhRow).toContainText('not estimable: every study has either no events in group one');
    await expect(page.locator('#pooled-body tr', { hasText: 'Peto OR' })).toContainText('0.099');
    await expect(page.locator('#estimability-note')).toContainText('MH OR is not estimable');
    const r = await page.evaluate(() => window._almLastMhPeto());
    expect(r.mh_est).toBeNull();
    expect(r.peto_est).not.toBeNull();
    expect(r.mh_QE).toBeNull();
  });
  test('all double-zero tables: both methods explained, heterogeneity not reported', async ({ page }) => {
    await page.goto(url);
    await enter(page, 'A,0,10,0,10\nB,0,12,0,9');
    await expect(page.locator('#pooled-body tr.not-estimable')).toHaveCount(2);
    await expect(page.locator('#pooled-body')).toContainText('no study has an event in either group');
    await expect(page.locator('#het-body tr.not-estimable')).toHaveCount(2);
    await expect(page.locator('#fragility-note')).not.toContainText('undefined');
    await expect(page.locator('#k-note')).toContainText('2 with no events (or no non-events) in both groups');
  });
  test('RR with no events in group one is explained', async ({ page }) => {
    await page.goto(url);
    await page.selectOption('#measure', 'RR');
    await enter(page, 'A,0,10,3,10\nB,0,10,4,10');
    await expect(page.locator('#pooled-body')).toContainText('MH RR');
    await expect(page.locator('#pooled-body')).toContainText('not estimable: no study has an event in group one');
  });
  test('zero-cell handling is stated, including the meta::metabin difference', async ({ page }) => {
    await page.goto(url);
    const note = page.locator('#zero-note');
    await expect(note).toContainText('no continuity correction');
    await expect(note).toContainText('metafor rma.mh / rma.peto');
    await expect(note).toContainText('MH.exact = TRUE');
    await expect(note).toContainText('add 0.5 to every cell of a table that contains a zero');
    await page.selectOption('#measure', 'RD');
    await expect(note).toContainText('risk differences use the uncorrected counts');
  });
});

test.describe('heterogeneity, CMH, Tarone and Breslow-Day (metafor 5.2-1 reference)', () => {
  test('one click loads the paper example and every exported statistic matches the archived reference', async ({ page }) => {
    await page.goto(url);
    await page.getByRole('button', { name: /Load example: Yusuf 1985/ }).click(); // click 1 of <= 3
    await expect(page.locator('#pooled-body tr', { hasText: 'MH OR' })).toContainText('0.933');
    await expect(page.locator('#pooled-body tr', { hasText: 'MH OR' })).toContainText('[0.739, 1.179]');
    await expect(page.locator('#pooled-body tr', { hasText: 'Peto OR' })).toContainText('[0.738, 1.179]');
    const base = 'dat.yusuf1985|binary|6|';
    const checks = [];
    for (const measure of ['OR', 'RR', 'RD']) {
      await page.selectOption('#measure', measure);
      const r = await page.evaluate(() => window._almLastMhPeto());
      const m = ref(base + measure);
      checks.push([measure + ' est', r.mh_est, m.est], [measure + ' QE', r.mh_QE, m.QE], [measure + ' QEp', r.mh_QEp, m.QEp, true],
        [measure + ' I2', r.mh_I2, m.I2], [measure + ' H2', r.mh_H2, m.H2]);
      if (measure === 'OR') {
        const p = ref(base + 'PETO');
        checks.push(['CMH', r.cmh, m.MH], ['CMH p', r.cmh_p, m.MHp, true], ['Tarone', r.tarone, m.TA], ['Tarone p', r.tarone_p, m.TAp, true],
          ['Breslow-Day', r.breslow_day, m.BD], ['Breslow-Day p', r.breslow_day_p, m.BDp, true],
          ['Peto QE', r.peto_QE, p.QE], ['Peto QEp', r.peto_QEp, p.QEp, true], ['Peto I2', r.peto_I2, p.I2], ['Peto H2', r.peto_H2, p.H2]);
        await expect(page.locator('#het-body tr', { hasText: 'MH OR' })).toContainText('9.43 (20)');
        await expect(page.locator('#het-body tr', { hasText: 'Peto OR' })).toContainText('10.83 (17)');
        await expect(page.locator('#assoc-body')).toContainText('Tarone');
        await expect(page.locator('#assoc-body tr', { hasText: 'Tarone' })).toContainText('10.93');
      } else {
        await expect(page.locator('#assoc-body')).toContainText('Defined for the odds ratio only');
      }
    }
    const bad = checks.filter(([, a, b, abs]) => !close(a, b, 1e-9, !!abs)).map(([n, a, b]) => `${n}: ${a} vs ${b}`);
    expect(bad).toEqual([]);
    expect(checks.length).toBe(25); // 5 per measure x 3 + 6 association + 4 Peto heterogeneity
  });
  test('a planted Tarone error is caught by the same comparison', async () => {
    const m = ref('dat.yusuf1985|binary|6|OR');
    expect(close(m.TA * (1 + 1e-7), m.TA)).toBe(false);
    expect(close(m.TA * (1 + 1e-10), m.TA)).toBe(true);
  });
});

test.describe('outputs and wording', () => {
  test('forest plot has an x-axis with ticks and a measure label', async ({ page }) => {
    await page.goto(url);
    expect(await page.locator('#forest .forest-tick-label').count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#forest .forest-axis-label')).toHaveText('Odds ratio (log scale); dashed line: no difference');
    await expect(page.locator('#forest .forest-tick-label', { hasText: /^1$/ })).toHaveCount(1);
    await page.selectOption('#measure', 'RD');
    await expect(page.locator('#forest .forest-axis-label')).toHaveText('Risk difference; dashed line: no difference');
    await expect(page.locator('#per-effect-h')).toHaveText('RD');
    await page.selectOption('#measure', 'OR');
    await expect(page.locator('#per-effect-h')).toHaveText('OR (0.5 if zero cell)');
  });
  test('"Verify in R" button no longer implies an MH/Peto check', async ({ page }) => {
    await page.goto(url);
    const b = page.locator('#btn-verify-in-r');
    await expect(b).toHaveText('Open study effects in WebR (inverse-variance, not MH/Peto)');
    expect(await b.getAttribute('title')).toContain('NOT a check of the Mantel-Haenszel or Peto results');
  });
  test('self-checking R script: data, settings, page values and escaped labels', async ({ page }) => {
    await page.goto(url);
    await enter(page, '"He said ""hi"", 2001", 3, 50, 7, 52\nMüller\\x, 1, 40, 4, 41\nC, 0, 30, 2, 29');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export self-checking R script', exact: true }).click();
    const d = await download;
    expect(d.suggestedFilename()).toBe('mhpeto-check-OR.R');
    const text = await readFile(await d.path(), 'utf8');
    const r = await page.evaluate(() => window._almLastMhPeto());
    expect(text).toContain('study = c("He said \\"hi\\", 2001", "M\\u{fc}ller\\\\x", "C")');
    expect(text).toContain('ai = c(3, 1, 0)');
    expect(text).toContain('n1i = c(50, 40, 30)');
    expect(text).toContain('ci = c(7, 4, 2)');
    expect(text).toContain('n2i = c(52, 41, 29)');
    expect(text).toContain('add = c(0.5, 0), to = c("only0", "none"), drop00 = c(FALSE, FALSE), correct = FALSE');
    expect(text).toContain('rma.peto(ai = ai, bi = bi, ci = ci, di = di, data = dat, slab = study, add = 0, to = "none", drop00 = TRUE)');
    expect(text).toContain('`est` = ' + r.mh_est.toPrecision(17));
    expect(text).toContain('`TA` = ' + r.tarone.toPrecision(17));
    expect(text).toContain('`QE` = ' + r.peto_QE.toPrecision(17));
    expect(text).toContain('ALLMETA-CHECK');
    await page.selectOption('#measure', 'RD');
    const rd = await page.evaluate(() => window.__mhPetoRScript());
    expect(rd).toContain('measure <- "RD"');
    expect(rd).not.toContain('rma.peto');
    expect(rd).not.toContain('`TA`');
  });
  test('R script export is refused with a message when the input is invalid', async ({ page }) => {
    await page.goto(url);
    await enter(page, 'A,1,10,2,10\nB,x,10,2,10');
    expect(await page.evaluate(() => window.__mhPetoRScript())).toBeNull();
  });
  test('in-app validation names the invalid line', async ({ page }) => {
    await page.goto(url);
    await page.locator('#src').fill('A,1,10,2,10\nB,2.5,10,2,10');
    await page.getByRole('button', { name: 'Validate this analysis in R', exact: true }).click();
    await expect(page.locator('#alm-validate [role=status]')).toContainText('Input line 2');
  });
});

test.describe('usability and accessibility', () => {
  test('phone width 375 px: no horizontal scroll, results reachable by a link', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    const jump = page.locator('#jump-results');
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(page.locator('#results')).toBeInViewport();
  });
  test('labels, captions and live regions', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByLabel('Effect measure')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: /Studies/ })).toHaveId('src');
    for (const id of ['pooled', 'het', 'assoc', 'per-study']) await expect(page.locator('#' + id + ' caption')).toHaveCount(1);
    await expect(page.locator('#alm-csv-mount textarea')).toHaveAttribute('aria-label', /Paste CSV/);
    for (const id of ['k-note', 'estimability-note', 'fragility-note']) await expect(page.locator('#' + id)).toHaveAttribute('aria-live', 'polite');
    // Measure is reachable before the Run button in keyboard order.
    const order = await page.evaluate(() => { const all = [...document.querySelectorAll('select, textarea, button')]; return [all.indexOf(document.getElementById('measure')), all.indexOf(document.getElementById('btn-run'))]; });
    expect(order[0]).toBeLessThan(order[1]);
  });
  for (const scheme of ['light', 'dark']) {
    test(`axe-core: no WCAG violations (${scheme})`, async ({ page }) => {
      let path = process.env.AXE_PATH;
      if (!path) { try { path = require.resolve('axe-core/axe.min.js'); } catch { path = null; } }
      expect(path, 'axe-core not found: install hub/shared/tests dependencies or set AXE_PATH').toBeTruthy();
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await page.addScriptTag({ content: await readFile(path, 'utf8') });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ':' + v.nodes.length));
      expect(violations).toEqual([]);
    });
  }
});
