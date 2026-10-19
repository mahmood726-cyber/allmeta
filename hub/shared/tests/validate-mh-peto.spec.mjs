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
    expect(result.rows).toHaveLength(measure==='OR'?16:8);
    expect(result.rows.filter(r=>!r.pass)).toEqual([]);
    expect(result.versions.webR).toBe('0.5.5');expect(result.versions.metafor).toBe('4.8-0');
    await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  }
  await page.locator('#src').fill('One,0,100,5,100\nTwo,2,150,8,150');
  const changed=await page.evaluate(()=>AlmMhPetoValidation.runLive());
  expect(changed.rows.filter(r=>!r.pass)).toEqual([]);
});

test('task4 live double-zero RD declares only zero-SE NaN z and p undefined',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);await page.selectOption('#measure','RD');
  await page.locator('#src').fill('A,0,100,0,100\nB,0,100,0,100');
  const result=await page.evaluate(()=>AlmMhPetoValidation.runLive());
  expect(result.rows.filter(r=>!r.pass)).toEqual([]);
  for(const q of ['z','p']) {
    const row=result.rows.find(r=>r.label==='MH RD '+q);
    expect(row.app).toBeNull();expect(row.ref).toBeNull();expect(row.pass).toBe(true);
  }
  const rejected=await page.evaluate(()=>{
    const live=AlmMhPetoValidationAdapter.live,base=live.currentState();
    return ['missing','null','nonzero-SE','estimate-NaN'].map(kind=>{
      const s=structuredClone(base);
      if(kind==='missing')delete s.result.mh_z;
      if(kind==='null')s.result.mh_z=null;
      if(kind==='nonzero-SE')s.result.mh_hi=1;
      if(kind==='estimate-NaN')s.result.mh_est=NaN;
      try{live.appValues(s);return false;}catch(e){return /evidence/.test(e.message);}
    });
  });
  expect(rejected).toEqual([true,true,true,true]);
  console.log('TASK4 DOUBLE ZERO',JSON.stringify(result));
});

test('task4 live tail rejects false zero and enforces relative tolerance and exact zero',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);await page.selectOption('#measure','RD');
  await page.locator('#src').fill('A,10,100,60,100\nB,10,100,60,100');
  const good=await page.evaluate(()=>AlmMhPetoValidation.runLive());
  expect(good.rows.filter(r=>!r.pass)).toEqual([]);
  const reference=good.rows.find(r=>r.label==='MH RD p').ref;
  expect(reference).toBeGreaterThan(0);expect(reference).toBeLessThan(1e-12);
  await page.evaluate(()=>{window.task4Original=window._almLastMhPeto;window._almLastMhPeto=()=>({...window.task4Original(),mh_p:window.task4P});});
  for(const [value,pass] of [[0,false],[reference*(1+2e-9),false],[reference*(1+0.5e-9),true]]) {
    await page.evaluate(v=>{window.task4P=v;},value);
    const result=await page.evaluate(()=>AlmMhPetoValidation.runLive());
    expect(result.rows.every(r=>r.pass)).toBe(pass);
    console.log('TASK4 LIVE TAIL',JSON.stringify({value,pass,rows:result.rows}));
  }
  await page.locator('#src').fill('A,100,1000,900,1000\nB,100,1000,900,1000');
  for(const [value,pass] of [[0,true],[Number.MIN_VALUE,false]]) {
    await page.evaluate(v=>{window.task4P=v;},value);
    const result=await page.evaluate(()=>AlmMhPetoValidation.runLive());
    expect(result.rows.find(r=>r.label==='MH RD p').ref).toBe(0);
    expect(result.rows.every(r=>r.pass)).toBe(pass);
  }
});
test('mh-peto refuses changed corpus bytes',async({page})=>{
  await page.goto(url);
  await page.route('**/validate/corpus/corpus.json',route=>route.fulfill({contentType:'application/json',body:'[]\n'}));
  await page.getByRole('button',{name:'Replay published corpus (stored references)',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});

test('task4 browser curve shape rejects missing empty truncated and invalid coordinates',async({page})=>{
  await page.goto(url);
  const rejected=await page.evaluate(async()=>{
    const adapter=AlmMhPetoValidationAdapter.corpus;
    const loaded=Object.fromEntries(await Promise.all(adapter.files.map(async f=>[f.path,await (await fetch(f.path)).json()])));
    const results=[];
    for(const kind of ['empty','missing','truncated','coordinate','grid']) {
      // Mutate exported evidence after the plot renderer has consumed it.
      const load=window.__almLoad;
      window.__almLoad=(...args)=>{
        load(...args);const lb=window.__almLabbe;
        if(!lb)return;
        if(kind==='empty')lb.curve=[];
        if(kind==='missing')delete lb.curve;
        if(kind==='truncated')lb.curve.pop();
        if(kind==='coordinate')delete lb.curve[0].pt;
        if(kind==='grid')lb.curve[0].pc=.002;
      };
      try{await adapter.run(loaded,()=>{});results.push(false);}
      catch(e){results.push(/Labbe|evidence/.test(e.message));}
      finally{window.__almLoad=load;}
    }
    return results;
  });
  expect(rejected).toEqual(Array(5).fill(true));
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
    const valid=live.appValues(base).filter(r=>!r.key.endsWith('_tail')).every(r=>r.value===null);
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
