// nma-inconsistency usability (U-A): zero-click results, one-click real data, live model/input,
// input diagnostics, keyboard-only use and axe on the plus panel.
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
const root=new URL('../../../',import.meta.url),app='/nma-inconsistency/index.html';
const triples=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/plus/estimators-reference.json',root),'utf8'));
const idle=page=>page.evaluate(()=>AlmIncoPlus.whenIdle());
const near=(a,b,tol)=>Math.abs(a-b)/Math.max(1,Math.abs(b))<=tol;

test('fresh load shows results with 0 clicks',async({page})=>{
 await page.goto(app);
 await expect(page.locator('#ns-body tr')).not.toHaveCount(0);
 await expect(page.locator('#dbt')).toContainText('Design-by-treatment Q =');
 await idle(page);await expect(page.locator('#plus-loo-body tr')).toHaveCount(11);
 await expect(page.locator('#plus-interpret-list li').first()).toBeVisible();
});
for(const model of ['FE','DL','PM'])test('one-click Baker example matches the archived R reference ('+model+')',async({page})=>{
 await page.goto(app);await page.selectOption('#f-model',model);
 await page.getByRole('button',{name:/Baker 2009/}).click();
 const s=await page.evaluate(()=>_almLastInco()),r=triples.find(t=>t.key==='netmeta::Baker2009::exac::OR::two-arm-only').models[model];
 const tol=model==='PM'?1e-6:1e-9;
 expect(s.model).toBe(model);expect(near(s.tau2,r.tau2,tol)).toBe(true);
 expect(near(s.dbt.Q,r.dbt.Q,tol)).toBe(true);expect(s.dbt.df).toBe(r.dbt.df);expect(Math.abs(s.dbt.p-r.dbt.p)).toBeLessThanOrEqual(1e-9);
 const byName=Object.fromEntries(r.nodeSplit.map(x=>[x.comparison,x]));
 expect(s.nodeSplit.map(x=>x.comparison).sort()).toEqual(Object.keys(byName).sort());
 for(const x of s.nodeSplit){expect(Math.abs(x.p-byName[x.comparison].p)).toBeLessThanOrEqual(1e-9);expect(near(x.diff,byName[x.comparison].diff,tol)).toBe(true);}
 await expect(page.locator('#inco-example-note')).toContainText('multi-arm studies removed');
 await expect(page.locator('#inco-example-note')).toContainText('Pharmacotherapy 2009');
});
test('changing the model re-runs without a click',async({page})=>{
 await page.goto(app);await page.getByRole('button',{name:/Baker 2009/}).click();
 await page.selectOption('#f-model','DL');
 expect(await page.evaluate(()=>_almLastInco().model)).toBe('DL');
 await expect(page.locator('#dbt')).toContainText('Model: DL τ²');
});
test('edited valid input re-runs after a pause; invalid input explains and clears results',async({page})=>{
 await page.goto(app);
 await page.fill('#src','A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15\nA,B,.25,.12');
 await expect.poll(()=>page.evaluate(()=>_almLastInco().trts?.join('')==='ABC'&&_almLastInco().dbt?.df===1&&_almLastInco().nodeSplit?.length===3)).toBeTruthy();
 await page.fill('#src','t1,t2,TE,seTE\nA,B,.2,0\nB,C,x,.2');
 await expect(page.locator('#inco-input-msg')).toContainText('line 1 looks like a header');
 await expect(page.locator('#inco-input-msg')).toContainText('line 2 SE must be > 0');
 await expect.poll(()=>page.evaluate(()=>_almLastInco().status)).toBe('refused');
 await expect(page.locator('#ns-body tr')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>AlmIncoPlus.methodsText())).toBe('');
 await page.fill('#src','"A,B,.2,.1\nB,C,.3,.2');
 await expect(page.locator('#inco-input-msg')).toContainText('opened on line 1 is never closed');
});
test('Ctrl+Enter runs the analysis from the input box',async({page})=>{
 await page.goto(app);await page.fill('#src','A,B,.1,.1');
 await page.locator('#src').press('Control+Enter');
 await expect(page.locator('#dbt')).toHaveText('At least 3 valid contrasts are required.');
});
test('restored draft is analysed, not shown under the example results',async({page})=>{
 await page.goto(app);
 await page.evaluate(()=>localStorage.setItem('alm-autosave:nma-inconsistency',JSON.stringify({version:1,savedAt:new Date().toISOString(),values:{src:'A,B,.2,.1\nB,C,.3,.2\nA,C,.9,.15','f-model':'DL'}})));
 await page.reload();await page.getByRole('button',{name:'Restore'}).click();
 await expect.poll(()=>page.evaluate(()=>_almLastInco().model+':'+_almLastInco().trts.join(''))).toBe('DL:ABC');
 await expect(page.locator('#ns-body tr')).toHaveCount(3);
});
test('keyboard-only path: example, sort, select a study',async({page})=>{
 await page.goto(app);
 await page.getByRole('button',{name:/Baker 2009/}).focus();await page.keyboard.press('Enter');await idle(page);
 const sort=page.locator('#plus-loo-head button[data-sort="study"]');await sort.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#plus-loo-head th').first()).toHaveAttribute('aria-sort','ascending');
 await expect(page.locator('#plus-loo-head button[data-sort="study"]')).toBeFocused();
 const first=page.locator('#plus-loo-body button.plus-row').first();await first.focus();await page.keyboard.press('Space');
 await expect(page.locator('#plus-loo-body button.plus-row').first()).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#plus-detail caption')).toContainText('Node-splits without');
});
test('axe: plus panel and input helpers have no WCAG 2.1 AA violations',async({page})=>{
 await page.goto(app);await page.getByRole('button',{name:/Linde 2015/}).click();await idle(page);
 await page.locator('#plus-loo-body button.plus-row').first().click();
 for(const include of ['#alm-plus','#inco-example','#inco-input-msg']){
  const r=await new AxeBuilder({page}).include(include).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(r.violations.map(v=>v.id+': '+v.nodes.length),include).toEqual([]);
 }
});
