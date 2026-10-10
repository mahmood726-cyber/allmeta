/**
 * Screen benchmark integration contract. Chrome/file URLs, no remote requests.
 * Full mode distinguishes 190 actual simulations from 29 published Screen comparisons.
 * No per-seed oracle exists in the supplied checkout.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const app=pathToFileURL(resolve(root,'screen/index.html')).href;
const hasWidget=existsSync(resolve(root,'shared/alm-validate.js'));
test.use({channel:'chrome'});
async function open(page,context){
 const external=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 await context.setOffline(true);
 await page.goto(app);
 await page.evaluate(()=>window.ScreenValidationAdapter.ready);
 return external;
}
test('quick corpus replay is offline, uses shipped simulator and reports stored expected values',async({page,context})=>{
 const external=await open(page,context);
 const result=await page.evaluate(async()=>{
  const a=window.ScreenValidationAdapter;a.corpus.mode='quick';
  const original=window.__almScreenpro.simulateActiveLearning;let calls=0;
  window.__almScreenpro.simulateActiveLearning=o=>{calls++;return original(o);};
  const result=await a.corpus.run(await a.corpus.loadFiles());
  return {...result,calls};
 });
 expect(result.calls).toBe(4);
 expect(result.simulations).toBe(4);expect(result.checks).toBe(4);expect(result.passed).toBe(4);
 expect(result.failed).toEqual([]);expect(result.rows.map(r=>r.ref)).toEqual([0.0113,0.2734,0.6599,0.4668]);
 expect(external).toEqual([]);
});
test('full paper WSS benchmark @slow',async({page,context})=>{
 test.setTimeout(30*60*1000);
 const external=await open(page,context);
 await page.exposeFunction('screenValidationProgress',p=>{if(p.done%10===0)console.log(p.message);});
 const result=await page.evaluate(async()=>{
  const a=window.ScreenValidationAdapter;a.corpus.mode='full';
  return a.corpus.run(await a.corpus.loadFiles(),p=>window.screenValidationProgress(p));
 });
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
  const a=window.ScreenValidationAdapter,files=await a.corpus.loadFiles();
  let calls=0;window.__almScreenpro.simulateActiveLearning=()=>{calls++;throw Error('Must not run');};
  const errors=[];
  for(const altered of [{...files,'validate/corpus/reference.json':files['validate/corpus/reference.json']+' '},{}]){
   try{await a.corpus.run(altered);errors.push('accepted');}catch(e){errors.push(e.message);}
  }return {errors,calls};
 });
 expect(errors.calls).toBe(0);expect(errors.errors[0]).toContain('SHA-256 mismatch');
 expect(errors.errors[1]).toContain('Missing corpus file');expect(external).toEqual([]);
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
 await buttons.filter({hasText:/corpus|paper|benchmark/i}).first().click();
 await expect(page.locator('#alm-validate')).toContainText('4 passed',{timeout:60000});
 expect(external).toEqual([]);
});
