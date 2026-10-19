// Plus panel in the browser: R-pinned replay, panel display vs R, and no effect on the validated page.
import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),app=new URL('nma-inconsistency/index.html',root).href;
const manifest=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/MANIFEST-plus.json',root),'utf8'));
const paths=manifest.files.map(f=>fileURLToPath(new URL('nma-inconsistency/'+f.path,root)));
const raw=manifest.files.map((f,i)=>[f.path,[...readFileSync(paths[i])]]);
const v1=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/MANIFEST.json',root),'utf8'));
const v1raw=v1.files.map(f=>[f.path,[...readFileSync(fileURLToPath(new URL('nma-inconsistency/'+f.path,root)))]]);
const reference=JSON.parse(readFileSync(paths[1],'utf8'));
const idle=page=>page.evaluate(()=>AlmIncoPlus.whenIdle());

test('offline plus replay: every LOO refit, FE/DL/PM triple and sentence matches pinned R; page state untouched',async({page,context})=>{
 test.setTimeout(900000);await context.setOffline(true);await page.goto(app);await idle(page);
 const before=await page.evaluate(()=>JSON.stringify(AlmIncoValidationAdapter.snapshot()));
 const r=await page.evaluate(entries=>AlmIncoPlusAdapter.corpus.run(Object.fromEntries(entries.map(([k,v])=>[k,new Uint8Array(v)]))),raw);
 console.log(`plus replay ${r.passed}/${r.checks} groups ${JSON.stringify(r.groups)} boundary ${JSON.stringify(r.boundary)}`);
 expect(r.failed.slice(0,5)).toEqual([]);expect(r.passed).toBe(manifest.checks);expect(r.checks).toBe(manifest.checks);
 expect(await page.evaluate(()=>JSON.stringify(AlmIncoValidationAdapter.snapshot()))).toBe(before);
});
test('pinned 4627-check replay still passes with the plus panel mounted and computed',async({page,context})=>{
 test.setTimeout(300000);await context.setOffline(true);await page.goto(app);
 await page.getByRole('button',{name:/Linde 2015/}).click();await idle(page);
 const r=await page.evaluate(entries=>AlmIncoValidationAdapter.corpus.run(Object.fromEntries(entries.map(([k,v])=>[k,new Uint8Array(v)]))),v1raw);
 expect(r.failed).toEqual([]);expect(r.passed).toBe(4627);expect(r.checks).toBe(4627);
});
for(const index of [0,1,2])test('tampered plus pin '+index+' refuses before execution',async({page,context})=>{
 await context.setOffline(true);await page.goto(app);
 const bad=raw.map(([k,v],i)=>[k,i===index?[...v,32]:v]);
 const e=await page.evaluate(entries=>AlmIncoPlusAdapter.corpus.run(Object.fromEntries(entries.map(([k,v])=>[k,new Uint8Array(v)]))).then(()=>null,e=>e.message),bad);
 expect(e).toContain('SHA-256 mismatch; refused');
});
for(const model of ['FE','DL','PM'])test('Baker example '+model+': displayed LOO table equals R-formatted values',async({page})=>{
 test.setTimeout(120000);await page.goto(app);await page.selectOption('#f-model',model);
 await page.getByRole('button',{name:/Baker 2009/}).click();await idle(page);
 const ref=reference.cases.find(x=>x.key==='netmeta::Baker2009::exac::OR::two-arm-only::'+model);expect(ref).toBeTruthy();
 const expected=await page.evaluate(([x,model])=>{
  const P=AlmIncoPlusCore,L=AlmIncoPlusAdapter.refLoo({model,rows:[]},x),f=(v,d)=>P.fmt(v,d);
  return Object.fromEntries(L.drops.map(d=>[d.study,[f(d.tau2,4),f(d.dbt.Q,2),(d.dQ>0?'+':'')+f(d.dQ,2),P.fmtP(d.dbt.p),String(d.nSplits),String(d.nInconsistent)]]));
 },[ref,model]);
 const shown=await page.$$eval('#plus-loo-body tr',trs=>trs.map(tr=>[tr.querySelector('th').textContent.trim(),[...tr.querySelectorAll('td')].slice(0,6).map(td=>td.textContent.trim())]));
 expect(shown.length).toBe(29);expect(Object.fromEntries(shown)).toEqual(expected);
 const summary=await page.evaluate(([x,model])=>AlmIncoPlusCore.looSummary(AlmIncoPlusAdapter.refLoo({model,rows:[]},x)),[ref,model]);
 await expect(page.locator('#plus-loo-summary')).toHaveText(summary);
 // Panel never alters the validated engine state.
 const s=await page.evaluate(()=>_almLastInco());expect(s.model).toBe(model);expect(s.nodeSplit.length).toBe(8);
});
test('methods export contains the generated Methods and Results paragraph',async({page})=>{
 await page.goto(app);await page.getByRole('button',{name:/Baker 2009/}).click();await idle(page);
 const text=await page.evaluate(()=>AlmIncoPlus.methodsText());
 expect(text).toMatch(/^Methods\. /);expect(text).toContain('Results. The global design-by-treatment test gave Q = ');
 await expect(page.locator('#plus-methods-text')).toHaveText(text);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Methods+Results (.md)'}).click()]);
 const md=readFileSync(await download.path(),'utf8');expect(md).toContain(text.split('\n')[0].slice(0,120));
});
test('interpretation text has no forbidden claims',async({page})=>{
 await page.goto(app);
 for(const name of [/Baker 2009/,/Linde 2015/])for(const model of ['FE','DL','PM']){
  await page.selectOption('#f-model',model);await page.getByRole('button',{name}).click();await idle(page);
  const t=(await page.locator('#alm-plus').innerText()).toLowerCase();
  for(const bad of ['proves','proven','consistent network','more accurate than r','confirms consistency','no inconsistency exists'])expect(t,`${model} ${bad}`).not.toContain(bad);
  expect(t,model).not.toMatch(/(?<!not evidence that the )network is consistent/);
 }
});
test('R script download is self-describing',async({page})=>{
 await page.goto(app);await page.getByRole('button',{name:/Baker 2009/}).click();await idle(page);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download R script (self-verifying)'}).click()]);
 const s=readFileSync(await download.path(),'utf8');expect(download.suggestedFilename()).toBe('nma-inconsistency-FE.R');
 expect(s).toContain('allmeta check: %d/%d quantities match');expect(s).toContain('quit(status = 1)');
});
