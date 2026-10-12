import {test, expect} from './validation-fixture.mjs';
const url='/multilevel-ma/index.html';
test('multilevel published corpus: 528/528 checks and restored inputs',async({page})=>{
  test.setTimeout(180000);
  await page.goto(url);
  const before=await page.locator('#src').inputValue();
  const result=await page.evaluate(()=>AlmMultilevelValidation.runCorpus());
  console.log('MULTILEVEL CORPUS',JSON.stringify(result));
  expect(result.checks).toBe(528);expect(result.passed).toBe(528);expect(result.failed).toEqual([]);
  await expect(page.locator('#src')).toHaveValue(before);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('528/528 passed; 0 failed');
});
test('multilevel built-in example live R and edited current inputs @slow',async({page})=>{
  test.setTimeout(240000);
  await page.goto(url);
  const result=await page.evaluate(()=>AlmMultilevelValidation.runLive());
  console.log('MULTILEVEL LIVE',JSON.stringify(result));
  expect(result.rows).toHaveLength(7);expect(result.rows.filter(r=>!r.pass)).toEqual([]);
  expect(result.versions.webR).toBe('0.5.5');expect(result.versions.metafor).toBe('4.8-0');expect(result.versions.R).toContain('R version');
  await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  await expect(page.locator('#alm-validate tbody tr')).toHaveCount(7);
  // Do not click Fit: live validation must pick up edits, including a zero effect.
  await page.locator('#src').fill('A,0,0.12\nA,0.2,0.1\nB,0.3,0.12\nB,0.4,0.13\nC,0.1,0.11\nC,0.2,0.1');
  const changed=await page.evaluate(()=>AlmMultilevelValidation.runLive());
  expect(changed.rows.filter(r=>!r.pass)).toEqual([]);expect(changed.rows[0].app).not.toBe(result.rows[0].app);
});
test('multilevel refuses changed corpus bytes',async({page})=>{
  await page.goto(url);
  await page.route('**/validate/corpus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
test('multilevel refuses too few current rows',async({page})=>{
  await page.goto(url);await page.locator('#src').fill('A,0.1,0.1');
  await page.getByRole('button',{name:'Validate this analysis in R',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('Need at least three');
});
