import { test, expect } from '@playwright/test';
import { loadExample, runBrowserR, compareInPage } from '../../../scripts/xplat/live-browser.mjs';
const app = 'rve-meta';

test('browser honestly refuses unpinned RVE packages; comparator catches one planted value', async ({ page }) => {
  await loadExample(page, app);
  const { data, result } = await runBrowserR(page, app);
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Package not in pinned repository: (robumeta|clubSandwich)/);
  console.log(`LIVE ${app} unavailable: ${result.error}; numerical parity requires desktop R`);
  // Comparator gate only: this is explicitly NOT an R numerical parity claim.
  // Desktop check_live.R independently runs both packages on these values.
  const reference = Object.fromEntries(data.appValues.map(v=>[v.key,v.value]));
  expect((await compareInPage(page,data,reference)).every(r=>r.pass)).toBe(true);
  const planted = await compareInPage(page,data,reference,true);
  expect(planted.filter(r=>!r.pass).map(r=>r.key)).toEqual(['coef.0.estimate']);
});

test('snapshot never refits and refuses stale accessor after an unsuccessful fit', async ({ page }) => {
  await loadExample(page, app);
  expect(await page.evaluate(()=>{
    AlmRVE.fitCORR=()=>{throw Error('Unexpected refit');};
    const a=AlmLiveAdapters['rve-meta']; return a.appValues(a.currentState()).length;
  })).toBe(40);
  await page.fill('#f-rho','0.2');
  await expect(page.evaluate(()=>AlmLiveAdapters['rve-meta'].currentState())).rejects.toThrow(/out of date/);
  await page.fill('#src','');
  await page.click('#btn-run');
  await expect(page.evaluate(()=>AlmLiveAdapters['rve-meta'].currentState())).rejects.toThrow(/no successful result/);
});
