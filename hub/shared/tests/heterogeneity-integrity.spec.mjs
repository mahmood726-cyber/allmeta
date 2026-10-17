import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const DATA='A,-0.5,0.1\nB,0.1,0.4\nC,1.2,0.2';
async function open(page) {
  await page.goto('/heterogeneity/index.html');
  await page.waitForFunction(()=>typeof window.__almHetCompute==='function' && typeof window.__almResults==='function');
  await page.locator('#f-tau2').selectOption('pm');
}
async function input(page,text) { await page.locator('#f-data').fill(text); }
async function result(page) { return page.evaluate(()=>window.__almResults()); }
async function csv(page,text) {
  await page.locator('#alm-csv-mount textarea').fill(text);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
}

test('zero Q is a valid boundary, not a NaN defect',async({page})=>{
  await open(page);await input(page,'A,0,0.1\nB,0,0.2\nC,0,0.3');
  const out=await result(page);
  expect(out.Q).toBe(0);expect(out.I2).toBe(0);expect(out.tau2).toBe(0);
  expect(Number.isFinite(out.ci_lb_hksj)).toBe(true);
});

test('distinct I2 definitions are labelled and normal, modified-HK and PI methods exported',async({page})=>{
  await open(page);await input(page,DATA);
  const out=await result(page);
  expect(out.I2).toBeCloseTo(96.56371446103498,8);
  expect(out.I2_Q).toBe(out.I2);
  expect(out.I2_model).toBeCloseTo(94.6921190680546,8);
  expect(out.modified_HK_test).toBe('adhoc');expect(out.prediction_interval_test).toBe('t');
  await expect(page.locator('#stats-wrap')).toContainText('I² (Q-based)');
  await expect(page.locator('#stats-wrap')).toContainText('I² (model-based)');
  await expect(page.locator('#het-method-note')).toContainText('variance floor of 1');
});

for(const [name,text] of [
  ['numeric prefix','A,0.2junk,0.1\nB,0.3,0.1'],
  ['empty value','A,,0.1\nB,0.3,0.1'],
  ['nonpositive SE','A,0.2,0\nB,0.3,0.1'],
  ['variance underflow','A,0.2,1e-200\nB,0.3,0.1'],
  ['fake header','A,not a number,0.1\nB,0.3,0.1']
])test('bad textarea row blocks the full fit: '+name,async({page})=>{
  await open(page);await input(page,DATA);await input(page,text);
  expect((await result(page)).k).toBe(0);
  expect(await page.evaluate(()=>window._almLastFE())).toBeNull();
  expect(await page.locator('#svg-host circle').count()).toBe(0);
  await expect(page.locator('#warn-banner')).toContainText('Analysis blocked');
});

test('a recognised header after comments is accepted',async({page})=>{
  await open(page);await input(page,'# source\n# cohort\n# date\nlabel,estimate,se\n'+DATA);
  expect((await result(page)).k).toBe(3);
});

test('CSV with one invalid variance never becomes a two-study subset and Undo restores input',async({page})=>{
  await open(page);await input(page,DATA);
  await csv(page,'study,yi,vi\nA,-0.5,0.01\nB,0.1,-0.16\nC,1.2,0.04');
  expect((await result(page)).k).toBe(0);
  await expect(page.locator('#warn-banner')).toContainText('CSV rejected');
  await page.locator('#alm-undo-mount [data-action="undo"]').click();
  expect((await result(page)).k).toBe(3);
  await expect(page.locator('#f-data')).toHaveValue(DATA);
});

test('CSV missing yi is not coerced to zero',async({page})=>{
  await open(page);await input(page,DATA);
  await csv(page,'study,yi,vi\nA,,0.01\nB,0.1,0.16\nC,1.2,0.04');
  expect((await result(page)).k).toBe(0);
  await expect(page.locator('#warn-banner')).toContainText('CSV rejected');
});

test('duplicate and fuzzy column names require explicit correction',async({page})=>{
  await open(page);
  for(const header of ['study,yi,vi,vi','study,yi,vx']){
    await csv(page,header+'\nA,0.1,0.04,0.09\nB,0.2,0.04,0.09');
    expect((await result(page)).k).toBe(0);
    await expect(page.locator('#warn-banner')).toContainText('exact study/yi/vi');
  }
});

test('actual CSV file upload retains all studies and variance precision',async({page})=>{
  await open(page);
  await page.locator('#alm-csv-mount input[type="file"]').setInputFiles({name:'studies.csv',mimeType:'text/csv',buffer:Buffer.from('study,yi,vi\n"Study, A",-0.5,0.010000000000001\nB,0.1,0.16\nC,1.2,0.04')});
  await expect.poll(async()=>(await result(page)).k).toBe(3);
  const out=await result(page);
  expect(out.studies[0].label).toBe('Study, A');
  expect(out.studies[0].v).toBeCloseTo(0.010000000000001,15);
  expect(out.mu).toBeCloseTo(0.2636048510479969,9);
});

test('numeric engine failure clears cached output instead of showing an old fit',async({page})=>{
  await open(page);await input(page,DATA);
  await page.evaluate(()=>{window.AlmMaCore={...window.AlmMaCore,tau2PM(){throw new Error('Injected numerical failure');}};});
  await input(page,DATA+'\nD,0.2,0.1');
  expect((await result(page)).k).toBe(0);
  expect(await page.evaluate(()=>window._almLastFE())).toBeNull();
  expect(await page.locator('#svg-host circle').count()).toBe(0);
  await expect(page.locator('#warn-banner')).toContainText('Injected numerical failure');
});

test('invalid input cannot overwrite shared studies or pooled GRADE data',async({page})=>{
  await open(page);await input(page,DATA);
  await page.evaluate(()=>{localStorage.setItem('ma-studies-v1','protected');localStorage.setItem('ma-pooled-v1','protected-pooled');});
  await input(page,'A,broken,0.1\nB,0.2,0.1');
  await page.locator('#btn-bus-save').click();await page.locator('#btn-push-grade').click();
  expect(await page.evaluate(()=>localStorage.getItem('ma-studies-v1'))).toBe('protected');
  expect(await page.evaluate(()=>localStorage.getItem('ma-pooled-v1'))).toBe('protected-pooled');
});

test('Baujat axis edits change geometry without changing fit values',async({page})=>{
  await open(page);await input(page,DATA);
  const before=await result(page);
  const oldX=Number(await page.locator('#svg-host circle').first().getAttribute('cx'));
  const max=page.locator('#alm-axis-mount input[data-axis="x"][data-edge="max"]');
  await max.fill('20');await max.dispatchEvent('change');
  const newX=Number(await page.locator('#svg-host circle').first().getAttribute('cx'));
  expect(Math.abs(newX-oldX)).toBeGreaterThan(10);
  const after=await result(page);expect(after.mu).toBe(before.mu);expect(after.k).toBe(3);
  expect(await page.locator('#alm-axis-mount input[data-axis="y"][data-edge="max"]').count()).toBe(1);
  await expect(page.locator('#alm-axis-mount input[data-axis="x"][data-edge="log"]')).toBeDisabled();
});

test('cropped Baujat view explicitly reports hidden points but retains their data',async({page})=>{
  await open(page);await input(page,DATA);
  const max=page.locator('#alm-axis-mount input[data-axis="x"][data-edge="max"]');
  await max.fill('0.01');await max.dispatchEvent('change');
  await expect(page.locator('#baujat-range-note')).toContainText('outside the selected axis range');
  expect((await result(page)).k).toBe(3);
  const positions=await page.locator('#svg-host circle').evaluateAll(xs=>xs.map(x=>Number(x.getAttribute('cx'))));
  expect(positions.every(x=>x>=78 && x<=656)).toBe(true);
});

test('accessible SVG export names the actual model and matches the selected view',async({page})=>{
  await open(page);await input(page,DATA);
  await expect(page.locator('#svg-host svg')).toHaveAttribute('role','img');
  await expect(page.locator('#baujat-description')).toContainText('Estimator pm');
  const panel=page.getByRole('group',{name:'Download plots',exact:true});
  await panel.getByLabel('Format',{exact:true}).selectOption('svg');
  const [dl]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'Download Baujat plot',exact:true}).click()]);
  const txt=readFileSync(await dl.path(),'utf8');
  const parsed=await page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');
    return {errors:doc.querySelectorAll('parsererror').length,title:doc.querySelector('#baujat-title')?.textContent,n:doc.querySelectorAll('circle').length};
  },txt);
  expect(parsed.errors).toBe(0);expect(parsed.title).toBe('Baujat plot for 3 studies');expect(parsed.n).toBe(3);
});

test('CSV diagnostics display untrusted cell contents as text, not executable markup',async({page})=>{
  await open(page);
  await csv(page,'study,yi,vi\nA,<svg/onload=window.__csvInjected=1>,0.04\nB,0.2,0.04');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>window.__csvInjected)).toBeUndefined();
  expect(await page.locator('#alm-csv-mount [data-section="warnings"] svg').count()).toBe(0);
  await expect(page.locator('#alm-csv-mount [data-section="warnings"]')).toContainText('<svg/onload=');
});

test('fresh pinned R verifies both CI conventions, model I2 and the distinct prediction interval',async({page})=>{
  test.setTimeout(240000);await open(page);
  await page.addScriptTag({url:'/shared/webr-runner.js'});
  const cases=[{name:'floor',data:'A,0.20,0.20\nB,0.21,0.20\nC,0.19,0.20'},
    {name:'unequal',data:DATA},{name:'zero',data:'A,0,0.1\nB,0,0.2\nC,0,0.3'}];
  const records=[];
  for(const c of cases){
    await input(page,c.data);
    const out=await result(page);
    const ref=await page.evaluate(async()=>{
      const studies=window._almLastStudies();
      const z=await AlmWebR.runMetafor({studies,method:'PM',test:'z'});
      const hk=await AlmWebR.runMetafor({studies,method:'PM',test:'adhoc'});
      const code='suppressPackageStartupMessages(library(metafor))\nf<-rma(yi=c('+studies.map(x=>x.est).join(',')+'),vi=c('+studies.map(x=>x.v).join(',')+'),method="PM",test="t",control=list(tol=1e-15,maxiter=10000))\np<-predict(f)\ncat(sprintf("PIJSON:[%.17g,%.17g]\\n",p$pi.lb,p$pi.ub))';
      const pi=await AlmWebR.runR({packages:['metafor'],script:code});return {z,hk,pi};
    });
    expect(ref.z.ok,JSON.stringify(ref.z)).toBe(true);expect(ref.hk.ok).toBe(true);expect(ref.pi.ok).toBe(true);
    expect(ref.z.versions.metafor).toBe('4.8-0');expect(ref.z.versions.webR).toBe('0.5.5');
    for(const [js,r] of [['mu','mu'],['se','se'],['ci_lb','ci_lb'],['ci_ub','ci_ub'],['tau2','tau2'],['I2_model','I2']])
      expect(Math.abs(out[js]-ref.z.result[r]),c.name+' '+js).toBeLessThan(1e-8*Math.max(1,Math.abs(ref.z.result[r])));
    expect(out.ci_lb_hksj).toBeCloseTo(ref.hk.result.ci_lb,7);expect(out.ci_ub_hksj).toBeCloseTo(ref.hk.result.ci_ub,7);
    const pi=JSON.parse(ref.pi.stdout.split('\n').find(x=>x.startsWith('PIJSON:')).slice(7));
    expect(out.pi_lb).toBeCloseTo(pi[0],7);expect(out.pi_ub).toBeCloseTo(pi[1],7);
    records.push({name:c.name,versions:ref.z.versions,actual:out,z:ref.z.result,hk:ref.hk.result,pi});
  }
  console.log('HETEROGENEITY_FRESH_R_EVIDENCE '+JSON.stringify(records));
});
