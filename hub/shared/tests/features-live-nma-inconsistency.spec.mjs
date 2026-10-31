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
  // The refused input was one contrast ("At least 3"); since 2026-10-31 one contrast is fitted as netmeta fits it,
  // so a disconnected network (still refused by the page) is the refused input here.
  await page.fill('#src','A,B,.2,.1\nC,D,.3,.1');
  await expect(page.evaluate(()=>AlmLiveAdapters['nma-inconsistency'].currentState())).rejects.toThrow(/out of date/);
  await page.click('#btn-run');
  await expect(page.evaluate(()=>AlmLiveAdapters['nma-inconsistency'].currentState())).rejects.toThrow(/disconnected/);
});
