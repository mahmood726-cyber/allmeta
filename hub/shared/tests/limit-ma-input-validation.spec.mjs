import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const cases=JSON.parse(readFileSync(new URL('../../../limit-ma/tests/fixtures/input-validation.json',import.meta.url),'utf8'));
const good='0.1,0.2,A\n0.2,0.3,B\n0.3,0.4,C';
async function seed(page){
 await page.goto('/limit-ma/index.html');
 await page.locator('#alm-hero-mount select').selectOption('bcg');
 await expect(page.locator('#body tr')).toHaveCount(3);
 expect(await page.evaluate(()=>_almLastLimit().k)).toBe(13);
 await page.locator('#plus-run').click();
 await expect(page.locator('#plus-body tr')).toHaveCount(7);
 expect(await page.evaluate(()=>AlmLimitPlusUI.snapshot())).not.toBeNull();
}
async function cleared(page){
 for(const id of ['body','plot','limit-range-note','limit-diagnostics','plus-body','plus-details','plus-forest','plus-funnel','plus-interpretation'])await expect(page.locator('#'+id)).toBeEmpty();
 expect(await page.evaluate(()=>_almLastLimit())).toBeNull();
 expect(await page.evaluate(()=>__almLimitValidationSnapshot().result)).toBeNull();
 expect(await page.evaluate(()=>AlmLimitPlusUI.snapshot())).toBeNull();
 await expect(page.locator('#plus-status')).not.toContainText('complete');
 await expect(page.locator('#analysis-status')).toBeHidden();
 // The toggle and alpha handlers must not resurrect retained sensitivity results.
 await page.locator('#plus-contour-toggle').check();
 await page.locator('#plus-alpha').fill('0.2');await page.locator('#plus-alpha').blur();
 await expect(page.locator('#plus-funnel')).toBeEmpty();
}
for(const c of cases)test(`limit-ma rejects ${c.name}, explains physical line and clears BCG`,async({page})=>{
 await seed(page);await page.locator('#src').fill(good+'\n\n'+c.line);await page.locator('#btn-run').click();
 const alert=page.locator('#limit-error[role=alert]');await expect(alert).toBeVisible();
 await expect(alert).toContainText('Line 5:');await expect(alert).toContainText(c.reason);
 await cleared(page);
 await page.locator('#alm-hero-mount select').selectOption('bcg');
 await expect(alert).toBeEmpty();await expect(page.locator('#plot circle')).toHaveCount(13);
 expect(await page.evaluate(()=>_almLastLimit().k)).toBe(13);
});
for(const [name,text,reason] of [['empty','','At least three'],['undersized','.1,.2\n.2,.3','At least three'],['equal SE','.1,.2\n.2,.2\n.3,.2','variation']])test(`limit-ma ${name} refusal clears comparisons`,async({page})=>{
 await seed(page);await page.locator('#src').fill(text);await page.locator('#btn-run').click();
 await expect(page.locator('#limit-error')).toContainText(reason);await cleared(page);
});
test('all bad lines reported safely after a header and blanks',async({page})=>{
 await seed(page);await page.locator('#src').fill('effect,SE,label\n\n.4O,.2\n.4,0\n<img src=x onerror=alert(1)>,.2\n'+good);
 await page.locator('#btn-run').click();
 for(const n of [3,4,5])await expect(page.locator('#limit-error')).toContainText(`Line ${n}:`);
 await expect(page.locator('#limit-error img')).toHaveCount(0);await cleared(page);
});
test('sensitivity Run shares strict refusal and clears core output',async({page})=>{
 await seed(page);await page.locator('#src').fill(good+'\n.4,.5,A,B');await page.locator('#plus-run').click();
 await expect(page.locator('#limit-error')).toContainText('Line 4:');await cleared(page);
});
test('header, blanks, CRLF and decimal/exponent forms work in both panels',async({page})=>{
 await page.goto('/limit-ma/index.html');
 await page.locator('#src').fill('\r\neffect, SE, label\r\n+.1e1, 2.e-1, A\r\n\r\n-.2,+.3\r\n3.,.4,C\r\n');
 await page.locator('#btn-run').click();await expect(page.locator('#limit-error')).toBeEmpty();
 expect(await page.evaluate(()=>_almLastLimit().k)).toBe(3);await page.locator('#plus-run').click();
 await expect(page.locator('#plus-body tr')).toHaveCount(7);
});
