import {test,expect} from '@playwright/test';
const recs=[{id:'a',title:'Cardiac heart therapy Alpha hospital investigation',r1:{d:'include'}},{id:'b',title:'Cardiac benefit in heart treatment Beta cohort',r1:{d:'include'}},{id:'c',title:'Molecular protein mechanisms in wild type mice',r1:{d:'exclude'}},{id:'d',title:'Animal mouse protein synthesis laboratory pathway',r1:{d:'exclude'}},{id:'e',title:'Heart cardiac therapy outcomes in adults randomized evaluation',abstract:'HF in adults without animal experiments.'},{id:'f',title:'Protein molecular mouse dataset expression array'}];
test('protocol spans and local worker ranking persist without changing decisions',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({records:recs}),recs);
 await page.getByText('Protocol concepts and synonyms',{exact:true}).click();await page.locator('#hy-population').fill('require: heart | HF');await page.locator('#hy-design').fill('exclude: animal');await page.locator('#hy-save-rules').click();
 await page.locator('#hy-train').click();await expect(page.locator('#hy-status')).toContainText('Ranked', {timeout:30000});
 const s=await page.evaluate(()=>__almScreenpro.state());expect(s.hybrid.run.version).toBe('screen-hybrid-lr-1');expect(s.records.find(r=>r.id==='e').r1.d).toBe('');
 await page.locator('#f-filter').selectOption('undecided');await expect(page.locator('.ctitle')).toContainText('Heart');await expect(page.locator('.pico-evidence')).toContainText('population');await expect(page.locator('.pico-hit').first()).toBeVisible();
 await page.reload();await expect(page.locator('#hy-population')).toHaveValue('require: heart | HF');
});
test('blinded hybrid training cannot use the other reviewer labels',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({mode:'dual',blind:true,active:'r2',records:recs}),recs);
 await page.locator('#hy-train').click();await expect(page.locator('#hy-status')).toContainText('two includes');
 expect(await page.evaluate(()=>__almScreenpro.state().hybrid.run)).toBeFalsy();
});

test('an in-flight ranking is discarded when the reviewer changes',async({page})=>{
 await page.addInitScript(()=>{const NativeWorker=Worker;window.Worker=class extends NativeWorker{postMessage(data){setTimeout(()=>super.postMessage(data),500);}};});
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({mode:'dual',blind:true,active:'r1',records:recs}),recs);
 await page.locator('#hy-train').click();await page.locator('#f-active').selectOption('r2');await expect(page.locator('#hy-status')).toContainText('stale ranking discarded');
 expect(await page.evaluate(()=>__almScreenpro.state().hybrid.run)).toBeFalsy();
});

test('restored audit refuses changed counts and model cache refuses altered assets',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({records:recs}),recs);
 await page.locator('#hy-auditor').fill('Separate auditor');await page.locator('#hy-sample-size').fill('1');await page.locator('#hy-start-audit').click();await expect(page.locator('#hy-audit-status')).toContainText('0 / 1');
 await page.evaluate(()=>{const s=__almScreenpro.state();s.hybrid.audits[0].found=100000;__almScreenpro.restoreProject(s);});await expect(page.locator('#hy-audit-status')).toContainText('invalidated');await expect(page.locator('#hy-audit-buttons')).toBeHidden();
 const error=await page.evaluate(async()=>{const c=await caches.open('screen-optional-model-751bff3');await c.put(new URL('vendor/semantic/models/minilm/config.json',location.href),new Response('{}'));try{await ScreenOffline.cacheModel();return null;}catch(e){return e.message;}});expect(error).toContain('checksum mismatch');
});

test('full-text audits require retrieval and explain independent report reading',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(()=>__almScreenpro.setState({stage:'ft',records:[{id:'audit-ft',title:'Synthetic full text audit fixture',r1:{d:'include'}}]}));
 await page.locator('#hy-auditor').fill('Separate auditor');await page.locator('#hy-sample-size').fill('1');await page.locator('#hy-start-audit').click();await expect(page.locator('#hy-audit-status')).toContainText('Retrieve every remaining full text');
 await page.locator('#ft-retrieval').selectOption('retrieved');await page.locator('#ft-save').click();await page.locator('#hy-start-audit').click();await expect(page.locator('#hy-audit-card')).toContainText('Abstracts alone are insufficient');
});
test('audit freezes a random sample, hides ranks and requires completion',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({records:recs}),recs);
 await page.locator('#hy-auditor').fill('Independent reviewer');await page.locator('#hy-sample-size').fill('2');await page.locator('#hy-start-audit').click();
 await expect(page.locator('#hy-audit-card')).not.toContainText('score');await expect(page.locator('#hy-audit-status')).toContainText('0 / 2');
 await page.locator('#hy-audit-exclude').click();await expect(page.locator('#hy-audit-status')).toContainText('1 / 2');await page.locator('#hy-audit-include').click();
 await expect(page.locator('#hy-audit-status')).toContainText('Recall lower bound');
 await expect(page.locator('#hy-audit-status')).toContainText('Title/abstract includes are provisional');
 await expect(page.locator('#hy-audit-card')).toContainText('Audit includes needing human follow-up');
 expect(await page.evaluate(()=>__almScreenpro.state().records.filter(r=>!r.r1.d).length)).toBe(2);
 await page.reload();await expect(page.locator('#hy-audit-status')).toContainText('Recall lower bound');
});
test('cached app reloads fully offline and makes no cross-origin AI requests',async({page,context})=>{
 const remote=[],origin='http://127.0.0.1:'+(process.env.SCREEN_TEST_PORT||'8000')+'/';page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))remote.push(r.url());});
 await page.goto('/screen/index.html');await page.locator('#hy-offline').click();await expect(page.locator('#hy-offline-status')).toContainText('Ready', {timeout:30000});
 await page.evaluate(()=>localStorage.setItem('screen-ai-key','synthetic-old-key'));
 await page.reload();await context.setOffline(true);await page.reload();await expect(page.locator('#hy-train')).toBeVisible();
 await page.locator('#btn-example').click();await expect(page.locator('.ctitle')).toContainText('Synthetic');expect(remote).toEqual([]);await context.setOffline(false);
});
test('real quantized MiniLM runs in WASM and reuses its persistent vector cache',async({page})=>{
 test.setTimeout(120000);await page.goto('/screen/index.html');
 const result=await page.evaluate(async()=>{
  const w=new Worker('semantic-worker.mjs',{type:'module'});const run=id=>new Promise((resolve,reject)=>{w.onmessage=({data})=>{if(data.error)reject(Error(data.error));if(data.result)resolve(data.result);};w.onerror=e=>reject(Error(e.message));w.postMessage({id,backend:'wasm',records:[{id:'1',title:'A heart failure treatment trial'},{id:'2',title:'An experiment about cardiac therapy'},{id:'3',title:'Ancient pottery and ceramic vessels'}]});});
  try{return [await run(1),await run(2)];}finally{w.terminate();}
 });
 expect(result[0].backend).toBe('wasm');expect(result[0].vectors['1']).toHaveLength(384);expect(result[1].cacheHits).toBe(3);
 const scores=await page.evaluate(v=>[ScreenHybrid.cosine(v['1'],v['2']),ScreenHybrid.cosine(v['1'],v['3'])],result[0].vectors);expect(scores[0]).toBeGreaterThan(scores[1]);
});

test('semantic model pack and hybrid ranking work after an offline reload',async({page,context})=>{
 test.setTimeout(120000);await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({records:recs}),recs);
 await page.locator('#hy-semantic').check();await page.locator('#hy-backend').selectOption('wasm');await page.locator('#hy-embed').click();await expect(page.locator('#hy-semantic-status')).toContainText('Ready: wasm',{timeout:90000});
 await page.reload();await context.setOffline(true);await page.reload();await page.locator('#hy-embed').click();await expect(page.locator('#hy-semantic-status')).toContainText('Ready: wasm',{timeout:30000});
 await page.locator('#hy-train').click();await expect(page.locator('#hy-status')).toContainText('Ranked');expect(await page.evaluate(()=>__almScreenpro.state().hybrid.run.semantic.weight)).toBe(.2);await context.setOffline(false);
});

test('automatic retraining uses the new decision and invalidates an earlier audit',async({page})=>{
 await page.goto('/screen/index.html');await page.evaluate(recs=>__almScreenpro.setState({records:recs}),recs);
 await page.locator('#hy-auditor').fill('Separate auditor');await page.locator('#hy-sample-size').fill('1');await page.locator('#hy-start-audit').click();
 await page.locator('#hy-auto').check();await expect(page.locator('#hy-status')).toContainText('Ranked');await page.locator('#f-filter').selectOption('undecided');await page.locator('[data-dec="include"]').click();
 await expect.poll(()=>page.evaluate(()=>__almScreenpro.state().hybrid.run.labels.length)).toBe(5);await expect(page.locator('#hy-audit-status')).toContainText('invalidated');
});
