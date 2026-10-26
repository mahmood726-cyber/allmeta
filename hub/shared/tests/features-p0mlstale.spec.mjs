import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('./rchecks-out/p0mlstale/', import.meta.url);
async function current(page) {
  return page.evaluate(()=>({mom:window._almLastMlma(),reml:window.__almReml(),summary:document.querySelector('#summary').innerHTML}));
}
async function stale(page) {
  await expect(page.locator('#analysis-stale')).toBeVisible();
  await expect(page.locator('#analysis-status')).toBeHidden();
  for (const id of ['summary','body','forest']) expect(await page.locator('#'+id).evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(await page.evaluate(()=>window._almLastMlma())).toBeNull();
  // Capture guard must stop downstream export handlers, including plot downloads.
  expect(await page.evaluate(()=>{
    let reached=0;
    for(const id of ['alm-plot-mount','alm-export-mount','alm-grade-push']) {
      const mount=document.getElementById(id), button=document.createElement('button');
      button.addEventListener('click',()=>reached++);mount.append(button);button.click();button.remove();
    }
    return reached;
  })).toBe(0);
}
for(const n of [0,1,2]) test('P07 '+n+' rows: pasted and uploaded refusal, valid refit control',async({page})=>{
  await page.goto('/multilevel-ma/index.html'); await page.locator('#btn-run').click();
  const valid=await page.locator('#src').inputValue(), before=await current(page);
  for(const upload of [false,true]) {
    const short=valid.split('\n').slice(0,n).join('\n');
    if(upload) {
      await page.locator('#alm-csv-mount textarea').fill('study,effect,SE,label\n'+short);
      await page.locator('[data-action="parse-paste"]').click();
    } else { await page.locator('#src').fill(short); await page.locator('#btn-run').click(); }
    await stale(page);
    expect(await page.locator('#summary').innerHTML()).toBe(before.summary);
    if(n===2&&!upload) {
      await mkdir(out,{recursive:true});
      const flag=await page.locator('#analysis-stale').evaluate(el=>!el.hidden);
      await writeFile(new URL('stale.csv',out),'rows,stale\n2,'+String(flag).toUpperCase()+'\n');
    }
    await page.locator('#src').fill(valid);await page.locator('#btn-run').click();
    await expect(page.locator('#analysis-stale')).toBeHidden();
    expect(await current(page)).toEqual(before);
    expect(await page.locator('#summary').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  }
  // Compare recovery with a new page fit, not only the previous in-memory result.
  const fresh=await page.context().newPage();await fresh.goto('/multilevel-ma/index.html');
  await fresh.locator('#src').fill(valid);await fresh.locator('#btn-run').click();
  expect(await current(fresh)).toEqual(before);await fresh.close();
});
test('P07 existing edit trigger, exported REML values and successful control',async({page})=>{
  await page.goto('/multilevel-ma/index.html');await page.locator('#btn-run').click();
  const valid=await page.locator('#src').inputValue();
  const values=await page.evaluate(()=>({rows:__almMlmaParse(document.querySelector('#src').value),fit:__almReml()}));
  await mkdir(out,{recursive:true});
  await writeFile(new URL('fixture.csv',out),'study,es_id,yi,vi\n'+values.rows.map((r,i)=>[r.study,i+1,r.te,r.se*r.se].join(',')).join('\n')+'\n');
  const keys=['mu','se','ciLo','ciHi','sigma2Between','sigma2Within','logLik'];
  await writeFile(new URL('estimates.csv',out),'metric,value\n'+keys.map(k=>k+','+values.fit[k]).join('\n')+'\n');
  await page.locator('#src').fill(valid+'\n7,0.2,0.1,new');await stale(page);
  await page.locator('#btn-run').click();await expect(page.locator('#analysis-stale')).toBeHidden();
  expect((await current(page)).mom.k).toBe(values.rows.length+1);
});

test('P07 export guards release after a successful refit',async({page})=>{
  await page.goto('/multilevel-ma/index.html');await page.locator('#btn-run').click();
  const valid=await page.locator('#src').inputValue();
  const reach=()=>page.evaluate(()=>{
    let reached=0;
    for(const id of ['alm-plot-mount','alm-export-mount','alm-grade-push']) {
      const mount=document.getElementById(id),button=document.createElement('button');
      button.addEventListener('click',()=>reached++);mount.append(button);button.click();button.remove();
    }
    return reached;
  });
  expect(await reach()).toBe(3);
  // Assign directly: programmatic imports do not necessarily dispatch an input event.
  await page.evaluate(()=>{document.getElementById('src').value='A,0.2,0.1';window.__almMlmaRun();});
  await stale(page);expect(await reach()).toBe(0);
  await page.locator('#src').fill(valid);await page.locator('#btn-run').click();
  await expect(page.locator('#analysis-stale')).toBeHidden();
  expect(await reach()).toBe(3);
});
