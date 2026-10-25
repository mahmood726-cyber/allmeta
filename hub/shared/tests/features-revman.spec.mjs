import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fixture = name => fileURLToPath(new URL('./fixtures/revman/'+name,import.meta.url));
const origin = () => 'http://127.0.0.1:'+(process.env.ALM_FEATURES_PORT||8089);
async function open(page,app) {
  await page.goto(origin()+'/'+app+'/index.html');
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab',{name:'RevMan',exact:true}).click();
}
async function load(page,name='multi.rm5') {
  await page.getByLabel('RevMan file', {exact:true}).setInputFiles(fixture(name));
  await expect(page.locator('#alm-revman-status')).toContainText('Choose');
}
async function choose(page,outcome) {
  await page.getByLabel('Comparison',{exact:true}).selectOption('0');
  await page.getByLabel('Outcome',{exact:true}).selectOption(String(outcome));
  await page.getByLabel('Subgroup',{exact:true}).selectOption('0');
}
const cases=[
  {app:'heterogeneity',outcome:2,ta:'#f-data',text:'Étude α\t-0.25\t0.125\n試験 β\t0.1\t0.2',bad:'Étude α\t-0.15\t0.125\n試験 β\t0.1\t0.2',result:'#stats-wrap'},
  {app:'mh-peto',outcome:0,ta:'#src',text:'Étude α,0,40,4,42\n試験 β,7,60,11,61',bad:'Étude α,1,40,4,42\n試験 β,7,60,11,61',result:'#pooled-body'},
  {app:'effect-size-converter',outcome:1,ta:'#alm-csv-mount textarea',text:'m1,sd1,n1,m2,sd2,n2\n5.25,1.2,40,4.5,1.4,42',bad:'m1,sd1,n1,m2,sd2,n2\n6.25,1.2,40,4.5,1.4,42',result:'#results-body'}
];
async function type(page,c,text) {
  await page.locator(c.ta).fill(text);
  await page.locator(c.app==='effect-size-converter'?'#alm-csv-mount [data-action="parse-paste"]':'#btn-run').click();
}
for(const c of cases) test(c.app+': import equals native input, planted changed number differs, provenance and current-data export',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page,c.app);
  await type(page,c,c.text);
  const expected=await page.locator(c.result).innerText();expect(expected.trim()).not.toBe('');
  await type(page,c,c.bad);
  expect(await page.locator(c.result).innerText()).not.toBe(expected);
  await load(page);
  const use=page.getByRole('button',{name:'Import selected rows',exact:true});
  await expect(use).toBeDisabled();
  await page.getByLabel('Comparison',{exact:true}).selectOption('0');await expect(use).toBeDisabled();
  await page.getByLabel('Outcome',{exact:true}).selectOption(String(c.outcome));await expect(use).toBeDisabled();
  await page.getByLabel('Subgroup',{exact:true}).selectOption('0');await expect(use).toBeEnabled();
  await use.click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported');
  expect(await page.locator(c.result).innerText()).toBe(expected);
  const p=await page.evaluate(()=>AlmFeaturesState.provenance);
  expect(p.length).toBe(c.app==='effect-size-converter'?1:2);
  expect(p[0].location).toContain('RevMan file multi.rm5, comparison Synthetic A versus B, outcome Synthetic');
  expect(p[0].studyId).toBe('s1');expect(p[0].year).toBe(2020);
  // Current native inputs, not an old import cache, drive the downloaded CSV.
  await type(page,c,c.bad);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export study table CSV',exact:true}).click();
  const csv=readFileSync(await (await download).path(),'utf8');
  expect(csv).toContain(c.app==='heterogeneity'?'-0.15':c.app==='mh-peto'?'1,40,4,42':'6.25,1.2,40,4.5,1.4,42');
  await expect(page.locator('#alm-revman-note')).toContainText('recompute');
  expect(errors).toEqual([]);
});

test('malformed file, wrong data type, and changed selection cannot apply stale data',async({page})=>{
  await open(page,'mh-peto');await load(page);await choose(page,0);
  const before=await page.locator('#src').inputValue();
  await page.getByLabel('Comparison',{exact:true}).selectOption('1');
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  await choose(page,2);
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  await expect(page.locator('#alm-revman-status')).toContainText('compatible');
  await page.getByLabel('RevMan file',{exact:true}).setInputFiles(fixture('malformed.rm5'));
  await expect(page.locator('#alm-revman-status')).toContainText('Malformed XML');
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  expect(await page.locator('#src').inputValue()).toBe(before);
  await load(page,'binary.csv');await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 2');
});

test('continuous converter refuses multiple rows; a single selected subgroup is accepted',async({page})=>{
  await open(page,'effect-size-converter');await load(page,'continuous.csv');await choose(page,0);
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  await expect(page.locator('#alm-revman-status')).toContainText('one study');
  await load(page);await choose(page,1);
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeEnabled();
});

test('Web export requires outcome/arm metadata and downloads three current-input CSV files',async({page})=>{
  await open(page,'heterogeneity');
  await page.locator('#f-data').fill('Synthetic A\t-0.25\t0.125\nSynthetic B\t0.1\t0.2');await page.locator('#btn-run').click();
  await page.getByRole('button',{name:'Export study results CSV',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Enter outcome');
  await page.getByLabel('Export outcome name',{exact:true}).fill('Synthetic outcome');
  await page.getByLabel('Experimental arm / intervention',{exact:true}).fill('A');
  await page.getByLabel('Control arm / intervention',{exact:true}).fill('B');
  await page.getByLabel('Export effect measure',{exact:true}).selectOption('HR');
  for(const [label,header] of [['information','Study,Year'],['arms','Study,Arm,Description,Intervention'],['results','Study,Outcome,Data type,Effect measure,Arm,Reference arm']]){
    const ready=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export study '+label+' CSV',exact:true}).click();
    const text=readFileSync(await (await ready).path(),'utf8');expect(text.startsWith(header)).toBe(true);
    if(label==='results'){expect(text).toContain('log[Hazard Ratio]');expect(text).toContain('-0.25');expect(text).toContain('0.125');}
  }
});

// Every value below is synthetic; the expected results come from each native app.
const pairwiseRows=[[-.25,.125],[.1,.2],[-.4,.25],[.2,.15],[.05,.1]];
const addedApps=[
  {app:'influence',result:'#model-body'},
  {app:'limit-ma',result:'#body'},
  {app:'gosh',result:'#m-est'},
  {app:'pubbias-tests',result:'#body'},
  {app:'cumulative-subgroup',result:'#stats-wrap'}
];
for(const c of addedApps)test(c.app+': RevMan import equals native results and edited export remains current',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page,c.app);
  const cumulative=c.app==='cumulative-subgroup',pubbias=c.app==='pubbias-tests';
  const textarea=cumulative?'#f-data':'#src';
  const native=changed=>pairwiseRows.map(([yi,se],i)=>{
    const study='Synthetic '+String.fromCharCode(65+i),effect=yi+(changed&&i===0?1:0);
    return cumulative?[study,effect,se,2020+i,'Selected group'].join(','):pubbias?[study,effect,se].join('\t'):[effect,se,study].join(',');
  }).join('\n');
  async function enter(changed){await page.locator(textarea).fill(native(changed));if(!cumulative)await page.locator('#btn-run').click();}
  await enter(false);
  const expected=await page.locator(c.result).innerText();expect(expected.trim()).not.toBe('');
  await enter(true);expect(await page.locator(c.result).innerText()).not.toBe(expected);
  await load(page,'pairwise.csv');await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 5');
  expect(await page.locator(c.result).innerText()).toBe(expected);
  const p=await page.evaluate(()=>AlmFeaturesState.provenance);
  expect(p.map(r=>r.studyId)).toEqual(['synthetic-0','synthetic-1','synthetic-2','synthetic-3','synthetic-4']);
  expect(p[0].location).toBe('RevMan file pairwise.csv, comparison Synthetic comparison, outcome Synthetic effect');
  await enter(true);
  const ready=page.waitForEvent('download');await page.getByRole('button',{name:'Export study table CSV',exact:true}).click();
  const csv=readFileSync(await(await ready).path(),'utf8');expect(csv).toContain('0.75,0.125');expect(csv).toContain('synthetic-0');
  if(cumulative){
    await page.locator(textarea).fill(native(true).replace('2020,Selected group','2025,Edited subgroup'));
    const edited=page.waitForEvent('download');await page.getByRole('button',{name:'Export study table CSV',exact:true}).click();
    expect(readFileSync(await(await edited).path(),'utf8')).toContain('Edited subgroup,synthetic-0,Synthetic A,2025');
  }
  expect(errors).toEqual([]);
});

test('pubbias binary import uses native zero-cell inputs; incompatible generic mode refuses import',async({page})=>{
  await open(page,'pubbias-tests');
  await page.locator('#format').selectOption('binary');
  const native=pairwiseRows.map((_,i)=>['Synthetic '+String.fromCharCode(65+i),i,40,i+3,42].join('\t')).join('\n');
  await page.locator('#src').fill(native);await page.locator('#btn-run').click();
  const expected=await page.locator('#body').innerText();expect(expected.trim()).not.toBe('');
  await load(page,'pairwise-binary.csv');await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 5');
  expect(await page.locator('#body').innerText()).toBe(expected);
  await page.locator('#format').selectOption('te-se');
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('not compatible');
  expect(await page.locator('#src').inputValue()).toBe(native);
});

test('pubbias Web export measure follows the current native data type',async({page})=>{
  await open(page,'pubbias-tests');
  const measure=page.getByLabel('Export effect measure',{exact:true});
  await expect(measure).toBeEnabled();
  await page.locator('#format').selectOption('binary');await expect(measure).toBeDisabled();
  await page.locator('#format').selectOption('te-se');await expect(measure).toBeEnabled();
});

for(const binary of [true,false])test('pubbias '+(binary?'binary':'generic')+' format switches preserve edited RevMan data and invalidate incompatible results',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page,'pubbias-tests');
  const format=binary?'binary':'te-se',other=binary?'te-se':'binary';
  await page.locator('#format').selectOption(format);
  await load(page,binary?'pairwise-binary.csv':'pairwise.csv');await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 5');
  const edited=(await page.locator('#src').inputValue()).replace('Synthetic A','Edited synthetic A');
  await page.locator('#src').fill(edited);await page.locator('#btn-run').click();
  const expected=await page.locator('#body').innerText();expect(expected.trim()).not.toBe('');
  const provenance=await page.evaluate(()=>AlmFeaturesState.provenance);
  const measure=page.getByLabel('Export effect measure',{exact:true});
  await page.locator('#format').selectOption(other);
  expect(await page.locator('#src').inputValue()).toBe(edited);
  await expect(page.locator('#input-error')).toContainText('Input not used');
  expect(await page.evaluate(()=>_almLastPubbias())).toBeNull();
  if(other==='binary')await expect(measure).toBeDisabled();else await expect(measure).toBeEnabled();
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('not compatible');
  expect(await page.locator('#src').inputValue()).toBe(edited);
  expect(await page.evaluate(()=>AlmFeaturesState.provenance)).toEqual(provenance);
  await page.locator('#format').selectOption(format);
  expect(await page.locator('#src').inputValue()).toBe(edited);
  expect(await page.locator('#body').innerText()).toBe(expected);
  if(format==='binary')await expect(measure).toBeDisabled();else await expect(measure).toBeEnabled();
  const ready=page.waitForEvent('download');await page.getByRole('button',{name:'Export study table CSV',exact:true}).click();
  const csv=readFileSync(await(await ready).path(),'utf8');expect(csv).toContain('Edited synthetic A');
  expect(csv).toContain(binary?'0,40,3,42':'-0.25,0.125');
  expect(errors).toEqual([]);
});
