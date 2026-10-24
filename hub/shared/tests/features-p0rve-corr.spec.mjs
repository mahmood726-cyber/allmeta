import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const OUT = new URL('./rchecks-out/p0rve_corr/', import.meta.url);
const BASE = 'http://127.0.0.1:8088'; // The lane's unchanged default config serves this port.
const files = ['correlation-input.csv', 'correlation-ci.csv', 'correlation-labels.csv', 'rve-input.csv', 'rve-coefficients.csv'];
function csv(name, rows) {
  const cell = v => '"' + String(v).replace(/"/g, '""') + '"';
  writeFileSync(new URL(name, OUT), rows.map(r => r.map(cell).join(',')).join('\n') + '\n', 'utf8');
}
test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  for (const file of files) rmSync(new URL(file, OUT), { force: true });
});

async function open(page, app) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${app}/index.html`, { waitUntil: 'load' });
  if (app === 'rve-meta') await page.waitForFunction(() => window.__almLastRVE && window.__almLastRVE());
  else await page.waitForFunction(() => window._almCorrPlus && window._almCorrPlus());
  return errors;
}
async function download(page, mount, action) {
  const pending = page.waitForEvent('download');
  await page.locator(`${mount} [data-action="${action}"]`).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFileSync(await file.path(), 'utf8');
}
function interceptLabel(names, centred) {
  if (!names.length) return '(intercept)';
  return centred ? 'Intercept (effect at predictor means; not an overall pooled effect)' :
    `Intercept (effect when ${names.map(n => `${n} = 0`).join(' and ')}; not an overall pooled effect)`;
}

test('P0-38 moderator plant regression, centred and intercept-only controls; actual page coefficients to R', async ({ page }) => {
  const errors = await open(page, 'rve-meta');
  const original = await page.evaluate(() => __almLastRVE());
  const names = original.inputs.predictor_names;
  expect(names.length).toBeGreaterThan(0);
  const wanted = interceptLabel(names, false);
  await expect(page.locator('#coef-body tr').first().locator('th')).toHaveText(wanted);
  await expect(page.locator('#intercept-note')).toContainText('Centre predictors at their means');
  expect(original.coefficients[0].term).toBe(wanted);
  for (const action of ['json', 'csv', 'report-md']) {
    expect(await download(page, '#alm-export-mount', action)).toContain(wanted);
  }
  const records = [['scenario', 'index', 'term', 'estimate', 'tau2', 'rho', 'centred']];
  function record(scenario, result) {
    result.coefficients.forEach((c, i) => records.push([scenario, i, c.term, c.estimate, result.model.tau2, result.inputs.rho, Number(result.inputs.centred)]));
  }
  record('raw', original);
  csv('rve-input.csv', [['cluster', 'yi', 'vi', ...names], ...original.inputs.rows.map(r => [r.cluster, r.yi, r.vi, ...r.x])]);

  await page.locator('#f-centre').check();
  await page.locator('#btn-run').click();
  const centred = await page.evaluate(() => __almLastRVE());
  expect(centred.inputs.centred).toBe(true);
  await expect(page.locator('#coef-body tr').first().locator('th')).toHaveText(interceptLabel(names, true));
  await expect(page.locator('#centre-note')).toContainText('expected effect at these means');
  await expect(page.locator('#intercept-note')).toHaveCount(0);
  for (let i = 1; i < original.coefficients.length; i++) {
    expect(Math.abs(centred.coefficients[i].estimate - original.coefficients[i].estimate)).toBeLessThanOrEqual(1e-6);
  }
  record('centred', centred);

  await page.locator('#src').fill(original.inputs.rows.map(r => [r.cluster, r.yi, r.vi].join(',')).join('\n'));
  await page.locator('#f-names').fill('');
  await page.locator('#f-centre').uncheck();
  await page.locator('#btn-run').click();
  const pooled = await page.evaluate(() => __almLastRVE());
  expect(pooled.coefficients).toHaveLength(1);
  expect(pooled.coefficients[0].term).toBe('(intercept)');
  await expect(page.locator('#intercept-note')).toHaveCount(0);
  record('intercept-only', pooled);
  csv('rve-coefficients.csv', records);
  expect(errors).toEqual([]);
});

test('P0-38 planted original label is detected in the table and exports', async ({ page }) => {
  const html = readFileSync(new URL('rve-meta/index.html', ROOT), 'utf8');
  const mutant = html.replace(/    function coefficientLabels\(names, p, centred\) \{[\s\S]*?\n    \}/,
    '    function coefficientLabels(names, p, centred) { return E.coefficientNames(names, p, centred); }');
  expect(mutant).not.toBe(html);
  await page.route('**/rve-meta/index.html', route => route.fulfill({ contentType: 'text/html', body: mutant }));
  await open(page, 'rve-meta');
  const r = await page.evaluate(() => __almLastRVE());
  const wanted = interceptLabel(r.inputs.predictor_names, false);
  expect(await page.locator('#coef-body tr').first().locator('th').textContent()).not.toBe(wanted);
  expect(r.coefficients[0].term).not.toBe(wanted);
  expect(r.coefficients[0].estimate).toBe(r.fit.beta[0]);
});

async function corrLabels(page) {
  return page.evaluate(() => ({
    headline: getComputedStyle(document.getElementById('headline'), '::before').content,
    accessible: document.getElementById('headline').getAttribute('aria-label'),
    live: document.getElementById('corr-live-ci')?.textContent || '',
    scope: document.getElementById('corr-ci-scope')?.textContent || ''
  }));
}
function labelsCorrect(labels, selected) {
  return labels.headline.includes('95% CI method: Wald z') && labels.accessible?.includes('Wald z') &&
    labels.live.includes('Live check CI method: Wald z') && labels.scope.includes(`Selected panel CI method: ${selected}`) &&
    labels.scope.includes('Download R script');
}

test('P0-36 HKSJ plant regression and Wald control label headline, every main export and live check', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await open(page, 'correlation-ma');
  const initial = await page.evaluate(() => _almLastCorrMA());
  expect(labelsCorrect(await corrLabels(page), 'Wald z')).toBe(true);
  await page.locator('input[name="alm-plus-test"][value="knha"]').check();
  expect(labelsCorrect(await corrLabels(page), 'HKSJ')).toBe(true);
  await expect(page.locator('#alm-plus-prose')).toContainText('HKSJ');
  const snapshot = await page.evaluate(() => ({ main: _almLastCorrMA(), panel: _almCorrPlus() }));
  expect(snapshot.main).toEqual(initial);
  const selected = snapshot.panel.cells.find(c => c.method === 'REML' && c.test === 'knha');
  expect(Math.abs(selected.r_lo - initial.r_lo)).toBeGreaterThan(1e-6);

  let exported;
  for (const action of ['json', 'csv', 'md', 'report-md', 'report-txt']) {
    const text = await download(page, '#alm-export-mount', action);
    expect(text).toContain('Wald z');
    expect(text).toContain('ci_method');
    if (action === 'json') exported = JSON.parse(text);
  }
  expect(exported.test).toBe('z');
  for (const key of Object.keys(initial)) expect(exported[key]).toEqual(initial[key]);
  const pending = page.waitForEvent('download');
  await page.locator('#alm-plus-r').click();
  const script = await pending;
  expect(readFileSync(await script.path(), 'utf8')).toContain('test = "knha"');
  const liveScript = await page.evaluate(() => {
    const a = AlmCorrValidationAdapter;
    return a.live.buildScript(a.live.currentState());
  });
  expect(liveScript).toContain("test='z'");
  const labels = await corrLabels(page);
  csv('correlation-labels.csv', [['surface', 'method'], ['headline', labels.headline.match(/95% CI method: ([^"]+)/)[1]],
    ['live', labels.live.match(/Live check CI method: ([^.]+)/)[1]], ['export', exported.ci_method],
    ['panel', labels.scope.match(/Selected panel CI method: ([^.]+)/)[1]]]);
  expect(labelsCorrect(labels, 'HKSJ')).toBe(true);
  csv('correlation-input.csv', [['label', 'r', 'n'], ...initial.studies.map(s => [s.label, s.r, s.n])]);
  const ci = [['surface', 'method', 'test', 'mu_z', 'r', 'r_lo', 'r_hi', 'ci_excludes_0']];
  for (const c of snapshot.panel.cells.filter(c => c.method === 'REML' && ['z', 'knha'].includes(c.test))) {
    ci.push(['panel', c.method, c.test, c.mu_z, c.r, c.r_lo, c.r_hi, Number(c.ci_excludes_0)]);
  }
  ci.push(['main-export', exported.method, exported.test, exported.mu_z, exported.r, exported.r_lo, exported.r_hi, Number(exported.r_lo > 0 || exported.r_hi < 0)]);
  csv('correlation-ci.csv', ci);

  await page.locator('input[name="alm-plus-test"][value="z"]').check();
  expect(labelsCorrect(await corrLabels(page), 'Wald z')).toBe(true);
  expect(await page.evaluate(() => _almLastCorrMA())).toEqual(initial);
  await page.evaluate(() => AlmCorrPlusUI.restore({ test: 'knha', benchmark: 'cohen', loo: false }));
  expect(labelsCorrect(await corrLabels(page), 'HKSJ')).toBe(true);
  // HKSJ is unavailable for FE in the panel; the valid Wald main fit still runs.
  await page.locator('#f-method').selectOption('FE');
  await page.locator('input[name="alm-plus-test"][value="knha"]').check();
  await expect(page.locator('#alm-plus-prose')).toContainText('Choose Wald z');
  expect((await page.evaluate(() => _almLastCorrMA())).method).toBe('FE');
  expect(labelsCorrect(await corrLabels(page), 'HKSJ')).toBe(true);
  expect(errors).toEqual([]);
});

test('P0-36 planted missing labels and export metadata are detected', async ({ page }) => {
  const html = readFileSync(new URL('correlation-ma/index.html', ROOT), 'utf8');
  const mutant = html.replace('content: "95% CI method: Wald z"', 'content: ""')
    .replace('Live check CI method: Wald z.', 'Live check.')
    .replace('Object.assign({}, result, { ci_method: "Wald z", test: "z" })', 'result');
  expect(mutant).not.toBe(html);
  await page.route('**/correlation-ma/index.html', route => route.fulfill({ contentType: 'text/html', body: mutant }));
  await open(page, 'correlation-ma');
  await page.locator('input[name="alm-plus-test"][value="knha"]').check();
  const labels = await corrLabels(page);
  expect(labelsCorrect(labels, 'HKSJ')).toBe(false);
  expect(labels.headline).not.toContain('Wald z');
  expect(labels.live).not.toContain('Live check CI method: Wald z');
  const result = JSON.parse(await download(page, '#alm-export-mount', 'json'));
  expect(result.ci_method).toBeUndefined();
  expect(Number.isFinite(result.r)).toBe(true);
});
