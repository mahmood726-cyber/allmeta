import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {badRows,withBadRow,valid,validFixtures} from './fixtures/p0prop/cases.mjs';

const banner='Results do not match the current input';
const out=new URL('./rchecks-out/p0prop/',import.meta.url);
const exportButtons='#alm-export-mount button, #alm-plot-mount button, #btn-bus-save, #btn-verify-in-r, #btn-truthcert';
async function open(page) {
  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toBeVisible();
}
async function run(page,text) {
  await page.locator('#src').fill(text);
  await page.locator('#btn-run').click();
}
async function refused(page,row,label,reason) {
  await expect(page.locator('#parse-warn')).toBeVisible();
  await expect(page.locator('#parse-warn')).toContainText(`Row ${row}`);
  await expect(page.locator('#parse-warn')).toContainText(label);
  await expect(page.locator('#parse-warn')).toContainText(reason);
  await expect(page.locator('#analysis-stale')).toHaveAttribute('role','status');
  await expect(page.locator('#analysis-stale')).toHaveText(banner);
  await expect(page.locator('#analysis-stale')).toBeVisible();
  await expect(page.locator('#analysis-status')).toBeHidden();
  expect(await page.evaluate(()=>window._almLastPropMA())).toBeNull();
  expect(await page.evaluate(()=>window.__almPropValidation.snapshot())).toBeNull();
  expect(await page.locator(exportButtons).evaluateAll(bs=>bs.length>0 && bs.every(b=>b.disabled))).toBe(true);
  expect(await page.locator('#forest').evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1);
}
for(const [name,row,label,reason] of badRows) test(`plant: ${name} is refused; corrected control recovers`,async({page})=>{
  await open(page);
  await run(page,valid);
  const before=await page.evaluate(()=>window._almLastPropMA());
  await run(page,withBadRow(row));
  await refused(page,2,label,reason);
  await run(page,valid);
  await expect(page.locator('#analysis-stale')).toBeHidden();
  await expect(page.locator('#parse-warn')).toBeHidden();
  expect(await page.evaluate(()=>window._almLastPropMA())).toEqual(before);
  await expect(page.locator('#alm-export-mount [data-action=json]')).toBeEnabled();
  expect(await page.locator('#forest').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});
test('plant: empty input is refused; integral decimal and optional-label controls succeed',async({page})=>{
  await open(page);
  await run(page,'');
  await refused(page,1,'Study 1',/empty/);
  await run(page,'12.0,150.0\n8,90\n0,10,Zero\n10,10,All\n');
  expect((await page.evaluate(()=>window._almLastPropMA())).k).toBe(4);
  await expect(page.locator('#analysis-stale')).toBeHidden();
});
test('plant: insufficient rows also invalidate every old output; valid control restores exports',async({page})=>{
  await open(page);
  await run(page,'12,150,A');
  await expect(page.locator('#parse-warn')).toContainText('Need at least 2');
  await expect(page.locator('#analysis-stale')).toBeVisible();
  expect(await page.locator(exportButtons).evaluateAll(bs=>bs.every(b=>b.disabled))).toBe(true);
  await run(page,valid);
  const download=page.waitForEvent('download');
  await page.locator('#alm-export-mount [data-action=json]').click();
  const stream=await (await download).createReadStream();
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).k).toBe(5);
});
for(const [name,row,label,reason] of badRows) test(`CSV plant: ${name}; valid upload control`,async({page})=>{
  await open(page);
  const pasted=page.locator('#alm-csv-mount textarea');
  await pasted.fill('events,total,label\n'+withBadRow(row));
  await page.locator('#alm-csv-mount [data-action=parse-paste]').click();
  await refused(page,3,label,reason);
  await page.locator('#alm-csv-mount input[type=file]').setInputFiles({name:'control.csv',mimeType:'text/csv',buffer:Buffer.from('events,total,label\n12.0,150,"Study, A"\n8,90,"Study ""B"""\n')});
  await expect(page.locator('#analysis-stale')).toBeHidden();
  await expect(page.locator('#res-body')).toContainText('Study, A');
  await expect(page.locator('#res-body')).toContainText('Study "B"');
  expect((await page.evaluate(()=>window._almLastPropMA())).k).toBe(2);
});
test('plant: refused row label is text, never markup',async({page})=>{
  await open(page);
  await run(page,'12,150,A\n12.5,150,<img src=x onerror=alert(1)>\n8,90,C');
  await expect(page.locator('#parse-warn')).toContainText('<img');
  await expect(page.locator('#parse-warn img')).toHaveCount(0);
});
for(const colorScheme of ['light','dark']) test(`plant: stale text retains WCAG contrast in ${colorScheme} mode; valid control recovers`,async({page})=>{
  await page.emulateMedia({colorScheme});
  await open(page);
  await run(page,valid);
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
  const audit=()=>new AxeBuilder({page})
    .include('#results-panel').include('#analysis-stale').include('#parse-warn')
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  const serious=result=>result.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
  expect(serious(await audit())).toEqual([]);
  const before=await page.locator('#res-body').innerText();
  await run(page,withBadRow('-1,150,Bad study'));
  await refused(page,2,'Bad study',/negative/);
  expect(await page.locator('#res-body').innerText()).toBe(before);
  await expect(page.locator('#res-body .pooled-row')).toBeVisible();
  await expect(page.locator('#het')).toBeVisible();
  // This fails on the round-1 CSS: alpha blending also fades every text cell.
  expect(serious(await audit())).toEqual([]);
  // Replant that exact defect to prove the contrast audit is active.
  const plant=await page.addStyleTag({content:'.results-stale table, .results-stale #het { opacity: 0.45; }'});
  try {
    expect(serious(await audit()).map(v=>v.id)).toContain('color-contrast');
  } finally {
    await plant.evaluate(el=>el.remove());
  }
  expect(serious(await audit())).toEqual([]);
  await run(page,valid);
  await expect(page.locator('#analysis-stale')).toBeHidden();
  await expect(page.locator('#parse-warn')).toBeHidden();
  await expect(page.locator('#alm-export-mount [data-action=json]')).toBeEnabled();
  expect(await page.locator('#res-body').innerText()).toBe(before);
  expect(serious(await audit())).toEqual([]);
});
test('R evidence: page values for all transforms and estimators plus truncated-count refusal',async({page})=>{
  await open(page);
  const values=[],inputs=[];
  for(const fixture of validFixtures) for(const transform of ['logit','ft','raw']) for(const method of ['PM','DL','FE']) {
    await page.evaluate(({text,transform,method})=>{
      document.getElementById('src').value=text;
      document.getElementById('trans').value=transform;
      document.getElementById('tau-est').value=method;
      document.getElementById('btn-run').click();
    },{text:fixture.text,transform,method});
    const actual=await page.evaluate(()=>window.__almPropValidation.snapshot());
    expect(actual).not.toBeNull();
    const id=`${fixture.id}-${transform}-${method}`;
    values.push({id,...actual.values});
    actual.studies.forEach((r,i)=>inputs.push({id,row:i+1,events:r.x,total:r.n,label:r.label}));
  }
  // Independent known numerical control already in proportion-ma-sanity.spec.mjs.
  const tiny=values.find(r=>r.id==='prop-tiny-logit-PM');
  for(const [key,value] of Object.entries({mu_re:-2.365861008193144,seRE:0.1350315581077194,poolP:0.08581328456303973,poolLo:0.0671999729960778,poolHi:0.1089798521337489}))
    expect(Math.abs(tiny[key]-value),key).toBeLessThan(1e-6);
  await run(page,withBadRow('12.5,150,Bad study'));
  await refused(page,2,'Bad study',/whole/);
  const refusal=await page.evaluate(()=>({events:12.5,total:150,row:2,label:'Bad study',refused:window._almLastPropMA()===null?1:0,error:document.getElementById('parse-warn').textContent}));
  const csv=(rows,keys)=>[keys.join(','),...rows.map(row=>keys.map(k=>'"'+String(row[k]??'').replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
  await mkdir(out,{recursive:true});
  await writeFile(new URL('../.gitignore',out),'*\n');
  await writeFile(new URL('inputs.csv',out),csv(inputs,['id','row','events','total','label']));
  await writeFile(new URL('values.csv',out),csv(values,['id','transform','tauEstimator','k','mu_re','seRE','tau2','lo','hi','poolP','poolLo','poolHi']));
  await writeFile(new URL('refusal.csv',out),csv([refusal],['events','total','row','label','refused','error']));
});
