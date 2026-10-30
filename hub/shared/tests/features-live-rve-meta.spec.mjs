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
    // 4 model quantities + 12 per displayed coefficient (7 robumeta + 5 clubSandwich).
    const a=AlmLiveAdapters['rve-meta']; return a.appValues(a.currentState()).length-(4+12*document.querySelectorAll('#coef-body tr').length);
  })).toBe(0);
  await page.fill('#f-rho','0.2');
  await expect(page.evaluate(()=>AlmLiveAdapters['rve-meta'].currentState())).rejects.toThrow(/out of date/);
  await page.fill('#src','');
  await page.click('#btn-run');
  await expect(page.evaluate(()=>AlmLiveAdapters['rve-meta'].currentState())).rejects.toThrow(/no successful result/);
});

test('adapter reads the page’s own fitted inputs: header-mapped columns, SE column, centring (stale when toggled)', async ({ page }) => {
  await loadExample(page, app);
  const plain = await page.evaluate(()=>{const a=AlmLiveAdapters['rve-meta'],s=a.currentState();return {centred:s.centred,script:a.buildScript(s),names:s.names,k:s.rows.length};});
  expect(plain.centred).toBe(false);
  expect(plain.script).not.toMatch(/mean\(d\$x1\)/);
  expect(plain.names).toEqual(['Intercept', 'males', 'college', 'binge']);
  // Toggling centring without a re-run makes the snapshot stale.
  await page.check('#f-centre');
  await expect(page.evaluate(()=>AlmLiveAdapters['rve-meta'].currentState())).rejects.toThrow(/out of date/);
  await page.click('#btn-run');
  const centred = await page.evaluate(()=>{const a=AlmLiveAdapters['rve-meta'],s=a.currentState();return {centred:s.centred,script:a.buildScript(s),x1:s.rows[0].X[1]};});
  expect(centred.centred).toBe(true);
  expect(centred.script).toMatch(/d\$x1 <- d\$x1 - mean\(d\$x1\)/);
  // Columns in a different order with an SE column instead of vi: the adapter uses the page's parsed rows (vi = se^2).
  await page.uncheck('#f-centre');
  await page.fill('#src', ['se,es,study,dose', '0.2,0.1,A,1', '0.3,0.4,A,2', '0.25,0.2,B,1', '0.1,0.5,C,3', '0.2,0.3,D,2', '0.3,0.6,E,4'].join('\n'));
  await page.click('#btn-run');
  const reordered = await page.evaluate(()=>{const a=AlmLiveAdapters['rve-meta'],s=a.currentState();return s.rows.map(r=>[r.cluster,r.yi,r.vi,r.X[1]]);});
  expect(reordered[0][0]).toBe('A');
  expect(reordered[0][1]).toBe(0.1);
  expect(reordered[0][2]).toBeCloseTo(0.04, 15);
  expect(reordered[0][3]).toBe(1);
});
