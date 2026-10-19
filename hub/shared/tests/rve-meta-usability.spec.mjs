/**
 * rve-meta usability fixes (paper-15 upgrade plan, defects D1–D18) plus the two
 * new features: the conditioning (kappa) warning with one-click centring, and the
 * R-script export. One test per defect/feature; each asserts the REQUIREMENT
 * (what a user must get), not a snapshot of current markup.
 *
 * Plant-the-defect: set RVE_PAGE to another page path (e.g. a copy of the
 * pre-fix page) and every test here is expected to fail on it.
 *   RVE_PAGE=/rve-meta-prefix/index.html npx playwright test rve-meta-usability
 */
import { test, expect } from '@playwright/test';

const PAGE = (process.env.RVE_BASE || 'http://localhost:8088') + (process.env.RVE_PAGE || '/rve-meta/index.html');
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>|ERR_CONNECTION_REFUSED|favicon/;

// Uncentred calendar-year moderator: kappa(X'WX) ~ 1e11 (ill-conditioned).
const YEAR_DATA = [
  'a,0.20,0.030,1990', 'a,0.25,0.030,1990', 'b,0.40,0.040,1995', 'b,0.35,0.045,1995',
  'c,0.10,0.020,2004', 'd,0.60,0.050,2003', 'd,0.52,0.050,2003', 'e,0.31,0.030,1999',
  'f,0.18,0.025,2010', 'f,0.22,0.030,2010', 'g,0.45,0.040,1993', 'h,0.28,0.035,2007',
].join('\n');

async function open(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  return errors;
}

async function fitWith(page, text, { rho = '0.8', names = '', centre = false } = {}) {
  await page.fill('#src', text);
  await page.fill('#f-rho', rho);
  await page.fill('#f-names', names);
  const c = page.locator('#f-centre');
  if (await c.count()) { if ((await c.isChecked()) !== centre) await c.click(); }
  await page.click('#btn-run');
}

async function downloadText(page, action) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.click(`#alm-export-mount button[data-action="${action}"]`),
  ]);
  const path = await dl.path();
  const fs = await import('node:fs');
  return { name: dl.suggestedFilename(), text: fs.readFileSync(path, 'utf8') };
}

test('D1: restoring an autosaved draft refits, so table and exports match the restored inputs', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('alm-autosave:rve-meta', JSON.stringify({
    version: 1, savedAt: new Date(Date.now() - 120000).toISOString(),
    values: { src: 'a,0.2,0.03,1\nb,0.4,0.04,2\nc,0.1,0.02,4\nd,0.6,0.05,3\ne,0.3,0.03,5', 'f-rho': '0.6', 'f-names': 'dose' },
  })));
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('#meta-row')).toContainText('k = 5 effects');
  await expect(page.locator('#meta-row')).toContainText('ρ = 0.60');
  const r = await page.evaluate(() => window.__almLastRVE && window.__almLastRVE());
  expect(r && r.inputs.rho).toBe(0.6);
  expect(r.inputs.rows.length).toBe(5);
});

test('D2: exports carry predictor names, input data and software identity; no placeholder URL or developer text', async ({ page }) => {
  await open(page);
  await page.click('#btn-example');
  const csv = await downloadText(page, 'csv');
  expect(csv.text.split(/\r?\n/)[0]).toBe('term,estimate,se,t,df,ci_lo,ci_hi,p');
  expect(csv.text).toMatch(/\nmales,/);
  const inp = await downloadText(page, 'input-csv');
  expect(inp.text.split(/\r?\n/).filter(Boolean).length).toBe(173); // header + 172 effects
  const rep = await downloadText(page, 'report-md');
  expect(rep.text).not.toContain('https://github.com/)');
  expect(rep.text).not.toMatch(/fitCORR\(|CR1/);
  expect(rep.text).toContain('| college |');
  expect(rep.text).toContain('## Input data');
  const js = JSON.parse((await downloadText(page, 'json')).text);
  expect(js.inputs.predictor_names).toEqual(['males', 'college', 'binge']);
  expect(js.inputs.rows.length).toBe(172);
  expect(js.software.validated_against).toContain('robumeta 2.1');
});

test('D4: a header row is recognised and supplies the predictor names', async ({ page }) => {
  await open(page);
  await fitWith(page, 'study,yi,vi,dose\na,0.2,0.03,1\nb,0.4,0.04,2\nc,0.1,0.02,4\nd,0.6,0.05,3', { names: 'wrong' });
  await expect(page.locator('#coef-body tr')).toHaveCount(2);
  await expect(page.locator('#coef-body tr').nth(1).locator('th, td').first()).toHaveText('dose');
  await expect(page.locator('#f-names')).toHaveValue('dose');
});

test('D5: tab-separated (Excel paste) and semicolon-separated input both fit', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a\t0.2\t0.03\t1\nb\t0.4\t0.04\t2\nc\t0.1\t0.02\t4\nd\t0.6\t0.05\t3', { names: 'dose' });
  await expect(page.locator('#coef-body tr')).toHaveCount(2);
  await fitWith(page, 'a;0.2;0.03;1\nb;0.4;0.04;2\nc;0.1;0.02;4\nd;0.6;0.05;3', { names: 'dose' });
  await expect(page.locator('#coef-body tr')).toHaveCount(2);
});

test('D6: a quoted cluster label containing a comma is one label', async ({ page }) => {
  await open(page);
  await fitWith(page, '"Smith, 2010",0.2,0.03\n"Smith, 2010",0.25,0.03\n"Jones, 2012",0.4,0.04\nLee,0.1,0.02', {});
  await expect(page.locator('#meta-row')).toContainText('m = 3 clusters');
});

test('D7: a negative vi is refused with a sampling-variance explanation', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a,0.2,-0.04\nb,0.4,0.04\nc,0.1,0.02');
  await expect(page.locator('#meta-row [role="alert"]')).toContainText('positive sampling variance');
  await expect(page.locator('#coef-body tr')).toHaveCount(0);
});

test('D8: a missing predictor value names the column and says it is not imputed', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a,0.2,0.03,NA\nb,0.4,0.04,2\nc,0.1,0.02,4\nd,0.6,0.05,3', { names: 'dose' });
  const t = page.locator('#meta-row [role="alert"]');
  await expect(t).toContainText('column 4');
  await expect(t).toContainText('not imputed');
});

test('D9: engine refusals are explained in plain language', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a,0.2,0.03,1\nb,0.4,0.04,2', { names: 'dose' });
  await expect(page.locator('#meta-row')).toContainText('2 clusters cannot support 2 coefficients');
  await fitWith(page, 'a,0.2,0.03,1\nb,0.4,0.04,1\nc,0.1,0.02,1\nd,0.6,0.05,1', { names: 'dose' });
  await expect(page.locator('#meta-row')).toContainText('collinear');
  await expect(page.locator('#meta-row')).not.toContainText("X'WX");
});

test('D10: a predictor-name count mismatch is flagged inline', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a,0.2,0.03,1,5\nb,0.4,0.04,2,3\nc,0.1,0.02,4,4\nd,0.6,0.05,3,9\ne,0.3,0.03,5,1', { names: 'one, two, three, four' });
  await expect(page.locator('#names-warning')).toBeVisible();
  await expect(page.locator('#names-warning')).toContainText('4 predictor names for 2 predictor columns');
});

test('D11: the low-df warning is a styled note naming the affected coefficients', async ({ page }) => {
  await open(page);
  await page.click('#btn-example-small');
  const w = page.locator('#lowdf-warning');
  await expect(w).toBeVisible();
  await expect(w).toHaveClass(/note/);
  await expect(w).toContainText('dose_weeks');
});

test('D12: form controls have their visible labels as accessible names', async ({ page }) => {
  await open(page);
  expect(await page.locator('[aria-label="F rho"], [aria-label="F names"], [aria-label="Studies"]').count()).toBe(0);
  await expect(page.getByLabel('Working correlation ρ (0 to 1)')).toHaveAttribute('id', 'f-rho');
  await expect(page.getByLabel('Predictor names')).toHaveAttribute('id', 'f-names');
  await expect(page.getByLabel('Studies: one row per effect size')).toHaveAttribute('aria-describedby', /src-help/);
});

test('D13: results are announced (aria-live) and errors use role=alert', async ({ page }) => {
  await open(page);
  await expect(page.locator('#meta-row')).toHaveAttribute('aria-live', 'polite');
  await fitWith(page, 'a,0.2,0.03\nb,x,0.04');
  await expect(page.locator('#meta-row [role="alert"]')).toHaveCount(1);
});

test('D14: the coefficient table has a caption, column headers and row headers', async ({ page }) => {
  await open(page);
  await page.click('#btn-example');
  await expect(page.locator('#coef-table caption')).toHaveCount(1);
  expect(await page.locator('#coef-table thead th[scope="col"]').count()).toBe(7);
  expect(await page.locator('#coef-body th[scope="row"]').count()).toBe(4);
});

test('D15: links opening a new tab say so to screen readers', async ({ page }) => {
  await open(page);
  const n = await page.evaluate(() => Array.from(document.querySelectorAll('a[target=_blank]'))
    .filter(a => !/new tab/i.test(a.textContent + ' ' + (a.getAttribute('aria-label') || ''))).length);
  expect(await page.locator('a[target=_blank]').count()).toBeGreaterThan(0);
  expect(n).toBe(0);
});

test('D16: pressing Enter in the rho field runs the fit', async ({ page }) => {
  await open(page);
  await page.click('#btn-example');
  await page.fill('#f-rho', '0.5');
  await page.press('#f-rho', 'Enter');
  await expect(page.locator('#meta-row')).toContainText('ρ = 0.50');
});

test('D17: the fixed back link does not overlap the page title', async ({ page }) => {
  for (const vp of [{ width: 1280, height: 860 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp);
    await open(page);
    const a = await page.locator('#hub-back').boundingBox();
    const h = await page.locator('h1').boundingBox();
    const overlap = !(a.x + a.width <= h.x || h.x + h.width <= a.x || a.y + a.height <= h.y || h.y + h.height <= a.y);
    expect(overlap, `overlap at ${vp.width}px`).toBe(false);
  }
});

test('D18: no horizontal page scroll at 375 px; the table scrolls inside its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.click('#btn-example');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(376);
  const region = page.locator('.table-wrap');
  await expect(region).toHaveAttribute('role', 'region');
  await expect(region).toHaveAttribute('tabindex', '0');
});

test('Example: one visible button loads a healthy-df example and shows results (1 click)', async ({ page }) => {
  await open(page);
  await page.fill('#src', '');
  await page.click('#btn-run');
  await expect(page.locator('#coef-body tr')).toHaveCount(0);
  await expect(page.locator('#btn-example')).toBeVisible();
  await page.click('#btn-example');
  await expect(page.locator('#coef-body tr')).toHaveCount(4);
  const dfs = await page.evaluate(() => window.__almLastRVE().summary.map(s => s.df));
  expect(Math.min(...dfs)).toBeGreaterThan(4);
});

test('Claims: unvalidated text (CR1 route, "robust to mis-specification") is gone', async ({ page }) => {
  await open(page);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/fitCORR\(rows|CR1|robust to mis-?specification/i);
});

test('Feature: kappa warning on an ill-conditioned design, one-click centring keeps the slope', async ({ page }) => {
  const errors = await open(page);
  await fitWith(page, YEAR_DATA, { names: 'year' });
  await expect(page.locator('#kappa-warning')).toBeVisible();
  const before = await page.evaluate(() => window.__almLastRVE());
  expect(before.conditioning.kappa_XtWX).toBeGreaterThan(9.0e6);
  await page.click('#btn-centre');
  await expect(page.locator('#f-centre')).toBeChecked();
  await expect(page.locator('#kappa-warning')).toHaveCount(0);
  await expect(page.locator('#coef-body tr').first().locator('th')).toContainText('effect at predictor means');
  const after = await page.evaluate(() => window.__almLastRVE());
  expect(after.inputs.centred).toBe(true);
  expect(after.conditioning.kappa_XtWX).toBeLessThan(9.0e6);
  expect(Math.abs(after.coefficients[1].estimate - before.coefficients[1].estimate)).toBeLessThan(1e-8);
  expect(Math.abs(after.coefficients[1].se / before.coefficients[1].se - 1)).toBeLessThan(1e-6);
  const rep = await downloadText(page, 'report-md');
  expect(rep.text).toContain('effect at predictor means');
  expect(errors).toEqual([]);
});

test('Feature: R script export reproduces the call, escapes labels and records the session', async ({ page }) => {
  await open(page);
  await fitWith(page, 'a"); system("echo hi,0.2,0.03,1\nb\\x,0.4,0.04,2\nc,0.1,0.02,4\nd,0.6,0.05,3\ne,0.3,0.03,5', { names: 'dose "w"' });
  const r = await downloadText(page, 'r-script');
  expect(r.name).toBe('rve-meta.R');
  expect(r.text).toContain('library(robumeta)');
  expect(r.text).toMatch(/robu\(yi ~ dose_w, data = d, studynum = cluster, var\.eff\.size = vi,\s+modelweights = "CORR", rho = 0\.8, small = TRUE\)/);
  expect(r.text).toContain('coef_test(fit, vcov = "CR2", test = "Satterthwaite")');
  expect(r.text).toContain('sessionInfo()');
  expect(r.text).toContain('"a\\"); system(\\"echo hi"');
  expect(r.text).toContain('"b\\\\x"');
  expect(r.text).toContain('dose_w = "dose \\"w\\""');
});
