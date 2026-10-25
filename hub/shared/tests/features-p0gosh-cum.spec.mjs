import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('./rchecks-out/p0gosh_cum/', import.meta.url);
const medianLabel = 'median I² across subsets (not the full-data I²)';
const reLabel = 'Q (random-effects weights)', feLabel = 'Cochran’s Q (fixed-effect weights)';
const cases = [
  {id:'heterogeneous', y:[0,0,3], se:[1,1,1]},
  {id:'unequal', y:[-1,0.2,2], se:[0.3,0.7,0.5]},
  {id:'identical', y:[0.2,0.2,0.2], se:[0.3,0.7,0.5]}
];
async function open(page, app) {
  await page.goto('/'+app+'/');
  await page.waitForFunction(app => app==='gosh' ? !!window.AlmGoshValidationAdapter : !!window.AlmCumSubValidationAdapter, app);
}
async function cards(page, selector) {
  return page.locator(selector).evaluateAll(es => es.map(e=>[e.querySelector('.k').textContent,e.querySelector('.v').textContent]));
}
function goshOK(c) { return c.some(x=>x[0]===medianLabel) && c.some(x=>x[0]==='Full-data I²' && Number.isFinite(parseFloat(x[1]))) && !c.some(x=>x[0]==='Median I²'); }
function qOK(c) { return c.some(x=>x[0]===reLabel) && c.some(x=>x[0]===feLabel) && !c.some(x=>x[0]==='Q'); }
test('GOSH labels, full-data I2 and descriptive interpretation: plants and controls', async ({page}) => {
  await open(page,'gosh');
  for (const model of ['FE','DL']) for(const c of cases) {
    const state=await page.evaluate(({c,model})=>window.__almGoshValidationRun(c.y.map((y,i)=>[y,c.se[i],'S'+(i+1)].join(',')).join('\n'),model), {c,model});
    const actual=await cards(page,'.metrics > .card, .metrics .full-data');
    expect(goshOK(actual)).toBe(true);
    expect(await page.evaluate(()=>window.AlmGoshValidationAdapter.live.currentState().values.filter(v=>v.key==='display').map(v=>v.value))).toEqual([true]);
    expect(goshOK(actual.map(x=>x[0]===medianLabel?['Median I²',x[1]]:x))).toBe(false);
    expect(goshOK(actual.filter(x=>x[0]!=='Full-data I²'))).toBe(false);
    const full=state.presentation.full_i2;
    expect(actual.find(x=>x[0]==='Full-data I²')[1]).toBe(full.toFixed(1)+'%');
    expect(actual.find(x=>x[0]==='Full-data I²')[1]).not.toBe(full.toFixed(9)+'%');
    if(c.id==='heterogeneous') { expect(full).toBeCloseTo(100*4/6,6); expect(parseFloat(actual.find(x=>x[0]===medianLabel)[1])).toBe(0); }
    if(c.id==='identical') expect(full).toBe(0);
    await mkdir(out,{recursive:true});
    await writeFile(new URL('gosh-'+c.id+'-'+model+'.csv',out),'yi,sei,full_i2,full_label,median_label\n'+c.y.map((y,i)=>[y,c.se[i],full,actual.find(x=>x[0]==='Full-data I²')[0],actual.find(x=>x[0]===medianLabel)[0]].join(',')).join('\n')+'\n');
  }
  const text=await page.locator('.note').first().innerText();
  const interpretationOK=s=>s.includes('subsets share an estimate') && s.includes('does not establish that heterogeneity is absent') && !s.includes('homogeneous evidence');
  expect(interpretationOK(text)).toBe(true);
  expect(interpretationOK(text.replace('does not establish that heterogeneity is absent','homogeneous evidence'))).toBe(false);
  await page.evaluate(()=>window.__almGoshValidationRun('bad','FE'));
  await expect(page.locator('#m-full-i2')).toHaveText('—');
});
test('cumulative Q weighting: nonzero-tau plant and zero-tau control; page-produced R values',async({page})=>{
  await open(page,'cumulative-subgroup');
  for(const c of cases){
    const state=await page.evaluate(c=>window.__almCumSubValidationRun(c.y.map((y,i)=>['S'+(i+1),y,c.se[i],2020+i].join(',')).join('\n'),'cumulative','',{}),c);
    const ex=state.summary;
    const actual=await cards(page,'#stats-wrap .stat');
    expect(qOK(actual)).toBe(true);
    expect(await page.evaluate(()=>window.AlmCumSubValidationAdapter.live.currentState().values.filter(v=>v.key.startsWith('display.')).every(v=>v.value===true))).toBe(true);
    expect(qOK(actual.map(x=>x[0]===reLabel?['Q',x[1]]:x))).toBe(false);
    const re=state.cum.series[state.cum.series.length-1].Q, fe=state.presentation.q_fe;
    expect(actual.find(x=>x[0]===reLabel)[1]).toBe(re.toFixed(2));
    expect(actual.find(x=>x[0]===feLabel)[1]).toBe(fe.toFixed(2));
    expect(actual.find(x=>x[0]===reLabel)[1]).not.toBe(re.toFixed(9));
    expect(actual.find(x=>x[0]===feLabel)[1]).not.toBe(fe.toFixed(9));
    expect(Math.abs(re-ex.Q_final)).toBeLessThan(1e-6);
    expect(Object.keys(ex)).toEqual(['_schema','view','k','mu_final','se_final','lo_final','hi_final','tau2_final','Q_final','series']);
    if(c.id==='heterogeneous'){expect(fe).toBe(6);expect(re).toBeCloseTo(2,6);expect(Math.abs(fe-re)).toBeGreaterThan(1);}
    if(c.id==='identical'){expect(fe).toBeCloseTo(0,6);expect(re).toBeCloseTo(0,6);}
    await mkdir(out,{recursive:true});
    await writeFile(new URL('cum-'+c.id+'.csv',out),'yi,sei,q_fe,q_re,fe_label,re_label\n'+c.y.map((y,i)=>[y,c.se[i],fe,re,actual.find(x=>x[0]===feLabel)[0],actual.find(x=>x[0]===reLabel)[0]].join(',')).join('\n')+'\n');
  }
});
test('missing years warn by name, preserve input order; complete years and subgroup controls',async({page})=>{
  await open(page,'cumulative-subgroup');
  const data='Late,0,1,2022,A\nMissing <year>,0,1,,A\nEarly,3,1,2010,B';
  const run=(text,view)=>page.evaluate(({text,view})=>window.__almCumSubValidationRun(text,view,'',{}).summary,{text,view});
  const ex=await run(data,'cumulative');
  expect(ex.series.map(s=>s.label)).toEqual(['Late','Missing <year>','Early']);
  const expected='Missing year for: Missing <year>. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.';
  await expect(page.locator('#warn-banner')).toBeVisible();
  const note=(await page.locator('#warn-banner li').allTextContents()).join('');
  expect(note).toBe(expected);
  expect(await page.evaluate(()=>window.AlmCumSubValidationAdapter.live.currentState().values.find(v=>v.key==='display.status_messages').value)).toBe(true);
  await page.locator('#warn-banner').evaluate(el=>{el.innerHTML='';el.classList.remove('is-visible');});
  expect(await page.locator('#warn-banner li').allTextContents()).not.toEqual([expected]);
  await run(data,'cumulative');
  await expect(page.locator('#warn-banner li')).toHaveText(expected);
  const complete=await run(data.replace('1,,A','1,2020,A'),'cumulative');
  expect(complete.series.map(s=>s.label)).toEqual(['Early','Missing <year>','Late']);
  await expect(page.locator('#warn-banner')).not.toBeVisible();
  const completeNote=await page.locator('#warn-banner').textContent();
  await run(data,'subgroup');
  await expect(page.locator('#warn-banner')).not.toBeVisible();
  const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
  await mkdir(out,{recursive:true});
  await writeFile(new URL('ordering.csv',out),'missing_note,input_order,complete_note,complete_order,subgroup_note\n'+[note,ex.series.map(s=>s.label).join('|'),completeNote,complete.series.map(s=>s.label).join('|'),await page.locator('#warn-banner').textContent()].map(quote).join(',')+'\n');
});

for (const mutation of ['bare median','homogeneity claim','wrong full I2','nine-decimal I2']) {
  test('GOSH presentation adapter rejects planted '+mutation, async({page})=>{
    await open(page,'gosh');
    const ok=await page.evaluate(m=>{
      const original=window.__almGoshValidationRun;
      window.__almGoshValidationRun=(...args)=>{
        const a=original(...args);
        if(m==='nine-decimal I2') document.getElementById('m-full-i2').textContent=a.presentation.full_i2.toFixed(9)+'%';
        if(m==='bare median') document.querySelector('#m-i2').previousElementSibling.textContent='Median I²';
        if(m==='homogeneity claim') document.querySelector('.note').textContent='A horizontal band means homogeneous evidence.';
        if(m==='wrong full I2') document.getElementById('m-full-i2').textContent='999%';
        return a;
      };
      try{return window.AlmGoshValidationAdapter.live.currentState().values.find(v=>v.key==='display').value;}
      finally{window.__almGoshValidationRun=original;}
    },mutation);
    expect(ok).toBe(false);
  });
}
for (const mutation of ['bare Q','swapped Q','silent missing year','nine-decimal RE Q','nine-decimal FE Q']) {
  test('cumulative presentation adapter rejects planted '+mutation, async({page})=>{
    await open(page,'cumulative-subgroup');
    const ok=await page.evaluate(m=>{
      window.__almCumSubValidationRun('A,0,1\nB,0,1\nC,3,1','cumulative','',{});
      const original=window.__almCumSubValidationRun;
      window.__almCumSubValidationRun=(...args)=>{
        const a=original(...args), cards=[...document.querySelectorAll('#stats-wrap .stat')];
        if(m==='nine-decimal RE Q') cards[3].querySelector('.v').textContent=a.summary.Q_final.toFixed(9);
        if(m==='nine-decimal FE Q') cards[4].querySelector('.v').textContent=a.presentation.q_fe.toFixed(9);
        if(m==='bare Q') cards[3].querySelector('.k').textContent='Q';
        if(m==='swapped Q') {const x=cards[3].querySelector('.v'),y=cards[4].querySelector('.v'),t=x.textContent;x.textContent=y.textContent;y.textContent=t;}
        if(m==='silent missing year') {const e=document.getElementById('warn-banner');e.innerHTML='';e.classList.remove('is-visible');}
        return a;
      };
      try{return window.AlmCumSubValidationAdapter.live.currentState().values.find(v=>v.key===(m==='silent missing year'?'display.status_messages':'display.summary_cards')).value;}
      finally{window.__almCumSubValidationRun=original;}
    },mutation);
    expect(ok).toBe(false);
  });
}
