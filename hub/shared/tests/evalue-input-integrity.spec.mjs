import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/evalue/index.html';
async function configure(page, point, lo, hi, measure='RR') {
  await page.goto(URL);
  await page.locator('#measure').selectOption(measure);
  await page.locator('#point').fill(point);
  await page.locator('#lo').fill(lo);
  await page.locator('#hi').fill(hi);
  await page.locator('#btn-run').click();
}
test('valid RR and protective RR preserve original E-value numbers', async ({page}) => {
  await configure(page,'2','1.5','2.7');
  let r=await page.evaluate(()=>window.__almLastEValue());
  expect(r.point).toBeCloseTo(3.414213562373095,10);
  expect(r.ci).toBeCloseTo(2.3660254037844384,10);
  await configure(page,'.6','.4','.9');
  r=await page.evaluate(()=>window.__almLastEValue());
  expect(r.ci).toBeCloseTo(1.4624752955742646,10);
  expect(await page.locator('#plot circle').count()).toBeGreaterThan(0);
});
test('absence of CI is not misdescribed as a null-crossing interval', async ({page}) => {
  await configure(page,'2','','');
  const r=await page.evaluate(()=>window.__almLastEValue());
  expect(r.point).toBeCloseTo(3.414213562373095,10);
  expect(r.ci).toBeNull();
  await expect(page.locator('#interp')).toContainText('no confidence interval was supplied');
  await expect(page.locator('#tbody')).toContainText('—');
});
for (const [name,pt,lo,hi,measure] of [
  ['partial interval','2','','2.7','RR'],
  ['point outside interval','2','2.5','3','RR'],
  ['reversed interval','2','3','1.5','RR'],
  ['opposite-direction interval','2','.4','.8','RR'],
  ['point at null but CI excludes null','1','1.2','1.6','RR'],
  ['negative RR bound','2','-.2','3','RR'],
  ['reversed SMD interval','.7','1.2','.4','SMD']
]) {
  test('refuses '+name,async({page})=>{
    await configure(page,pt,lo,hi,measure);
    expect(await page.evaluate(()=>window.__almLastEValue())).toBeNull();
    await expect(page.locator('#tbody')).toContainText('Analysis refused');
    expect(await page.locator('#plot *').count()).toBe(0);
  });
}
test('can recover from refusal and correctly handle CI crossing RR=1',async({page})=>{
  await configure(page,'2','3','1.5');
  expect(await page.evaluate(()=>window.__almLastEValue())).toBeNull();
  await page.locator('#lo').fill('.9');
  await page.locator('#hi').fill('3');
  await page.locator('#btn-run').click();
  expect((await page.evaluate(()=>window.__almLastEValue())).ci).toBe(1);
  expect(await page.locator('#plot circle').count()).toBeGreaterThan(0);
});
