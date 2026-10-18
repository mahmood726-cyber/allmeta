import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const reference = JSON.parse(readFileSync(new URL('../../../tests/fixtures/evalue-input-oracle.json', import.meta.url)));
const APP_URL = '/evalue/index.html';
const errors = new WeakMap();
test.beforeEach(async ({page}) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
});
test.afterEach(async ({page}) => expect(errors.get(page)).toEqual([]));
async function configure(page, point, lo, hi, measure='RR', rare=false) {
  await page.goto(APP_URL);
  await page.locator('#measure').selectOption(measure);
  await page.locator('#point').fill(point);
  await page.locator('#lo').fill(lo);
  await page.locator('#hi').fill(hi);
  await page.locator('#rare').setChecked(rare);
  await page.locator('#btn-run').click();
}
for (const c of reference.cases) {
  test('actual UI agrees with fresh pinned R reference: ' + c.id, async ({page}) => {
    await configure(page, String(c.point), c.lo == null ? '' : String(c.lo),
      c.hi == null ? '' : String(c.hi), c.measure, c.rare);
    const r = await page.evaluate(() => window.__almLastEValue());
    expect(r.point).toBeCloseTo(c.expected.point, 6);
    if (c.expected.ci == null) expect(r.ci).toBeNull();
    else expect(r.ci).toBeCloseTo(c.expected.ci, 6);
    for (const field of ['point', 'lo', 'hi']) {
      if (c.expected.rr[field] == null) expect(r.rr[field]).toBeNull();
      else expect(r.rr[field]).toBeCloseTo(c.expected.rr[field], 6);
    }
    expect(await page.locator('#plot circle').count()).toBeGreaterThan(0);
    expect(await page.locator('#plot').innerHTML()).not.toMatch(/NaN|Infinity/);
  });
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

// Type real keystrokes: assigning .value would erase malformed number text and
// would not reproduce Chromium's value==='' / validity.badInput==true state.
for (const fields of [['lo'], ['hi'], ['lo', 'hi'], ['point']]) {
  for (const malformed of ['1e', '-', '1e999']) {
    test(`refuses malformed ${malformed} in ${fields.join('+')} and clears stale output`, async ({page}) => {
      await configure(page, '2', '1.5', '2.7');
      expect(await page.evaluate(() => window.__almLastEValue())).not.toBeNull();
      // The other CI field is deliberately blank, exposing the omission bug.
      await page.locator('#lo').fill('');
      await page.locator('#hi').fill('');
      for (const id of fields) {
        const input = page.locator('#' + id);
        await input.fill('');
        await input.pressSequentially(malformed);
        expect(await input.evaluate(el => ({value: el.value, bad: el.validity.badInput})))
          .toEqual({value: '', bad: true});
      }
      // Input events alone must invalidate the old result, before Compute.
      expect(await page.evaluate(() => window.__almLastEValue())).toBeNull();
      await page.locator('#btn-run').click();
      expect(await page.evaluate(() => window.__almLastEValue())).toBeNull();
      await expect(page.locator('#tbody')).toContainText('Analysis refused');
      await expect(page.locator('#interp')).toBeEmpty();
      expect(await page.locator('#plot *').count()).toBe(0);
      for (const id of fields) await page.locator('#' + id).fill(id === 'point' ? '2' : '');
      await page.locator('#btn-run').click();
      const recovered = await page.evaluate(() => window.__almLastEValue());
      expect(recovered.point).toBeCloseTo(3.414213562373095, 10);
      expect(recovered.ci).toBeNull();
      await expect(page.locator('#interp')).toContainText('no confidence interval was supplied');
    });
  }
}

test('completed scientific notation is accepted after an unfinished exponent', async ({page}) => {
  await configure(page, '2', '', '');
  await page.locator('#lo').pressSequentially('1.5e');
  expect(await page.evaluate(() => window.__almLastEValue())).toBeNull();
  await page.locator('#lo').pressSequentially('0');
  await page.locator('#hi').pressSequentially('2.7e0');
  const r = await page.evaluate(() => window.__almLastEValue());
  expect(r.point).toBeCloseTo(3.414213562373095, 10);
  expect(r.ci).toBeCloseTo(2.3660254037844384, 10);
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
