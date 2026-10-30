import {test,expect} from '@playwright/test';
const spec={model:'random',estimator:'REML',test:'adhoc',measure:'MD'};
test.beforeEach(async({page})=>{
  await page.route('**/a4-test-page', route => route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>A4 fixture</title>'}));
  await page.goto('/a4-test-page');
  await page.setContent('<main><output id="estimate">-0.230</output><output id="i2">55%</output><output id="k">8</output></main><aside id="alm-addons" data-alm-addon><pre id="a4-draft"></pre></aside>');
  await page.addScriptTag({url:'/shared/method-refs.js'});
  await page.addScriptTag({url:'/hub/shared/report-text.js'});
});
test('browser reads visible values and renders draft offline without changing main',async({page,context})=>{
  const before=await page.locator('main').innerHTML();
  await context.setOffline(true);
  const result=await page.evaluate(spec=>{
    const displayed=Object.fromEntries(['estimate','i2','k'].map(k=>[k,{text:document.getElementById(k).textContent,source:'#'+k}]));
    const r=alm.reportText.interpret(spec,displayed);
    document.getElementById('a4-draft').textContent=r.text;
    return {r,methods:alm.reportText.methods(spec)};
  },spec);
  await expect(page.locator('#a4-draft')).toContainText('Auto-generated draft - check before use');
  await expect(page.locator('#a4-draft')).toContainText('-0.230');
  expect(result.r.text).toContain('moderate'); expect(result.r.text).toContain('substantial');
  expect(result.methods.text).toContain('modified Hartung\u2013Knapp');
  expect(result.methods.pendingReferences).toEqual(['metafor']);
  expect(await page.locator('main').innerHTML()).toBe(before);
});
test('browser rejects invented numbers and banned claims',async({page})=>{
  const results=await page.evaluate(()=>['Estimate: 999','proves benefit'].map(text=>{
    try{alm.reportText.assertProvenance(text,{estimate:{text:'-0.230',source:'#estimate'}});return 'accepted';}
    catch(e){return e.message;}
  }));
  expect(results[0]).toContain('Undisplayed'); expect(results[1]).toContain('Banned');
});
test('browser rejects unsupported choice and missing provenance',async({page})=>{
  const errors=await page.evaluate(spec=>{
    const attempts=[()=>alm.reportText.methods({...spec,test:'HK'}),()=>alm.reportText.interpret(spec,{estimate:{text:'-0.230'}})];
    return attempts.map(f=>{try{f();return false;}catch{return true;}});
  },spec);
  expect(errors).toEqual([true,true]);
});
