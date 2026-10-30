import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const records = [
  {id:'fixture-a', title:'Synthetic cardiac eligibility record', abstract:'A test abstract.', r1:{d:'include'},r2:{d:'exclude',reason:'PRIVATE REASON'}},
  {id:'fixture-b', title:'Synthetic pulmonary eligibility record', abstract:'Another test abstract.', r1:{d:''},r2:{d:'include'}}
];

test('built-in demonstration is explicitly synthetic without publication identifiers',async({page})=>{
  await page.goto('/screen/index.html');
  await page.locator('#btn-example').click();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('screen-v1')));
  expect(data.title).toContain('Synthetic');
  expect(data.records).toHaveLength(7);
  for(const r of data.records){
    expect(r.title).toContain('Synthetic demo:');
    expect(r.source).toBe('synthetic demo');
    for(const field of ['doi','pmid','nct','year','journal'])expect(r[field] || '').toBe('');
  }
  expect(data.records.filter(r=>r.dup)).toHaveLength(0);  // even exact title matches require a user decision (S06)
  expect(data.records.filter(r=>(r.possibleDupOf||[]).length)).toHaveLength(1);  // the demo's duplicate is offered for confirmation
  expect(data.duplicatePairs).toHaveLength(1);
  expect(data.duplicatePairs[0].reason).toBe('exact-title');
  await expect(page.locator('#duplicate-warning')).toContainText('Nothing has been removed.');
  await page.locator('#duplicate-warning a').click();
  await expect(page.locator('.duplicate-pair article')).toHaveCount(2);
});
test('blind review hides peer badges, conflict panels, counts and peer ranking labels', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(records=>window.__almScreenpro.setState({mode:'dual',blind:true,active:'r1',records}),records);
  await expect(page.locator('#card-host')).not.toContainText('R2:');
  await expect(page.locator('#conflict-panel')).toBeHidden();
  await expect(page.locator('#kappa')).not.toContainText('agreement');
  await expect(page.locator('#stats')).not.toContainText('Conflicts');
  await page.locator('#f-filter').selectOption('undecided');
  await expect(page.locator('.ctitle')).toContainText('pulmonary');
});
test('full-text review, reason and audit survive reload', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({mode:'single',records:[{id:'fixture',title:'Synthetic eligibility record',r1:{d:'include'}}]}));
  await page.locator('#f-stage').selectOption('ft');
  await page.locator('#ft-retrieval').selectOption('retrieved');
  await page.locator('#ft-note').fill('Methods, page 2: population outside protocol.');
  await page.locator('#ft-save').click();
  await page.getByRole('button',{name:'Exclude e',exact:true}).click();
  await expect(page.locator('#workflow-status')).toContainText('reason');
  await page.locator('[data-reason="0"]').click();
  await expect(page.locator('#workflow-summary')).toContainText('Full text');
  await page.reload();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('screen-v1')));
  expect(data.records[0].r1.d).toBe('include');
  expect(data.records[0].fullText.r1.d).toBe('exclude');
  expect(data.audit.some(e=>e.action==='decision'&&e.stage==='ft')).toBe(true);
});

test('a filtered decision does not skip its successor and undo restores the original card',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({filter:'undecided',records:[{id:'one',title:'Synthetic cardiac record'},{id:'two',title:'Synthetic molecular record'},{id:'three',title:'Synthetic renal record'}]}));
  await page.locator('[data-dec="include"]').click();
  await expect(page.locator('.ctitle')).toContainText('molecular');
  await page.locator('#btn-undo').click();
  await expect(page.locator('.ctitle')).toContainText('cardiac');
  expect(await page.evaluate(()=>window.__almScreenpro.recordById('one').r1.d)).toBe('');
  expect(await page.evaluate(()=>window.__almScreenpro.state().audit.at(-1).action)).toBe('undo');
});

test('blind-mode model cannot learn from peer labels and stale scores clear on reviewer switch',async({page})=>{
  await page.goto('/screen/index.html');
  const result=await page.evaluate(()=>{
    const h=window.__almScreenpro;
    const records=[{id:'i1',title:'cardiac heart failure',abstract:'ejection fraction hospitalization',r2:{d:'include'}},{id:'i2',title:'heart failure ejection',abstract:'cardiac hospitalization',r2:{d:'include'}},{id:'e1',title:'molecular murine assay',abstract:'protein kinase expression',r2:{d:'exclude'}},{id:'e2',title:'murine signaling kinase',abstract:'molecular protein assay',r2:{d:'exclude'}}];
    h.setState({mode:'dual',blind:true,active:'r1',records});const r1=h.mlTrain();
    h.setState({mode:'dual',blind:true,active:'r2',records});const r2=h.mlTrain();
    return {r1:r1.ok,r2:r2.ok,run:h.state().modelRun};
  });
  expect(result.r1).toBe(false);expect(result.r2).toBe(true);expect(result.run.reviewer).toBe('r2');
  await page.locator('#f-active').selectOption('r1');
  expect(await page.evaluate(()=>window.__almScreenpro.state().records.every(r=>r.mlScore===null))).toBe(true);
});

test('unblinding and completed title/abstract decisions gate entry to full text',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(records=>window.__almScreenpro.setState({mode:'dual',blind:true,records}),records);
  await page.locator('#f-stage').selectOption('ft');
  await expect(page.locator('#f-stage')).toHaveValue('ta');
  await expect(page.locator('#workflow-status')).toContainText('Complete title/abstract');
});

test('adjudication keeps rationale, and a later reviewer change reopens the conflict',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(records=>window.__almScreenpro.setState({mode:'dual',blind:false,records:[records[0]]}),records);
  await page.locator('#adjudicator').fill('Test adjudicator');
  await page.locator('#adjudication-reason').fill('Meets the prespecified eligibility criterion.');
  await page.locator('[data-res-inc]').click();
  await expect(page.locator('#conflict-panel')).toBeHidden();
  await page.locator('[data-dec="maybe"]').click();
  await expect(page.locator('#conflict-panel')).toBeVisible();
  const state=await page.evaluate(()=>window.__almScreenpro.state());
  expect(state.records[0].resolved).toBe('');
  expect(state.audit.some(e=>e.action==='adjudication'&&e.after.resolution.actor==='Test adjudicator')).toBe(true);
});

test('reviewer merge validates the whole file before changing any decisions',async({page})=>{
  await page.goto('/screen/index.html');
  const r=await page.evaluate(()=>{
    const h=window.__almScreenpro;
    h.setState({mode:'dual',records:[{id:'a',title:'Synthetic cardiac paper'},{id:'b',title:'Synthetic pulmonary paper',r2:{d:'exclude'}}]});
    const before=JSON.stringify(h.state());let error='';
    try{h.mergeReviewer({_schema:'sr-reviewer-v1',reviewer:'r2',decisions:[{id:'a',d:'include'},{id:'b',d:'include'}]});}catch(e){error=e.message;}
    return {error,unchanged:before===JSON.stringify(h.state())};
  });
  expect(r.error).toContain('Existing r2 decision differs');expect(r.unchanged).toBe(true);
});

test('stage-specific reviewer exchange preserves decision timestamps and never overwrites TA',async({page})=>{
  await page.goto('/screen/index.html');
  const r=await page.evaluate(()=>{
    const h=window.__almScreenpro;
    h.setState({mode:'dual',stage:'ft',records:[{id:'a',title:'Synthetic staged record',r1:{d:'include'},r2:{d:'include'},fullText:{retrieval:'retrieved',r1:{d:'include'}}}]});
    const at=new Date().toISOString();
    h.mergeReviewer({_schema:'sr-reviewer-v1',stage:'ft',reviewer:'r2',decisions:[{id:'a',d:'exclude',reason:'Wrong population',at}]});
    return {at,record:h.recordById('a'),flow:h.flow(),audit:h.state().audit};
  });
  expect(r.record.r2.d).toBe('include');expect(r.record.fullText.r2.d).toBe('exclude');
  expect(r.record.fullText.r2.at).toBe(r.at);expect(r.flow.pendingFull).toBe(1);
  expect(r.audit.at(-1).source).toContain('reviewer-file');
});

test('complete JSON backup restores project settings, decisions, evidence and audit',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({title:'Synthetic backup fixture',mode:'single',records:[{id:'backup',title:'Synthetic backup record',r1:{d:'include'}}]}));
  await page.locator('#f-stage').selectOption('ft');
  await page.locator('#ft-retrieval').selectOption('retrieved');await page.locator('#ft-note').fill('Synthetic evidence note');await page.locator('#ft-save').click();
  await page.locator('[data-dec="include"]').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#btn-export-json').click();
  const file=await downloadPromise;const backup=JSON.parse(await readFile(await file.path(),'utf8'));
  await page.evaluate(()=>window.__almScreenpro.setState({records:[]}));
  await page.locator('#file-import').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.locator('#workflow-status')).toContainText('Project restored');
  const restored=await page.evaluate(()=>window.__almScreenpro.state());
  expect(restored.title).toBe(backup.title);expect(restored.stage).toBe('ft');expect(restored.audit).toEqual(backup.audit);
  expect(restored.records[0].fullText).toEqual(backup.records[0].fullText);
});

test('quoted multiline CSV preserves columns and malformed imports do not add records',async({page})=>{
  await page.goto('/screen/index.html');
  await page.locator('#file-import').setInputFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from('id,title,abstract\na,"Synthetic, multiline","first line\nsecond ""quoted"" line"\n')});
  await expect(page.locator('.ctitle')).toHaveText('Synthetic, multiline');
  await expect(page.locator('.abstract')).toContainText('second "quoted" line');
  await page.locator('#file-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.locator('#workflow-status')).toContainText('Import failed');
  expect(await page.evaluate(()=>window.__almScreenpro.state().records.length)).toBe(1);
});

test('storage failures are visible and unreadable previous data is preserved',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>localStorage.setItem('screen-v1','{broken'));await page.reload();
  await expect(page.locator('#btn-recover')).toBeVisible();
  await page.locator('#f-title').fill('Do not overwrite damaged data');
  expect(await page.evaluate(()=>localStorage.getItem('screen-v1'))).toBe('{broken');
  await expect(page.locator('#save-status')).toContainText('blocked');
  await page.evaluate(()=>{localStorage.removeItem('screen-v1');});await page.reload();
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota exceeded','QuotaExceededError');};});
  await page.locator('#f-title').fill('Unsaved fixture');
  await expect(page.locator('#save-status')).toContainText('NOT SAVED');
});

test('Extract receives only final full-text includes from a v2 project',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>{
    const r=(id,ft)=>({id,title:'Synthetic '+id,r1:{d:'include'},fullText:{retrieval:'retrieved',r1:{d:ft},r2:{d:''}}});
    localStorage.setItem('screen-v1',JSON.stringify({_schema:'screen-v1',workflowVersion:2,mode:'single',records:[r('eligible','include'),r('ta-only',''),r('excluded','exclude')]}));
  });
  await page.goto('/extract/index.html');await page.locator('#btn-from-screen').click();
  const env=await page.evaluate(()=>window.__almExtract.envelope());
  expect(env.records.map(r=>r.id)).toEqual(['eligible']);
});

test('mobile controls remain reachable and a larger queue renders one card',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/screen/index.html');
  const elapsed=await page.evaluate(()=>{
    const records=[];let seed=7;
    function word(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return 'w'+seed.toString(36);}
    for(let i=0;i<2500;i++)records.push({id:'synthetic-'+i,title:Array.from({length:8},word).join(' ')});
    const start=performance.now();window.__almScreenpro.setState({records});return performance.now()-start;
  });
  expect(elapsed).toBeLessThan(8000);expect(await page.locator('#card-host .card').count()).toBe(1);
  console.log('Synthetic 2500-record load/filter/render ms:',Math.round(elapsed));
  await page.evaluate(()=>window.__almScreenpro.setState({title:'Synthetic workflow demonstration',stage:'ft',records:[{id:'visual',title:'Synthetic full-text eligibility record — demonstration only',abstract:'This record is a UI fixture, not a published study.',r1:{d:'include'},fullText:{retrieval:'retrieved',note:'Read the open full text and record a page reference here.'}}]}));
  await page.locator('.full-text-evidence').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('screen-full-text-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#f-stage')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.full-text-evidence').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('screen-full-text-mobile.png')});
  expect(errors).toEqual([]);
});

test('optional batch retraining records its exact label set and configuration',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>{
    const records=Array.from({length:20},(_,i)=>({id:'batch-'+i,title:['a','b','c','d','e','f'].map(x=>x+i+'unique').join(' '),abstract:i<5?'cardiac heart failure ejection':i<10?'molecular kinase murine expression':'unknown unlabelled record'}));
    window.__almScreenpro.setState({autoRank:true,records});
  });
  for(let i=0;i<10;i++)await page.locator('[data-dec="'+(i<5?'include':'exclude')+'"]').click();
  await expect(page.locator('#ml-status')).toContainText('Trained on 5 includes / 5 excludes');
  const run=await page.evaluate(()=>window.__almScreenpro.state().modelRun);
  expect(run.labels).toHaveLength(10);expect(run.config).toMatchObject({mode:'nb',alpha:2,balance:2,maxDf:0.4});expect(run.stale).toBe(false);
});

test('complete two-stage PRISMA and final RIS include only eligible reports',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({records:[
    {id:'included',title:'Synthetic included report',r1:{d:'include'},fullText:{retrieval:'retrieved',r1:{d:'include'}}},
    {id:'rejected',title:'Synthetic rejected report',r1:{d:'include'},fullText:{retrieval:'retrieved',r1:{d:'exclude',reason:'Wrong population'}}},
    {id:'missing',title:'Synthetic unavailable report',r1:{d:'include'},fullText:{retrieval:'not-retrieved'}},
    {id:'ta-rejected',title:'Synthetic title excluded report',r1:{d:'exclude'}}
  ]}));
  await page.locator('#btn-prisma').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prisma-flow-v1')))).toMatchObject({db:4,screened:4,excludedScreen:1,sought:3,notRetrieved:1,assessed:2,excludedEligible:1,reports:1});
  const downloadPromise=page.waitForEvent('download');await page.locator('#btn-export-ris').click();
  const ris=await readFile(await (await downloadPromise).path(),'utf8');
  expect(ris).toContain('Synthetic included report');expect(ris).not.toContain('rejected');expect(ris).not.toContain('unavailable');
});

test('untrusted source links and malformed backup cannot change record identity or execute script',async({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({records:[{id:'fixture',title:'Synthetic unsafe link fixture',url:'javascript:alert(1)',ctgovUrl:'javascript:alert(1)',pmid:'abc123'}]}));
  expect(await page.locator('#card-host a').count()).toBe(0);
  await expect(page.evaluate(()=>window.__almScreenpro.restoreProject({_schema:'screen-v1',mode:'invalid',records:[]}))).rejects.toThrow('Invalid reviewer mode');
  expect(await page.evaluate(()=>window.__almScreenpro.recordById('fixture').pmid)).toBe('abc123');
});
test('PRISMA refuses unfinished work without overwriting an existing diagram', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>{window.__almScreenpro.setState({records:[{id:'fixture',title:'Synthetic unfinished record'}]});localStorage.setItem('prisma-flow-v1','{"title":"Existing diagram"}');});
  await page.locator('#btn-prisma').click();
  await expect(page.locator('#workflow-status')).toContainText('Finish');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prisma-flow-v1')).title)).toBe('Existing diagram');
});
