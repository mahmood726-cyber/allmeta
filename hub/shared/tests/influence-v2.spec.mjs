/**
 * Influence v2 (paper 11 upgrade): one test per usability fix / feature.
 * Run from hub/shared/tests:  npx playwright test influence-v2.spec.mjs --reporter=list
 * INF_PAGE (default index.html) lets the same spec be pointed at another copy of the page; run against the
 * pre-upgrade page it must FAIL (plant-the-defect evidence recorded in UPGRADE_RESULT.md).
 */
import { test, expect } from '@playwright/test';

const PAGE = '/influence/' + (process.env.INF_PAGE || 'index.html');
const BCG_REF_MU = -0.7145323421581395; // metafor 5.2-1, dat.bcg::RR (archive reference.json)

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window._almLastDiag === 'function' && document.querySelectorAll('#body tr').length > 0);
  return errors;
}
async function enter(page, text) {
  await page.locator('#src').fill(text);
  await page.locator('#btn-run').click();
}
const fmt = (x, d) => Number.isFinite(x) ? x.toFixed(d) : '—';
const FIVE = '0.10, 0.10, A\n0.30, 0.12, B\n0.25, 0.08, C\n0.90, 0.10, D\n0.15, 0.09, E';

test('U1: "Try with: BCG" loads 13 trials and analyses them (not the default example)', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-alm-hero]').selectOption('bcg');
  await expect(page.locator('#body tr')).toHaveCount(14);
  await expect(page.locator('#body tr').first()).toContainText('Aronson 1948');
  const mu = await page.evaluate(() => window._almLastInfluence().mu);
  // Canonical dataset stores yi/vi to 4 dp, so agreement with metafor's full-precision fit is ~1e-5, not 1e-9.
  expect(Math.abs(mu - BCG_REF_MU)).toBeLessThan(1e-4);
  await expect(page.locator('#input-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('U2: garbage input is refused with line numbers and old results are cleared', async ({ page }) => {
  await open(page);
  await enter(page, 'hello, world\n0.2, 0.1, ok\nfoo');
  await expect(page.locator('#input-error')).toBeVisible();
  await expect(page.locator('#input-error')).toContainText('line 1');
  await expect(page.locator('#input-error')).toContainText('line 3');
  await expect(page.locator('#body tr')).toHaveCount(0);
  await expect(page.locator('#loo-plot > *')).toHaveCount(0);
  await expect(page.locator('#model-body tr')).toHaveCount(0);
  await expect(page.locator('#analysis-status')).toBeHidden();
  expect(await page.evaluate(() => window._almLastInfluence())).toBeNull();
});

test('U2: SE <= 0 and European decimals are refused, not silently dropped or mis-parsed', async ({ page }) => {
  await open(page);
  await enter(page, FIVE + '\n0.2, 0, F');
  await expect(page.locator('#input-error')).toContainText('line 6: SE must be greater than 0');
  await expect(page.locator('#body tr')).toHaveCount(0);
  await enter(page, '0,1; 0,2; A\n0,3; 0,1; B\n0,2; 0,1; C');
  await expect(page.locator('#input-error')).toContainText("use commas between fields and '.' as the decimal point");
  await expect(page.locator('#body tr')).toHaveCount(0);
  // Control: the same five valid rows alone are accepted.
  await enter(page, FIVE);
  await expect(page.locator('#input-error')).toBeHidden();
  await expect(page.locator('#body tr')).toHaveCount(6);
});

test('U2: fewer than three studies gives a clear message', async ({ page }) => {
  await open(page);
  await enter(page, '0.2, 0.1, A\n0.3, 0.1, B');
  await expect(page.locator('#input-error')).toContainText('At least 3 studies are needed');
  await enter(page, '');
  await expect(page.locator('#input-error')).toContainText('No studies entered');
});

test('U4: full-model summary shows tau2, I2, CI and p equal to the engine at displayed precision', async ({ page }) => {
  await open(page);
  const f = await page.evaluate(() => window._almLastInfluence());
  const text = await page.locator('#model-body').textContent();
  for (const s of [fmt(f.mu, 4), fmt(f.seMu, 4), fmt(f.ciLo, 4), fmt(f.ciHi, 4), fmt(f.tau2, 4), fmt(f.I2, 1), fmt(f.Q, 3), String(f.k)]) expect(text).toContain(s);
  expect(text).toMatch(/τ²/); expect(text).toMatch(/I²/);
});

test('U7: influential studies are marked in text, not colour only', async ({ page }) => {
  await open(page);
  const flagged = await page.locator('#body tr.flag').count();
  expect(flagged).toBeGreaterThan(0);
  await expect(page.locator('#body td.infl-yes')).toHaveCount(flagged);
  await expect(page.locator('#body tr.flag td.infl-yes')).toHaveCount(flagged);
  await expect(page.locator('#body td.infl-yes').first()).toContainText('Yes');
  // Influence plot: flagged points are diamonds (path), others circles.
  await expect(page.locator('#influence-plot g[data-i] path')).toHaveCount(flagged);
});

test('U3: per-study CSV and JSON carry every displayed column, one row per study', async ({ page }) => {
  await open(page);
  const { csv, json, k } = await page.evaluate(() => ({ csv: window.__almInfluenceStudyCsv(), json: window.__almResults(), k: window._almLastDiag().length }));
  const lines = csv.trim().split(/\r?\n/);
  expect(lines.length).toBe(k + 1);
  for (const c of ['dffits', 'cov_ratio', 'weight_percent', 'influential', 'dfbetas', 'loo_ci_lb', 'loo_tau2', 'loo_I2', 'loo_Qp']) expect(lines[0].split(',')).toContain(c);
  expect(json.studies.length).toBe(k);
  const d = await page.evaluate(() => window._almLastDiag()[0]);
  expect(json.studies[0].dffits).toBe(d.dffits);
  expect(json.studies[0].cov_ratio).toBe(d.covRatio);
  expect(json.tau2).toBe((await page.evaluate(() => window._almLastInfluence())).tau2);
  expect(json.I2).toBeGreaterThan(0);
});

test('U5: axis controls change the leave-one-out plot domain; log is disabled', async ({ page }) => {
  await open(page);
  const before = await page.locator('#loo-plot').innerHTML();
  await page.locator('#alm-axis-mount input[data-edge="min"]').fill('-1');
  await page.locator('#alm-axis-mount input[data-edge="min"]').dispatchEvent('change');
  await page.locator('#alm-axis-mount input[data-edge="max"]').fill('2');
  await page.locator('#alm-axis-mount input[data-edge="max"]').dispatchEvent('change');
  const after = await page.locator('#loo-plot').innerHTML();
  expect(after).not.toBe(before);
  expect(after).toContain('>-1.00<');
  expect(after).toContain('>2.00<');
  await expect(page.locator('#alm-axis-mount input[data-edge="log"]')).toBeDisabled();
});

test('E1: ticking Exclude re-pools without that study and equals its leave-one-out fit', async ({ page }) => {
  await open(page);
  const i = 5;
  await page.locator('#body input.excl').nth(i).check();
  const { ex, d } = await page.evaluate(i => ({ ex: window._almLastExclusion(), d: window._almLastDiag()[i] }), i);
  expect(ex.excluded).toEqual([i]);
  expect(ex.kept.k).toBe(ex.full.k - 1);
  // Same engine path as leave-one-out: identical doubles.
  expect(ex.kept.mu).toBe(d.loo_mu); expect(ex.kept.seMu).toBe(d.loo_seMu); expect(ex.kept.tau2).toBe(d.loo_tau2);
  await expect(page.locator('#model-summary thead th.excl-col').first()).toBeVisible();
  await expect(page.locator('#model-body')).toContainText(fmt(d.loo_mu, 4));
  await expect(page.locator('#body tr').nth(i)).toHaveClass(/excluded/);
  for (const id of ['loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot']) {
    await expect(page.locator(`#${id} g[data-i="${i}"]`)).toHaveAttribute('opacity', '0.22');
    await expect(page.locator(`#${id} g[data-i="0"]`)).toHaveAttribute('opacity', '1'); // control: others not dimmed
  }
  await page.locator('#body input.excl').nth(i).uncheck();
  expect((await page.evaluate(() => window._almLastExclusion())).excluded).toEqual([]);
  await expect(page.locator('#model-summary thead th.excl-col').first()).toBeHidden();
});

test('E1: "Exclude all flagged" excludes exactly the flagged studies; too few retained is refused', async ({ page }) => {
  await open(page);
  await page.locator('#btn-excl-flagged').click();
  const ex = await page.evaluate(() => window._almLastExclusion());
  const flagged = await page.evaluate(() => window._almLastDiag().map((d, i) => d.influential ? i : -1).filter(i => i >= 0));
  expect(flagged.length).toBeGreaterThan(0);
  expect(ex.excluded).toEqual(flagged);
  expect(ex.kept.k).toBe(ex.full.k - flagged.length);
  await page.locator('#btn-excl-clear').click();
  await enter(page, FIVE);
  for (const n of [0, 1, 2]) await page.locator('#body input.excl').nth(n).check();
  await expect(page.locator('#excl-msg')).toContainText('Cannot re-pool');
  expect((await page.evaluate(() => window._almLastExclusion())).kept).toBeNull();
});

test('E1: interpretation sentence numbers equal the engine values at displayed precision', async ({ page }) => {
  await open(page);
  await page.locator('#btn-excl-flagged').click();
  const ex = await page.evaluate(() => window._almLastExclusion());
  const s = await page.locator('#excl-sentence').innerText();
  const nums = (s.match(/-?\d+\.\d+/g) || []);
  const expected = [ex.full.mu, ex.full.ciLo, ex.full.ciHi, ex.kept.mu, ex.kept.ciLo, ex.kept.ciHi].map(x => fmt(x, 4))
    .concat([ex.full.tau2, ex.kept.tau2].map(x => (x !== 0 && Math.abs(x) < 0.001) ? x.toExponential(2) : fmt(x, 4)), [ex.full.I2, ex.kept.I2].map(x => fmt(x, 1)));
  expect(nums).toEqual(expected);
  expect(s).toContain(`Excluding ${ex.excluded.length} of ${ex.full.k} studies`);
  expect(s).not.toMatch(/caus|wrong data|should be removed/i);
});

test('E1: "Re-run diagnostics on retained studies" recomputes on the retained studies only', async ({ page }) => {
  await open(page);
  const original = await page.locator('#src').inputValue();
  await page.locator('#body input.excl').nth(0).check();
  await page.locator('#btn-excl-apply').click();
  await expect(page.locator('#body tr')).toHaveCount(10); // 9 retained + pooled row
  expect(await page.locator('#src').inputValue()).not.toBe(original);
});

test('E2: leave-one-out heterogeneity and DFBETAS columns are available via one toggle', async ({ page }) => {
  await open(page);
  const th = page.locator('#diag-table thead th', { hasText: 'LOO τ²' });
  await expect(th).toBeHidden();
  await page.locator('#btn-more-cols').click();
  await expect(th).toBeVisible();
  await expect(page.locator('#btn-more-cols')).toHaveAttribute('aria-pressed', 'true');
  const d = await page.evaluate(() => window._almLastDiag()[0]);
  await expect(page.locator('#body tr').first()).toContainText(fmt(d.loo_I2, 1));
  await expect(page.locator('#body tr').first()).toContainText(fmt(d.dfbetas, 3));
});

test('E3: R script embeds the data and app values, and downloads as influence-analysis.R', async ({ page }) => {
  await open(page);
  const s = await page.evaluate(() => window.__almInfluenceRScript());
  const d = await page.evaluate(() => window._almLastDiag());
  expect(s).toContain('library(metafor)');
  expect(s).toContain(String(d[0].te));
  expect(s).toContain('"inf.dffits" = list(app = c(' + d.map(x => String(x.dffits)).join(', ') + ')');
  expect(s).toContain('ALL %d/%d app values reproduced');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-rscript').click()]);
  expect(dl.suggestedFilename()).toBe('influence-analysis.R');
});

test('A11y: caption, scoped headers, labelled checkboxes, SVG titles, labelled CSV box, 2px focus outline', async ({ page }) => {
  await open(page);
  await expect(page.locator('#diag-table caption')).toHaveCount(1);
  expect(await page.locator('#diag-table thead th:not([scope="col"])').count()).toBe(0);
  const labels = await page.locator('#body input.excl').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  expect(labels.every(l => /^Exclude .+ and re-pool$/.test(l))).toBe(true);
  for (const id of ['loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot']) await expect(page.locator(`#${id} > title`)).toHaveCount(1);
  await expect(page.locator('#alm-csv-mount textarea')).toHaveAttribute('aria-label', /CSV/);
  await page.locator('#src').focus(); await page.keyboard.press('Tab');
  const o = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { id: document.activeElement.id, w: s.outlineWidth, st: s.outlineStyle }; });
  expect(o.id).toBe('btn-run'); expect(o.st).toBe('solid'); expect(o.w).toBe('2px');
});

test('Mobile 390px: no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.cw + 1);
});
