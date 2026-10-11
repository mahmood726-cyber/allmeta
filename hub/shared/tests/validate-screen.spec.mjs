/**
 * Screen benchmark integration contract. Chrome/file URLs, no remote requests.
 * Full mode distinguishes 190 actual simulations from 29 published Screen comparisons.
 * No per-seed oracle exists in the supplied checkout.
 */
import { test, expect } from './validation-fixture.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const app=pathToFileURL(resolve(root,'screen/index.html')).href;
const manifest=JSON.parse(readFileSync(resolve(root,'screen/validate/MANIFEST.json'),'utf8'));
const corpusPaths=manifest.files.map(f=>resolve(root,'screen',f.path));
const hasWidget=existsSync(resolve(root,'shared/alm-validate.js'));
test.use({channel:'chrome'});
async function open(page,context){
 const external=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await context.setOffline(true);
 await page.goto(app);
 await page.evaluate(()=>window.ScreenValidationAdapter.ready);
 await page.locator('#alm-validate input[type=file]').setInputFiles(corpusPaths);
 return external;
}
test('quick corpus replay is offline, uses shipped simulator and reports stored expected values',async({page,context})=>{
 const external=await open(page,context);
 const result=await page.evaluate(async()=>{
  const a=window.ScreenValidationAdapter;a.corpus.mode='quick';
  const original=window.__almScreenpro.simulateActiveLearning;let calls=0;
  window.__almScreenpro.simulateActiveLearning=o=>{calls++;return original(o);};
  const result=await a.corpus.run(await AlmValidate.loadFiles(a.corpus.files,[...document.querySelector('#alm-validate input[type=file]').files],true));
  return {...result,calls};
 });
 console.log(result.summaryLines[0]);
 expect(result.calls).toBe(4);
 expect(result.simulations).toBe(4);expect(result.checks).toBe(4);expect(result.passed).toBe(4);
 expect(result.failed).toEqual([]);expect(result.rows.map(r=>r.ref)).toEqual([0.0113,0.2734,0.6599,0.4668]);
 expect(external).toEqual([]);
});
test('full paper WSS benchmark @slow',async({page,context})=>{
 test.setTimeout(30*60*1000);
 const external=[];
 context.on('request', r=>{if(new URL(r.url()).origin !== 'http://localhost:8088') external.push(r.url());});
 await page.goto('/screen/index.html');
 await page.evaluate(()=>ScreenValidationAdapter.ready);
 await page.exposeFunction('screenValidationProgress',p=>{if(p.done%10===0)console.log(p.message);});
 await page.evaluate(()=>{const a=ScreenValidationAdapter,run=a.corpus.run;a.corpus.run=(files,progress)=>run(files,p=>{progress(p);window.screenValidationProgress(p);});});
 await page.evaluate(async()=>{
  const a=window.ScreenValidationAdapter;a.corpus.mode='full';
  const widget=AlmValidate.mount(document.getElementById('alm-validate'),a);
  await widget.prepare();
  window.__screenWidget=widget;
  return true;
 });
 await context.setOffline(true);
 const result=await page.evaluate(()=>window.__screenWidget.runCorpus());
 console.log(result.summaryLines.join('\n'));
 console.log('ELAPSED '+result.elapsedSeconds+' seconds');
 expect(result.simulations).toBe(190);expect(result.datasets).toBe(19);
 expect(result.seeds).toEqual([101,202,303,404,505,606,707,808,909,1010]);
 expect(result.checks).toBe(29);expect(result.passed).toBe(29);expect(result.failed).toEqual([]);
 expect(result.rows.find(r=>r.id==='screen_mean_all').ref).toBe(0.447);
 expect(result.summaryLines[0]).toBe('SCREEN FULL: 19 datasets x 10 seeds = 190 simulations; 29 checks; 29 passed; 0 failed');
 expect(external).toEqual([]);
});
test('hash mismatch and missing corpus are refused before ranking',async({page,context})=>{
 const external=await open(page,context);
 const errors=await page.evaluate(async()=>{
  const a=window.ScreenValidationAdapter,files=await AlmValidate.loadFiles(a.corpus.files,[...document.querySelector('#alm-validate input[type=file]').files],true);
  let calls=0;window.__almScreenpro.simulateActiveLearning=()=>{calls++;throw Error('Must not run');};
  const errors=[],gz=a.corpus.files.find(f=>f.path.endsWith('.gz')).path;
  const corrupt=files[gz].slice(0);new Uint8Array(corrupt)[0]^=1;
  for(const altered of [{...files,'validate/corpus/reference.json':files['validate/corpus/reference.json']+' '},{},{...files,[gz]:corrupt}]){
   try{await a.corpus.run(altered);errors.push('accepted');}catch(e){errors.push(e.message);}
  }return {errors,calls};
 });
 expect(errors.calls).toBe(0);expect(errors.errors[0]).toContain('SHA-256 mismatch');
 expect(errors.errors[1]).toContain('Missing corpus file');expect(errors.errors[2]).toContain('SHA-256 mismatch');expect(external).toEqual([]);
});
test('honest unavailable R link @slow',async({page,context})=>{
 const external=await open(page,context);
 await page.getByRole('button',{name:'Load example',exact:true}).click();
 expect(await page.evaluate(()=>window.ScreenValidationAdapter.live)).toBeNull();
 const link=page.locator('#alm-validate').getByRole('link',{name:'R check available via the reproducible repo'});
 await expect(link).toHaveAttribute('href','https://github.com/mahmood726-cyber/screen-reproducible');
 expect(external).toEqual([]);
});
test('shared widget renders and runs the selected offline quick mode',async({page,context})=>{
 test.skip(!hasWidget,'Framework lane has not supplied shared/alm-validate.js');
 const external=await open(page,context);
 await page.locator('#screen-validation-mode').selectOption('quick');
 const buttons=page.locator('#alm-validate button');
 expect(await buttons.count()).toBeGreaterThan(0);
 await buttons.filter({hasText:/full validation|corpus|paper|benchmark/i}).first().click();
 await expect(page.locator('#alm-validate')).toContainText('4 passed',{timeout:60000});
 expect(external).toEqual([]);
});

test('HTTP loader preserves compressed bytes and shared loader refuses changed gzip',async({page,baseURL})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto(baseURL+'/screen/index.html');
 const result=await page.evaluate(async()=>{
  const a=await ScreenValidationAdapter.ready;a.corpus.mode='quick';
  const files=await a.corpus.loadFiles();
  const binary=a.corpus.files.every(f=>files[f.path] instanceof ArrayBuffer&&files[f.path].byteLength===f.bytes);
  return {binary,result:await a.corpus.run(files)};
 });
 expect(result.binary).toBe(true);expect(result.result.passed).toBe(4);
 expect(requests.filter(u=>u.endsWith('.csv.gz'))).toHaveLength(19);
 await page.route('**/benchmark/data/corpora/*.csv.gz',route=>route.fulfill({body:'corrupt gzip'}));
 const refusal=await page.evaluate(async()=>{
  let calls=0;window.__almScreenpro.simulateActiveLearning=()=>{calls++;throw Error('Must not run');};
  const widget=AlmValidate.mount(document.getElementById('alm-validate'),ScreenValidationAdapter);
  try{await widget.runCorpus();return {calls,error:'accepted'};}catch(e){return {calls,error:e.message};}
 });
 expect(refusal.calls).toBe(0);expect(refusal.error).toContain('SHA-256 mismatch');
 expect(requests.every(u=>new URL(u).origin===baseURL)).toBe(true);
});
