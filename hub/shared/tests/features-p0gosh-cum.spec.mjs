import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('./rchecks-out/p0gosh_cum/', import.meta.url);
const medianLabel = 'median I² across subsets (not the full-data I²)';
const qDefinition = "Q_final: residual Q under random-effects (PM) weights, not Cochran's Q.";
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
function qOK(c) { return JSON.stringify(c.map(x=>x[0])) === JSON.stringify(['k','Final pooled','Final τ²']); }
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
    expect(qOK([...actual,['Q','2.00']])).toBe(false);
    const re=state.cum.series[state.cum.series.length-1].Q, fe=state.presentation.q_fe;
    expect(Math.abs(re-ex.Q_final)).toBeLessThan(1e-6);
    expect(Object.keys(ex)).toEqual(['_schema','view','k','mu_final','se_final','lo_final','hi_final','tau2_final','Q_final','series']);
    if(c.id==='heterogeneous'){expect(fe).toBe(6);expect(re).toBeCloseTo(2,6);expect(Math.abs(fe-re)).toBeGreaterThan(1);}
    if(c.id==='identical'){expect(fe).toBeCloseTo(0,6);expect(re).toBeCloseTo(0,6);}
    let definition;
    for (const kind of ['report-md','report-txt']) {
      const [dl] = await Promise.all([page.waitForEvent('download'),page.click('#alm-export-mount [data-action="'+kind+'"]')]);
      const chunks=[]; for await (const chunk of await dl.createReadStream()) chunks.push(chunk);
      const report=Buffer.concat(chunks).toString('utf8');
      expect(report).toContain(qDefinition);
      definition=report.slice(report.indexOf(qDefinition),report.indexOf(qDefinition)+qDefinition.length);
      expect(report.replace(qDefinition,'')).not.toContain(qDefinition);
      expect(report).toContain('Q_final');
    }
    await mkdir(out,{recursive:true});
    await writeFile(new URL('cum-'+c.id+'.csv',out),'yi,sei,q_fe,q_re,q_definition\n'+c.y.map((y,i)=>[y,c.se[i],fe,re,JSON.stringify(definition)].join(',')).join('\n')+'\n');
  }
});
test('missing years warn by name, preserve input order; complete years and subgroup controls',async({page})=>{
  await open(page,'cumulative-subgroup');
  const data='Late,0,1,2022,A\nMissing <year>,0,1,,A\nEarly,3,1,2010,B';
  const run=(text,view)=>page.evaluate(({text,view})=>window.__almCumSubValidationRun(text,view,'',{}).summary,{text,view});
  const ex=await run(data,'cumulative');
  expect(ex.series.map(s=>s.label)).toEqual(['Late','Missing <year>','Early']);
  const expected='Missing year for: Missing <year>. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.';
  await expect(page.locator('#ordering-note')).toBeVisible();
  const note=(await page.locator('#ordering-note').allTextContents()).join('');
  expect(note).toBe(expected);
  expect(await page.evaluate(()=>window.AlmCumSubValidationAdapter.live.currentState().values.find(v=>v.key==='display.status_messages').value)).toBe(true);
  await page.locator('#ordering-note').evaluate(el=>{el.innerHTML='';el.classList.remove('is-visible');});
  expect(await page.locator('#ordering-note').allTextContents()).not.toEqual([expected]);
  await run(data,'cumulative');
  await expect(page.locator('#ordering-note')).toHaveText(expected);
  const complete=await run(data.replace('1,,A','1,2020,A'),'cumulative');
  expect(complete.series.map(s=>s.label)).toEqual(['Early','Missing <year>','Late']);
  await expect(page.locator('#ordering-note')).not.toBeVisible();
  const completeNote=await page.locator('#ordering-note').textContent();
  await run(data,'subgroup');
  await expect(page.locator('#ordering-note')).not.toBeVisible();
  const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
  await mkdir(out,{recursive:true});
  await writeFile(new URL('ordering.csv',out),'missing_note,input_order,complete_note,complete_order,subgroup_note\n'+[note,ex.series.map(s=>s.label).join('|'),completeNote,complete.series.map(s=>s.label).join('|'),await page.locator('#ordering-note').textContent()].map(quote).join(',')+'\n');
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
for (const mutation of ['bare Q','extra RE Q','extra FE Q','silent missing year']) {
  test('cumulative presentation adapter rejects planted '+mutation, async({page})=>{
    await open(page,'cumulative-subgroup');
    const ok=await page.evaluate(m=>{
      window.__almCumSubValidationRun('A,0,1\nB,0,1\nC,3,1','cumulative','',{});
      const original=window.__almCumSubValidationRun;
      window.__almCumSubValidationRun=(...args)=>{
        const a=original(...args), cards=[...document.querySelectorAll('#stats-wrap .stat')];
        if(m!=='silent missing year') {
          const extra=cards[0].cloneNode(true);
          extra.querySelector('.k').textContent=m==='bare Q'?'Q':m==='extra RE Q'?'Q (random-effects weights)':'Cochran’s Q (fixed-effect weights)';
          extra.querySelector('.v').textContent='2.00';
          cards[0].parentElement.append(extra);
        }
        if(m==='silent missing year') {const e=document.getElementById('ordering-note');e.innerHTML='';e.classList.remove('is-visible');}
        return a;
      };
      try{return window.AlmCumSubValidationAdapter.live.currentState().values.find(v=>v.key===(m==='silent missing year'?'display.status_messages':'display.summary_cards')).value;}
      finally{window.__almCumSubValidationRun=original;}
    },mutation);
    expect(ok).toBe(false);
  });
}

test('hero with optional years omitted keeps the ordering advisory visible without error banners',async({page})=>{
  await open(page,'cumulative-subgroup');
  await page.locator('#alm-hero-mount select[data-alm-hero]').selectOption({index:1});
  await expect(page.locator('#svg-host svg')).toBeVisible();
  const note=page.locator('#ordering-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('role','status');
  const labels=await page.evaluate(()=>window._almLastCumSub().series.map(s=>s.label));
  await expect(note).toHaveText('Missing year for: '+labels.join(', ')+'. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.');
  await expect(page.locator('#warn-banner')).toBeEmpty();
  await expect(page.locator('#warn-banner')).not.toBeVisible();
  const before=await note.textContent();
  const ok=await page.evaluate(()=>window.AlmCumSubValidationAdapter.live.currentState().values.filter(v=>v.key.startsWith('display.')).every(v=>v.value===true));
  expect(ok).toBe(true);
  await expect(note).toHaveText(before);
  // Plant the old routing defect: this must violate the unchanged hero criterion.
  await page.locator('#warn-banner').evaluate((el,text)=>{el.textContent=text;el.classList.add('is-visible');},before);
  await expect(page.locator('#warn-banner')).toBeVisible();
  await expect(page.locator('#warn-banner')).not.toBeEmpty();
  // A real invalid-input warning must still be reported in its original banner.
  await page.evaluate(()=>window.__almCumSubValidationRun('A,0,1\nBad,0,-1\nB,1,1','cumulative','',{}));
  await expect(page.locator('#warn-banner')).toBeVisible();
  await expect(note).toBeVisible();
  await page.evaluate(()=>window.__almCumSubValidationRun('','cumulative','',{}));
  await expect(note).toBeEmpty();
  await expect(note).not.toBeVisible();
});
