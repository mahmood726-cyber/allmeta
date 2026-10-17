import {test,expect} from './validation-fixture.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const url='/limit-ma/index.html';
test('limit-ma-plus all configurations and displayed quantities versus pinned R',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const before=await page.evaluate(()=>__almLimitValidationSnapshot());
 const r=await page.evaluate(()=>AlmLimitPlusValidation.runCorpus());
 writeFileSync(new URL('../../../limit-ma/validate/plus/evidence-replay.json',import.meta.url),JSON.stringify(r,null,2)+'\n');
 console.log('LIMIT PLUS',r.passed+'/'+r.checks,'failed',r.failed.length);
 expect(await page.evaluate(()=>__almLimitValidationSnapshot())).toEqual(before);
 expect(r.failed).toEqual([]);
});
test('limit-ma-plus every displayed quantity has a mutation detector',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);await page.locator('#plus-run').click();
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files,corpus=loaded[files[0].path];
  const seen=new Set(),missedAll=[];
  for(const c of corpus){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);const lim=_almLastLimit(),r=AlmLimitPlus.compute(c,lim);AlmLimitPlusUI.render(r,c,lim);
   const expected=AlmLimitPlusContract.flatten(r);
   for(const node of document.querySelectorAll('#alm-plus [data-plus-number],#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]')){
    const key=(node.dataset.plusNumber||node.dataset.plusCategory||node.dataset.plusRefusal+'.reason').replace(/\.\d+$/,'[]');if(seen.has(key))continue;seen.add(key);const text=node.textContent;node.textContent+='9';if(!AlmLimitPlusContract.displayed(expected).length)missedAll.push(key);node.textContent=text;
   }
  }
  const contract=AlmLimitPlusContract,expected=contract.flatten(AlmLimitPlusUI.snapshot().results),nodes=[...document.querySelectorAll('#alm-plus [data-plus-number],#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]')];
  const missed=[];for(const node of nodes){const before=node.textContent;node.textContent+='9';if(!contract.displayed(expected).length)missed.push(node.outerHTML);node.textContent=before;}
  const removed=nodes.find(n=>n.dataset.plusNumber==='PET.slope'),parent=removed.parentNode,next=removed.nextSibling;removed.remove();const missing=contract.displayed(expected);parent.insertBefore(removed,next);
  return {nodes:seen.size,missed:missed.concat(missedAll),missing,clean:contract.displayed(expected),keys:[...seen]};
 });
 expect(result.nodes).toBeGreaterThan(60);expect(result.keys).toContain('selection.delta');expect(result.keys).toContain('trimfill.imputed[]');expect(result.missed).toEqual([]);expect(result.missing).toContain('PET.slope missing');expect(result.clean).toEqual([]);
 console.log('LIMIT PLUS MUTATIONS',result.nodes,'detected');
});
test('limit-ma-plus altered bytes and malformed references fail closed',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 await page.route('**/validate/plus/reference.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
 await expect(page.evaluate(()=>AlmLimitPlusValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
 await page.unroute('**/validate/plus/reference.json');
 const errors=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files,c=loaded[files[0].path],r=loaded[files[1].path];
  const mutations=[x=>x.pop(),x=>x[1].id=x[0].id,x=>delete x[0].methods.PET.values.p,x=>x[0].methods.PET.values.p=null,x=>x[0].methods.PET.values.p='1',x=>x[0].methods.PET.values.p=Infinity,x=>x[0].methods.conditional.branch='unknown'];
  return mutations.map(m=>{const copy=structuredClone(r);m(copy);try{AlmLimitPlusContract.validate(c,copy);return 'UNSAFE PASS';}catch(e){return e.message;}});
 });expect(errors).not.toContain('UNSAFE PASS');
});
test('limit-ma-plus exact refusals, alpha tie, keyboard and accessible controls',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 await page.locator('#plus-run').focus();await page.keyboard.press('Enter');await expect(page.locator('#plus-status')).toContainText('complete');
 await expect(page.locator('#alm-plus')).toContainText('Small-study tests have low power with few studies');
 const r=await page.evaluate(()=>{
  const c={te:[.1,.2,.3,.4],se:[.1,.12,.15,.18]},m=AlmLimitPlus.compute(c,null);
  return {egger:m.Egger,peters:m.Peters,empty:AlmLimitPlus.compute({te:[3,4,5],se:[.1,.2,.3]},null).selection,
   tie:AlmLimitPlus.conditional(m.PET,m.PEESE,m.PET.values.p),singular:AlmLimitPlus.reg([1,2,3],[.2,.2,.2],1)};
 });expect(r.egger).toEqual({status:'refused',reason:'k-below-10'});expect(r.peters.reason).toBe('binary-arm-counts-required');expect(r.empty.reason).toBe('empty-interval');expect(r.tie.reason).toBe('alpha-tie');expect(r.singular.reason).toBe('singular-design');
 for(const id of ['plus-limit-toggle','plus-fill-toggle','plus-reg-toggle','plus-contour-toggle']){
  const check=page.locator('#'+id);await check.focus();const before=await check.isChecked();await page.keyboard.press('Space');expect(await check.isChecked()).toBe(!before);await expect(check).toHaveAccessibleName(/.+/);
 }
 await expect(page.locator('#plus-forest')).toHaveAttribute('role','img');await expect(page.locator('#plus-funnel')).toHaveAttribute('role','img');
 await page.locator('#alm-plus').screenshot({path:'test-results/limit-ma-plus.png'});
 await page.locator('#src').fill('0.1,0.1\nbad,0.2\n0.3,0.3');await page.locator('#plus-run').click();await expect(page.locator('#plus-status')).toContainText('Refused');await expect(page.locator('#plus-body tr')).toHaveCount(0);
});
test('limit-ma-plus binary Peters inputs match R and reject mismatched counts',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const cases=await page.evaluate(async()=>{const x=await AlmLimitPlusValidation.prepare(),f=AlmLimitPlusValidationAdapter.corpus.files;return x[f[0].path].map((c,i)=>({c,r:x[f[1].path][i]})).filter(x=>x.c.binary);});
 expect(cases.map(x=>x.c.binary.measure).sort()).toEqual(['OR','RR']);
 await page.locator('#alm-plus details summary').click();
 for(const {c,r} of cases){
  await page.locator('#src').fill(c.te.map((x,i)=>x+','+c.se[i]).join('\n'));
  await page.locator('#plus-binary-measure').selectOption(c.binary.measure);
  await page.locator('#plus-binary-counts').fill(c.binary.rows.map(x=>x.join(',')).join('\n'));
  await page.locator('#plus-run').click();await expect(page.locator('[data-plus-number="Peters.p"]')).toHaveText(r.methods.Peters.values.p.toPrecision(12));
  const bad=structuredClone(c.binary.rows);bad[0][1]++;
  await page.locator('#plus-binary-counts').fill(bad.map(x=>x.join(',')).join('\n'));await page.locator('#plus-run').click();
  await expect(page.locator('[data-plus-refusal="Peters"]')).toContainText('binary-effect-mismatch');
 }
});
test('limit-ma-plus changed refusal and conditional branch are failed comparisons',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const failures=await page.evaluate(async()=>{const x=structuredClone(await AlmLimitPlusValidation.prepare()),a=AlmLimitPlusValidationAdapter,r=x[a.corpus.files[1].path];r[0].methods.Peters.reason='changed';r[0].methods.conditional.branch=r[0].methods.conditional.branch==='PET'?'PEESE':'PET';return(await a.corpus.run(x,()=>{})).failed.map(x=>x.quantity);});
 expect(failures).toEqual(['conditional.branch','Peters.reason']);
});

test('limit-ma-plus offline file picker replays its separate pins',async({page,context})=>{
 test.setTimeout(240000);await context.setOffline(true);await page.goto(new URL('../../../limit-ma/index.html',import.meta.url).href);await page.evaluate(()=>AlmLimitPlusReady);
 const manifest=JSON.parse(readFileSync(new URL('../../../limit-ma/validate/MANIFEST-plus.json',import.meta.url),'utf8'));
 await page.locator('#alm-plus-validate input[type=file]').setInputFiles(manifest.files.map(f=>fileURLToPath(new URL('../../../limit-ma/'+f.path,import.meta.url))));
 await page.getByRole('button',{name:'Re-run sensitivity validation',exact:true}).click();
 await expect(page.locator('#alm-plus-validate [role=status]')).toContainText(`${manifest.checks}/${manifest.checks} passed; 0 failed`,{timeout:180000});
});
