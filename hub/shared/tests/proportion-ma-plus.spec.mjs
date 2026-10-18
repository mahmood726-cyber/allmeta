import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {compareBrowser,assertDocumentedContract} from '../../../proportion-ma/validate/compare-browser.mjs';
const root=new URL('../../../',import.meta.url),base='7966530de875d22253f0557c7b447ed9d917685d';
const read=p=>JSON.parse(readFileSync(new URL('proportion-ma/'+p,root),'utf8'));
const corpus=read('validate/plus-corpus/corpus.json'),refs=read('validate/plus-corpus/reference-plus.json');
const url='/proportion-ma/index.html';
test.setTimeout(120000);
const state=page=>page.evaluate(()=>({src:document.getElementById('src').value,trans:document.getElementById('trans').value,tau:document.getElementById('tau-est').value,result:window._almLastPropMA(),body:document.getElementById('res-body').innerHTML,forest:document.getElementById('forest').outerHTML,het:document.getElementById('het').innerHTML,href:location.href,history:history.state}));
for(const version of ['baseline','after'])test('original full corpus '+version,async({page})=>{
 test.setTimeout(300000);
 if(version==='baseline')for(const p of ['index.html','validate/adapter.js']){
  const body=execFileSync('git',['show',base+':proportion-ma/'+p],{cwd:root,encoding:'utf8'});
  await page.route('**/proportion-ma/'+p,r=>r.fulfill({contentType:p.endsWith('.js')?'text/javascript':'text/html',body}));
 }
 await page.goto(url);const before=await state(page),r=await page.evaluate(()=>AlmProportionValidation.runCorpus());
 console.log(version,JSON.stringify({checks:r.checks,passed:r.passed,failed:r.failed,refusals:r.refusals.length}));
 expect(r.checks).toBe(298116);expect(r.passed).toBe(298116);expect(r.failed).toEqual([]);expect(r.refusals).toHaveLength(198);expect(await state(page)).toEqual(before);
});
test('extras full corpus offline cache and restoration',async({page,context})=>{
 test.setTimeout(180000);await page.goto(url);const before=await state(page);
 await page.evaluate(()=>AlmPropPlusValidation.prepare());await context.setOffline(true);
 const r=await page.evaluate(()=>AlmPropPlusValidation.runCorpus());
 expect(r.checks).toBe(7248);expect(r.passed).toBe(7248);expect(r.failed).toEqual([]);expect(r.refusals).toHaveLength(28);expect(await state(page)).toEqual(before);
});
for(const file of ['corpus.json','reference-plus.json','comparison-plus.json','versions-plus.json','manifest.json','row-audit.json'])test('rejects changed pin '+file,async({page})=>{
 await page.goto(url);await page.route('**/validate/plus-corpus/'+file,r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await expect(page.evaluate(()=>AlmPropPlusValidation.runCorpus())).rejects.toThrow(/SHA-256/);
});
for(const key of ['status','k','mu','se','tau2','estimate','ciLo','ciHi','piLo','piHi'])test('display negative '+key,async({page})=>{
 await page.goto(url);await page.evaluate(({result,key})=>{AlmPropPlus.render(result,null,'fixture');document.querySelector('#plus-result [data-key="'+key+'"] td:last-child').textContent='wrong';},{result:refs[corpus[0].id].metafor,key});
 await expect(page.evaluate(()=>AlmPropPlus.audit())).rejects.toThrow(/display differs/);
});
test('refusal labels export and stale inputs',async({page})=>{
 await page.goto(url);const result=refs[corpus.find(c=>refs[c.id].metafor.status==='refused').id].metafor;
 await page.evaluate(result=>AlmPropPlus.render(result,null,'fixture'),result);
 expect(await page.evaluate(()=>JSON.parse(AlmPropPlus.exported()).result)).toEqual(result);
 for(const selector of ['[data-key="reason"] td:last-child','th']){
  await page.evaluate(({result,selector})=>{AlmPropPlus.render(result,null,'fixture');document.querySelector('#plus-result '+selector).textContent='wrong';},{result,selector});
  await expect(page.evaluate(()=>AlmPropPlus.audit())).rejects.toThrow();
 }
 await page.evaluate(result=>AlmPropPlus.render(result,null,'fixture'),result);await page.locator('#src').fill('1,10,A\n2,10,B');
 await expect(page.evaluate(()=>AlmPropPlus.exported())).rejects.toThrow(/Run the GLMM/);
});
test('replay rejects numerical and export mutations',async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 const failures=await page.evaluate(async()=>{
  const files=await AlmValidate.loadFiles(AlmPropPlusPins.files),refs=files['validate/plus-corpus/reference-plus.json'],key=Object.keys(refs).find(k=>refs[k].meta.status==='ok');
  refs[key].meta.values.mu+=1;const a=await AlmPropPlusAdapter.corpus.run(files);refs[key].meta.values.mu-=1;
  const original=AlmPropPlus.exported;AlmPropPlus.exported=()=>{const x=JSON.parse(original());if(x.result.status==='ok')x.result.values.mu+=1;return JSON.stringify(x);};
  const b=await AlmPropPlusAdapter.corpus.run(files);return [a.failed.length,b.failed.length];
 });expect(failures[0]).toBeGreaterThan(0);expect(failures[1]).toBeGreaterThan(0);
});
test('runtime unavailable and late result refusal',async({page})=>{
 await page.goto(url);await page.evaluate(()=>{AlmWebR.runR=async()=>({ok:false,error:'fixture unavailable'});});
 await page.locator('#plus-run').click();await expect(page.locator('#plus-status')).toContainText('unavailable');await expect(page.locator('#plus-export')).toBeDisabled();
 await page.evaluate(()=>{AlmWebR.runR=()=>new Promise(resolve=>window.finishGLMM=resolve);});
 await page.locator('#plus-run').click();await page.locator('#src').fill('1,10,A\n2,20,B');await page.evaluate(()=>window.finishGLMM({ok:true,stdout:'invalid',versions:{}}));
 await expect(page.locator('#plus-export')).toBeDisabled();await expect(page.locator('#plus-result')).toBeEmpty();
});
test('live webR entire GLMM corpus @slow',async({page},testInfo)=>{
 test.setTimeout(1800000);await page.goto(url);
 const observed=[];
 try {
 for(const ca of corpus){
  await page.locator('#src').fill(ca.rows.map(r=>[r.x,r.n,r.label].join(',')).join('\n'));
  const r=await page.evaluate(async()=>{await AlmPropPlus.run();return AlmPropPlus.snapshot().result;}),ref=refs[ca.id].metafor;
  observed.push({id:ca.id,result:r});
  console.log('GLMM CASE',ca.id);
  await page.evaluate(()=>AlmPropPlus.audit());
 }
 const comparison=compareBrowser(observed,corpus,refs);
 const comparisonPath=testInfo.outputPath('glmm-browser-comparison.json');
 writeFileSync(comparisonPath,JSON.stringify(comparison,null,2));
 await testInfo.attach('glmm-browser-comparison',{path:comparisonPath,contentType:'application/json'});
 console.log('GLMM COMPARISON',JSON.stringify(comparison));
 assertDocumentedContract(comparison);
 const live=await page.evaluate(()=>AlmPropPlusValidation.runLive());expect(live.rows.filter(r=>!r.pass)).toEqual([]);expect(live.versions.metafor).toBe('4.8-0');
 } finally {const path=testInfo.outputPath('glmm-browser-results.json');writeFileSync(path,JSON.stringify(observed,null,2));await testInfo.attach('glmm-browser-results',{path,contentType:'application/json'});}
});

test('replay rejects changed input records and provenance',async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 const failed=await page.evaluate(async()=>{
  const files=await AlmValidate.loadFiles(AlmPropPlusPins.files),original=AlmPropPlus.exported;
  AlmPropPlus.exported=()=>{const out=JSON.parse(original());out.inputs=[];out.source='wrong';return JSON.stringify(out);};
  return (await AlmPropPlusAdapter.corpus.run(files)).failed;
 });expect(failed.some(f=>f.quantity==='export_inputs')).toBe(true);expect(failed.some(f=>f.quantity==='provenance')).toBe(true);
});
test('original comparison column is audited',async({page})=>{
 await page.goto(url);await page.evaluate(result=>{
  AlmPropPlus.render(result,null,'fixture');AlmPropPlus.audit();
  AlmPropPlus.render(result,__almPropValidation.snapshot().values,'fixture');AlmPropPlus.audit();
  document.querySelector('#plus-result [data-key="tau2"] td:nth-child(2)').textContent='wrong';
 },refs[corpus[0].id].metafor);
 await expect(page.evaluate(()=>AlmPropPlus.audit())).rejects.toThrow(/display differs/);
});

// Recorded cross-runtime failures remain numerical failures in the live test above.
// These tests check the separate disclosure contract, not a relaxed tolerance.
test('known parity mismatches labelled and exported for every recorded configuration',async({page})=>{
 await page.goto(url);
 const result=await page.evaluate(()=>{
  let checked=0;
  for(const rec of AlmPropPlusParity.records){
   const rows=rec.counts.map(([x,n])=>({x,n,label:'input'}));
   AlmPropPlus.render({status:'refused',reason:'nonconvergence'},null,'diagnostic fixture',AlmPropPlus.signature(),rows);
   AlmPropPlus.audit();
   const a=JSON.parse(AlmPropPlus.exported()).validation;
   if(a.status!=='known_cross_runtime_mismatch'||!a.configurations.includes(rec.id)||!a.issues.includes(rec.issue))throw Error(rec.id);
   checked++;
  }
  return checked;
 });expect(result).toBe(23);
});
test('parity warning corruption fails audit and unknown inputs remain unverified',async({page})=>{
 await page.goto(url);
 await page.evaluate(()=>AlmPropPlus.render({status:'refused',reason:'insufficient_studies'},null,'fixture',AlmPropPlus.signature(),[{x:1,n:17,label:'A'}]));
 expect(await page.evaluate(()=>JSON.parse(AlmPropPlus.exported()).validation.status)).toBe('not_independently_verified');
 await expect(page.locator('#plus-parity')).toContainText('not independently verified');
 await page.evaluate(()=>document.getElementById('plus-parity').textContent='Validated');
 await expect(page.evaluate(()=>AlmPropPlus.audit())).rejects.toThrow(/display differs/);
});

test('replay rejects removal of export validation label',async({page})=>{
 await page.goto(url);
 await page.evaluate(()=>{const original=AlmPropPlus.exported;AlmPropPlus.exported=()=>{const value=JSON.parse(original());delete value.validation;return JSON.stringify(value);};});
 await expect(page.evaluate(()=>AlmPropPlusValidation.runCorpus())).rejects.toThrow(/validation label differs/);
});

// Exercise the same strict gate with altered evidence: exceptions remain FAIL.
test('documented exception contract rejects missing, additional and altered failures',()=>{
 const native=corpus.map(c=>({id:c.id,result:structuredClone(refs[c.id].metafor)}));
 const evidence=read('validate/diagnostics/host3-comparison.json');
 for(const f of evidence.failures){
  const row=native.find(r=>r.id===f.id);
  if(f.field==='status') row.result=f.actual==='refused'?{status:'refused',reason:'nonconvergence'}:{status:'ok',values:structuredClone(refs[corpus[0].id].metafor.values)};
  else row.result.values[f.field]=f.actual;
 }
 const report=compareBrowser(native,corpus,refs);
 expect(()=>assertDocumentedContract(report)).not.toThrow();
 expect(report.failed.every(f=>f.knownException && f.reason)).toBe(true);
 expect(()=>compareBrowser(native.slice(1),corpus,refs)).toThrow();
 expect(()=>compareBrowser([...native.slice(1),native[1]],corpus,refs)).toThrow();
 for(const change of [
  r=>r.failed.pop(),
  r=>r.failed.push({id:'unexpected',field:'mu',knownException:false}),
  r=>r.failed[0].field='mu',
  r=>r.failed[0].reason='',
  r=>r.passed++,
  r=>r.refusals--
 ]) {const mutated=structuredClone(report);change(mutated);expect(()=>assertDocumentedContract(mutated)).toThrow();}
 const unknown=native.find(r=>r.result.status==='ok'&&!evidence.failures.some(f=>f.id===r.id));
 unknown.result.values.mu+=1;
 const unexpected=compareBrowser(native,corpus,refs);
 expect(unexpected.unexpected).toBe(1);
 expect(()=>assertDocumentedContract(unexpected)).toThrow();
});
