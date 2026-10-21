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
  // The page re-fits 250 ms after typing stops: stale until then, then no result.
  await expect(page.evaluate(()=>AlmLiveAdapters['multivariate-ma'].currentState())).rejects.toThrow(/out of date|no result/);
  await expect.poll(()=>page.evaluate(()=>{try{AlmLiveAdapters['multivariate-ma'].currentState();return 'state';}catch(e){return e.message;}})).toMatch(/no result/);
});

test('within-study correlation modes of the page (r, assumed rho_w): R gets the same covariances; all rows pass', async ({ page }) => {
  await loadExample(page, app);
  await page.click('#btn-ex-hyp');
  const state = await page.evaluate(()=>{const a=AlmLiveAdapters['multivariate-ma'],s=a.currentState();return {mode:s.mode,script:a.buildScript(s)};});
  expect(state.mode).toBe('r');
  expect(state.script).toMatch(/d\[, ?5\] <- d\[, ?5\] \* sqrt\(d\[, ?2\] \* d\[, ?4\]\)/);
  const { data, result, reference } = await runBrowserR(page, app);
  expect(result.ok, result.error).toBe(true);
  const rows = await compareInPage(page, data, reference);
  console.log(`LIVE ${app} (r mode) ${rows.filter(r=>r.pass).length}/${rows.length}`);
  expect(rows.filter(r=>!r.pass)).toEqual([]);
});
