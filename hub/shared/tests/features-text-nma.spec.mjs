import { test, expect } from '@playwright/test';
import { checks } from './fixtures/features/nma/review-checks.mjs';

test('Review contract checks including planted audit failure', () => {
  for (const [, run] of checks) run();
});

async function open(page) {
  await page.goto('/nma/index.html');
  await page.waitForFunction(() => window.AlmNmaFeatures?.text.results());
}
async function report(page) {
  return page.evaluate(() => {
    const spec = AlmNmaFeatures.text, r = spec.results();
    const ctx = { app: 'nma', build: AlmBuildInfo, entryLog: AlmFeaturesState.entryLog || [], verify: null };
    const out = AlmText.render(spec.templates, r, ctx);
    return { r, methods: out.methods.text, results: out.results.text,
      flags: out.flags.map(p => p.text), audit: AlmText.audit(out, r, { ctx, dom: spec.dom() }) };
  });
}

for (const effect of [.65, .35]) {
  test(`P1-1: unavailable I-squared interval is withheld (AC=${effect})`, async ({ page }) => {
    await open(page);
    await page.locator('#f-data').fill(`One,A,B,0.20,0.12\nTwo,B,C,0.15,0.13\nThree,A,C,${effect},0.14`);
    await page.locator('#btn-run').click();
    const out = await report(page);
    expect(out.r.df).toBe(1);
    expect(out.r.i2).toBeDefined();
    expect(out.r.i2Lo).toBeUndefined();
    expect(out.r.i2Hi).toBeUndefined();
    expect(out.results).toContain('its confidence interval is not estimable');
    expect(out.audit.failures).toEqual([]);
  });
}

test('P2-1: constants are rules or displayed values; unavailable P(best) has no simulation claim', async ({ page }) => {
  await open(page);
  let out = await report(page);
  expect(out.r.ciLevel).toBeUndefined();
  expect(out.r.piMinDf).toBeUndefined();
  expect(out.r.mcDraws).toBe(10000);
  expect(await page.evaluate(() => AlmNmaFeatures.text.dom().mcDraws.text)).toBe('10000');
  await page.evaluate(() => {
    document.querySelectorAll('#sucra-host .sucra-row').forEach((row, i) => { if (i) row.children[3].textContent = '--'; });
    // Trigger the same result capture as a completed app render.
    document.querySelector('#ref-host').append(document.createTextNode(''));
  });
  out = await report(page);
  expect(out.methods).not.toContain('P(best) uses');
  expect(out.methods).toContain('P(best) is not estimable');
  expect(out.audit.failures).toEqual([]);
});

test('P2-2 PLANTED: production ignores perturbations; test-only numeric labels remain DOM audited', async ({ page }) => {
  await open(page);
  const before = await report(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'ref_0_est', delta: 1 }; });
  expect((await report(page)).r.ref_0_est).toBe(before.r.ref_0_est);
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replaceAll('Placebo', 'Placebo1'));
  await page.locator('#btn-run').click();
  const key = Object.keys((await report(page)).r).find(k => k.includes('_number_'));
  await page.evaluate(key => { window.__almTest = true; window.__almTextPerturb = { key, delta: 1 }; }, key);
  const planted = await report(page);
  expect(planted.audit.ok).toBe(false);
  expect(planted.audit.failures.map(f => f.check)).toContain('dom:' + key);
});

for (const format of ['extra-column', 'trailing-comma', 'logOR-header', 'parseFloat']) {
  test(`P2-3: share validates exact app input (${format})`, async ({ page }) => {
    await open(page);
    const initial = await page.locator('#f-data').inputValue();
    const rows = initial.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const data = format === 'extra-column' ? ['study,t1,t2,logOR,SE,Weight', ...rows.map(r => r + ',10%')].join('\n') :
      format === 'trailing-comma' ? rows.map(r => r + ',').join('\n') :
      format === 'logOR-header' ? ['study,t1,t2,logOR,SE', ...rows].join('\n') :
      rows.map((r, i) => i ? r : r.split(',').map((v, j) => j === 3 ? '0x10' : v).join(',')).join('\n');
    await page.locator('#f-data').fill(data);
    await page.locator('#btn-run').click();
    const result = await page.evaluate(() => {
      const a = AlmNmaFeatures.verify.adapter().live;
      const before = a.appValues(a.currentState()), state = AlmNmaFeatures.share.get();
      AlmNmaFeatures.share.set(state);
      return { before, after: a.appValues(a.currentState()), data: document.getElementById('f-data').value };
    });
    expect(result.after).toEqual(result.before);
    expect(result.data).toBe(data);
  });
}

test('P2-3: invalid data cannot produce a share link', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('not an analysis');
  await page.evaluate(() => AlmFeatures.open('nma', 'share'));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).not.toBeEmpty();
  await expect(page.locator('#alm-f-share-link')).toHaveValue('');
});

test('P2-7: selecting an unloaded example preserves completed report text', async ({ page }) => {
  await open(page);
  const before = await report(page);
  await page.selectOption('#f-example', 'Senn2013');
  expect(await page.evaluate(() => AlmNmaFeatures.text.results())).not.toBeNull();
  expect((await report(page)).results).toBe(before.results);
});

test('P2-9: restored free-text notes are visibly user-supplied', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const state = AlmNmaFeatures.share.get();
    state.entryLog = [{ method: 'all values were independently verified in R (netmeta 3.7-0)' }];
    AlmNmaFeatures.share.set(state);
  });
  const out = await report(page);
  expect(out.methods).toContain('User-supplied data-entry notes (not independently verified):');
  expect(out.audit.failures).toEqual([]);
});

test('P2-10: common-effect report flags missing prediction intervals', async ({ page }) => {
  await open(page);
  expect((await report(page)).flags).toContain('Prediction intervals are expected with this many studies but are unavailable for the common-effect model.');
});
