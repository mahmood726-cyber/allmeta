import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const cases=[['pubbias-tests','AlmPubbiasValidationAdapter'],['multilevel-ma','AlmMultilevelValidationAdapter'],['proportion-ma','AlmProportionValidationAdapter'],['mh-peto','AlmMhPetoValidationAdapter'],['limit-ma','AlmLimitValidationAdapter'],['gosh','AlmGoshValidationAdapter'],['dose-response-ma','AlmDoseValidate'],['dta-sroc','AlmDTAValidateAdapter'],['nma','AlmNmaValidateAdapter'],['heterogeneity','AlmHetValidationAdapter'],['influence','AlmInfluenceValidationAdapter'],['screen','ScreenValidationAdapter']];
for(const [app,adapter] of cases) test(`baseline/current replay ${app}`,async({browser})=>{
 test.setTimeout(app==='screen'?1800000:360000);
 const outcomes=[];
 for(const baseline of [true,false]) {
  const context=await browser.newContext();const page=await context.newPage();
  if(baseline) for(const file of [app+'/index.html','hub/shared/plot-export.js',...(app==='gosh'?['gosh/validate/adapter.js']:[])]) {
   const body=execFileSync('git',['show','14e042c:'+file],{cwd:root,encoding:'utf8',maxBuffer:10000000});
   await page.route('**/'+file,route=>route.fulfill({body,contentType:file.endsWith('.html')?'text/html':'application/javascript'}));
  }
  await page.goto('http://localhost:8088/'+app+'/index.html');
  const r=await page.evaluate(async({adapter,app})=>{
   const a=window[adapter];if(a.ready)await a.ready;
   if(app==='screen')a.corpus.mode='full';
   const widget=AlmValidate.mount(document.getElementById('alm-validate'),a);await widget.prepare();
   const r=await widget.runCorpus();return {checks:r.checks,passed:r.passed,failed:r.failed};
  },{adapter,app});
  outcomes.push(r);await context.close();
 }
 expect(outcomes[1]).toEqual(outcomes[0]);
 console.log('R1 REPLAY '+app+' '+outcomes[0].passed+'/'+outcomes[0].checks+' -> '+outcomes[1].passed+'/'+outcomes[1].checks);
});
for(const format of ['png','svg','tiff','pdf'])test(`GOSH replay after ${format} export and status tamper`,async({page})=>{
 test.setTimeout(360000);await page.goto('/gosh/index.html');
 const fresh=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(fresh.failed).toEqual([]);
 const panel=page.getByRole('group',{name:'Download plots',exact:true});
 await panel.getByLabel('Format',{exact:true}).selectOption(format);await panel.getByLabel('Physical width',{exact:true}).selectOption('85');
 const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Download GOSH scatter',exact:true}).click();
 expect(await (await download).failure()).toBeNull();await expect(panel.getByRole('status')).toHaveText('Downloaded 1 file(s)');
 const after=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(after.checks).toBe(fresh.checks);expect(after.failed).toEqual([]);
 await panel.getByRole('status').evaluate(el=>el.textContent='Downloaded 2 file(s)');
 const bad=await page.evaluate(()=>AlmGoshValidation.runCorpus());expect(bad.checks).toBe(fresh.checks);expect(bad.failed.length).toBeGreaterThan(0);expect(bad.failed.every(f=>f.quantity==='page_text')).toBe(true);
 console.log('R1 EXPORT '+format+' '+fresh.checks+' / '+after.checks+'; tamper rejected '+bad.failed.length);
});
for(const mutation of ['legend','label','control','status attribute','status child','status removed'])test('export exact contract rejects '+mutation,async({page})=>{
 await page.goto('/gosh/index.html');
 expect(await page.evaluate(()=>alm.plotExport.statusContract(document.querySelector('#alm-plot-mount > fieldset')))).toBe(true);
 await page.locator('#alm-plot-mount > fieldset').evaluate((p,m)=>{
  if(m==='legend')p.querySelector('legend').textContent='Changed';
  if(m==='label')p.querySelector('label').textContent='Changed';
  if(m==='control')p.querySelector('select').remove();
  if(m==='status attribute')p.lastElementChild.setAttribute('aria-live','off');
  if(m==='status child')p.lastElementChild.appendChild(document.createElement('span'));
  if(m==='status removed')p.lastElementChild.remove();
 },mutation);
 expect(await page.evaluate(()=>alm.plotExport.statusContract(document.querySelector('#alm-plot-mount > fieldset')))).toBe(false);
});

// Real autosave metadata must not invalidate the exact exporter contract.
test('export contract survives autosave metadata and still rejects label tampering',async({page})=>{
 await page.goto('/gosh/index.html');
 await page.locator('#src').fill(await page.locator('#src').inputValue()+'\n');
 await page.waitForFunction(()=>document.querySelector('#alm-plot-mount input[data-autosave-index]'));
 const valid=()=>alm.plotExport.statusContract(document.querySelector('#alm-plot-mount > fieldset'));
 expect(await page.evaluate(valid)).toBe(true);
 await page.locator('#alm-plot-mount legend').evaluate(el=>el.textContent='Changed');
 expect(await page.evaluate(valid)).toBe(false);
});
