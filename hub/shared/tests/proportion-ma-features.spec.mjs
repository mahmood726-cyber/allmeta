// Feature coverage for paper 9 (proportion-ma): CSV export, plot export (PNG 600 / PDF / TIFF tags),
// and the double-arcsine back-transformation caution. Positives + planted negatives.
import { test, expect } from '@playwright/test';
import { checkCsvAgainstPage, downloadCsv, exportEveryPlot, exportNegatives, fail } from './features-helpers.mjs';

const APP = '/proportion-ma/index.html';

async function load(page, trans = 'logit', tau = 'PM') {
  await page.goto(APP);
  await page.locator('#trans').selectOption(trans);
  await page.locator('#tau-est').selectOption(tau);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await page.waitForFunction(([t, e]) => { const r = window._almLastPropMA && window._almLastPropMA(); return r && r.transform === t && r.tauEstimator === e; }, [trans, tau]);
}

async function displayedNumbers(page) {
  const pooled = await page.locator('#res-body tr.pooled-row').evaluate(tr => [...tr.cells].map(c => c.textContent.trim()));
  const het = await page.locator('#het').textContent();
  const pct = s => (s.match(/^(-?[\d.]+)%$/) || fail('not a percentage: ' + s))[1];
  const [lo, hi] = pooled[3].split(' – ');
  const out = [
    { key: 'poolP', text: pct(pooled[2]), digits: 1, scale: 100 },
    { key: 'poolLo', text: pct(lo), digits: 1, scale: 100 }, { key: 'poolHi', text: pct(hi), digits: 1, scale: 100 },
    { key: 'tau2', text: het.match(/τ² = (\S+)/)[1], digits: 4 },
    { key: 'Q', text: het.match(/Q = (\S+)/)[1], digits: 2 },
    { key: 'df', text: het.match(/df=(\d+)/)[1], digits: 0 },
    { key: 'i2', text: het.match(/I² = (\S+)%/)[1], digits: 1 },
  ];
  const pi = het.match(/prediction interval = (\S+)% – (\S+)%/);
  if (pi) out.push({ key: 'poolPiLo', text: pi[1], digits: 1, scale: 100 }, { key: 'poolPiHi', text: pi[2], digits: 1, scale: 100 });
  return out;
}

test('proportion CSV export: header and every value equal the page results and the printed table', async ({ page }) => {
  for (const [trans, tau] of [['logit', 'PM'], ['ft', 'PM'], ['raw', 'DL']]) {
    await load(page, trans, tau);
    const { name, text } = await downloadCsv(page);
    expect(name).toBe('propma-results.csv');
    const results = await page.evaluate(() => window._almLastPropMA());
    const shown = await displayedNumbers(page);
    expect(shown.length).toBe(9);
    checkCsvAgainstPage(text, results, shown);
    expect(() => checkCsvAgainstPage(text.replace(/^key,value/, 'key,v'), results, shown)).toThrow(/header/);
    expect(() => checkCsvAgainstPage(text.replace('poolP,' + results.poolP, 'poolP,' + (results.poolP + 0.002)), results, shown)).toThrow(/poolP/);
    expect(() => checkCsvAgainstPage(text, results, shown.map(d => d.key === 'Q' ? { ...d, text: (Number(d.text) + 0.01).toFixed(2) } : d))).toThrow(/ Q=/);
  }
});

test('proportion plot selector: every plot as PNG 600 dpi, PDF and TIFF 300/600 (LZW, RGB)', async ({ page }) => {
  test.setTimeout(180_000);
  await load(page, 'ft', 'PM');
  const { names, log, last } = await exportEveryPlot(page, expect);
  expect(names).toEqual(['Forest plot']);
  expect(log.length).toBe(5);
  exportNegatives(last, expect);
});

// The caution sits in the input panel next to the transformation selector. Visible text of that panel
// is what a user sees while choosing options (the footer method notes are a separate, static section).
const CAUTION = /back-?\)?-?\s?transformation[\s\S]{0,200}seriously misleading/i;
async function inputPanelText(page) {
  return page.locator('section.panel').filter({ has: page.locator('#trans') }).innerText();
}

test('double-arcsine caution is visible when Freeman-Tukey is selected', async ({ page }) => {
  await load(page, 'ft', 'PM');
  const text = await inputPanelText(page);
  expect(text).toMatch(CAUTION);
  expect(text).toMatch(/Schwarzer/);
  // The check can fail: the same pattern does not match text without the caution.
  expect(text.replace(/seriously misleading/g, '')).not.toMatch(CAUTION);
});

test('double-arcsine caution is NOT shown when logit or raw is selected', async ({ page }) => {
  // KNOWN GAP (lane fc, 19 Oct 2026): the caution is a static <span class="hint"> under the selector, so
  // it is shown for every transformation, not only for FT. Remove test.fail() once it is made conditional.
  test.fail();
  for (const trans of ['logit', 'raw']) {
    await load(page, trans, 'PM');
    expect(await inputPanelText(page), trans).not.toMatch(CAUTION);
  }
});
