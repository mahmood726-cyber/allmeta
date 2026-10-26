import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = [
 ['drug','control',-.40,.12], ['exercise','control',-.30,.15],
 ['drug+exercise','control',-.65,.13], ['drug+education','control',-.55,.16],
 ['education','control',-.20,.18], ['exercise+education','control',-.45,.14],
 ['drug+exercise+education','control',-.80,.20]
];
const out = new URL('./rchecks-out/p0cnma/', import.meta.url);
const text = rows => rows.map(r => r.join(' | ')).join('\n');
async function load(page, rows) {
 await page.evaluate(t => window.__almCnmaLoad(t), text(rows));
 return page.evaluate(() => window._almLastCnma());
}
function save(name, rows, result) {
 mkdirSync(out, {recursive:true});
 writeFileSync(new URL(name+'-input.csv',out), 'studlab,treat1,treat2,TE,seTE\n'+rows.map((r,i)=>['s'+i,...r].join(',')).join('\n')+'\n');
 writeFileSync(new URL(name+'-page.csv',out), 'component,est,se,inactive\n'+Object.entries(result.components).map(([c,v])=>[c,v.est,v.se,result.inactive].join(',')).join('\n')+'\n');
}
for (const [name,label,combo] of [['control','control',false],['placebo','placebo',false],['mixed-case','Placebo',false],['pbo','PBO',false],['combination','control',true]]) {
 test(name+': planted inactive defect and default-control numerical control', async ({page}) => {
  await page.goto('/component-nma/');
  await page.waitForFunction(()=>typeof window.__almCnmaLoad === 'function');
  const baseline = await load(page,base);
  const rows = base.map(([a,b,e,s])=>[combo?a.replace('drug','drug+control'):a,label,e,s]);
  const got = await load(page,rows);
  expect(got).toBeTruthy();
  await expect(page.getByLabel('Inactive treatment',{exact:true})).toHaveValue(label.toLowerCase());
  expect(got.components).toEqual(baseline.components);
  expect(got.comps).toEqual(['drug','education','exercise']);
  if(label!=='control') {
   await expect(page.locator('#inactive-note')).toBeVisible();
   await expect(page.locator('#inactive-note')).toContainText('Detected');
   await expect(page.locator('#inactive-note')).toContainText('Inactive treatment');
  } else await expect(page.locator('#inactive-note')).toBeHidden();
  save(name,rows,got);
 });
}
test('explicit selection overrides auto-detection and stays selected on Fit', async ({page}) => {
 await page.goto('/component-nma/');
 const rows = base.map(([a,b,e,s])=>[a,'sham',e,s]);
 await load(page,rows);
 await page.getByLabel('Inactive treatment',{exact:true}).selectOption('sham');
 await page.locator('#btn-run').click();
 const result = await page.evaluate(()=>window._almLastCnma());
 expect(result.inactive).toBe('sham');
 expect(result.comps).toEqual(['drug','education','exercise']);
 save('manual',rows,result);
 // A real active placebo component must remain when control exists.
 const active = base.map(([a,b,e,s])=>[a.replaceAll('drug','placebo'),b,e,s]);
 const control = await load(page,active);
 expect(control.inactive).toBe('control');
 expect(control.comps).toContain('placebo');
});
