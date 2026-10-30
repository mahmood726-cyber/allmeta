import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const fixture = name => fileURLToPath(new URL('./fixtures/revman/'+name,import.meta.url));
const origin = () => 'http://127.0.0.1:'+(process.env.ALM_FEATURES_PORT||8089);
async function open(page,app) {
  await page.goto(origin()+'/'+app+'/index.html');
  expect(await page.locator('#alm-features').evaluate(n=>n.closest('main'))).toBeNull();
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab',{name:'RevMan',exact:true}).click();
}
async function load(page,name='multi.rm5') {
  await page.getByLabel('RevMan file', {exact:true}).setInputFiles(fixture(name));
  await expect(page.locator('#alm-revman-status')).toContainText('Choose');
}
async function choose(page,outcome) {
  await page.getByLabel('Comparison',{exact:true}).selectOption('0');
  await page.getByLabel('RevMan outcome',{exact:true}).selectOption(String(outcome));
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
  await page.getByLabel('RevMan outcome',{exact:true}).selectOption(String(c.outcome));await expect(use).toBeDisabled();
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

test('continuous multi-row fixture can import an explicitly chosen study without pooling other rows',async({page})=>{
  await open(page,'effect-size-converter');await load(page,'continuous.csv');await choose(page,0);
  const use=page.getByRole('button',{name:'Import selected rows',exact:true});
  await expect(use).toBeDisabled();
  await page.getByLabel('Study (single-study app)',{exact:true}).selectOption('1');
  await expect(use).toBeEnabled();await use.click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 1');
  expect(await page.evaluate(()=>AlmFeaturesState.provenance.map(p=>p.label))).toEqual(['試験 β']);
  expect(await page.locator('#alm-csv-mount textarea').inputValue()).toContain('-1.5,2,60,-2,2.5,61');
  await page.getByLabel('RevMan outcome',{exact:true}).selectOption('');await expect(use).toBeDisabled();
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
  await page.getByLabel('Measure written to the RevMan file',{exact:true}).selectOption('HR');
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
  const measure=page.getByLabel('Measure written to the RevMan file',{exact:true});
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
  const measure=page.getByLabel('Measure written to the RevMan file',{exact:true});
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

// R consumes actual page outputs and downloaded bytes, never a JS recomputation.
const caseLines=readFileSync(fixture('rcheck-cases.txt'),'utf8').trimEnd().split(/\r?\n/).map(l=>l.split('\t'));
const caseHeader=caseLines.shift();
const rCases=caseLines.map(r=>Object.fromEntries(caseHeader.map((k,i)=>[k,r[i]])));
const witnessDir=fileURLToPath(new URL('./rchecks-out/revman/',import.meta.url));
const csvTable=rows=>rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';

test.describe('page witnesses for independent RevMan R check',()=>{
  test.describe.configure({mode:'serial'});
  let run;
  test.beforeAll(()=>{
    run=randomUUID();mkdirSync(witnessDir,{recursive:true});
    writeFileSync(new URL('./rchecks-out/.gitignore',import.meta.url),'*\n','utf8');
    writeFileSync(witnessDir+'/run.txt',run,'utf8');
  });
  for(const c of rCases)test('R witness '+c.case,async({page})=>{
    await open(page,c.app);
    // Set the native controls explicitly: import transfers inputs, not model choices.
    if(c.app==='heterogeneity')await page.locator('#f-tau2').selectOption(c.method.toLowerCase());
    if(c.app==='mh-peto')await page.locator('#measure').selectOption(c.measure);
    await load(page,c.file);
    await page.getByLabel('Comparison',{exact:true}).selectOption(c.comparison);
    await page.getByLabel('RevMan outcome',{exact:true}).selectOption(c.outcome);
    await page.getByLabel('Subgroup',{exact:true}).selectOption(c.subgroup);
    if(c.study!=='')await page.getByLabel('Study (single-study app)',{exact:true}).selectOption(c.study);
    await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
    await expect(page.locator('#alm-revman-status')).toContainText('Imported');
    const produced=await page.evaluate(app=>{
      const spec=AlmFeatures.get(app),rows=AlmRevman.current(spec),fields=AlmRevman.reader.fields[spec.entry.schema];
      const raw=app==='mh-peto'?_almLastMhPeto():app==='heterogeneity'?__almResults():__almResultRows;
      let values={k:rows.length};
      if(app==='mh-peto'&&raw)values={...raw};
      if(app==='heterogeneity'&&raw)values={...raw};
      if(app==='effect-size-converter'){
        const smd=raw.find(r=>r.scale.startsWith('SMD'));
        if(!smd)throw new Error('No page SMD result');
        values={k:1,yi:smd.point,sei:smd.se,ci_lb:smd.lo,ci_ub:smd.hi};
      }
      const keys=['studyId','study','year',...fields];
      return {keys,rows:rows.map(r=>keys.map(k=>r[k]??'')),values:Object.entries(values).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)),
        pooled:app==='effect-size-converter'||rows.length>1,
        settings:app==='heterogeneity'?document.getElementById('f-tau2').value:app==='mh-peto'?document.getElementById('measure').value:'SMD',
        text:document.querySelector(app==='mh-peto'?'#pooled-body':app==='heterogeneity'?'#stats-wrap':'#results-body').innerText};
    },c.app);
    expect(produced.rows.length).toBeGreaterThan(0);
    if(produced.pooled)expect(produced.text.trim()).not.toBe('');
    expect(produced.settings).toBe(c.app==='heterogeneity'?c.method.toLowerCase():c.measure);
    const prefix=witnessDir+'/'+c.case;
    writeFileSync(prefix+'-inputs.csv',csvTable([produced.keys,...produced.rows]),'utf8');
    writeFileSync(prefix+'-results.csv',csvTable([['key','value'],...produced.values]),'utf8');
    writeFileSync(prefix+'-display.txt',produced.text,'utf8');
    async function downloaded(label,suffix){
      const ready=page.waitForEvent('download');
      await page.getByRole('button',{name:label,exact:true}).click();
      const contents=readFileSync(await(await ready).path(),'utf8');
      writeFileSync(prefix+suffix,contents,'utf8');return contents;
    }
    const exported=await downloaded('Export study table CSV','-export.csv');
    // Exercise the real RevMan Web package downloads as well as the wide table.
    await page.getByLabel('Export outcome name',{exact:true}).fill('Synthetic R check outcome');
    await page.getByLabel('Experimental arm / intervention',{exact:true}).fill('Experimental');
    await page.getByLabel('Control arm / intervention',{exact:true}).fill('Control');
    if(c.app==='heterogeneity')await page.getByLabel('Measure written to the RevMan file',{exact:true}).selectOption(c.measure);
    for(const part of ['information','arms','results'])await downloaded('Export study '+part+' CSV','-web-'+part+'.csv');
    // Reimport the downloaded study table through the file UI. No in-memory shortcut.
    await page.getByLabel('RevMan file',{exact:true}).setInputFiles({name:'roundtrip.csv',mimeType:'text/csv',buffer:Buffer.from(exported)});
    await expect(page.locator('#alm-revman-status')).toContainText('Choose');await choose(page,0);
    await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
    await expect(page.locator('#alm-revman-status')).toContainText('Imported');
    const back=await page.evaluate(({app,keys})=>{
      const spec=AlmFeatures.get(app);
      return AlmRevman.current(spec).map(r=>keys.map(k=>r[k]??''));
    },{app:c.app,keys:produced.keys});
    expect(back).toEqual(produced.rows);
    expect(await page.locator(c.app==='mh-peto'?'#pooled-body':c.app==='heterogeneity'?'#stats-wrap':'#results-body').innerText()).toBe(produced.text);
    // Corrupt an actual downloaded export, swapping both fields of one arm pair.
    if(c.case==='multi-binary-first'){
      const planted=await page.evaluate(csv=>{
        const R=AlmRevman.reader,t=R.splitTable(csv),h=t[0];
        for(const [a,b] of [['Experimental Events','Control Events'],['Experimental Total','Control Total']]){
          const i=h.indexOf(a),j=h.indexOf(b);[t[1][i],t[1][j]]=[t[1][j],t[1][i]];
        }
        return R.csvRows(t);
      },exported);
      expect(planted).not.toBe(exported);writeFileSync(witnessDir+'/planted-swapped-arm.csv',planted,'utf8');
    }
    // Completion token is written only after every assertion and download succeeds.
    writeFileSync(prefix+'-run.txt',run,'utf8');
  });
});


test('malformed split XML terminator is refused without changing native inputs; valid spacing imports',async({page})=>{
  await open(page,'mh-peto');
  const before=await page.locator('#src').inputValue();
  const source=readFileSync(fixture('multi.rm5'),'utf8');
  const malformed=source.replace(/(<DICH_DATA[^>]+)\/>/,'$1/ >');
  expect(malformed).not.toBe(source);
  await page.getByLabel('RevMan file',{exact:true}).setInputFiles({name:'malformed-terminator.rm5',mimeType:'application/xml',buffer:Buffer.from(malformed)});
  await expect(page.locator('#alm-revman-status')).toContainText('Malformed XML');
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  expect(await page.locator('#src').inputValue()).toBe(before);
  const valid=source.replace(/(<DICH_DATA[^>]+)\/>/,'$1 />');
  await page.getByLabel('RevMan file',{exact:true}).setInputFiles({name:'valid-spacing.rm5',mimeType:'application/xml',buffer:Buffer.from(valid)});
  await expect(page.locator('#alm-revman-status')).toContainText('Choose');
  await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 2');
  expect(await page.evaluate(()=>AlmRevman.current(AlmFeatures.get('mh-peto')).map(r=>[r.ai,r.n1i,r.ci,r.n2i]))).toEqual([[0,40,4,42],[7,60,11,61]]);
});

for (const c of [
  {app:'mh-peto', input:'#src', columns:'Events,Total,Events,Total', values:'0,40,4,42', alias:'Experimental Events'},
  {app:'effect-size-converter', input:'#alm-csv-mount textarea', columns:'Mean,SD,Total,Mean,SD,Total', values:'5.25,1.2,40,4.5,1.4,42', alias:'Control SD'}
]) test(c.app+': conflicting clipboard arm header refuses import; valid control recovers',async({page})=>{
  await open(page,c.app);
  const before=await page.locator(c.input).inputValue();
  const upload=async(name,text)=>page.getByLabel('RevMan file',{exact:true}).setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});
  await upload('ambiguous.csv','Study or Subgroup,'+c.columns+','+c.alias+'\nSynthetic,'+c.values+',9');
  await expect(page.locator('#alm-revman-status')).toContainText('Ambiguous duplicate header');
  await expect(page.getByRole('button',{name:'Import selected rows',exact:true})).toBeDisabled();
  expect(await page.locator(c.input).inputValue()).toBe(before);
  await upload('valid-copy.csv','Study or Subgroup,'+c.columns+'\nSynthetic,'+c.values);
  await expect(page.locator('#alm-revman-status')).toContainText('Choose');
  await choose(page,0);
  await page.getByRole('button',{name:'Import selected rows',exact:true}).click();
  await expect(page.locator('#alm-revman-status')).toContainText('Imported 1');
  const values=await page.evaluate(app=>{
    const spec=AlmFeatures.get(app),row=AlmRevman.current(spec)[0];
    return AlmRevman.reader.fields[spec.entry.schema].map(f=>row[f]);
  },c.app);
  expect(values).toEqual(c.values.split(',').map(Number));
});
