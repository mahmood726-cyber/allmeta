// multilevel-ma extras (#alm-plus): CR2 cluster-robust inference and variance
// profiles. Engine tests compare against the pinned native R references
// (2,596 checks); browser tests run the 7,272-check extras replay, the
// individual negative controls and (tagged @slow) the live webR tier.
import {test,expect} from './validation-fixture.mjs';
import {test as engineTest,expect as engineExpect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../../../multilevel-ma/',import.meta.url);
vm.runInThisContext(readFileSync(new URL('plus-engine.js',root),'utf8'),{filename:'plus-engine.js'});
const Engine=globalThis.AlmMultilevelPlusEngine;
const corpus=JSON.parse(readFileSync(new URL('validate/corpus/corpus.json',root),'utf8'));
const refs=()=>JSON.parse(readFileSync(new URL('validate/plus-corpus/reference-plus.json',root),'utf8'));
const url='/multilevel-ma/index.html';
function check(a,b,tol,absolute=false){engineExpect(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)/(absolute?1:Math.max(1,Math.abs(b)))<=tol,`${a} versus ${b} (tolerance ${tol})`).toBe(true);}

engineTest('multilevel-ma-plus all 44 R references: fit, CR2, profile intervals and every plotted coordinate',()=>{
  const reference=refs();engineExpect(Object.keys(reference)).toHaveLength(44);
  let checks=0;
  for(const [name,r] of Object.entries(reference)){
    engineExpect(r.status,name+': '+r.reason).toBe('ok');
    const a=Engine.fit(corpus[name]);
    engineExpect(a.rows).toBe(r.rows);engineExpect(a.clusters).toBe(r.clusters);checks+=2;
    check(a.logLik,r.logLik,1e-6);checks++;
    for(const k of Object.keys(r.robust)){check(a.robust[k],r.robust[k],k==='p'?1e-9:1e-6,k==='p');checks++;}
    const cr=Engine.cr2(corpus[name],...r.cr2Sigma2);
    for(const k of Object.keys(r.robust)){check(cr[k],r.robust[k],1e-9,k==='p');checks++;}
    for(let j=0;j<2;j++)for(const k of ['estimate','lower','upper','x','ll']){
      for(const [i,v] of [r.profiles[j][k]].flat().entries()){check([a.profiles[j][k]].flat()[i],v,1e-6);checks++;}
    }
  }
  console.log('MULTILEVEL PLUS ENGINE',checks+'/'+checks);
  engineExpect(checks).toBe(2596);
});
engineTest('multilevel-ma-plus invalid rows, too few clusters and unidentifiable components refuse',()=>{
  const valid=[{cluster:'A',y:.1,v:.01},{cluster:'A',y:.2,v:.02},{cluster:'B',y:.3,v:.03}];
  engineExpect(()=>Engine.fit(valid.slice(0,1))).toThrow(/three valid/);
  engineExpect(()=>Engine.fit(valid.map(r=>({...r,cluster:'A'})))).toThrow(/two clusters/);
  engineExpect(()=>Engine.fit(valid.map((r,i)=>({...r,cluster:i})))).toThrow(/not identifiable/);
  for(const value of [0,-1,NaN,Infinity])engineExpect(()=>Engine.fit(valid.map((r,i)=>i?r:{...r,v:value}))).toThrow(/positive variances/);
  engineExpect(()=>Engine.fit(valid.map((r,i)=>i?r:{...r,y:NaN}))).toThrow(/finite effects/);
});
engineTest('multilevel-ma-plus cluster labels cannot affect membership through object prototype keys',()=>{
  const rows=corpus['dat.konstantopoulos2011'],keys=[...new Set(rows.map(r=>r.cluster))];
  const a=Engine.fit(rows),b=Engine.fit(rows.map(r=>({...r,cluster:keys.indexOf(r.cluster)===0?'__proto__':'c'+keys.indexOf(r.cluster)})));
  engineExpect(b).toEqual(a);
});
engineTest('multilevel-ma-plus pinned LF corpus files verify; every changed file is refused',async()=>{
  const context=vm.createContext({crypto:webcrypto,TextDecoder,TextEncoder});
  vm.runInContext(readFileSync(new URL('../../../shared/alm-validate.js',import.meta.url),'utf8'),context);
  const manifest=JSON.parse(readFileSync(new URL('validate/MANIFEST-plus.json',root),'utf8'));
  engineExpect(manifest.files).toHaveLength(4);engineExpect(manifest.checks).toBe(7272);
  for(const f of manifest.files){
    const bytes=readFileSync(new URL(f.path,root));engineExpect(bytes.length).toBe(f.bytes);engineExpect(bytes.includes(13)).toBe(false);
    await context.AlmValidate.verify(bytes,f.sha256,f.path);
    const changed=Buffer.from(bytes);changed[0]^=1;
    await engineExpect(context.AlmValidate.verify(changed,f.sha256,f.path)).rejects.toThrow(/SHA-256 mismatch/);
  }
});

test('multilevel-ma-plus extras replay is 7272/7272 and leaves inputs and navigation unchanged',async({page})=>{
  test.setTimeout(600000);
  await page.goto(url);
  const before=await page.locator('#src').inputValue();
  const navigation=await page.evaluate(()=>({href:location.href,state:history.state,length:history.length}));
  const plus=await page.evaluate(()=>AlmMultilevelPlusValidation.runCorpus());
  console.log('MULTILEVEL PLUS',plus.passed+'/'+plus.checks,'failed',plus.failed.length,JSON.stringify(plus.failed.slice(0,5)));
  console.log('MULTILEVEL PLUS AXES',JSON.stringify(plus.axisCoverage));
  expect(plus.failed).toEqual([]);expect(plus.checks).toBe(7272);expect(plus.passed).toBe(7272);
  expect(plus.axisCoverage).toHaveLength(44*4);
  const checked=plus.axisCoverage.filter(a=>a.checked).length;
  await expect(page.locator('#alm-plus-validate')).toContainText(`Axis labels: ${checked} checked; ${plus.axisCoverage.length-checked} not checked.`);
  for(const a of plus.axisCoverage)if(a.checked){expect(a.coverage).toBeGreaterThanOrEqual(.2);expect(a.residual).toBeLessThanOrEqual(1e-7);}else expect(a.message).toMatch(/^axis labels: not checked \(.*\)$/);
  expect(await page.locator('#src').inputValue()).toBe(before);
  expect(await page.evaluate(()=>({href:location.href,state:history.state,length:history.length}))).toEqual(navigation);
});

async function prepared(page){
  await page.goto(url);
  await page.evaluate(async()=>{
    const c=await (await fetch('validate/corpus/corpus.json')).json(),refs=await(await fetch('validate/plus-corpus/reference-plus.json')).json();
    const rows=c['dat.konstantopoulos2011'];document.getElementById('src').value=rows.map(r=>[r.cluster,r.y,Math.sqrt(r.v)].join(',')).join('\n');
    window.plusTestRef=refs['dat.konstantopoulos2011'];window.plusTestApp=AlmMultilevelPlus.calculate();
  });
}
test('multilevel-ma-plus clean plot and table pass at desktop and narrow viewport',async({page})=>{
  await prepared(page);
  for(const width of [1280,480]){
    await page.setViewportSize({width,height:900});
    const bad=await page.evaluate(async()=>(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).filter(r=>!r.pass));expect(bad).toEqual([]);
  }
});
test('multilevel-ma-plus every numerical, display and export check can fail',async({page})=>{
  test.setTimeout(120000);
  await prepared(page);
  const outcome=await page.evaluate(async()=>{
    const keys=Object.keys(AlmMultilevelPlus.quantities(plusTestApp)),failed=[];
    function alter(obj,key){const parts=key.split('.');let v=obj;for(const p of parts.slice(0,-1))v=v[p==='profile'?'profiles':p];v[parts.at(-1)]+=1;}
    const realExport=AlmMultilevelPlus.exportText;
    for(const key of keys){
      const changed=structuredClone(plusTestApp);alter(changed,key);
      if((await AlmMultilevelPlusAudit.audit(changed,plusTestRef)).find(x=>x.quantity===key)?.pass!==false)failed.push('number '+key);
      const cell=document.querySelector(`[data-quantity="${key}"]`),old=cell.textContent;cell.textContent=String(Number(old)+1);
      if((await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='display.'+key)?.pass!==false)failed.push('display '+key);cell.textContent=old;
      const exp=JSON.parse(realExport());alter(exp,key);AlmMultilevelPlus.exportText=()=>JSON.stringify(exp);
      if((await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='export.'+key)?.pass!==false)failed.push('export '+key);
      AlmMultilevelPlus.exportText=realExport;
    }
    return {keys:keys.length,failed};
  });
  expect(outcome.keys).toBe(52);expect(outcome.failed).toEqual([]);
});
test('multilevel-ma-plus extra cells, altered labels and export metadata fail',async({page})=>{
  await prepared(page);
  const checks=await page.evaluate(async()=>{
    const output=document.getElementById('alm-plus-output'),cell=output.querySelector('[data-quantity]'),clone=cell.cloneNode(true);output.append(clone);
    const count=(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='display.count').pass;clone.remove();
    const label=cell.previousElementSibling,text=label.textContent;label.textContent='Incorrect label';
    const labelled=(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='display.rows').pass;label.textContent=text;
    const fn=AlmMultilevelPlus.exportText;AlmMultilevelPlus.exportText=()=>JSON.stringify({...JSON.parse(fn()),inference:'CR1'});
    const exported=(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='export.schema').pass;AlmMultilevelPlus.exportText=fn;
    const title=output.querySelector('h3'),old=title.textContent;title.textContent='CR1';
    const schema=(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).find(x=>x.quantity==='display.schema').pass;title.textContent=old;
    return [count,labelled,exported,schema];
  });expect(checks).toEqual([false,false,false,false]);
});
test('multilevel-ma-plus each plot fails on geometry, paint, title and axis-label changes',async({page})=>{
  await prepared(page);
  const checks=await page.evaluate(async()=>{
    const out=[];
    const reset=()=>AlmMultilevelPlus.render(plusTestApp);
    const svgAt=j=>document.querySelectorAll('#alm-plus-output svg')[j];
    const label=(j,axis,i)=>svgAt(j).querySelectorAll(`[data-plus-tick-label="${axis}"]`)[i];
    // Moves a label by a fraction of the full tick step (two endpoint ticks).
    const shift=(j,axis,i,f)=>{const a=Number(label(j,axis,0).textContent),b=Number(label(j,axis,1).textContent),n=label(j,axis,i);n.textContent=String(Number(n.textContent)+f*(b-a));};
    for(let j=0;j<2;j++){
      for(const [kind,apply] of [
        ['geometry',()=>svgAt(j).querySelector('circle').setAttribute('transform','translate(15 0)')],
        ['paint',()=>{svgAt(j).querySelector('circle').style.fill='red';}],
        ['labels',()=>{svgAt(j).querySelector('text').textContent='Wrong axis';}],
        ['labels',()=>shift(j,'x',1,.6)],
        ['labels',()=>shift(j,'y',0,-.6)]
      ]){apply();out.push((await AlmMultilevelPlusAudit.plotChecks(plusTestApp)).find(x=>x.quantity===`plot.${j}.${kind}`).pass);reset();}
    }
    // The independent tick-step oracle alone (no clean-render comparison):
    // beyond half a tick step fails; within half a tick step is no label failure.
    const oracle=(axis,f)=>{shift(0,axis,1,f);const r=AlmMultilevelPlusAudit.axisOracle(svgAt(0),plusTestApp.profiles[0]);reset();return r.map(x=>({checked:x.checked,failure:x.failure||''}));};
    return {out,far:[oracle('x',.6),oracle('y',.6)],near:[oracle('x',.4),oracle('y',-.4)],clean:AlmMultilevelPlusAudit.axisOracle(svgAt(0),plusTestApp.profiles[0])};
  });
  expect(checks.out).toEqual(Array(10).fill(false));
  for(const r of checks.far)expect(r.some(x=>/label does not match mark scale/.test(x.failure))).toBe(true);
  for(const r of checks.near)expect(r.map(x=>x.failure)).toEqual(['','']);
  expect(checks.clean.map(x=>[x.axis,x.checked,x.failure||''])).toEqual([['x',true,''],['y',true,'']]);
});
test('multilevel-ma-plus edited inputs invalidate extras and exports',async({page})=>{
  await prepared(page);
  await page.locator('#src').fill('A,0.1,0.1');await page.waitForTimeout(250);
  await expect(page.locator('#alm-plus-output [data-quantity]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Export extras (JSON)',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>{try{AlmMultilevelPlus.exportText();return false;}catch{return true;}})).toBe(true);
});
test('multilevel-ma-plus all four refusals pass and each reason/display/export check can fail',async({page})=>{
  await prepared(page);
  const outcome=await page.evaluate(()=>{
    const checks=[];
    for(const c of AlmMultilevelPlusAudit.refusalCases){
      document.getElementById('src').value=c.text;let reason='';try{AlmMultilevelPlus.calculate();}catch(e){reason=e.message;}
      checks.push(...AlmMultilevelPlusAudit.refusalChecks(reason,c.reason).map(x=>x.pass));
      checks.push(!AlmMultilevelPlusAudit.refusalChecks('Incorrect refusal',c.reason)[0].pass);
      document.querySelector('#alm-plus-output [data-refusal]').textContent='Incorrect display';
      checks.push(!AlmMultilevelPlusAudit.refusalChecks(reason,c.reason)[1].pass);
      const original=AlmMultilevelPlus.exportText;AlmMultilevelPlus.exportText=()=> '{}';
      checks.push(!AlmMultilevelPlusAudit.refusalChecks(reason,c.reason)[2].pass);AlmMultilevelPlus.exportText=original;
    }return checks;
  });expect(outcome).toHaveLength(24);expect(outcome.every(Boolean)).toBe(true);
});
test('multilevel-ma-plus SHA-256 changed reference bytes are refused',async({page})=>{
  await page.goto(url);await page.route('**/validate/plus-corpus/reference-plus.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  const error=await page.evaluate(async()=>{try{await AlmMultilevelPlusValidation.runCorpus();return '';}catch(e){return e.message;}});expect(error).toMatch(/SHA-256 mismatch/);
});
test('multilevel-ma-plus panel buttons have names distinct from the original Validate panel',async({page})=>{
  await page.goto(url);
  for(const name of ['Re-run full validation','Validate this analysis in R'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(1);
  await expect(page.locator('#alm-plus-validate').getByRole('button',{name:'Re-run extras validation',exact:true})).toHaveCount(1);
  await expect(page.locator('#alm-plus-validate').getByRole('button',{name:'Validate the extras in R',exact:true})).toHaveCount(1);
});
test('multilevel-ma-plus current profiles match live webR metafor 4.8-0 @slow',async({page})=>{
  test.setTimeout(300000);
  await page.goto(url);const r=await page.evaluate(()=>AlmMultilevelPlusValidation.runLive());
  console.log('MULTILEVEL PLUS LIVE',JSON.stringify({versions:r.versions,rows:r.rows.length,failed:r.rows.filter(x=>!x.pass)}));
  expect(r.versions.metafor).toBe('4.8-0');expect(r.rows).toHaveLength(43);expect(r.rows.filter(x=>!x.pass)).toEqual([]);
});
