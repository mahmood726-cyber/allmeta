// multivariate-ma plus panel: usability, exports, refusals and the full pinned R corpus replay.
import { test, expect } from './multivariate-ma-fixture.mjs';
import { readFileSync } from 'node:fs';
const url = '/multivariate-ma/index.html';
const manifest = JSON.parse(readFileSync(new URL('../../../multivariate-ma/validate/MANIFEST-plus.json', import.meta.url), 'utf8'));
const settle = page => page.waitForFunction(() => window._almLastMultivariate && window._almLastMultivariate() && window.AlmMvPlusUI);

test('fresh load shows core output with zero clicks; sweep is one click', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await settle(page);
  await expect(page.locator('#headline')).toContainText('k = 5 studies');
  await expect(page.locator('#headline')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#plus-cmp-body tr')).toHaveCount(4);
  const o = await page.evaluate(() => window._almLastMultivariate());
  expect(o._schema).toBe('multivariate-ma-results-v2');
  for (const k of ['k', 'mu', 'muSE', 'G', 'rho', 'logLik']) expect(o).toHaveProperty(k);
  expect(o.mu[0]).toBeCloseTo(0.3534281696, 6); expect(o.logLik).toBeCloseTo(3.6917676944, 6);
  expect(o.z).toHaveLength(2); expect(o.p).toHaveLength(2);
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-status')).toContainText('19 of 19');
  await expect(page.locator('#plus-sweep-body tr')).toHaveCount(19);
  const svg = page.locator('#plus-sweep-plot svg');
  await expect(svg).toHaveAttribute('role', 'img'); await expect(svg.locator('title')).toHaveCount(1);
  const joint = page.locator('#plot-host svg');
  await expect(joint).toHaveAttribute('role', 'img'); await expect(joint.locator('title')).toHaveText('Joint outcome plot');
  expect(await joint.locator('[data-axis="x"]').count()).toBeGreaterThan(2); expect(await joint.locator('[data-axis="y"]').count()).toBeGreaterThan(2);
  await expect(joint.locator('[data-legend]')).toHaveCount(1);
  await expect(page.locator('#plus-methods')).toHaveValue(/restricted maximum likelihood/);
  await expect(page.locator('#plus-results')).toHaveValue(/Across k = 5 studies/);
  expect(errors).toEqual([]);
});

test('examples, clear, CSV upload, omitted rows and r flags', async ({ page }) => {
  await page.goto(url); await settle(page);
  await page.locator('#btn-ex-hyp').click();
  await expect(page.locator('#headline')).toContainText('k = 10 studies');
  await expect(page.locator('#f-mode')).toHaveValue('r');
  await page.locator('#btn-clear').click();
  await expect(page.locator('#headline')).toHaveText('Enter ≥ 2 studies.');
  await page.locator('#f-mode').selectOption('cov');
  await page.locator('#f-csv').setInputFiles({ name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('label,y1,v1,y2,v2,cov\na, .1, .2, .3, .4, .1\nb, .5, .3, x, .5, .2\nc, -.1, .2, .4, .4, .1\nd, .2, -1, .3, .3, .1\ne, .3, .2, .1, .3, .05\n') });
  await expect(page.locator('#headline')).toContainText('k = 3 studies');
  await expect(page.locator('#omitted')).toHaveText('k used = 3; 2 rows omitted: line 3 (missing or non-numeric value); line 5 (variance must be > 0).');
  await page.locator('#f-data').fill('a, .1, .2, .3, .4, 1\nb, .5, .3, .6, .5, .1\nc, .2, .2, .2, .2, 0');
  await expect(page.locator('#headline')).toContainText('Refused: Within-study covariance must be positive definite. (|r| ≥ 1 on line 1)');
  await expect(page.locator('#derived-body tr[data-flag]')).toHaveCount(1);
  await expect(page.locator('#stats .stat')).toHaveCount(0);
  expect(await page.evaluate(() => window._almLastMultivariate())).toBeNull();
});

test('250 ms debounce, assumed rho_w mode, editable grid refusals', async ({ page }) => {
  await page.goto(url); await settle(page);
  await page.locator('#f-mode').selectOption('rhoW');
  await page.locator('#f-data').fill('a, .1, .2, .3, .4\nb, .5, .3, .6, .5\nc, .2, .2, .2, .2');
  await page.waitForTimeout(100);
  await expect(page.locator('#headline')).not.toContainText('k = 3');   // not yet: debounced
  await expect(page.locator('#headline')).toContainText('k = 3 studies');
  await expect(page.locator('#plus-methods')).toHaveValue(/common within-study correlation of ρw = 0.5/);
  await page.locator('#plus-from').fill('0.9'); await page.locator('#plus-to').fill('1.1'); await page.locator('#plus-step').fill('0.1');
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-status')).toContainText('1 of 3');
  await expect(page.locator('#plus-sweep-body')).toContainText('within-study correlation must satisfy |rho| < 1');
  await page.locator('#f-rhow').fill('1');
  await expect(page.locator('#headline')).toContainText('Refused: Assumed within-study correlation must satisfy |ρw| < 1.');
});

test('downloads: R script, JSON, SVG and PNG', async ({ page }) => {
  await page.goto(url); await settle(page); await page.locator('#plus-run').click();
  for (const [id, name] of [['plus-dl-r', 'multivariate-ma-analysis.R'], ['plus-dl-json', 'multivariate-ma-results.json'], ['btn-plot-svg', 'multivariate-ma-plot.svg'], ['btn-plot-png', 'multivariate-ma-plot.png'], ['plus-dl-sweep-svg', 'multivariate-ma-sweep.svg'], ['plus-dl-sweep-png', 'multivariate-ma-sweep.png']]) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#' + id).click()]);
    expect(d.suggestedFilename()).toBe(name);
    const body = readFileSync(await d.path());
    expect(body.length).toBeGreaterThan(200);
    if (name.endsWith('.R')) { const t = body.toString(); expect(t).toContain('mvmeta(Y ~ 1'); expect(t).toContain('rma.mv('); expect(t).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//); }
    if (name.endsWith('.json')) { const j = JSON.parse(body.toString()); expect(j.sweep).toHaveLength(19); expect(j.result._schema).toBe('multivariate-ma-results-v2'); }
    if (name.endsWith('.png')) expect(body.subarray(1, 4).toString()).toBe('PNG');
  }
});

test('keyboard: every plus control reachable and operable', async ({ page }) => {
  await page.goto(url); await settle(page);
  await page.locator('#plus-run').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#plus-status')).toContainText('19 of 19');
  for (const id of ['btn-ex-berkey', 'btn-ex-hyp', 'btn-clear', 'plus-run', 'plus-dl-r', 'f-mode', 'f-rhow', 'plus-from', 'plus-to', 'plus-step']) await expect(page.locator('#' + id)).toHaveAccessibleName(/.+/);
});

test('full pinned corpus replay versus R (all checks)', async ({ page }) => {
  test.setTimeout(900000);
  await page.goto(url); await settle(page);
  await page.waitForFunction(() => window.AlmMvPlusValidation);
  const r = await page.evaluate(() => window.AlmMvPlusValidation.runCorpus());
  console.log('MV PLUS', r.passed + '/' + r.checks, 'adjudicated', r.adjudicated.length, JSON.stringify(r.logLikComparison));
  expect(r.checks).toBe(manifest.checks);
  expect(r.failed).toEqual([]);
  await expect(page.locator('#alm-plus-validate')).toContainText(r.checks + '/' + r.checks + ' passed');
});

test('altered reference bytes fail closed', async ({ page }) => {
  await page.goto(url); await settle(page); await page.waitForFunction(() => window.AlmMvPlusValidation);
  await page.route('**/validate/plus/reference.json', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
  await expect(page.evaluate(() => window.AlmMvPlusValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
  const errs = await page.evaluate(() => {
    const out = [];
    for (const m of [x => x.configurations.pop(), x => { x.configurations[1].id = x.configurations[0].id; }, x => { x.configurations[0].sweep[0].mu[0] = null; }, x => { x.grid = [0]; }]) {
      const c = { schema: 'multivariate-ma-plus-corpus-v1', grid: [0], configurations: [{ id: 'a', rows: [] }, { id: 'b', rows: [] }] };
      const r = { schema: 'multivariate-ma-plus-reference-v1', grid: [0], pnormGrid: [{ z: 0, p: 1 }], metaforBerkeySweep: [{}], configurations: [
        { id: 'a', supplied: { status: 'refused' }, univariate: [{}, {}], sweep: [{ rhoW: 0, status: 'ok', mu: [0, 0], muSE: [1, 1], z: [0, 0], p: [1, 1], G: [[0, 0], [0, 0]], muVcov: [[1, 0], [0, 1]], rho: null, logLik: 0 }] },
        { id: 'b', supplied: { status: 'refused' }, univariate: [{}, {}], sweep: [{ rhoW: 0, status: 'refused' }] }] };
      m(r); try { window.AlmMvPlusContract.validateInputs(c, r); out.push('UNSAFE PASS'); } catch (e) { out.push(e.message); }
    }
    return out;
  });
  expect(errs).not.toContain('UNSAFE PASS');
});
