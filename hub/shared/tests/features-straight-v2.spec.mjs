import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile,rm} from 'node:fs/promises';
const apps=["heterogeneity","pubbias-tests","meta-regression","influence","limit-ma","gosh","cumulative-subgroup","mh-peto","multilevel-ma","nma","component-nma","dose-response-ma","rve-meta"];
// Independent oracle: read page result caches and rendered CI cells, never the adapter or rule table.
async function expected(page,app){return page.evaluate(app=>{
 const get=name=>typeof window[name]==='function'?window[name]():null;
 const nums=s=>(String(s||'').replace(/−/g,'-').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number);
 const interval=s=>{const m=String(s||'').match(/\[([^\]]+)\]/);return m?nums(m[1]):[];};
 const ci=(lo,hi,nul=0,piLo,piHi)=>({lo,hi,nul,piLo,piHi});
 const table=(sel,col,nul=0)=>Array.from(document.querySelectorAll(sel)).map(tr=>{const n=interval(tr.cells[col]?.textContent);return ci(n[0],n[1],nul);});
 let k,rec=false,i2,es=[],funnel=false,network=false,min,consistent=false;
 let r;
 if(app==='heterogeneity'){r=get('_almLastFE');if(r){k=r.k;rec=r.estimator==='dl'&&k<10;i2=r.sum.I2;es=[ci(r.sum.ciLoHKSJ,r.sum.ciHiHKSJ,0,r.pi.lo,r.pi.hi)];}}
 if(app==='pubbias-tests'){
  r=get('_almLastPubbias');if(r){k=r.k;funnel=Number.isFinite(r.egger_p);}
  // Independent displayed sources: the main cache is deliberately null for k < 5.
  const count=document.querySelector('#body')?.textContent.match(/Current k = (\d+)\./);
  if(!r&&count)k=Number(count[1]);
  const plusCount=document.querySelector('#plus-k')?.textContent.match(/^k = (\d+)/);
  if(plusCount)k=Number(plusCount[1]);
  const v=q=>{const n=document.querySelector('[data-plus-key="full.conditional.'+q+'"]');return n?Number(n.dataset.plusValue):undefined;};
  es=[ci(v('ciLo'),v('ciHi'))];
  const egger=document.querySelector('[data-plus-key="loo.none.egger.p"]');
  if(egger&&Number.isFinite(Number(egger.dataset.plusValue)))funnel=true;
 }
 if(app==='meta-regression'){r=get('_almLastFitted');if(r){k=get('_almLastStudies').length;for(const n of document.querySelectorAll('#stats-wrap .stat'))if(/β[₀₁]/.test(n.querySelector('.k')?.textContent||'')&&/\[/.test(n.textContent)){const v=interval(n.querySelector('.v').textContent);es.push(ci(v[0],v[1]));}}}
 if(app==='influence'){r=get('_almLastInfluence');if(r){k=get('_almStudies').length;rec=k<10;i2=r.I2;es=[ci(r.ciLo,r.ciHi)];}}
 if(app==='limit-ma'){r=get('_almLastLimit');if(r){k=r.k;rec=k<10;es=[ci(r.limit_ci_lo,r.limit_ci_hi),ci(r.re_ci_lo,r.re_ci_hi)];funnel=!!document.querySelector('[data-plus-number="Egger.p"]');}}
 if(app==='gosh'){r=get('_almLastGosh');if(r){k=r.k;rec=r.model==='DL'&&k<10;}}
 if(app==='cumulative-subgroup'){r=get('_almLastCumSub');if(r){k=r.k;rec=k<10;es=r.view==='subgroup'?[ci(r.overall_lo,r.overall_hi,0,r.overall_pi_lo,r.overall_pi_hi)]:[ci(r.lo_final,r.hi_final)];}}
 if(app==='mh-peto'){r=get('_almLastMhPeto');if(r){k=r.k;es=[ci(r.mh_lo,r.mh_hi,r.measure==='RD'?0:1)];if(r.measure==='OR')es.push(ci(r.peto_lo,r.peto_hi,1));}}
 if(app==='multilevel-ma'){r=get('_almLastMlma');if(r){k=r.J;es=[ci(r.ci_lb_hk,r.ci_ub_hk,0,r.pi_lb,r.pi_ub)];const reml=get('__almReml');if(reml)es.push(ci(reml.ciLo,reml.ciHi));}}
 if(app==='dose-response-ma'){r=get('_almLastDoseResponse');if(r){k=r.k;if(r.model==='linear'&&!r.metaRegression){const n=interval(document.querySelector('#headline').textContent);es=[ci(n[0],n[1],1)];}else es=(r.predictions||[]).filter(p=>p.dose!==r.referenceDose).map(p=>ci(p.lo,p.hi,1));}}
 if(app==='rve-meta'){r=get('__almLastRVE');if(r&&document.querySelector('#coef-body tr')&&document.querySelector('#stale-note').hidden){k=r.fit.m_clusters;es=r.summary.map(s=>ci(s.ci_lo,s.ci_hi));}}
 if(app==='component-nma'){r=get('_almLastCnma');network=true;if(r){es=table('#comp-body tr',3).concat(table('#int-body tr',2));const counts={};for(const row of window.parse(document.querySelector('#src').value)){const key=[row.A.slice().sort().join('+'),row.B.slice().sort().join('+')].sort().join('|');counts[key]=(counts[key]||0)+1;}min=Math.min(...Object.values(counts));}}
 if(app==='nma'){network=true;if(document.querySelector('#ref-host tbody tr')){es=Array.from(document.querySelectorAll('#ref-host tbody tr')).map(tr=>{const v=nums(tr.cells[1].textContent);return ci(v[1],v[2],document.querySelector('#f-scale').value==='exp'?1:0);});const counts={};for(const line of document.querySelector('#f-data').value.split('\n')){const p=(line.match(/(?:"(?:[^"]|"")*"|[^,])+/g)||[]).map(s=>s.trim().replace(/^"|"$/g,''));if(p.length===5&&Number.isFinite(Number(p[3]))&&Number(p[4])>0){const key=p.slice(1,3).sort().join('|');(counts[key]||=(new Set())).add(p[0]);}}min=Math.min(...Object.values(counts).map(s=>s.size));for(const tr of document.querySelectorAll('#het-host tr'))if(tr.textContent.includes('Between designs')){const m=tr.textContent.match(/p\s*=\s*([.\d]+)/);if(m&&Number(m[1])>=.05)consistent=true;}}}
 const inc=(l,h,v)=>[l,h,v].every(Number.isFinite)&&l<=v&&v<=h;
 const e=[];if(rec)e.push('SP-REC-SMALLK@1');if(i2<.05&&k<5)e.push('SP-PIT-I2ZERO@1');if(es.some(x=>inc(x.lo,x.hi,x.nul)))e.push('SP-PIT-NONSIG@1');if(funnel&&k<10)e.push('SP-PIT-FUNNELSMALLK@1');if(consistent)e.push('SP-PIT-NMACONSIST@1');if(network?min<5:k<5)e.push('SP-UNC-SMALLK@1');if(k>=3&&es.some(x=>inc(x.piLo,x.piHi,x.nul)&&!inc(x.lo,x.hi,x.nul)))e.push('SP-UNC-WIDEPI@1');return {e:e.sort(),k,min,es,i2};
 },app);}

// Cross-language evidence is page-produced, not a JS recomputation or adapter ctx.
// Each test replaces only its own directory; missing fixtures make R fail closed.
const evidenceRoot=new URL('./rchecks-out/straight13/',import.meta.url);
const csv=(header,rows)=>[header,...rows].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
async function exportR(page,app,fixture,d){
 const snapshot=await page.evaluate(app=>{
  const get=n=>typeof window[n]==='function'?window[n]():null;
  const input=document.querySelector(['heterogeneity','meta-regression','cumulative-subgroup','dose-response-ma','nma'].includes(app)?'#f-data':'#src').value;
  const controls=Array.from(document.querySelectorAll('input[id],select[id]')).map(n=>[n.id,n.type==='checkbox'?String(n.checked):n.value]);
  const values={}; const add=(key,v)=>{if(v!==undefined&&v!==null)values[key]=v;};
  let r;
  if(app==='heterogeneity'){r=get('_almLastFE');add('tau2',r.tau2);add('estimator',r.estimator.toUpperCase());}
  if(app==='meta-regression'){r=get('_almLastFitted');add('tau2',r.tau2);add('estimator','PM');}
  if(app==='influence'){r=get('_almLastInfluence');add('tau2',r.tau2);add('estimator','REML');}
  if(app==='limit-ma'){r=get('_almLastLimit');add('tau2',r.tau2_dl);add('estimator','DL');const e=window.AlmLimitPlusUI.snapshot()?.results.Egger;if(e?.status==='ok')add('eggerP',e.values.p);}
  if(app==='gosh'){r=get('_almLastGosh');add('estimator',r.model);}
  if(app==='cumulative-subgroup'){r=get('_almLastCumSub');add('tau2',r.view==='subgroup'?r.overall_tau2:r.tau2_final);add('estimator','PM');}
  if(app==='pubbias-tests'){
   r=get('_almLastPubbias');const egger=document.querySelector('[data-plus-key="loo.none.egger.p"]');
   add('eggerP',egger?Number(egger.dataset.plusValue):r?.egger_p);
  }
  if(app==='multilevel-ma'){r=get('_almLastMlma');add('tau2Study',r.tau2_study);add('tau2Within',r.tau2_within);}
  if(app==='nma')for(const tr of document.querySelectorAll('#het-host tr'))if(tr.textContent.includes('Between designs')){
   const m=tr.textContent.match(/p\s*=\s*([.\d]+)/);if(m)add('inconsistencyP',Number(m[1]));
  }
  // RVE input rows are the original parsed values, before predictor centring.
  const rve=app==='rve-meta'?get('__almLastRVE'):null;
  if(rve)add('tau2',rve.fit.tau2);
  return {input,controls,values,rveRows:rve?.inputs.rows,
   fired:window.AlmStraight.fired(window.AlmStraightUI.last[app]).sort()};
 },app);
 const folder=new URL(app+'/'+fixture+'/',evidenceRoot);await mkdir(folder,{recursive:true});
 await writeFile(new URL('input.txt',folder),snapshot.input);
 await writeFile(new URL('controls.csv',folder),csv(['key','value'],snapshot.controls));
 await writeFile(new URL('observed.csv',folder),csv(['key','value'],Object.entries({...snapshot.values,k:d.k,min:d.min,i2:d.i2}).filter(([,v])=>v!==undefined&&v!==null)));
 await writeFile(new URL('estimates.csv',folder),csv(['lo','hi','nul','piLo','piHi'],d.es.map(x=>[x.lo,x.hi,x.nul,x.piLo,x.piHi])));
 await writeFile(new URL('fired.txt',folder),snapshot.fired.join('\n'));
 if(snapshot.rveRows){
  const rows=snapshot.rveRows;
  await writeFile(new URL('rve-input.csv',folder),csv(['cluster','yi','vi',...rows[0].x.map((_,i)=>'x'+i)],rows.map(r=>[r.cluster,r.yi,r.vi,...r.x])));
 }
}

async function check(page,app){
 const d=await expected(page,app);
 expect(Number.isFinite(d.k)||Number.isFinite(d.min),app+': built-in/current analysis must expose study counts').toBe(true);
 await expect.poll(()=>page.evaluate(a=>{const r=window.AlmStraightUI?.last[a];return r?window.AlmStraight.fired(r).sort():null;},app)).toEqual(d.e);
 console.log('STRAIGHT '+app+' fired=['+d.e.join(', ')+'] values='+JSON.stringify(d));
 const notice=page.locator('.alm-straight-notice[data-app="'+app+'"]');
 await expect(notice).toHaveCount(1);
 expect(await notice.evaluate(n=>n.parentElement===document.body&&n.nextElementSibling.id==='alm-features')).toBe(true);
 expect((await notice.getAttribute('data-fired')).split(' ').filter(Boolean).sort()).toEqual(d.e);
 const unannounced=await notice.locator('a[target="_blank"]').evaluateAll(links=>links.filter(a=>!/new tab/i.test(a.textContent+' '+(a.getAttribute('aria-label')||''))).length);
 expect(unannounced,app+': guidance links announce the new tab').toBe(0);
 return d;
}
for(const app of apps)test(app+': displayed example, planted choice, notice accessibility',async({page})=>{
 await rm(new URL(app+'/',evidenceRoot),{recursive:true,force:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/'+app+'/index.html');
 await expect.poll(()=>page.evaluate(a=>!!window.AlmStraightAdapters?.[a],app)).toBe(true);
 if(app==='rve-meta')await page.locator('#btn-run').click();
 if(['pubbias-tests','limit-ma'].includes(app))await page.locator('#plus-run').click();
 const baseline=await check(page,app);
 await exportR(page,app,'example',baseline);
 // A real page choice/input changes, followed by its normal analysis action.
 if(app==='nma')await page.locator('#f-scale').selectOption('exp');
 else if(app==='mh-peto'){await page.locator('#measure').selectOption('RD');const box=page.locator('#src');await box.fill((await box.inputValue()).split('\n').slice(0,4).join('\n'));}
 else if(app==='gosh'){await page.locator('#model').selectOption('FE');const box=page.locator('#src');await box.fill((await box.inputValue()).split('\n').filter(l=>l.trim()).slice(0,4).join('\n'));}
 else if(app==='dose-response-ma'){await page.locator('#f-shape').selectOption('linear');const box=page.locator('#f-data');await box.fill((await box.inputValue()).split('\n').filter(l=>l.startsWith('#')||/^[123],/.test(l)).join('\n'));}
 else if(app==='rve-meta'){await page.locator('#btn-example-small').click();const box=page.locator('#src');await box.fill((await box.inputValue()).split('\n').filter(l=>!l.startsWith('study5,')).join('\n'));await page.locator('#f-rho').fill('0.4');}
 else if(app==='cumulative-subgroup'){await page.locator('#f-view').selectOption('subgroup');const box=page.locator('#f-data');await box.fill((await box.inputValue()).split('\n').filter(l=>l.trim()&&!l.startsWith('#')).slice(0,4).join('\n'));}
 else {const input=page.locator(['heterogeneity','meta-regression'].includes(app)?'#f-data':'#src');const text=await input.inputValue();const lines=text.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#'));await input.fill(app==='component-nma'?text+'\n'+lines[0]:lines.slice(0,4).join('\n'));}
 const run=page.locator('#btn-run');if(await run.count())await run.click();
 if(['pubbias-tests','limit-ma'].includes(app))await page.locator('#plus-run').click();
 // Wait for the shared observer, then compare to independently read new results.
 await expect.poll(async()=>JSON.stringify((await expected(page,app)).e)===JSON.stringify(await page.evaluate(a=>window.AlmStraight.fired(window.AlmStraightUI.last[a]).sort(),app))).toBe(true);
 const changed=await check(page,app);
 await exportR(page,app,'changed',changed);
 if(app==='gosh'){
  expect(changed.k).toBe(4);
  expect(changed.e).toEqual(['SP-UNC-SMALLK@1']);
  expect(await page.locator('#model').inputValue()).toBe('FE');
 }
 if(app==='pubbias-tests'){
  expect(changed.k).toBe(4);
  expect(changed.e).toEqual(['SP-PIT-FUNNELSMALLK@1','SP-PIT-NONSIG@1','SP-UNC-SMALLK@1']);
  expect(await page.evaluate(()=>window._almLastPubbias())).toBeNull();
 }
 const notice='.alm-straight-notice[data-app="'+app+'"]';
 // The notice is hidden when no rules fire; scan its tab in that case as well.
 await expect(page.locator(notice)).toBeVisible();
 {
 const result=await new AxeBuilder({page}).include(notice).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 expect(result.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
 }
 expect(errors).toEqual([]);
});
