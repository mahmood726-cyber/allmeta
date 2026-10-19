import {test,expect} from './validation-fixture.mjs';
const url='/influence/index.html';
test('influence full primary replay restores inputs, results and navigation',async({page})=>{
  test.setTimeout(240000);
  await page.goto(url);
  // Corpus validation must preserve pending edits and the prior rendered result independently.
  await page.locator('#src').fill('not yet valid');
  // Let the pending user edit reach autosave before checking replay restoration.
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('alm-autosave:influence')||'null')?.values.src==='not yet valid');
  const before=await page.evaluate(()=>({data:__almSnapshot(),href:location.href,length:history.length,state:history.state,full:_almLastInfluence(),storage:{...localStorage}}));
  const result=await page.evaluate(()=>AlmInfluenceValidation.runCorpus());
  expect(result.checks).toBe(164802);expect(result.passed).toBe(164802);expect(result.failed).toEqual([]);
  expect(await page.evaluate(()=>({data:__almSnapshot(),href:location.href,length:history.length,state:history.state,full:_almLastInfluence(),storage:{...localStorage}}))).toEqual(before);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('164802/164802 passed; 0 failed');
  console.log('INFLUENCE CORPUS',result.passed+'/'+result.checks);
});
test('influence restores exact page state after a mid-replay failure',async({page})=>{
  await page.goto(url);
  const result=await page.evaluate(async()=>{
    const before=__almInfluenceValidationSnapshot(),navigation={href:location.href,length:history.length,state:history.state};
    const original=_almLastInfluence;_almLastInfluence=()=>({...original(),mu:NaN});
    let error='';try{await AlmInfluenceValidation.runCorpus();}catch(e){error=e.message;}finally{_almLastInfluence=original;}
    return {error,restored:JSON.stringify(before)===JSON.stringify(__almInfluenceValidationSnapshot()),sameNavigation:JSON.stringify(navigation)===JSON.stringify({href:location.href,length:history.length,state:history.state})};
  });
  expect(result.error).toContain('Invalid app quantity');expect(result.restored).toBe(true);expect(result.sameNavigation).toBe(true);
});
test('influence current built-in example and changed inputs live R @slow',async({page})=>{
  test.setTimeout(240000);await page.goto(url);
  const r=await page.evaluate(()=>AlmInfluenceValidation.runLive());
  expect(r.rows).toHaveLength(177);expect(r.rows.filter(x=>!x.pass)).toEqual([]);
  expect(r.versions.metafor).toBe('4.8-0');expect(r.versions.webR).toBe('0.5.5');
  await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  await page.locator('#src').fill('0,0.1,A\n0.2,0.12,B\n0.4,0.15,C\n0.1,0.09,D');
  const edited=await page.evaluate(()=>AlmInfluenceValidation.runLive());
  expect(edited.rows).toHaveLength(75);expect(edited.rows.filter(x=>!x.pass)).toEqual([]);
  expect(edited.rows[0].app).not.toBe(r.rows[0].app);
  console.log('INFLUENCE LIVE',r.rows.length+'/'+r.rows.length,'and',edited.rows.length+'/'+edited.rows.length);
});
test('influence refuses altered corpus bytes',async({page})=>{
  await page.goto(url);await page.route('**/validate/corpus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await page.getByRole('button',{name:'Replay published corpus (stored references)',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
test('influence malformed evidence is refused before replay',async({page})=>{
  test.setTimeout(90000);await page.goto(url);
  const errors=await page.evaluate(async()=>{
    const a=AlmInfluenceValidationAdapter,loaded=await AlmInfluenceValidation.prepare(),results=[];
    const cp=a.corpus.files[0].path,rp=a.corpus.files[1].path;
    const bad=[
      x=>x[cp].pop(),
      x=>x[cp][1].id=x[cp][0].id,
      x=>x[rp][1].id=x[rp][0].id,
      x=>x[rp][0].id='unexpected',
      x=>delete x[rp][0].data.loo.estimate,
      x=>x[rp][0].data.loo.estimate.pop(),
      x=>x[rp][0].data.inf.dffits[0]=NaN,
      x=>x[rp][0].data.inf.dffits[0]=Infinity,
      x=>x[rp][0].data.flags[0]=1,
      x=>x[rp][0].data.full.mu=null,
      x=>x[rp][0].data.radial.x[0]='1',
      x=>x[cp][0].data.rows[1]=x[cp][0].data.rows[0],
      x=>x[cp][0].data.vi[0]=0
    ];
    for(const mutate of bad){const x=structuredClone(loaded);mutate(x);try{await a.corpus.run(x,()=>{});results.push('UNSAFE PASS');}catch(e){results.push(e.message);}}
    return results;
  });
  expect(errors).toHaveLength(13);expect(errors).not.toContain('UNSAFE PASS');
});
test('influence refuses invalid current input and missing app evidence',async({page})=>{
  await page.goto(url);
  await page.locator('#src').fill('0.1,0.1,A\n0.2,0.1,B\nbad,0.1,C');
  await expect(page.evaluate(()=>AlmInfluenceValidation.runLive())).rejects.toThrow('valid effect rows');
  await page.reload();
  const result=await page.evaluate(()=>{
    const original=_almLastInfluence;
    _almLastInfluence=()=>({...original(),mu:undefined});
    try{AlmInfluenceValidationAdapter.live.currentState();return 'UNSAFE PASS';}catch(e){return e.message;}finally{_almLastInfluence=original;}
  });
  expect(result).toContain('Invalid app quantity');
});
test('influence locks page inputs during corpus replay and restores them afterwards',async({page})=>{
  // Review finding: an edit made mid-replay was overwritten and then discarded by the final restore. The page's
  // editable controls must be disabled for the whole replay and returned to their previous state afterwards.
  test.setTimeout(240000);
  await page.goto(url);
  const before=await page.evaluate(()=>[...document.querySelectorAll('textarea,input,select,button')].filter(el=>!el.closest('#alm-validate')).map(el=>el.disabled));
  await page.evaluate(()=>{window.__replay=AlmInfluenceValidation.runCorpus();});
  await expect(page.locator('#src')).toBeDisabled();
  const during=await page.evaluate(()=>[...document.querySelectorAll('textarea,input,select,button')].filter(el=>!el.closest('#alm-validate')).every(el=>el.disabled));
  expect(during).toBe(true);
  const result=await page.evaluate(()=>window.__replay);
  expect(result.checks).toBe(164802);expect(result.passed).toBe(164802);
  expect(await page.evaluate(()=>[...document.querySelectorAll('textarea,input,select,button')].filter(el=>!el.closest('#alm-validate')).map(el=>el.disabled))).toEqual(before);
  await expect(page.locator('#src')).toBeEditable();
});
