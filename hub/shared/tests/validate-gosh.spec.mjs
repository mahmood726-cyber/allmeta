import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../../gosh/validate/MANIFEST.json',import.meta.url),'utf8'));
const url='/gosh/index.html';
test('gosh declared replay preserves input and navigation',async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(async()=>{const s=__almGoshValidationSnapshot();s.axes={x:[-.5,.5],y:[10,90]};__almGoshValidationRestore(s);await alm.urlState.withoutWrites(()=>__almGoshValidationRun());});
 await page.locator('#src').fill('pending invalid edit');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('alm-autosave:gosh')||'null')?.values.src==='pending invalid edit');
 const snap=()=>({page:__almGoshValidationSnapshot(),href:location.href,length:history.length,state:history.state,storage:{...localStorage}});
 const before=await page.evaluate(snap),r=await page.evaluate(()=>AlmGoshValidation.runCorpus());
 expect(manifest.checks).toBe(876760);expect(r.checks).toBe(manifest.checks);expect(r.passed).toBe(r.checks);expect(r.failed).toEqual([]);expect(await page.evaluate(snap)).toEqual(before);
 console.log('GOSH REPLAY',r.passed+'/'+r.checks);
});
for(const model of ['FE','DL'])test(`gosh live built-in ${model} @slow`,async({page})=>{
 test.setTimeout(300000);await page.goto(url);await page.locator('#model').selectOption(model);
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.length).toBeGreaterThan(2000);expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');expect(r.rows.find(x=>x.label==='input_k').app).toBe(9);expect(r.rows.find(x=>x.label==='model').app).toBe(model);expect(r.rows.find(x=>x.label==='sampled').app).toBe(false);
 console.log('GOSH LIVE',model,r.rows.length+'/'+r.rows.length);
});
test('gosh refuses changed corpus bytes',async({page})=>{
 await page.goto(url);await page.route('**/validate/corpus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));await expect(page.evaluate(()=>AlmGoshValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
});
test('gosh live sampled DL uses all 37 captured draws',async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 // Explicit deterministic software fixture; no clinical source claims.
 await page.locator('#src').fill(Array.from({length:16},(_,i)=>`${(13+137*i)/100}, ${(231+70*i)/1000}, Fixture ${i+1}`).join('\n'));
 await page.locator('#model').selectOption('DL');await page.locator('#btn-run').click();await page.locator('#n-sample').fill('37');
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.rows).toHaveLength(37*7+11);
 console.log('GOSH LIVE SAMPLED DL',r.rows.length+'/'+r.rows.length);
});
for(const mutation of ['swap values','append digit','swap labels','header','whitespace','extra card'])test('gosh exact display rejects '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{const original=__almGoshValidationRun;window.__almGoshValidationRun=(...args)=>{const a=original(...args);if(!a.summary)return a;const cards=document.querySelectorAll('.metrics > .card');
 if(m==='swap values'){const a=cards[1].children[1],b=cards[2].children[1],t=a.textContent;a.textContent=b.textContent;b.textContent=t;}
 if(m==='append digit')cards[1].children[1].textContent+='1';
 if(m==='swap labels'){cards[1].children[0].textContent='Median I²';cards[2].children[0].textContent='Median estimate';}
 if(m==='header')document.querySelector('.metrics').parentElement.querySelector('h2').textContent='Wrong summary';
 if(m==='whitespace')cards[1].children[0].textContent='Median  estimate';
 if(m==='extra card'&&cards.length===3)cards[0].parentElement.append(cards[0].cloneNode(true));return a;};},mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(r.failed.length).toBe(manifest.model_configurations-(['swap values','append digit'].includes(mutation)?28:0));expect(r.failed.every(x=>x.quantity==='display')).toBe(true);
});
test('gosh evidence safeguards fail closed',async({page})=>{
 test.setTimeout(180000);await page.goto(url);const errors=await page.evaluate(async()=>{
 const a=AlmGoshValidationAdapter,loaded=await AlmGoshValidation.prepare(),cp=a.corpus.files[0].path,rp=a.corpus.files[1].path;
 const mutations=[x=>x[cp].pop(),x=>x[cp][1].id=x[cp][0].id,x=>x[rp][1].key=x[rp][0].key,x=>delete x[rp][0].points[0].mu,x=>x[rp][0].points[0].mu=null,x=>x[rp][0].points.pop(),x=>x[rp][0].points[0].members=[0],x=>x[cp][0].se[0]=0];
 const errors=[];for(const mutate of mutations){const x=structuredClone(loaded);mutate(x);try{await a.corpus.run(x,()=>{});errors.push('UNSAFE');}catch(e){errors.push(e.message);}}return errors;
 });expect(errors).toHaveLength(8);expect(errors).not.toContain('UNSAFE');
});
for(const mutation of ['coordinate','axis label','missing circle'])test('gosh graphical replay rejects '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{const original=__almGoshValidationRun;window.__almGoshValidationRun=(...args)=>{const a=original(...args);if(!a.summary)return a;
  if(m==='coordinate'){const c=document.querySelector('#plot circle');c.setAttribute('cx',String(Number(c.getAttribute('cx'))+1));}
  if(m==='axis label')[...document.querySelectorAll('#plot text')].at(-1).textContent='Incorrect axis';
  if(m==='missing circle')[...document.querySelectorAll('#plot circle')].at(-1).remove();return a;};},mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus()),q=mutation==='coordinate'?'plot_x':mutation==='axis label'?'axis_labels':'plotted_count';
 expect(r.checks).toBe(manifest.checks);expect(r.failed.filter(x=>x.quantity===q)).toHaveLength(manifest.model_configurations-28);
 expect(r.failed.every(x=>['plot_x','plot_y','axis_labels','plotted_count'].includes(x.quantity))).toBe(true);
});

for(const [field,value,label] of [['k',999,'input_k'],['model','wrong','model'],['sampled',true,'sampled']])test('gosh live catches incorrect exported '+field,async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 await page.evaluate(({field,value})=>{const original=__almGoshValidationRun;window.__almGoshValidationRun=(...args)=>{const a=original(...args);a.summary={...a.summary,[field]:value};return a;};},{field,value});
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.filter(x=>!x.pass).map(x=>x.label)).toEqual([label]);
});

for(const mutation of ['count','estimate','i2','label','heading','card count','sampling','plot','export'])test('gosh refused-state replay rejects '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{
  const original=__almGoshValidationRun,metrics=document.querySelector('.metrics'),markup=metrics.innerHTML,heading=metrics.parentElement.querySelector('h2'),title=heading.textContent,exporter=_almLastGosh;
  window.__almGoshValidationRun=(...args)=>{
   metrics.innerHTML=markup;heading.textContent=title;window._almLastGosh=exporter;
   const a=original(...args);if(a.summary)return a;
   if(m==='count')document.getElementById('m-n').textContent='999';
   if(m==='estimate')document.getElementById('m-est').textContent='0';
   if(m==='i2')document.getElementById('m-i2').textContent='0%';
   if(m==='label')metrics.querySelector('.k').textContent='Wrong count';
   if(m==='heading')heading.textContent='Wrong summary';
   if(m==='card count')metrics.append(metrics.firstElementChild.cloneNode(true));
   if(m==='sampling')document.getElementById('sample-label').style.display='block';
   if(m==='plot')document.getElementById('plot').innerHTML='<text>999</text>';
   if(m==='export')window._almLastGosh=()=>({n_subsets:999});
   return a;
  };
 },mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());
 const quantity={sampling:'sampling_control_visibility',plot:'cap_empty',export:'cap_export'}[mutation]||'display';
 expect(r.checks).toBe(manifest.checks);expect(r.failed).toHaveLength(28);expect(r.passed).toBe(manifest.checks-28);expect(r.failed.every(x=>x.quantity===quantity)).toBe(true);
});

for(const [mutation,expected] of [['draw control',4],['FE label',89],['DL label',89],['option list',178]])test('gosh replay rejects altered '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{
  const original=__almGoshValidationRun,select=document.getElementById('model'),markup=select.innerHTML;
  window.__almGoshValidationRun=(...args)=>{
   const v=select.value;select.innerHTML=markup;select.value=v;
   const a=original(...args);
   if(m==='draw control'&&a.summary?.sampled)document.getElementById('n-sample').value='999';
   if(m==='FE label'&&select.value==='FE')select.querySelector('option:checked').textContent='Wrong model';
   if(m==='DL label'&&select.value==='DL')select.querySelector('option:checked').textContent='Wrong model';
   if(m==='option list'){const o=document.createElement('option');o.value='X';o.textContent='Extra';select.append(o);}
   return a;
  };
 },mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());
 expect(r.checks).toBe(manifest.checks);expect(r.failed).toHaveLength(expected);expect(r.passed).toBe(manifest.checks-expected);expect(r.failed.every(x=>x.quantity==='controls')).toBe(true);
});

for(const [mutation,quantity] of [['omission note','status_messages'],['plot error','status_messages'],['sampling error','status_messages'],['axis error','status_messages'],['y max value','axis_controls'],['x min value','axis_controls'],['x label','axis_controls'],['log checkbox','axis_controls']])test('gosh replay rejects altered '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{
  const original=__almGoshValidationRun,mount=document.getElementById('alm-axis-mount'),markup=mount.innerHTML;
  window.__almGoshValidationRun=(...args)=>{
   const a=original(...args);
   if(m==='omission note')document.getElementById('plot-note').textContent='999 subset points outside the current axis range are omitted.';
   if(m==='plot error')document.getElementById('plot-error').textContent='999';
   if(m==='sampling error')document.getElementById('sample-error').textContent='999';
   if(m==='axis error')mount.querySelector('[data-error]').textContent='999';
   if(m==='y max value')mount.querySelector('[data-axis=y][data-edge=max]').value='999';
   if(m==='x min value')mount.querySelector('[data-axis=x][data-edge=min]').value='-999';
   if(m==='x label')mount.querySelector('.alm-axis-row label').textContent='X axis (Q)';
   if(m==='log checkbox')mount.querySelector('[data-axis=x][data-edge=log]').checked=true;
   return a;
  };
 },mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());
 expect(r.checks).toBe(manifest.checks);expect(r.failed).toHaveLength(manifest.model_configurations);expect(r.failed.every(x=>x.quantity===quantity)).toBe(true);
});
test('gosh replay shows default axis controls and restores the user axis controls',async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 const user=await page.evaluate(()=>{const m=document.getElementById('alm-axis-mount'),i=[...m.querySelectorAll('input')];i[0].value='-0.5';i[1].value='0.5';i[2].checked=true;i[4].value='90';const before=i.map(x=>[x.value,x.checked]);
  const original=__almGoshValidationRun;window.__seen=[];window.__almGoshValidationRun=(...args)=>{window.__seen.push(i.map(x=>[x.value,x.checked]));return original(...args);};return before;});
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(r.failed).toEqual([]);
 const seen=await page.evaluate(()=>window.__seen);expect(seen.length).toBe(manifest.model_configurations);
 for(const s of seen)expect(s).toEqual([['',false],['',false],['on',false],['0',false],['100',false],['on',false]]);
 expect(await page.evaluate(()=>[...document.querySelectorAll('#alm-axis-mount input')].map(x=>[x.value,x.checked]))).toEqual(user);
});

for(const mutation of ['bound labels','log label','sampling label','threshold hint','button title','interpretation','benchmark scale','undo label','schema cell merge','schema column move'])test('gosh replay rejects altered page text: '+mutation,async({page})=>{
 test.setTimeout(180000);await page.goto(url);
 await page.evaluate(m=>{
  const original=__almGoshValidationRun;
  window.__almGoshValidationRun=(...args)=>{
   const a=original(...args);
   if(m==='bound labels')for(const row of document.querySelectorAll('.alm-axis-row')){const s=row.querySelectorAll('span');s[0].textContent='max';s[1].textContent='min';}
   if(m==='log label')for(const row of document.querySelectorAll('.alm-axis-row'))row.querySelectorAll('label')[1].lastChild.textContent=' linear';
   if(m==='sampling label')document.querySelector('#sample-label > span').textContent='Studies included (k > 999)';
   if(m==='threshold hint'){const h=document.querySelector('#src').closest('label').querySelector('.hint');h.textContent=h.textContent.replace('k \u2264 15','k \u2264 99');}
   if(m==='button title')document.getElementById('btn-run').title='999';
   if(m==='benchmark scale')document.querySelector('#alm-hero-mount option[value=bcg]').textContent='BCG vaccine (Berkey 1995, risk difference)';
   if(m==='undo label')document.querySelector('#alm-undo-mount button').textContent='Undo 999';
   if(m==='schema cell merge'){const row=document.querySelector('main table tbody tr');if(row.children.length===4){const req=row.children[2],ex=row.children[3];while(ex.firstChild)req.append(ex.firstChild);ex.remove();}}
   if(m==='schema column move'){const row=document.querySelector('main table tbody tr');if(row.children.length===4&&row.children[2].textContent==='yes'){const a=row.children[2],b=row.children[3];const ta=a.innerHTML;a.innerHTML=b.innerHTML;b.innerHTML=ta;}}
   if(m==='interpretation'){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(n.textContent.includes('low <30%')){n.textContent=n.textContent.replace('low <30%','low <99%');break;}}
   return a;
  };
 },mutation);
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());
 expect(r.checks).toBe(manifest.checks);expect(r.failed).toHaveLength(manifest.model_configurations);expect(r.failed.every(x=>x.quantity==='page_text')).toBe(true);
});
test('gosh live rejects altered page text',async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 await page.evaluate(()=>{document.querySelector('#sample-label > span').textContent='Studies included (k > 999)';});
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.filter(x=>!x.pass).map(x=>x.label)).toEqual(['display']);
});

test('gosh live rejects altered benchmark scale label',async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 await page.evaluate(()=>{document.querySelector('#alm-hero-mount option[value=bcg]').textContent='BCG vaccine (Berkey 1995, risk difference)';});
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.filter(x=>!x.pass).map(x=>x.label)).toEqual(['display']);
});
test('gosh returning user: draft banner passes replay and live, altered banner fails',async({page})=>{
 test.setTimeout(400000);await page.goto(url);
 await page.locator('#src').fill((await page.locator('#src').inputValue())+'\n');
 await page.waitForFunction(()=>!!localStorage.getItem('alm-autosave:gosh'));
 await page.reload();
 await page.waitForFunction(()=>[...document.body.children].some(e=>/^Draft from /.test(e.textContent)));
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 const live=await page.evaluate(()=>AlmGoshValidation.runLive());expect(live.rows.filter(x=>!x.pass)).toEqual([]);
 await page.evaluate(()=>{for(const e of [...document.body.children])if(/^Draft from /.test(e.textContent))e.remove();const b=document.createElement('div');b.setAttribute('role','status');b.setAttribute('aria-live','polite');b.innerHTML='<span>Draft from 999 min ago found. Restore? Results verified.</span><button type=button>Restore</button><button type=button>Discard</button>';document.body.append(b);});
 const bad=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(bad.failed).toHaveLength(manifest.model_configurations);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
});

test('gosh live rejects a schema table cell merge',async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 await page.evaluate(()=>{const row=document.querySelector('main table tbody tr');const req=row.children[2],ex=row.children[3];while(ex.firstChild)req.append(ex.firstChild);ex.remove();});
 const r=await page.evaluate(()=>AlmGoshValidation.runLive());expect(r.rows.filter(x=>!x.pass).map(x=>x.label)).toEqual(['display']);
});

test('gosh CSV import with warnings passes replay and live; an invented warning fails',async({page})=>{
 test.setTimeout(400000);await page.goto(url);
 const mount=page.locator('#alm-csv-mount');
 await mount.locator('textarea').fill('yi,se,study\n0.1,0.05,A\n0.3,0.1,B\nx,0.1,C\n0.2,0.08,D\n0.25,0.12,E');
 await mount.locator('[data-action=parse-paste]').click();
 await expect(mount.locator('[data-section=warnings]')).toContainText('mapped to "sei"');
 await expect(mount.locator('[data-section=warnings]')).toContainText('not float: x');
 const r=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 const live=await page.evaluate(()=>AlmGoshValidation.runLive());expect(live.rows.length).toBeGreaterThan(0);expect(live.rows.filter(x=>!x.pass)).toEqual([]);
 await page.evaluate(()=>{const w=document.querySelector('#alm-csv-mount [data-section=warnings]');w.textContent+='\n\u2022 Results verified';});
 const bad=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(bad.failed).toHaveLength(manifest.model_configurations);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
});
test('gosh live refuses while the axis controls show an invalid-limits error',async({page})=>{
 test.setTimeout(120000);await page.goto(url);
 const min=page.locator('[data-axis=y][data-edge=min]'),max=page.locator('[data-axis=y][data-edge=max]');
 await max.fill('10');await max.dispatchEvent('change');await min.fill('50');await min.dispatchEvent('change');
 await expect(page.locator('#alm-axis-mount [data-error]')).not.toHaveText('');
 await expect(page.evaluate(()=>AlmGoshValidation.runLive())).rejects.toThrow(/Axis limits are invalid/);
});
test('gosh live accepts an equivalent spelling of the draw count',async({page})=>{
 test.setTimeout(300000);await page.goto(url);
 await page.evaluate(()=>{const rows=Array.from({length:16},(_, i)=>`${(i%5)/10+0.05}, ${0.05+i/100}, S${i+1}`).join('\n');document.getElementById('src').value=rows;document.getElementById('n-sample').value='37.0';__almGoshValidationRun();});
 expect(await page.locator('#m-n').textContent()).toBe('37');
 const live=await page.evaluate(()=>AlmGoshValidation.runLive());expect(live.rows.filter(x=>!x.pass)).toEqual([]);
});
