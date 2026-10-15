import {test,expect} from './validation-fixture.mjs';
const url='/limit-ma/index.html';
test('limit-ma full primary replay preserves pending input, results and navigation',async({page})=>{
 test.setTimeout(180000);await page.goto(url);await page.locator('#src').fill('pending invalid edit');
 // Wait for the user's debounced save before testing replay's restoration.
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('alm-autosave:limit-ma')||'null')?.values.src==='pending invalid edit');
 const snapshot=()=>({data:__almLimitValidationSnapshot(),href:location.href,length:history.length,state:history.state,storage:{...localStorage}});
 const before=await page.evaluate(snapshot);const r=await page.evaluate(()=>AlmLimitValidation.runCorpus());
 expect(r.checks).toBe(55525);expect(r.passed).toBe(55524);expect(r.failed).toHaveLength(1);
 expect(r.failed[0].id).toBe('dat.hartmannboyce2018::001');expect(r.failed[0].quantity).toBe('status');
 expect(await page.evaluate(snapshot)).toEqual(before);
 await expect(page.locator('#alm-validate')).toContainText('55524/55525 passed; 1 failed');
 console.log('LIMIT CORPUS',r.passed+'/'+r.checks);
});
test('limit-ma current built-in example live R @slow',async({page})=>{
 test.setTimeout(240000);await page.goto(url);const r=await page.evaluate(()=>AlmLimitValidation.runLive());
 expect(r.rows).toHaveLength(32);expect(r.rows.filter(x=>!x.pass)).toEqual([]);
 expect(r.versions.meta).toBe('8.3-0');expect(r.versions.metasens).toBe('1.5-3');
 await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: meta 8.5-0');
 console.log('LIMIT LIVE',r.rows.length+'/'+r.rows.length);
});
test('limit-ma refuses changed corpus bytes',async({page})=>{
 await page.goto(url);await page.route('**/validate/corpus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
 await expect(page.evaluate(()=>AlmLimitValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
});
test('limit-ma malformed evidence and changed refusal fail closed',async({page})=>{
 await page.goto(url);const errors=await page.evaluate(async()=>{
 const a=AlmLimitValidationAdapter,x=await AlmLimitValidation.prepare(),cp=a.corpus.files[0].path,rp=a.corpus.files[1].path;
 const mutations=[x=>x[cp].pop(),x=>x[cp][1].id=x[cp][0].id,x=>x[rp][1].id=x[rp][0].id,x=>x[rp][0].id='wrong',x=>delete x[rp][0].values.limit_est,x=>x[rp][0].values.limit_est=null,x=>x[rp][0].values.limit_est=NaN,x=>x[rp][0].values.limit_est=Infinity,x=>x[rp][0].values.limit_est='1',x=>x[rp][0].values.te_limit.pop(),x=>x[cp][0].source_rows[1]=x[cp][0].source_rows[0],x=>x[cp][0].se[0]=0,x=>x[rp].find(r=>r.status==='refused').reason='changed',x=>x[rp].find(r=>r.status==='refused').status='ok'];
 const out=[];for(const mutate of mutations){const y=structuredClone(x);mutate(y);try{await a.corpus.run(y,()=>{});out.push('UNSAFE PASS');}catch(e){out.push(e.message);}}return out;
 });expect(errors).toHaveLength(14);expect(errors).not.toContain('UNSAFE PASS');
});
test('limit-ma replay restores after engine failure',async({page})=>{
 await page.goto(url);const r=await page.evaluate(async()=>{const before=__almLimitValidationSnapshot(),original=_almLastLimit;_almLastLimit=()=>({...original(),limit_est:NaN});let error;try{await AlmLimitValidation.runCorpus();}catch(e){error=e.message;}finally{_almLastLimit=original;}return {error,same:JSON.stringify(before)===JSON.stringify(__almLimitValidationSnapshot())};});
 expect(r.error).toContain('Invalid app quantity');expect(r.same).toBe(true);await expect(page.locator('#src')).toBeEditable();
});
test('limit-ma invalid current rows are not silently dropped',async({page})=>{
 await page.goto(url);await page.locator('#src').fill('0.1,0.1,A\n0.2,0.2,B\nbad,0.3,C');
 await expect(page.evaluate(()=>AlmLimitValidation.runLive())).rejects.toThrow('valid effect rows');
});

for(const mutation of ['swap estimate/SE','reverse CI endpoints','append digit','change row label','swap headers','rename header','add header','remove column','extra header row','body whitespace','header whitespace']) {
 test('limit-ma table replay detects '+mutation,async({page})=>{
  test.setTimeout(180000);await page.goto(url);
  const r=await page.evaluate(async mutation=>{
   const original=__almLimitValidationRun;
   const head=document.getElementById('body').closest('table').tHead,originalHead=head.innerHTML;
   window.__almLimitValidationRun=(...args)=>{
    original(...args);document.getElementById('body').closest('table').tHead.innerHTML=originalHead;
    const head=document.getElementById('body').closest('table').tHead;
    const headers=head.rows[0].cells;
    if(mutation==='swap headers') {
     headers[1].textContent='SE';headers[2].textContent='Estimate';
    } else if(mutation==='rename header') headers[1].textContent='Effect';
    else if(mutation==='add header') head.rows[0].appendChild(document.createElement('th')).textContent='Extra';
    else if(mutation==='remove column') headers[3]?.remove();
    else if(mutation==='extra header row') head.appendChild(head.rows[0].cloneNode(true));
    else if(mutation==='header whitespace') headers[0].textContent='Method ';
    for(const row of document.querySelectorAll('#body tr')) {
     const cells=row.cells;
     if(mutation==='swap estimate/SE') {
      const estimate=cells[1].innerHTML;cells[1].innerHTML=cells[2].innerHTML;cells[2].innerHTML=estimate;
     } else if(mutation==='reverse CI endpoints') {
      const [lo,hi]=cells[3].innerText.slice(1,-1).split(', ');cells[3].textContent='['+hi+', '+lo+']';
     } else if(mutation==='append digit') cells[1].textContent+='7';
     else if(mutation==='change row label') cells[0].textContent+=' changed';
     else if(mutation==='body whitespace') cells[0].textContent=cells[0].textContent.replace(/ /g,'  ');
     else if(mutation==='remove column') cells[3].remove();
    }
   };
   try{return await AlmLimitValidation.runCorpus();}
   finally{window.__almLimitValidationRun=original;head.innerHTML=originalHead;}
  },mutation);
  expect(r.checks).toBe(55525);
  expect(r.failed.filter(x=>x.quantity==='table_render')).toHaveLength(168);
  expect(r.failed.filter(x=>x.quantity!=='table_render').map(x=>({id:x.id,quantity:x.quantity})))
   .toEqual([{id:'dat.hartmannboyce2018::001',quantity:'status'}]);
  expect(r.passed).toBe(55356);
  console.log('LIMIT TABLE',mutation,'168 table_render failures');
 });
}
