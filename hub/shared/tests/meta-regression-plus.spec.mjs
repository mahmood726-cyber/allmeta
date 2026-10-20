import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=new URL('../../../meta-regression/',import.meta.url);
const corpus=JSON.parse(readFileSync(new URL('validate/plus/corpus.json',base))),refs=JSON.parse(readFileSync(new URL('validate/plus/reference.json',base))),manifest=JSON.parse(readFileSync(new URL('validate/MANIFEST-plus.json',base)));
const good=corpus[refs.findIndex(r=>r.result.status==='ok')];
async function ready(page){await page.goto('/meta-regression/');await page.waitForFunction(()=>window.AlmMetaPlusValidation&&window.AlmMetaPlusUI);}
test('entire R corpus, visible numbers and effective plot geometry and paint',async({page})=>{
 test.setTimeout(240000);await ready(page);
 const before=await page.evaluate(()=>({original:_almLastFitted(),snapshot:AlmMetaPlusUI.snapshot()}));
 const result=await page.evaluate(()=>AlmMetaPlusValidation.runCorpus());
 expect(result.failed).toEqual([]);expect(result.checks).toBe(manifest.checks);expect(result.passed).toBe(manifest.checks);
 expect(await page.evaluate(()=>({original:_almLastFitted(),snapshot:AlmMetaPlusUI.snapshot()}))).toEqual(before);
});
test('correct displays in light/dark themes and narrow/wide viewports',async({page})=>{
 await ready(page);
 for(const colorScheme of ['light','dark'])for(const width of [390,1280]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:900});
  for(const interaction of [false,true]){
   const failures=await page.evaluate(c=>{const r=AlmMetaPlus.compute(c);AlmMetaPlusUI.render(r,c);return AlmMetaPlusDisplay.renderAudit(r,c).failures;},{...good,interaction});expect(failures).toEqual([]);
  }
 }
});
test('each displayed number, term, statistic label and refusal can fail',async({page})=>{
 await ready(page);
 const result=await page.evaluate(c=>{
  const r=AlmMetaPlus.compute(c),out=[];AlmMetaPlusUI.render(r,c);
  const keys=[...document.querySelectorAll('#plus-results [data-plus-number]')].map(n=>n.dataset.plusNumber);
  for(const key of keys){AlmMetaPlusUI.render(r,c);document.querySelector(`[data-plus-number="${key}"]`).textContent='999';out.push(AlmMetaPlusDisplay.displayed(r,c).length>0);}
  for(const selector of ['[data-term]','[data-model-heading]','thead th','[data-summary] dt','[data-held-label]','[data-comparison-label]']){AlmMetaPlusUI.render(r,c);document.querySelector('#plus-results '+selector).textContent='wrong';out.push(AlmMetaPlusDisplay.displayed(r,c).length>0);}
  const refusal={status:'refused',reason:'Moderator design is rank deficient'};AlmMetaPlusUI.render(refusal,c);document.getElementById('plus-status').textContent='Refused: wrong';out.push(AlmMetaPlusDisplay.displayed(refusal,c).length>0);return out;
 },good);
 expect(result.length).toBeGreaterThan(40);expect(result.every(Boolean)).toBe(true);
});
test('every plotted role rejects deletion, changed geometry and changed paint',async({page})=>{
 await ready(page);
 const results=await page.evaluate(c=>{
  const r=AlmMetaPlus.compute(c),out=[];
  const selectors=['[data-role="bubble"]','[data-role="fit"]','[data-role="band"]','[data-axis="x"]','[data-axis="y"]','[data-tick="x"]','[data-tick="y"]','[data-title="x"]','[data-title="y"]'];
  for(const selector of selectors)for(const mutation of ['delete','translate','hide','opacity','colour','clip']){
   AlmMetaPlusUI.render(r,c);const n=document.querySelector('#plus-plot '+selector);
   if(mutation==='delete')n.remove();if(mutation==='translate')n.style.transform='translate(10px, 10px)';if(mutation==='hide')n.style.display='none';if(mutation==='opacity')n.style.opacity='.1';if(mutation==='colour'){n.style.fill='red';n.style.stroke='red';}if(mutation==='clip')n.style.clipPath='inset(100%)';
   out.push({selector,mutation,failed:AlmMetaPlusDisplay.geometry(r,c).failures.length>0});
  }
  AlmMetaPlusUI.render(r,c);const p=document.querySelector('#plus-plot [data-role="fit"]').points;p.getItem(10).y+=10;out.push({mutation:'internal vertex',failed:AlmMetaPlusDisplay.geometry(r,c).failures.length>0});
  AlmMetaPlusUI.render(r,c);document.querySelector('#plus-plot [data-role="bubble"]').style.r='0';out.push({mutation:'CSS radius',failed:AlmMetaPlusDisplay.geometry(r,c).failures.length>0});
  AlmMetaPlusUI.render(r,c);document.getElementById('plus-plot').style.opacity='0';out.push({mutation:'ancestor opacity',failed:AlmMetaPlusDisplay.geometry(r,c).failures.length>0});return out;
 },good);
 expect(results.filter(r=>!r.failed)).toEqual([]);expect(results.length).toBe(57);
});
test('stale inputs clear results and exports; missing data never silently drops rows',async({page})=>{
 await ready(page);await page.locator('#plus-data').fill('yi,vi,a,b\n1,1,2,3\n2,1,,4');
 await expect(page.locator('#plus-results')).toBeEmpty();await expect(page.locator('#plus-export')).toBeDisabled();
 await page.locator('#plus-run').click();await expect(page.locator('#plus-status')).toContainText('Refused:');await expect(page.locator('#plus-plot')).toBeEmpty();
});
test('tampered offline bytes are rejected by the shared SHA-256 gate',async({page})=>{
 await page.route('**/meta-regression/validate/plus/reference.json',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+' '});});
 await ready(page);const error=await page.evaluate(()=>AlmMetaPlusValidation.runCorpus().then(()=>'',e=>e.message));expect(error).toContain('SHA-256 mismatch');
});
test('live webR metafor tier @slow',async({page})=>{
 test.setTimeout(240000);await ready(page);const r=await page.evaluate(()=>AlmMetaPlusValidation.runLive());expect(r.rows.length).toBeGreaterThan(100);expect(r.rows.filter(r=>!r.pass)).toEqual([]);
});
