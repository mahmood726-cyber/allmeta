import { test, expect } from '@playwright/test';

// Requirement: the Heteroscedasticity card of the served Pairwise AI bundle (Cross-Disciplinary tab) shows
// the subgroup tau2 ESTIMATES -- the smallest, the largest and their ratio -- not a floor, and says when the
// ratio is not defined (lane pwrest, follow-up to #566).
// Defects guarded:
//  - heteroscedasticityTest set tau2_min = max(1e-4, min tau2), so a subgroup estimate of 3.0e-5 was shown
//    as "Min tau2 0.0001" and the ratio was max / 1e-4 (2400x instead of ~7994x); the card also printed
//    the estimates with toFixed(4), so 3.0e-5 read 0.0000.
//  - with fewer than two subgroups having tau2 > 0 the card showed "1.00x", "Min 0.0000", "Max 0.0000"
//    whatever the estimates were (e.g. max 0.24).
// Expected values: DerSimonian-Laird tau2 per subgroup, cross-checked against metafor 5.2.1
// rma(method = "DL") (lane pwrest scratch hetero_r.R): A 3.002250e-05, B 0.24, C 0.

const PATH = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';
const A = { yi: [-0.10015, 0, 0.10015], vi: [0.01, 0.01, 0.01] };   // DL tau2 = (Q - 2) / 200 = 3.00225e-5
const B = { yi: [-0.5, 0, 0.5], vi: [0.01, 0.01, 0.01] };           // DL tau2 = 0.24
const C = { yi: [0, 0, 0], vi: [0.01, 0.01, 0.01] };                // DL tau2 = 0

async function card(page, groups) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function');
  await page.evaluate(() => loadDemoDataset('BCG'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__prev = AppState.results; });
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => AppState.results && AppState.results.crossDisc && AppState.results !== window.__prev,
    null, { timeout: 30000 });
  return page.evaluate(groups => {
    const yi = [], vi = [], g = [];
    for (const [name, d] of Object.entries(groups)) d.yi.forEach((y, i) => { yi.push(y); vi.push(d.vi[i]); g.push(name); });
    const h = heteroscedasticityTest(yi, vi, g);
    AppState.results.crossDisc.heteroscedasticity = h;
    renderCrossDisciplinaryPanel(AppState.results);
    const cardEl = [...document.querySelectorAll('#panel-crossdisciplinary .card')].find(c => /Heteroscedasticity/.test(c.textContent));
    return { h, text: cardEl ? cardEl.innerText.replace(/\s+/g, ' ') : '' };
  }, groups);
}

test('the smallest subgroup tau2 is its estimate, not the 1e-4 floor', async ({ page }) => {
  test.setTimeout(60000);
  const { h, text } = await card(page, { A, B });
  expect(Math.abs(h.tau2_min - 3.00225e-5)).toBeLessThan(1e-12);
  expect(Math.abs(h.tau2_max - 0.24)).toBeLessThan(1e-12);
  expect(Math.abs(h.tau2_ratio - 0.24 / 3.00225e-5)).toBeLessThan(1e-6);
  expect(text).not.toContain('0.0001');
  expect(text).toContain('3.00e-5');
  expect(text).toContain('7994');
});

test('with one subgroup at tau2 = 0 the ratio is not defined and the max is still the estimate', async ({ page }) => {
  test.setTimeout(60000);
  const { h, text } = await card(page, { B, C });
  expect(h.tau2_min).toBe(0);
  expect(Math.abs(h.tau2_max - 0.24)).toBeLessThan(1e-12);
  expect(h.tau2_ratio).toBeNull();
  expect(text).not.toContain('1.00×');
  expect(text).toContain('0.2400');
  expect(text).toMatch(/not defined/);
});
