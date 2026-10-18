import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),app=new URL('nma-inconsistency/index.html',root).href;
const manifest=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/MANIFEST.json',root),'utf8'));
const paths=manifest.files.map(f=>fileURLToPath(new URL('nma-inconsistency/'+f.path,root)));
const raw=manifest.files.map((f,i)=>[f.path,[...readFileSync(paths[i])]]);
async function replay(page){return page.evaluate(entries=>AlmIncoValidationAdapter.corpus.run(Object.fromEntries(entries.map(([k,v])=>[k,new Uint8Array(v)]))),raw);}
test('offline pinned replay: 4627 checks, 122 configurations, 54 matched refusals and exact restoration',async({page,context})=>{
 await context.setOffline(true);await page.goto(app);
 await page.fill('#src','pending input');
 await page.waitForFunction(()=>(localStorage.getItem('alm-autosave:nma-inconsistency')||'').includes('pending input'));
 const before=await page.evaluate(()=>JSON.stringify(AlmIncoValidationAdapter.snapshot()));
 const r=await replay(page);expect(r.checks).toBe(4627);expect(r.passed).toBe(4627);expect(r.failed).toEqual([]);expect(r.refusals).toEqual({expected:54,matched:54});
 expect(await page.evaluate(()=>JSON.stringify(AlmIncoValidationAdapter.snapshot()))).toBe(before);
 await page.waitForTimeout(800);
 expect(await page.evaluate(()=>JSON.stringify(AlmIncoValidationAdapter.snapshot()))).toBe(before);
});
test('offline file picker verifies both pins and runs panel',async({page,context})=>{
 await context.setOffline(true);await page.goto(app);
 await page.locator('#alm-validate input[type=file]').setInputFiles(paths);
 await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
 await expect(page.locator('#alm-validate [role=status]')).toContainText('4627/4627 passed; 0 failed');
 await expect(page.locator('#alm-validate')).toContainText('SHA-256 verified');
 await expect(page.getByRole('button',{name:'Validate this analysis in R',exact:true})).toBeVisible();
});
for(const kind of ['number','label','refusal','static text','control'])test('tampered '+kind+' fails replay',async({page})=>{
 await page.goto(app);
 await page.evaluate(kind=>{
  if(kind==='static text')document.querySelector('footer').append(' changed');
  else if(kind==='control')document.getElementById('f-model').disabled=true;
  else {const old=window.__almIncoLoad;window.__almIncoLoad=function(text){old(text);const s=_almLastInco();
   if(kind==='number'&&s.nodeSplit?.length){s.nodeSplit[0].p+=.01;document.querySelector('#ns-body tr td:nth-child(6)').textContent='0.999';}
   if(kind==='label'&&s.nodeSplit?.length)document.querySelector('#ns-body tr td:first-child').textContent='wrong label';
   if(kind==='refusal'&&s.status==='refused'){s.reason='wrong refusal';document.getElementById('dbt').textContent=s.reason;}
  };}
 },kind);
 const r=await replay(page);expect(r.failed.length).toBeGreaterThan(0);expect(r.passed+r.failed.length).toBe(4627);
});
for(const index of [0,1])test('tampered pin '+index+' refuses before page execution',async({page,context})=>{
 await context.setOffline(true);await page.goto(app);
 await page.evaluate(()=>{window.calls=0;const old=window.__almIncoLoad;window.__almIncoLoad=(...args)=>{calls++;return old(...args);};});
 await page.locator('#alm-validate input[type=file]').setInputFiles(paths.map((p,i)=>({name:p.split(/[\\/]/).pop(),mimeType:'application/json',buffer:Buffer.concat([readFileSync(p),Buffer.from(i===index?' ':'')])})));
 await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
 await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch; refused');expect(await page.evaluate(()=>calls)).toBe(0);
});
test('live refuses pending input and a refused input',async({page})=>{
 await page.goto(app);await page.fill('#src','A,B,.1,.1\nB,C,.2,.1\nA,C,.4,.1');
 expect(await page.evaluate(()=>{try{AlmIncoValidationAdapter.live.currentState();}catch(e){return e.message;}})).toContain('out of date');
 await page.fill('#src','A,B,.1,.1');await page.click('#btn-run');
 expect(await page.evaluate(()=>{try{AlmIncoValidationAdapter.live.currentState();}catch(e){return e.message;}})).toContain('At least 3');
});
for(const model of ['FE','DL','PM'])test('current '+model+' self-hosted live R @slow',async({page})=>{
 test.setTimeout(240000);await page.goto('/nma-inconsistency/index.html');await page.selectOption('#f-model',model);await page.click('#btn-run');
 const r=await page.evaluate(()=>AlmIncoValidation.runLive());
 expect(r.versions.netmeta).toBe('3.4-0');expect(r.versions.metafor).toBe('4.8-0');expect(r.rows.length).toBeGreaterThan(30);expect(r.rows.filter(r=>!r.pass)).toEqual([]);
});
