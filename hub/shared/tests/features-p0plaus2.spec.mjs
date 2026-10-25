import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const fixture=n=>readFileSync(new URL('./fixtures/p0plaus2/'+n,import.meta.url),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const out=new URL('./rchecks-out/p0plaus2/',import.meta.url);
function csv(name,header,rows){mkdirSync(out,{recursive:true});writeFileSync(new URL(name,out),header+'\n'+rows.map(r=>r.join(',')).join('\n')+'\n');}
const near=(a,b)=>expect(Math.abs(a-b)).toBeLessThan(1e-6);
test('SE control, variance plant, provenance and page-produced R values',async({page})=>{
 await page.goto('http://localhost:8088/limit-ma/');
 const rows=fixture('limit.csv'); const text=rows.map(([y,v,l])=>[y,v,l].join(',')).join('\n');
 await expect(page.locator('#uncertainty-scale')).toHaveValue('se');
 await page.locator('#src').fill(text); await page.locator('#btn-run').click();
 const numeric=await page.evaluate(()=>window._almLastLimit());
 expect(Object.keys(numeric).sort()).toEqual(['k','fe_est','fe_se','fe_ci_lo','fe_ci_hi','re_est','re_se','re_ci_lo','re_ci_hi','tau2_dl','tau_dl','limit_est','limit_se','limit_ci_lo','limit_ci_hi','slope','_schema','alpha_r','beta_r','Q','Q_small','Q_resid','G_squared','te_limit'].sort());
 const wrong=await page.evaluate(()=>window._almExportLimit());
 await page.locator('#uncertainty-scale').selectOption('variance'); await page.locator('#btn-run').click();
 const r=await page.evaluate(()=>window._almExportLimit());
 expect(Math.abs(r.re_est-wrong.re_est)).toBeGreaterThan(1e-6);
 await expect(page.locator('#scale-provenance')).toContainText('uncertainty entered as variance');
 expect(r.methods).toContain('uncertainty entered as variance'); expect(r.uncertainty_scale).toBe('variance');
 const downloadText=async action=>{
  const pending=page.waitForEvent('download');await page.locator('#alm-export-mount [data-action="'+action+'"]').click();
  const download=await pending;const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();return text;
 };
 const exported=JSON.parse(await downloadText('json'));expect(exported).toEqual(r);
 const report=await downloadText('report-md');expect(report.split('## Results')[0]).toContain('uncertainty entered as variance');
 const saved=await page.evaluate(()=>window.__almLimitValidationSnapshot());
 await page.locator('#uncertainty-scale').selectOption('se');
 await page.evaluate(s=>window.__almLimitValidationRestore(s),saved);
 expect(await page.evaluate(()=>window._almExportLimit())).toEqual(r);
 await expect(page.locator('#uncertainty-scale')).toHaveValue('variance');
 await page.locator('#uncertainty-scale').selectOption('se');
 await page.locator('#src').fill(rows.map(([y,v,l])=>[y,Math.sqrt(+v),l].join(',')).join('\n')); await page.locator('#btn-run').click();
 const control=await page.evaluate(()=>window._almExportLimit());
 for(const key of ['re_est','re_se','tau2_dl','limit_est','limit_se']) near(r[key],control[key]);
 expect(control.methods).toContain('uncertainty entered as standard error');
 csv('limit.csv','re_est,re_se,tau2,scale,plant_est',[[r.re_est,r.re_se,r.tau2_dl,r.uncertainty_scale,wrong.re_est]]);
});
test('additive control, raw-ratio plant, Methods/export and refusal',async({page})=>{
 await page.goto('http://localhost:8088/multivariate-ma/');
 const rows=fixture('raw.csv'), text=rows.map(r=>r.join(',')).join('\n');
 await expect(page.locator('#effect-scale')).toHaveValue('additive');
 await page.locator('#f-data').fill(text); await page.evaluate(()=>window.AlmMvPage.run());
 const wrong=await page.evaluate(()=>window._almLastMultivariate());
 await page.locator('#effect-scale').selectOption('raw');
 const raw=await page.evaluate(()=>window._almLastMultivariate());
 expect(raw).not.toBeNull(); expect(Math.abs(raw.mu[0]-wrong.mu[0])).toBeGreaterThan(1e-6);
 await expect(page.locator('#scale-provenance')).toContainText('raw ratios');
 await expect(page.locator('#plus-methods')).toHaveValue(/raw ratios/); expect(raw.effect_scale).toBe('raw'); expect(raw.methods).toContain('log-transformed');
 const parsed=await page.evaluate(()=>window.AlmMvPage.current().parsed);
 for(let i=0;i<rows.length;i++){near(parsed.rows[i].y[0],Math.log(+rows[i][1]));expect(parsed.rows[i].v).toEqual([+rows[i][2],+rows[i][4]]);expect(parsed.rows[i].cov).toBe(+rows[i][5]);}
 await page.locator('#effect-scale').selectOption('additive');
 await page.locator('#f-data').fill(rows.map(([l,y,v,z,w,c])=>[l,Math.log(+y),v,Math.log(+z),w,c].join(',')).join('\n')); await page.evaluate(()=>window.AlmMvPage.run());
 const control=await page.evaluate(()=>window._almLastMultivariate());
 for(let j=0;j<2;j++){near(raw.mu[j],control.mu[j]);near(raw.muSE[j],control.muSE[j]);}
 csv('raw.csv','outcome,mu,se,scale',raw.mu.map((m,i)=>[i+1,m,raw.muSE[i],raw.effect_scale]));
 for(const value of [0,-1]){
  const bad=rows.map(r=>r.slice());bad[1][1]=String(value);
  await page.locator('#f-data').fill(bad.map(r=>r.join(',')).join('\n'));
  await page.locator('#effect-scale').selectOption('raw');await page.evaluate(()=>window.AlmMvPage.run());
  await expect(page.locator('#headline')).toContainText(/Refused:.*line 2.*S2/);
  expect(await page.evaluate(()=>window._almLastMultivariate())).toBeNull();
  await page.locator('#effect-scale').selectOption('additive');await page.evaluate(()=>window.AlmMvPage.run());
  expect(await page.evaluate(()=>window._almLastMultivariate())).not.toBeNull();
 }
});
