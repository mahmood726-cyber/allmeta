import {test,expect} from '@playwright/test';
const apps=['pubbias-tests','multilevel-ma','proportion-ma','mh-peto','limit-ma','gosh','dose-response-ma','dta-sroc','nma','heterogeneity','influence','meta-regression'];
for(const app of apps) test(`lifecycle ${app}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/'+app+'/index.html');
 const data=page.locator('#src, #f-data'), initial=await data.inputValue();
 await page.locator('#btn-run').click();
 await expect(page.locator('#analysis-status')).toBeVisible();
 await expect(page.locator('#analysis-stale')).toBeHidden();
 await data.fill(initial.trim().split('\n').slice(0,-1).join('\n'));
 if(await page.locator('#src').count()) await expect(page.locator('#analysis-stale')).toBeVisible();
 else await expect(page.locator('#analysis-status')).toBeVisible();
 const option={gosh:'#model','proportion-ma':'#trans','mh-peto':'#measure','pubbias-tests':'#format','dose-response-ma':'#f-method',nma:'#f-model',heterogeneity:'#f-tau2','dta-sroc':'#f-method','meta-regression':'#f-scale'}[app];
 if(option) {
  const el=page.locator(option);await expect(el).toHaveCount(1);
  if(await el.getAttribute('type')==='checkbox') await el.setChecked(!(await el.isChecked()));
  else {
   const old=await el.inputValue();
   const values=await el.locator('option').evaluateAll(els=>els.map(e=>e.value));
   await el.selectOption(values.find(x=>x!==old));
  }
  if(app==='gosh') {await expect(page.locator('#analysis-stale')).toBeVisible();await expect(page.locator('#analysis-status')).toBeHidden();}
  else {await expect(page.locator('#analysis-stale')).toBeHidden();await expect(page.locator('#analysis-status')).toBeVisible();}
 }
 const valid=await data.inputValue();
 await data.fill('');await page.locator('#btn-run').click();
 await expect(page.locator('#analysis-status')).toBeHidden();await expect(page.locator('#analysis-stale')).toBeHidden();
 await data.fill(valid);await page.locator('#btn-run').click();
 await expect(page.locator('#analysis-status')).toBeVisible();expect(errors).toEqual([]);
});
test('screen refuses unlabelled training without success notice',async({page})=>{
 await page.goto('/screen/index.html');await page.locator('#btn-train').click();
 await expect(page.locator('#analysis-status')).toBeHidden();await expect(page.locator('#analysis-stale')).toBeHidden();
});

test('GOSH model and sampling edits require a completed run',async({page})=>{
 await page.goto('/gosh/index.html');await page.locator('#btn-run').click();
 const before=await page.locator('#plot').innerHTML();
 await page.locator('#model').selectOption('DL');
 expect(await page.locator('#plot').innerHTML()).toBe(before);
 await expect(page.locator('#analysis-stale')).toBeVisible();await expect(page.locator('#analysis-status')).toBeHidden();
 await page.locator('#btn-run').click();expect(await page.locator('#plot').innerHTML()).not.toBe(before);
 await expect(page.locator('#analysis-stale')).toBeHidden();await expect(page.locator('#analysis-status')).toBeVisible();
 // Explicit software-only input; no claimed research records.
 await page.locator('#src').fill(Array.from({length:16},(_,i)=>`${0.1+i/20}, 0.1, fixture ${i}`).join('\n'));
 await page.locator('#btn-run').click();await page.locator('#n-sample').fill('0');
 await expect(page.locator('#analysis-stale')).toBeVisible();await page.locator('#btn-run').click();
 await expect(page.locator('#analysis-status')).toBeHidden();await expect(page.locator('#analysis-stale')).toBeHidden();
 await page.locator('#n-sample').fill('37');await page.locator('#btn-run').click();await expect(page.locator('#analysis-status')).toBeVisible();
});
test('Screen training success, changed labels, retraining and refusal',async({page})=>{
 await page.goto('/screen/index.html');
 await page.evaluate(()=>{
  // Each class shares a term in exactly two documents, satisfying the real
  // vocabulary's minimum/maximum document-frequency filters.
  const titles=['amber clinical trial','birch clinical experiment','cedar laboratory review','dahlia laboratory report'];
  window.r1Records=titles.map((title,i)=>({id:'fixture-'+i,title,abstract:'Software fixture text for classifier regression coverage',r1:{d:i<2?'include':'exclude'}}));
  __almScreenpro.setState({mode:'single',records:r1Records});
 });
 await page.locator('#btn-train').click();await expect(page.locator('#analysis-status')).toBeVisible();
 await page.evaluate(()=>{r1Records[0].abstract+=' changed';__almScreenpro.setState({mode:'single',records:r1Records});});
 await expect(page.locator('#analysis-stale')).toBeVisible();await expect(page.locator('#analysis-status')).toBeHidden();
 await page.locator('#btn-train').click();await expect(page.locator('#analysis-stale')).toBeHidden();await expect(page.locator('#analysis-status')).toBeVisible();
 await page.evaluate(()=>__almScreenpro.setState({mode:'single',records:[]}));await page.locator('#btn-train').click();
 await expect(page.locator('#analysis-stale')).toBeHidden();await expect(page.locator('#analysis-status')).toBeHidden();
});
