import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../../pubbias-tests/validate/MANIFEST.json',import.meta.url),'utf8'));
const expected=manifest.knownExceptions.map(e=>`${e.dataset_configuration} | ${e.method} | ${e.quantity}`).sort();
test('pubbias published replay: 2107/2113 and six named Table 2 exceptions',async({page,context})=>{
  test.setTimeout(180000);
  await page.goto('/pubbias-tests/index.html');
  const before=await page.locator('#src').inputValue();
  await page.evaluate(()=>AlmPubbiasValidation.prepare());
  const requests=[];context.on('request',r=>requests.push(r.url()));
  await context.setOffline(true);
  const result=await page.evaluate(()=>AlmPubbiasValidation.runCorpus());
  console.log('PUBBIAS CORPUS',JSON.stringify({checks:result.checks,passed:result.passed,failed:result.failed}));
  expect(result.checks).toBe(2113);expect(result.passed).toBe(2107);
  expect(result.failed.map(f=>f.label.replace(' [documented]','')).sort()).toEqual(expected);
  expect(result.unexpected).toBe(0);
  expect(result.coverage).toBe(true);
  expect(result.failed.every(f=>f.knownException)).toBe(true);
  expect(requests).toEqual([]);
  await expect(page.locator('#src')).toHaveValue(before);
  for(const name of expected)await expect(page.locator('#alm-validate')).toContainText(name);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('2107/2113 passed; 6 failed');
});

for(const mutation of ['missing app','changed exception','matching exception','changed R exception','wrong refusal','missing configuration','empty inputs','changed coverage'])test(`pubbias negative replay ${mutation}`,async({page})=>{
  test.setTimeout(180000);
  if(process.env.PUBBIAS_BASELINE_ADAPTER)await page.route('**/validate/adapter.js',route=>route.fulfill({path:process.env.PUBBIAS_BASELINE_ADAPTER,contentType:'application/javascript'}));
  await page.goto('/pubbias-tests/index.html');
  const result=await page.evaluate(async mutation=>{
    const adapter=AlmPubbiasValidationAdapter;
    const loaded={};
    for(const f of adapter.corpus.files)loaded[f.path]=await (await fetch(f.path)).json();
    const corpus=loaded['validate/corpus/corpus.json'];
    const reference=loaded['validate/corpus/reference.json'].datasets;
    const engine=window.__almPubBiasEngine;
    const original=engine.beggMazumdar;
    const originalPeters=engine.petersTest;
    if(mutation==='missing app')engine.petersTest=()=>null;
    if(mutation==='changed exception'||mutation==='matching exception') {
      const k=corpus.find(d=>d.id==='dat.mccurdy2020').k;
      engine.beggMazumdar=rows=>{const v=original(rows);return rows.length===k?{...v,tau:mutation==='matching exception'?reference['dat.mccurdy2020'].begg.value.tau:0.75}:v;};
    }
    if(mutation==='changed R exception')reference['dat.mccurdy2020'].begg.value.tau=0.75;
    if(mutation==='wrong refusal')reference['dat.baker2009/OR:Placebo:Salmeterol'].egger_lm.value={error:'Required dependency missing'};
    if(mutation==='missing configuration')corpus.pop();
    if(mutation==='empty inputs')corpus[0]={...corpus[0],k:0,yi:[],vi:[]};
    if(mutation==='changed coverage')reference[corpus[0].id].begg.value={error:'new refusal'};
    try {return await adapter.corpus.run(loaded,()=>{});}
    catch(e){return {error:e.message};}
    finally{engine.beggMazumdar=original;engine.petersTest=originalPeters;}
  },mutation);
  console.log('PUBBIAS NEGATIVE',mutation,JSON.stringify(result));
  if(['missing app','missing configuration','empty inputs','changed coverage'].includes(mutation))expect(result.error).toMatch(/app method record|configuration|source inputs|coverage/i);
  else {
    expect(result.unexpected).toBeGreaterThan(0);
    expect(result.failed.some(f=>!f.knownException&&f.label.includes('[UNEXPECTED]'))).toBe(true);
  }
});
for(const binary of [false,true])test(`pubbias ${binary?'binary':'built-in'} current input live R @slow`,async({page})=>{
  // A cold meta namespace load follows extraction of its vendored dependency
  // tree; allow this without relaxing any numerical assertion.
  test.setTimeout(480000);
  await page.goto('/pubbias-tests/index.html');
  if(binary)await page.locator('#format').selectOption('binary');
  page.on('console',m=>console.log(m.text()));
  const result=await page.evaluate(async()=>{
    const heartbeat=setInterval(()=>console.log('PUBBIAS R STATUS',document.querySelector('#alm-validate [role=status]').textContent),15000);
    try{return await AlmPubbiasValidation.runLive();}finally{clearInterval(heartbeat);}
  });
  console.log('PUBBIAS LIVE',JSON.stringify(result));
  expect(result.rows).toHaveLength(binary?15:11);
  expect(result.rows.filter(r=>!r.pass)).toEqual([]);
  expect(result.versions).toMatchObject({webR:'0.5.5',metafor:'4.8-0',meta:'8.3-0'});
  expect(result.versions.R).toContain('R version');
  await expect(page.locator('#alm-validate')).toContainText('metafor 5.2-1');
  await expect(page.locator('#alm-validate')).toContainText('meta 8.5-0');
  await expect(page.locator('#alm-validate')).toContainText('Selection model: experimental, not validated');
  // Change current textarea without clicking Run: validation must not reuse saved results.
  if(!binary){
    await page.locator('#src').fill('0.2,0.1\n0.4,0.15\n0.1,0.07\n0.3,0.08\n0.5,0.2\n0.22,0.12');
    const changed=await page.evaluate(()=>AlmPubbiasValidation.runLive());
    expect(changed.rows.filter(r=>!r.pass)).toEqual([]);
    expect(changed.rows.find(r=>r.label==='Egger b0').app).not.toBe(result.rows.find(r=>r.label==='Egger b0').app);
  }
});
test('pubbias altered reference fails closed',async({page})=>{
  await page.goto('/pubbias-tests/index.html');
  await page.route('**/validate/corpus/reference.json',r=>r.fulfill({body:'{}',contentType:'application/json'}));
  await page.getByRole('button',{name:'Replay published corpus (stored references)',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
// TASK3 regressions use the normal page and standard validation fixture.
for(const method of ['begg','peters','harbord'])test(`task3 live missing ${method}`,async({page})=>{
  if(process.env.PUBBIAS_BASELINE_ADAPTER)await page.route('**/validate/adapter.js',r=>r.fulfill({path:process.env.PUBBIAS_BASELINE_ADAPTER,contentType:'application/javascript'}));
  await page.goto('/pubbias-tests/index.html');
  await page.locator('#format').selectOption('binary');
  const rows=await page.evaluate(method=>{
    const e=__almPubBiasEngine;e[{begg:'beggMazumdar',peters:'petersTest',harbord:'harbordTest'}[method]]=()=>null;
    const a=AlmPubbiasValidationAdapter.live;
    return a.appValues(a.currentState()).map(r=>({...r,pass:AlmValidate.compare(r.value,0,'abs',1e-9).pass}));
  },method);
  expect(rows).toHaveLength(15);
  expect(rows.filter(r=>r.key.startsWith(method+'_')).every(r=>!r.pass)).toBe(true);
});
for(const mutation of ['execution refusal','worker crash'])test(`task3 replay ${mutation}`,async({page})=>{
  test.setTimeout(180000);
  if(process.env.PUBBIAS_BASELINE_ADAPTER)await page.route('**/validate/adapter.js',r=>r.fulfill({path:process.env.PUBBIAS_BASELINE_ADAPTER,contentType:'application/javascript'}));
  await page.goto('/pubbias-tests/index.html');
  const r=await page.evaluate(async mutation=>{
    const a=AlmPubbiasValidationAdapter,loaded={};
    for(const f of a.corpus.files)loaded[f.path]=await(await fetch(f.path)).json();
    if(mutation==='execution refusal'){
      const original=__almPubBiasEngine.petersTest;
      __almPubBiasEngine.petersTest=rows=>{
        if(rows.filter(r=>r.e1+r.e2>0&&r.e1+r.e2<r.n1+r.n2).length<3)throw new ReferenceError('unbound statistical input');
        return original(rows);
      };
    }else loaded['validate/corpus/reference.json'].datasets['dat.mccurdy2020'].trimfill.value={unavailable:true,error:'Independent method attempt failed; no result',workerStatus:'crash'};
    return a.corpus.run(loaded,()=>{});
  },mutation);
  expect(r.unexpected).toBeGreaterThan(0);
});
