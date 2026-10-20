import { test, expect } from '@playwright/test';
import { loadExample, runBrowserR, compareInPage } from '../../../scripts/xplat/live-browser.mjs';
const app = 'multivariate-ma';

test('live mvmeta example and one planted estimate', async ({ page }) => {
  await loadExample(page, app);
  const { data, result, reference } = await runBrowserR(page, app);
  expect(result.ok, result.error).toBe(true);
  const rows = await compareInPage(page, data, reference);
  console.log(`LIVE ${app} ${rows.filter(r=>r.pass).length}/${rows.length}`, result.versions);
  expect(rows.length).toBeGreaterThanOrEqual(6);
  expect(rows.filter(r=>!r.pass)).toEqual([]);
  const planted = await compareInPage(page, data, reference, true);
  expect(planted.filter(r=>!r.pass).map(r=>r.key)).toEqual(['mu1']);
});

test('current snapshot reads results without fitting and refuses missing results', async ({ page }) => {
  await loadExample(page, app);
  expect(await page.evaluate(()=>{
    AlmMultivariate.fit=()=>{throw Error('Unexpected refit');};
    const a=AlmLiveAdapters['multivariate-ma']; return a.appValues(a.currentState()).length;
  })).toBe(10);
  // No input event: a script changes the textarea but leaves stale output.
  await page.evaluate(()=>{document.getElementById('f-data').value='pending';});
  await expect(page.evaluate(()=>AlmLiveAdapters['multivariate-ma'].currentState())).rejects.toThrow(/out of date/);
  await page.fill('#f-data','');
  await expect(page.evaluate(()=>AlmLiveAdapters['multivariate-ma'].currentState())).rejects.toThrow(/no result/);
});
