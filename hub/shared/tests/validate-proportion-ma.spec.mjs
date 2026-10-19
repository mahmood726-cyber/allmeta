import {test,expect} from './validation-fixture.mjs';
test('proportion full corpus and exact state restoration',async({page})=>{
  test.setTimeout(240000);
  await page.goto('/proportion-ma/index.html');
  const state=()=>page.evaluate(()=>({href:location.href,length:history.length,state:history.state,src:document.getElementById('src').value,trans:document.getElementById('trans').value,tau:document.getElementById('tau-est').value,result:window._almLastPropMA(),body:document.getElementById('res-body').innerHTML,forest:document.getElementById('forest').outerHTML,het:document.getElementById('het').innerHTML}));
  const before=await state();
  const result=await page.evaluate(()=>AlmProportionValidation.runCorpus());
  console.log('PROPORTION CORPUS',JSON.stringify({checks:result.checks,passed:result.passed,failed:result.failed,refusals:result.refusals.length}));
  expect(result.checks).toBe(298116);expect(result.passed).toBe(298116);expect(result.failed).toEqual([]);expect(result.refusals).toHaveLength(198);
  expect(await state()).toEqual(before);
});
test('proportion live built-in and every current transform estimator @slow',async({page})=>{
  test.setTimeout(300000);await page.goto('/proportion-ma/index.html');
  const first=await page.evaluate(()=>AlmProportionValidation.runLive());
  console.log('PROPORTION LIVE',JSON.stringify(first));
  expect(first.rows).toHaveLength(16);expect(first.rows.filter(r=>!r.pass)).toEqual([]);
  expect(first.versions.webR).toBe('0.5.5');expect(first.versions.metafor).toBe('4.8-0');
  await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  for(const tr of ['logit','ft','raw'])for(const method of ['PM','DL','FE']) {
    // Assign without firing the page's Run handler: live must recompute current inputs.
    await page.evaluate(({tr,method})=>{document.getElementById('src').value='0,10,A\n10,10,B\n4,20,C';document.getElementById('trans').value=tr;document.getElementById('tau-est').value=method;},{tr,method});
    const result=await page.evaluate(()=>AlmProportionValidation.runLive());
    expect(result.rows.filter(r=>!r.pass),tr+' '+method).toEqual([]);
  }
  await page.locator('#src').fill('0,10,A\n4,20,B');
  const two=await page.evaluate(()=>AlmProportionValidation.runLive());expect(two.rows.filter(r=>!r.pass)).toEqual([]);
});
for(const file of ['corpus.json','reference.json'])test('proportion refuses changed '+file,async({page})=>{
  await page.goto('/proportion-ma/index.html');
  await page.route('**/validate/corpus/'+file,r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.getByRole('button',{name:'Replay published corpus (stored references)',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
test('proportion refuses insufficient current rows',async({page})=>{
  await page.goto('/proportion-ma/index.html');await page.locator('#src').fill('1,10,A');
  await page.getByRole('button',{name:'Validate this analysis in R',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('Need at least 2');
});
