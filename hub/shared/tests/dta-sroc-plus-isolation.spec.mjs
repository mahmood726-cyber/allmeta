import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
// REVIEW_133 P1-1 (autosave isolation), P1-3 (raw-scale note) and P2-6 (decimal-only parser) for the #alm-plus extras.
test.setTimeout(120000);
const corpus=JSON.parse(readFileSync(new URL('../../../dta-sroc/validate/corpus/plus-reference.json',import.meta.url),'utf8'));
async function open(page){await page.goto('/dta-sroc/index.html');await expect(page.locator('#plus-example option')).toHaveCount(28,{timeout:60000});}

// Keys the ORIGINAL app's autosave writes on main (74ff0a7; dta-sroc and shared/autosave.js are identical to da66b89),
// captured by editing only #f-data, the same procedure as below.
const MAIN_AUTOSAVE_KEYS=['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution', 'f-cc', 'f-cov', 'f-data', 'f-example', 'f-method', 'f-title', 'idx:1', 'idx:11', 'idx:12', 'idx:13', 'idx:14', 'idx:15', 'idx:16', 'idx:17', 'idx:18', 'idx:19', 'idx:9'];
test('original autosave keys are exactly those on main; the extras are never saved into them',async({page})=>{
 await open(page);
 const keysOf=appKey=>page.evaluate(k=>Object.keys((JSON.parse(localStorage.getItem('alm-autosave:'+k)||'{}').values)||{}).sort(),appKey);
 // shared/autosave.js never saves a disabled control (_readField), so a control another change disables (e.g. the inert
 // axis controls in #162) drops out of the saved values without moving any other key. The positional idx:N keys are
 // assigned over all matched controls, disabled or not, so the remaining keys are still exactly main's.
 const disabledKeys=()=>page.evaluate(()=>[...document.querySelectorAll('[data-autosave-index]')].filter(el=>el.disabled&&!el.closest('#alm-plus'))
  .map(el=>el.id||el.name||'idx:'+el.dataset.autosaveIndex));
 const savedVsMain=async appKey=>{const off=await disabledKeys();return {saved:await keysOf(appKey),expected:MAIN_AUTOSAVE_KEYS.filter(k=>!off.includes(k))};};
 await page.locator('#plus-load').click();
 await page.evaluate(()=>{localStorage.clear();document.getElementById('f-data').dispatchEvent(new Event('input',{bubbles:true}));});
 await expect.poll(async()=>{const r=await savedVsMain('dta-sroc');return r.saved.length?r.saved:null;},{timeout:10000}).not.toBeNull();
 expect(await disabledKeys()).not.toContain('f-data');
 const first=await savedVsMain('dta-sroc');
 expect(first.saved).toEqual(first.expected);
 expect((await keysOf('dta-sroc')).filter(k=>k.startsWith('plus-'))).toEqual([]);
 // Editing the extras must not write to (or re-index) the original key.
 await page.evaluate(()=>localStorage.clear());
 await page.locator('#plus-method').selectOption('ml');
 await page.locator('#plus-data').fill('1,2,3,4,5');
 await page.locator('#plus-prevalence').fill('0.2');
 await page.waitForTimeout(1500);
 expect(await keysOf('dta-sroc')).toEqual([]);
 await page.evaluate(()=>document.getElementById('f-data').dispatchEvent(new Event('input',{bubbles:true})));
 await expect.poll(()=>keysOf('dta-sroc'),{timeout:10000}).toEqual(first.expected);
 // Planted negative: an autosave installed with the default selectors (as before this fix) picks up the extras.
 await page.evaluate(()=>{AlmAutosave.install({appKey:'dta-sroc-negative'});document.getElementById('f-data').dispatchEvent(new Event('input',{bubbles:true}));});
 await expect.poll(()=>keysOf('dta-sroc-negative'),{timeout:10000}).toContain('plus-data');
 expect(await keysOf('dta-sroc-negative')).not.toEqual(MAIN_AUTOSAVE_KEYS);
});

test('raw or rescaled covariates show the raw-scale note; standardised reference data do not',async({page})=>{
 await open(page);
 const c=corpus.cases.find(c=>c.id==='dat.kearon1998/year/reml/all');
 const note=page.locator('#plus-scale-note');
 expect(await page.evaluate(c=>!!AlmDTAPlusUI.set({rows:c.rows,method:c.method,correction:c.correction,at:0,prevalence:.1}),c)).toBe(true);
 await expect(note).toBeEmpty();
 const raw=c.rows.map((r,i)=>({...r,x:c.transformation.raw[i]}));
 expect(await page.evaluate(({c,raw})=>!!AlmDTAPlusUI.set({rows:raw,method:c.method,correction:c.correction,at:1990,prevalence:.1}),{c,raw})).toBe(true);
 await expect(note).toContainText('standard deviations from zero');
 await expect(note).toContainText('mada::reitsma run on these raw values can differ');
 await expect(page.locator('#plus-results table')).toBeVisible();
 // RECHECK_133 P1-3: a centred covariate on a large or small scale also differs from mada on the raw values, so the
 // note is shown unless the covariate is already standardised (|mean|/SD and |SD-1| <= 1e-3).
 const setX=(f,at)=>page.evaluate(({c,rows,at})=>!!AlmDTAPlusUI.set({rows,method:c.method,correction:c.correction,at,prevalence:.1}),{c,rows:c.rows.map(r=>({...r,x:f(r.x)})),at});
 for(const [f,at] of [[x=>1000*x,0],[x=>0.01*x,0],[x=>x+0.01,0]]){
  expect(await setX(f,at)).toBe(true);
  await expect(note).toContainText('The covariate is not standardised');
  await expect(note).toContainText('mada::reitsma run on these raw values can differ');
 }
 expect(await setX(x=>0.9995*x+0.0004,0)).toBe(true);
 await expect(note).toBeEmpty();
 // The note clears with the results when the input changes, and is not shown for a refusal.
 await page.locator('#plus-data').fill('x');
 await expect(note).toBeEmpty();
 await page.locator('#plus-fit').click();
 await expect(page.locator('#plus-error')).toHaveText('Each row must contain TP,FN,FP,TN,x');
 await expect(note).toBeEmpty();
});

test('study rows accept decimal and exponent numbers only',async({page})=>{
 await open(page);
 const good='10,2,3,20,0.5\n12,4,5,25,-1e-1\n9,3,2,30,.25\n15,1,4,22,1.';
 for(const bad of ['0x1F','0b101','0o17','Infinity']){
  await page.locator('#plus-data').fill(good.replace('0.5',bad));
  await page.locator('#plus-fit').click();
  await expect(page.locator('#plus-error')).toHaveText('Each row must contain TP,FN,FP,TN,x');
  await expect(page.locator('#plus-results')).toBeEmpty();
 }
 await page.locator('#plus-data').fill(good);
 await page.locator('#plus-fit').click();
 await expect(page.locator('#plus-error')).toHaveText('');
 await expect(page.locator('#plus-results table')).toBeVisible();
});
