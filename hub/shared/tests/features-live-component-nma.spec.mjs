import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadExample, runBrowserR, compareInPage } from '../../../scripts/xplat/live-browser.mjs';
const app = 'component-nma';
// R reference values (R 4.6.0 / netmeta 3.7.0) archived for the parity spec; never values captured from this page.
const V = JSON.parse(readFileSync(new URL('../../../component-nma/tests/fixtures/cnma-validation-oracle.json', import.meta.url), 'utf-8'));
// Same contract as component-nma-parity.spec.mjs: 1e-9 relative to max(1, |R|); df equal.
const near9 = (got, want, what) => expect(Math.abs(got - want) / Math.max(1, Math.abs(want)), `${what}: app=${got} R=${want}`).toBeLessThanOrEqual(1e-9);

test('live netmeta discomb example and one planted estimate', async ({ page }) => {
  test.setTimeout(600_000);
  await loadExample(page, app);
  const { data, result, reference } = await runBrowserR(page, app);
  expect(result.ok, result.error).toBe(true);
  const rows = await compareInPage(page, data, reference);
  console.log(`LIVE ${app} ${rows.filter(r=>r.pass).length}/${rows.length}`, result.versions);
  // 3 model quantities + 4 per component (3) and per implied intervention (6).
  expect(rows.length).toBe(39);
  expect(rows.filter(r=>!r.pass)).toEqual([]);
  expect(data.compare.tolerance.default).toBe(1e-9);
  expect(data.compare.tolerance.df).toBe(0);
  expect(data.appValues.every(v=>data.compare.kind[v.key]==='rel')).toBe(true);
  const planted = await compareInPage(page, data, reference, true);
  expect(planted.filter(r=>!r.pass).map(r=>r.key)).toEqual(['components_0_est']);
});

for (const name of ['heterogeneous', 'disconnected-identifiable']) {
  test(`live netmeta discomb on oracle case ${name}: every quantity passes and R reproduces the archived reference`, async ({ page }) => {
    test.setTimeout(600_000);
    const ref = V.cases[name];
    await loadExample(page, app);
    await page.evaluate(text => window.__almCnmaLoad(text), ref.text);
    const { data, result, reference } = await runBrowserR(page, app);
    expect(result.ok, result.error).toBe(true);
    const rows = await compareInPage(page, data, reference);
    console.log(`LIVE ${app} (${name}) ${rows.filter(r=>r.pass).length}/${rows.length}`, result.versions);
    expect(rows.length).toBe(3 + 4 * (Object.keys(ref.components).length + Object.keys(ref.combinations).length));
    expect(rows.filter(r=>!r.pass)).toEqual([]);
    // The generated script, run in webR, reproduces the archived desktop-R reference.
    expect(reference.df).toBe(ref.df);
    near9(reference.Q, ref.Q, 'Q');
    near9(reference.tau2, ref.tau2, 'tau2');
    for (const group of ['components', 'combinations']) Object.keys(ref[group]).sort().forEach((n, i) => {
      near9(reference[`${group}_${i}_est`], ref[group][n].est, `${group} ${n} est`);
      near9(reference[`${group}_${i}_se`], ref[group][n].se, `${group} ${n} se`);
    });
    const planted = await compareInPage(page, data, reference, true);
    expect(planted.filter(r=>!r.pass).map(r=>r.key)).toEqual(['components_0_est']);
  });
}

test('current snapshot reads results without fitting and rejects pending, refused and untranslatable input', async ({ page }) => {
  await loadExample(page, app);
  const before = await page.evaluate(() => {
    const a=AlmLiveAdapters['component-nma'];
    window.fit=()=>{throw Error('Unexpected refit');};
    window.run=()=>{throw Error('Unexpected refit');};
    const s=a.currentState();
    return { n: a.appValues(s).length, script: a.buildScript(s) };
  });
  expect(before.n).toBe(39);
  expect(before.script).toMatch(/netmeta::discomb\(/);
  expect(before.script).toMatch(/inactive = "control"/);
  // The Verify-in-R panel uses this adapter (single source of the R recipe).
  expect(await page.evaluate(() => AlmFeatures.get('component-nma').verify.adapter() === AlmLiveAdapters['component-nma'])).toBe(true);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.AlmLiveAdapters?.['component-nma']));
  await page.fill('#src', 'a | control | .3 | .1\nb | control | .2 | .2');
  await expect(page.evaluate(()=>AlmLiveAdapters['component-nma'].currentState())).rejects.toThrow(/out of date/);
  await page.fill('#src', V.cases.singular.text);
  await page.click('#btn-run');
  await expect(page.evaluate(()=>AlmLiveAdapters['component-nma'].currentState())).rejects.toThrow(/no result/);
  // A component literally named control cannot be passed to discomb(inactive = "control").
  await page.fill('#src', 'control+a | b | .3 | .1\nb | control | .2 | .2\na | control | .1 | .15');
  await page.click('#btn-run');
  expect(await page.evaluate(() => Boolean(_almLastCnma()))).toBe(true);
  await expect(page.evaluate(()=>AlmLiveAdapters['component-nma'].currentState())).rejects.toThrow(/component named control/);
});
