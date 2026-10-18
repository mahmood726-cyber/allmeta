// Run with node --test. Uses Playwright directly, with Edge on port 8088.
// ALM_ENGINE_ONLY=1 explicitly skips browser tests when browser launch is denied.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import '../../../multilevel-ma/plus-engine.js';
const root=new URL('../../../multilevel-ma/',import.meta.url);
const corpus=JSON.parse(readFileSync(new URL('validate/corpus/corpus.json',root)));
const refs=()=>JSON.parse(readFileSync(new URL('validate/plus-corpus/reference-plus.json',root)));
const require=createRequire(import.meta.url);
function check(a,b,tol,absolute=false){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)/(absolute?1:Math.max(1,Math.abs(b)))<=tol,`${a} versus ${b} (tolerance ${tol})`);}
test('all 44 R references: fit, CR2, profile intervals and every plotted coordinate',()=>{
  const reference=refs();assert.equal(Object.keys(reference).length,44);
  let checks=0;
  for(const [name,r] of Object.entries(reference)){
    assert.equal(r.status,'ok',name+': '+r.reason);
    const a=AlmMultilevelPlusEngine.fit(corpus[name]);
    assert.equal(a.rows,r.rows);assert.equal(a.clusters,r.clusters);checks+=2;
    check(a.logLik,r.logLik,1e-6);checks++;
    for(const k of Object.keys(r.robust)){check(a.robust[k],r.robust[k],k==='p'?1e-9:1e-6,k==='p');checks++;}
    const cr=AlmMultilevelPlusEngine.cr2(corpus[name],...r.cr2Sigma2);
    for(const k of Object.keys(r.robust)){check(cr[k],r.robust[k],1e-9,k==='p');checks++;}
    for(let j=0;j<2;j++)for(const k of ['estimate','lower','upper','x','ll']){
      for(const [i,v] of [r.profiles[j][k]].flat().entries()){check([a.profiles[j][k]].flat()[i],v,1e-6);checks++;}
    }
  }
  assert.equal(checks,2596);
});
test('invalid rows, too few clusters and unidentifiable components refuse',()=>{
  const valid=[{cluster:'A',y:.1,v:.01},{cluster:'A',y:.2,v:.02},{cluster:'B',y:.3,v:.03}];
  assert.throws(()=>AlmMultilevelPlusEngine.fit(valid.slice(0,1)),/three valid/);
  assert.throws(()=>AlmMultilevelPlusEngine.fit(valid.map(r=>({...r,cluster:'A'}))),/two clusters/);
  assert.throws(()=>AlmMultilevelPlusEngine.fit(valid.map((r,i)=>({...r,cluster:i}))),/not identifiable/);
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>AlmMultilevelPlusEngine.fit(valid.map((r,i)=>i? r:{...r,v:value})),/positive variances/);
  assert.throws(()=>AlmMultilevelPlusEngine.fit(valid.map((r,i)=>i?r:{...r,y:NaN})),/finite effects/);
});
test('cluster labels cannot affect membership through object prototype keys',()=>{
  const rows=corpus['dat.konstantopoulos2011'],keys=[...new Set(rows.map(r=>r.cluster))];
  const a=AlmMultilevelPlusEngine.fit(rows),b=AlmMultilevelPlusEngine.fit(rows.map(r=>({...r,cluster:keys.indexOf(r.cluster)===0?'__proto__':'c'+keys.indexOf(r.cluster)})));
  assert.deepEqual(a,b);
});
test('all pinned LF corpus files verify; every changed file is refused',async()=>{
  const context=vm.createContext({crypto:webcrypto,TextDecoder,TextEncoder});
  vm.runInContext(readFileSync(new URL('../../../shared/alm-validate.js',import.meta.url),'utf8'),context);
  const manifest=JSON.parse(readFileSync(new URL('validate/MANIFEST-plus.json',root)));
  assert.equal(manifest.files.length,4);assert.equal(manifest.checks,7272);
  for(const f of manifest.files){
    const bytes=readFileSync(new URL(f.path,root));assert.equal(bytes.length,f.bytes);assert.equal(bytes.includes(13),false);
    await context.AlmValidate.verify(bytes,f.sha256,f.path);
    const changed=Buffer.from(bytes);changed[0]^=1;
    await assert.rejects(()=>context.AlmValidate.verify(changed,f.sha256,f.path),/SHA-256 mismatch/);
  }
});
test('browser positives and individual negative controls', {skip:process.env.ALM_ENGINE_ONLY==='1',timeout:1800000},async t=>{
  let chromium;
  try{({chromium}=require('@playwright/test'));}catch{({chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/User/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core'));}
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();await page.goto('http://localhost:8088/multilevel-ma/');
    await t.test('original replay remains 528/528 and extras replay is 7272/7272',async()=>{
      const before=await page.locator('#src').inputValue();
      const navigation=await page.evaluate(()=>({href:location.href,state:history.state,length:history.length}));
      const old=await page.evaluate(()=>AlmMultilevelValidation.runCorpus());assert.equal(old.passed,528);assert.equal(old.checks,528);assert.deepEqual(old.failed,[]);
      const plus=await page.evaluate(()=>AlmMultilevelPlusValidation.runCorpus());assert.equal(plus.passed,7272);assert.equal(plus.checks,7272);assert.deepEqual(plus.failed,[]);
      assert.equal(await page.locator('#src').inputValue(),before);
      assert.deepEqual(await page.evaluate(()=>({href:location.href,state:history.state,length:history.length})),navigation);
    });
    await page.evaluate(async()=>{
      const c=await (await fetch('validate/corpus/corpus.json')).json(),refs=await(await fetch('validate/plus-corpus/reference-plus.json')).json();
      const rows=c['dat.konstantopoulos2011'];document.getElementById('src').value=rows.map(r=>[r.cluster,r.y,Math.sqrt(r.v)].join(',')).join('\n');
      window.plusTestRef=refs['dat.konstantopoulos2011'];window.plusTestApp=AlmMultilevelPlus.calculate();
    });
    await t.test('clean plot and table pass at desktop and narrow viewport',async()=>{
      for(const width of [1280,480]){
        await page.setViewportSize({width,height:900});
        const bad=await page.evaluate(async()=>(await AlmMultilevelPlusAudit.audit(plusTestApp,plusTestRef)).filter(r=>!r.pass));assert.deepEqual(bad,[]);
      }
      await page.setViewportSize({width:1280,height:900});
    });
    await t.test('every numerical, display and export check can fail',async()=>{
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
      assert.equal(outcome.keys,52);assert.deepEqual(outcome.failed,[]);
    });
    await t.test('extra cells, altered labels and export metadata fail',async()=>{
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
      });assert.deepEqual(checks,[false,false,false,false]);
    });
    await t.test('each plot fails on geometry, paint and axis-label changes',async()=>{
      const checks=await page.evaluate(async()=>{
        const out=[];
        for(let j=0;j<2;j++){
          const svg=document.querySelectorAll('#alm-plus-output svg')[j],mark=svg.querySelector('circle');
          for(const [kind,apply,undo] of [
            ['geometry',()=>mark.setAttribute('transform','translate(15 0)'),()=>mark.removeAttribute('transform')],
            ['paint',()=>mark.style.fill='red',()=>mark.style.fill=''],
            ['labels',()=>svg.querySelector('text').textContent='Wrong axis',()=>AlmMultilevelPlus.render(plusTestApp)]
          ]){apply();out.push((await AlmMultilevelPlusAudit.plotChecks(plusTestRef)).find(x=>x.quantity===`plot.${j}.${kind}`).pass);undo();}
        }return out;
      });assert.deepEqual(checks,[false,false,false,false,false,false]);
    });
    await t.test('edited inputs invalidate extras and exports',async()=>{
      await page.locator('#src').fill('A,0.1,0.1');await page.waitForTimeout(250);
      assert.equal(await page.locator('#alm-plus-output [data-quantity]').count(),0);
      assert.equal(await page.getByRole('button',{name:'Export extras (JSON)',exact:true}).isDisabled(),true);
      assert.equal(await page.evaluate(()=>{try{AlmMultilevelPlus.exportText();return false;}catch{return true;}}),true);
    });
    await t.test('current profiles match live webR metafor 4.8-0',{skip:process.env.ALM_LIVE_R!=='1'},async()=>{
      await page.reload();const r=await page.evaluate(()=>AlmMultilevelPlusValidation.runLive());
      assert.equal(r.versions.metafor,'4.8-0');assert.equal(r.rows.length,43);assert.deepEqual(r.rows.filter(x=>!x.pass),[]);
    });
    await t.test('all four refusals pass and each reason/display/export check can fail',async()=>{
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
      });assert.equal(outcome.length,24);assert.ok(outcome.every(Boolean));
    });
    await t.test('SHA-256 changed reference bytes are refused',async()=>{
      await page.reload();await page.route('**/validate/plus-corpus/reference-plus.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
      const error=await page.evaluate(async()=>{try{await AlmMultilevelPlusValidation.runCorpus();return '';}catch(e){return e.message;}});assert.match(error,/SHA-256 mismatch/);
    });
  }finally{await browser.close();}
});
