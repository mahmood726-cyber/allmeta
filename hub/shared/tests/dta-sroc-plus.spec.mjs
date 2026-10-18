import {test,expect} from './validation-fixture.mjs';
// Set before fixture setup; a timeout inside the test body cannot cover newPage.
test.setTimeout(240000);
async function open(page){await page.goto('/dta-sroc/index.html');await expect(page.locator('#plus-example option')).toHaveCount(27,{timeout:60000});}
async function replay(page){return page.evaluate(()=>AlmDTAPlusValidate.replay());}
test('extras corpus, values, exports, labels and clean-browser painted geometry pass',async({page})=>{test.setTimeout(240000);await open(page);const before=await page.locator('#plus-data').inputValue();const r=await replay(page);console.log('Extras display replay:',r.passed+'/'+r.checks,'failures:',r.failures.length);expect(r.failures.slice(0,12)).toEqual([]);expect(r.passed).toBe(r.checks);expect(await page.locator('#plus-data').inputValue()).toBe(before);});
test('second panel passes independently of original validation',async({page})=>{test.setTimeout(240000);await open(page);await page.locator('#plus-validate').click();await expect(page.locator('#plus-validation')).toContainText(/^PASS:/,{timeout:220000});await expect(page.locator('#alm-validate')).toBeVisible();});
for(const mutation of ['number','label','export','path','paint','transform','axis','refusal'])test('extras detect '+mutation+' corruption',async({page})=>{test.setTimeout(240000);await open(page);await page.evaluate(kind=>{if(kind==='export'){const original=AlmDTAPlusUI.exportJSON;AlmDTAPlusUI.exportJSON=()=>{const x=JSON.parse(original());x.prediction.positive+=.1;return JSON.stringify(x);};return;}
const original=AlmDTAPlusUI.set;AlmDTAPlusUI.set=s=>{const r=original(s);const root=document.querySelector('#plus-results');if(kind==='number')root.querySelector('[data-value]')?.replaceChildren('999');if(kind==='label')root.querySelector('caption')?.replaceChildren('wrong label');if(kind==='path')root.querySelector('[data-region]')?.setAttribute('d','M0 0 L1 1');if(kind==='paint')root.querySelector('[data-region]')?.style.setProperty('stroke','red');if(kind==='transform')root.querySelector('[data-region]')?.setAttribute('transform','translate(12 0)');if(kind==='axis')root.querySelector('text')?.replaceChildren('wrong axis');if(kind==='refusal'&&!r)document.querySelector('#plus-error').textContent='wrong refusal';return r;};},mutation);const failures=(await replay(page)).failures;const expected={number:'/display/studies',label:'/display/labels',export:'/display/export/',path:'/display/paint/',paint:'/display/paint/',transform:'/display/paint/',axis:'/display/paint/',refusal:'/display/refusal'}[mutation];expect(failures.some(f=>f.id.includes(expected))).toBe(true);});
test('SHA-256 mismatch refuses before corpus use',async({page})=>{await page.route('**/dta-sroc/validate/corpus/plus-reference.json',route=>route.fulfill({contentType:'application/json',body:'{}'}));await page.goto('/dta-sroc/index.html');await expect(page.locator('#plus-error')).toContainText('SHA-256 mismatch');await page.locator('#plus-validate').click();await expect(page.locator('#plus-validation')).toContainText('SHA-256 mismatch');});
test('invalid inputs clear results and disable export',async({page})=>{await open(page);await page.locator('#plus-prevalence').fill('2');await expect(page.locator('#plus-export')).toBeDisabled();await page.locator('#plus-fit').click();await expect(page.locator('#plus-error')).toContainText('prevalence between zero and one');await expect(page.locator('#plus-results')).toBeEmpty();});
test('live R reports checked coefficients and post-test values or explicit unavailability @slow',async({page})=>{test.setTimeout(180000);await open(page);await page.locator('#plus-live').click();await expect(page.locator('#plus-validation')).toContainText(/PASS: 28\/28|FAIL: Live R unavailable/,{timeout:170000});console.log('Live extras:',await page.locator('#plus-validation').textContent());});

test('responsive plot remains valid',async({page})=>{test.setTimeout(240000);await page.setViewportSize({width:390,height:844});await open(page);const r=await replay(page);console.log('Responsive display replay:',r.passed+'/'+r.checks,'failures:',r.failures.length);expect(r.failures.slice(0,12)).toEqual([]);});

for(const mutation of ['swap-cells','swap-rows','move-column','duplicate-cell','replace-cell','swap-summary','move-study-count','span-column'])test('extras semantic mapping detects '+mutation,async({page})=>{
 await open(page);
 await page.evaluate(kind=>{
  const original=AlmDTAPlusUI.set;
  AlmDTAPlusUI.set=s=>{
   const model=original(s),root=document.querySelector('#plus-results');
   if(!model)return model;
   const body=root.querySelector('tbody'),row=body.rows[0],cells=row.querySelectorAll('td');
   if(kind==='swap-cells')row.insertBefore(cells[1],cells[0]);
   if(kind==='swap-rows')body.insertBefore(body.rows[1],body.rows[0]);
   if(kind==='move-column')row.append(cells[0]);
   if(kind==='span-column')cells[0].setAttribute('colspan','2');
   if(kind==='duplicate-cell')row.append(cells[0].cloneNode(true));
   if(kind==='replace-cell')cells[1].replaceWith(cells[0].cloneNode(true));
   if(kind==='swap-summary'){
    const values=root.querySelectorAll('dd'),marker=document.createTextNode('');
    values[0].replaceWith(marker);values[1].replaceWith(values[0]);marker.replaceWith(values[1]);
   }
   if(kind==='move-study-count')root.querySelector('dt').append(root.querySelector('[data-value="studies"]'));
   return model;
  };
 },mutation);
 const r=await replay(page);
 expect(r.failures.some(f=>f.id.endsWith('/display/semantic-mapping'))).toBe(true);
});
