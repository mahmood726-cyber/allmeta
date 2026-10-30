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
 const live = await page.locator('#btn-run').getAttribute('data-alm-live');
 // Unwired legacy pages retain their existing contract until the pilot wave.
 const typingLive = live === null ? ['dose-response-ma','dta-sroc','nma','heterogeneity','meta-regression'].includes(app) : live === 'on';
 if(live !== null) expect(['on','off']).toContain(live);
 if(!typingLive) await expect(page.locator('#analysis-stale')).toBeVisible();
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


// Isolated software fixture: no app wiring or numerical outputs.
async function liveFixture(page, defaultOn = true) {
 await page.route('**/__lifecycle_fixture', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('/__lifecycle_fixture');
 await page.setContent('<button id="btn-run">Run</button><input id="data" value="valid"><p id="analysis-status" hidden>Updated</p><p id="analysis-stale" hidden>Stale</p>');
 await page.addScriptTag({url:'/hub/shared/analysis-lifecycle.js'});
 await page.evaluate(defaultOn => {
  window.calls = 0; window.completions = 0; window.ready = true; window.validating = false;
  window.AlmValidate = {isRunning:()=>window.validating};
  window.run = alm.analysisLifecycle(()=>{calls++; return document.querySelector('#data').value !== '';}, x=>x, '#data');
  run.onComplete(()=>completions++);
  window.controller = alm.analysisLifecycle.live(run,{inputs:'#data',toggleId:'live-toggle',defaultOn,ready:()=>window.ready});
  document.querySelector('#btn-run').onclick = run;
 }, defaultOn);
}

test('live trusted edits debounce; synthetic events and readiness block execution',async({page})=>{
 await liveFixture(page);
 await expect(page.locator('#btn-run')).toHaveAttribute('data-alm-live','on');
 await page.locator('#data').fill('first'); await page.locator('#data').fill('second');
 await page.waitForTimeout(200); expect(await page.evaluate(()=>calls)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>calls)).toBe(1);
 expect(await page.evaluate(()=>completions)).toBe(1);
 await page.evaluate(()=>document.querySelector('#data').dispatchEvent(new Event('input',{bubbles:true})));
 await page.waitForTimeout(500); expect(await page.evaluate(()=>calls)).toBe(1);
 await page.locator('#data').fill('pending'); await page.evaluate(()=>window.ready=false);
 await page.waitForTimeout(500); expect(await page.evaluate(()=>calls)).toBe(1);
 await page.locator('#data').fill('blocked'); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(1);
 await page.evaluate(()=>window.ready=true); await page.locator('#data').fill('resumed');
 await expect.poll(()=>page.evaluate(()=>calls)).toBe(2);
 await page.locator('#data').fill('validation pending'); await page.evaluate(()=>window.validating=true);
 await page.waitForTimeout(500); expect(await page.evaluate(()=>calls)).toBe(2);
 await page.locator('#data').fill('validation active'); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(2);
});

test('live toggle, refusal, manual cancellation and disposal',async({page})=>{
 await liveFixture(page,false);
 await expect(page.getByLabel('Update results as I type')).not.toBeChecked();
 await expect(page.locator('#btn-run')).toHaveAttribute('data-alm-live','off');
 await page.locator('#data').fill('off'); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(0);
 await page.locator('#live-toggle').check(); await page.locator('#data').fill('pending');
 await page.locator('#live-toggle').uncheck(); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(0);
 await page.locator('#live-toggle').check(); await page.locator('#data').fill('manual');
 await page.locator('#btn-run').click(); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(1);
 await page.locator('#data').fill(''); await expect.poll(()=>page.evaluate(()=>calls)).toBe(2);
 expect(await page.evaluate(()=>completions)).toBe(1);
 await expect(page.locator('#analysis-status')).toBeHidden();
 await page.locator('#data').fill('dispose'); await page.evaluate(()=>{controller.dispose();controller.dispose();});
 await page.waitForTimeout(500); expect(await page.evaluate(()=>calls)).toBe(2);
 await page.locator('#data').fill('disposed'); await page.waitForTimeout(500);
 expect(await page.evaluate(()=>calls)).toBe(2);
 await expect(page.locator('#live-toggle')).toHaveCount(0);
 expect(await page.locator('#btn-run').getAttribute('data-alm-live')).toBeNull();
});
