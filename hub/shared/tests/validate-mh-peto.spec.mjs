import {readFile} from 'node:fs/promises';
import {test,expect} from './validation-fixture.mjs';
const url='/mh-peto/index.html'; // relative: resolved against the standard config's baseURL
// Optional baseline injection proves these regressions fail with the old adapter.
test.beforeEach(async({page})=>{
  if(process.env.MH_PETO_ADAPTER_UNDER_TEST) {
    const body=await readFile(process.env.MH_PETO_ADAPTER_UNDER_TEST,'utf8');
    await page.route('**/mh-peto/validate/adapter.js',route=>route.fulfill({contentType:'text/javascript',body}));
  }
});
test('mh-peto full paper corpus and complete restoration',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);
  // Include a pending, unsubmitted edit: restore input and prior rendered result.
  await page.locator('#src').fill('Pending,1,30,4,30\nOther,2,20,3,20');
  const snapshot=()=>page.evaluate(()=>({src:document.getElementById('src').value,measure:document.getElementById('measure').value,href:location.href,length:history.length,state:history.state,html:['pooled-body','per-body','forest','labbe','fragility-note'].map(id=>document.getElementById(id).outerHTML),result:_almLastMhPeto(),labbe:window.__almLabbe,focus:document.activeElement.id,scroll:[scrollX,scrollY],selection:[document.getElementById('src').selectionStart,document.getElementById('src').selectionEnd]}));
  const before=await snapshot();
  const result=await page.evaluate(()=>AlmMhPetoValidation.runCorpus());
  console.log('MH/PETO CORPUS',JSON.stringify({checks:result.checks,passed:result.passed,failed:result.failed,tails:{checks:result.tails.checks,passed:result.tails.passed}}));
  expect(result.checks).toBe(68461);expect(result.passed).toBe(68461);expect(result.failed).toEqual([]);
  expect(result.tails.checks).toBeGreaterThan(0);expect(result.tails.passed).toBe(result.tails.checks);
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('68461/68461 passed; 0 failed');
});
test('mh-peto live built-in OR RR RD and edited inputs @slow',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);
  for(const measure of ['OR','RR','RD']){
    await page.selectOption('#measure',measure);
    const result=await page.evaluate(()=>AlmMhPetoValidation.runLive());
    console.log('MH/PETO LIVE',measure,JSON.stringify(result));
    expect(result.rows).toHaveLength(measure==='OR'?14:7);
    expect(result.rows.filter(r=>!r.pass)).toEqual([]);
    expect(result.versions.webR).toBe('0.5.5');expect(result.versions.metafor).toBe('4.8-0');
    await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  }
  await page.locator('#src').fill('One,0,100,5,100\nTwo,2,150,8,150');
  const changed=await page.evaluate(()=>AlmMhPetoValidation.runLive());
  expect(changed.rows.filter(r=>!r.pass)).toEqual([]);
});
test('mh-peto refuses changed corpus bytes',async({page})=>{
  await page.goto(url);
  await page.route('**/validate/corpus/corpus.json',route=>route.fulfill({contentType:'application/json',body:'[]\n'}));
  await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
test('mh-peto refuses fewer than two current rows',async({page})=>{
  await page.goto(url);await page.locator('#src').fill('Only,1,10,2,10');
  await page.getByRole('button',{name:'Validate this analysis in R',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('Need at least two');
});

test('mh-peto browser replay reports removed app evidence as FAIL',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);
  await page.evaluate(()=>{
    const original=window._almLastMhPeto;
    window._almLastMhPeto=()=>{
      const result=original();
      if(!result || result.mh_est!==null)return result;
      const copy={...result};delete copy.mh_est;return copy;
    };
  });
  const result=await page.evaluate(()=>AlmMhPetoValidation.runCorpus());
  expect(result.checks).toBe(68461);
  expect(result.passed).toBeLessThan(result.checks);
  expect(result.failed.some(r=>r.quantity==='OR.est')).toBe(true);
  console.log('REMOVED APP FIELD',JSON.stringify({checks:result.checks,passed:result.passed,failures:result.failed.length}));
  await expect(page.locator('#alm-validate [role=status]')).toContainText('failed');
});
test('mh-peto rejects invalid live values and preserves explicit undefined',async({page})=>{
  await page.goto(url);
  const result=await page.evaluate(()=>{
    const live=AlmMhPetoValidationAdapter.live;
    const base={measure:'OR',result:Object.fromEntries(['mh','peto'].flatMap(p=>['est','lo','hi','z','p'].map(q=>[p+'_'+q,null])))};
    const valid=live.appValues(base).every(r=>r.value===null);
    const rejected=['missing',NaN,Infinity,'0',true,[],{}].map(value=>{
      const s=structuredClone(base);
      if(value==='missing')delete s.result.peto_est;else s.result.peto_est=value;
      try {live.appValues(s);return false;}catch(e){return /evidence/.test(e.message);}
    });
    return {valid,rejected};
  });
  expect(result.valid).toBe(true);expect(result.rejected).toEqual(Array(7).fill(true));
});
test('mh-peto refuses duplicate and incomplete keyed corpus inputs',async({page})=>{
  await page.goto(url);
  const result=await page.evaluate(async()=>{
    const adapter=AlmMhPetoValidationAdapter.corpus;
    const loaded=Object.fromEntries(await Promise.all(adapter.files.map(async f=>[f.path,await (await fetch(f.path)).json()])));
    const results=[];
    for(const file of adapter.files)for(const mode of ['duplicate','replace','missing']) {
      const changed=structuredClone(loaded),xs=changed[file.path];
      if(mode==='missing')xs.pop();
      else if(mode==='replace')xs[xs.length-1]={...xs[0],FI:999};
      else xs.push({...xs[0],FI:999});
      try {await adapter.run(changed,()=>{});results.push(false);}
      catch(e){results.push(/Duplicate|cardinality|identifier/.test(e.message));}
    }
    return results;
  });
  expect(result).toEqual(Array(9).fill(true));
});
