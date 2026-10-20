import { test, expect } from '@playwright/test';
import { loadExample, runBrowserR, compareInPage } from '../../../scripts/xplat/live-browser.mjs';
const app = 'nma-inconsistency';

test('live netmeta example and one planted estimate', async ({ page }) => {
  await loadExample(page, app);
  const { data, result, reference } = await runBrowserR(page, app);
  expect(result.ok, result.error).toBe(true);
  const rows = await compareInPage(page, data, reference);
  console.log(`LIVE ${app} ${rows.filter(r=>r.pass).length}/${rows.length}`, result.versions);
  expect(rows.length).toBeGreaterThanOrEqual(6);
  expect(rows.filter(r=>!r.pass)).toEqual([]);
  const planted = await compareInPage(page, data, reference, true);
  expect(planted.filter(r=>!r.pass).map(r=>r.key)).toEqual(['split.0.direct']);
});

test('current snapshot reads results without fitting and rejects pending/refused input', async ({ page }) => {
  await loadExample(page, app);
  const before = await page.evaluate(() => {
    const a=AlmLiveAdapters['nma-inconsistency'];
    window.fitNMA=()=>{throw Error('Unexpected refit');};
    const s=a.currentState();
    return a.appValues(s);
  });
  expect(before.length).toBeGreaterThanOrEqual(6);
  await page.fill('#src','A,B,.2,.1');
  await expect(page.evaluate(()=>AlmLiveAdapters['nma-inconsistency'].currentState())).rejects.toThrow(/out of date/);
  await page.click('#btn-run');
  await expect(page.evaluate(()=>AlmLiveAdapters['nma-inconsistency'].currentState())).rejects.toThrow(/At least 3/);
});
