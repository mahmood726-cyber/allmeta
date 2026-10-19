import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../../correlation-ma/validate/MANIFEST.json',import.meta.url),'utf8'));
const ALL=72,ACCEPTED=64,REFUSED=8;
async function open(page){await page.goto('/correlation-ma/index.html');await page.waitForFunction(()=>!!window.AlmCorrValidation);}
const replay=page=>page.evaluate(()=>AlmCorrValidation.runCorpus());
const live=page=>page.evaluate(()=>AlmCorrValidation.runLive());
async function afterRun(page,body){await page.evaluate(body=>{const run=__almCorrValidationRun,mutate=new Function(body);window.__almCorrValidationRun=()=>{run();mutate();};},body);}
const state=()=>({data:document.getElementById('f-data').value,method:document.getElementById('f-method').value,result:_almLastCorrMA(),
  headline:document.getElementById('headline').innerHTML,table:document.getElementById('res-body').innerHTML,forest:document.getElementById('forest-host').innerHTML,
  disabled:['f-data','f-method'].map(id=>document.getElementById(id).disabled),storage:{...localStorage},href:location.href,history:history.length});
for(const refused of [false,true])test(`correlation-ma replay passes and restores ${refused?'refused':'accepted'} user state`,async({page})=>{
  await open(page);await page.locator('#f-method').selectOption('FE');
  await page.locator('#f-data').fill(refused?'A, .3, 20':'A, .3, 20\nB, -.2, 30');
  await page.evaluate(()=>alm.chartExportAuto.scan());
  const before=await page.evaluate(state),r=await replay(page);
  expect(r.checks).toBe(manifest.checks);expect(r.passed).toBe(r.checks);expect(r.failed).toEqual([]);expect(r.refusals).toHaveLength(REFUSED);
  expect(await page.evaluate(state)).toEqual(before);
  await expect(page.locator('#alm-validate [role=status]')).toContainText(`${manifest.checks}/${manifest.checks} passed; 0 failed`);
  if(!refused){
    // The original chart node and its download handler survive replay.
    const dl=page.waitForEvent('download');await page.locator('#forest-host [data-xfmt=svg]').click();
    expect((await dl).suggestedFilename()).toMatch(/\.svg$/);
  }
});
for(const file of ['corpus.json','reference.json'])test('correlation-ma refuses tampered '+file+' pin',async({page})=>{
  await open(page);await page.route('**/correlation-ma/validate/corpus/'+file,r=>r.fulfill({contentType:'application/json',body:'[]\n'}));
  await expect(replay(page)).rejects.toThrow(/SHA-256 mismatch/);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('Validation refused: SHA-256 mismatch');
});
test('correlation-ma rechecks pinned bytes even after widget preparation',async({page})=>{
  await open(page);
  const message=await page.evaluate(async()=>{const f=await AlmCorrValidation.prepare();new Uint8Array(f[AlmCorrValidationAdapter.corpus.files[0].path])[10]^=1;try{await AlmCorrValidationAdapter.corpus.run(f);return 'UNSAFE';}catch(e){return e.message;}});
  expect(message).toMatch(/SHA-256 mismatch/);
});
for(const [name,body,quantity,count] of [
  ['number','const c=document.querySelector("#res-body tr td:nth-child(2)");if(c)c.textContent="99";','display.table',ACCEPTED],
  ['study label','const c=document.querySelector("#res-body tr td");if(c)c.textContent="Invented";','display.table',ACCEPTED],
  ['refusal message','if(!_almLastCorrMA())document.getElementById("headline").textContent="Results verified";','refusal.message',REFUSED],
  ['static text','document.querySelector("h1").textContent="Other method";','page_text',ALL],
  ['control state','document.getElementById("f-method").disabled=false;','controls',ALL],
  ['option label','document.querySelector("#f-method option").textContent="Other estimator";','controls',ALL],
  ['forest coordinate','const c=document.querySelector("#forest-host circle");if(c)c.setAttribute("cx","999");','plot.marker.cx',ACCEPTED],
  ['export label','document.querySelector("#alm-export-mount button").textContent="Other export";','page_text',ALL],
])test('correlation-ma tampered '+name+' fails replay',async({page})=>{
  await open(page);await afterRun(page,body);const r=await replay(page);
  expect(r.failed.filter(f=>f.quantity===quantity)).toHaveLength(count);
  expect(r.passed).toBeLessThan(r.checks);
  await expect(page.locator('#alm-validate [role=status]')).not.toContainText('; 0 failed');
});
for(const method of ['REML','PM','DL','FE'])test(`correlation-ma live ${method} @slow`,async({page})=>{
  test.setTimeout(300000);await open(page);await page.locator('#f-method').selectOption(method);
  const r=await live(page);expect(r.rows).toHaveLength(12);expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
  await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
});
test('correlation-ma live refuses fewer than two valid studies',async({page})=>{
  await open(page);await page.locator('#f-data').fill('bad, .4oops, 30\none, .3, 20');
  await expect(live(page)).rejects.toThrow(/need at least 2 valid studies/);
});
test('correlation-ma live catches a tampered headline @slow',async({page})=>{
  test.setTimeout(300000);await open(page);await afterRun(page,'document.getElementById("headline").textContent="Pooled r = 99";');
  const r=await live(page);expect(r.rows.filter(x=>!x.pass).map(x=>x.label)).toEqual(['display']);
});
