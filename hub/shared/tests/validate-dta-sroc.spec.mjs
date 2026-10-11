import { test, expect } from './validation-fixture.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('dta-sroc/validate/MANIFEST.json', root), 'utf8'));
const corpus = Object.fromEntries(manifest.files.map(f => [f.path, JSON.parse(readFileSync(new URL('dta-sroc/'+f.path, root),'utf8'))]));
const APP=process.env.DTA_VALIDATE_FILE ? new URL('dta-sroc/index.html',root).href : '/dta-sroc/index.html';
async function open(page) {
 const external=[];
 const origin=new URL(APP,test.info().project.use.baseURL || 'http://localhost:8088').origin;
 page.on('request',r=>{const u=new URL(r.url()); if(/^https?:$/.test(u.protocol)&&u.origin!==origin)external.push(r.url());});
 await page.goto(APP);
 return external;
}
async function widget(page) {
 const mount=page.locator('#alm-validate');
 await expect(mount.getByRole('button')).toHaveCount(2);
 return mount;
}
const corpusButton = mount => mount.getByRole('button').filter({hasText:/full validation|paper|corpus|published/i});
const liveButton = mount => mount.getByRole('button').filter({hasText:/current|live|\bR\b/i}).filter({hasNotText:/full validation|paper|corpus|published/i});

test('DTA verified corpus reproduces all 855 checks offline using shipped engine', async ({page,context})=>{
 const external=await open(page);
 for(const f of manifest.files)expect(createHash('sha256').update(readFileSync(new URL('dta-sroc/'+f.path,root))).digest('hex')).toBe(f.sha256);
 await context.setOffline(true);
 const result=await page.evaluate(files=>window.AlmDTAValidateAdapter.corpus.run(files),corpus);
 expect(result.checks).toBe(855); expect(result.passed).toBe(855); expect(result.failed).toEqual([]);
 expect(result.refusals).toEqual({reference:25,app:25,matched:25});
 expect(result.summaryLines[0]).toContain('732 quantity checks + 18 Moses-Littenberg checks');
 expect(external).toEqual([]);
});

test('DTA validation buttons render and corpus widget passes without off-origin requests',async({page})=>{
 const external=await open(page); const mount=await widget(page);
 await corpusButton(mount).click();
 await expect(mount).toContainText(/855/, {timeout:60000});
 await expect(mount).toContainText(/PASS/,{timeout:60000});
 await expect(mount.locator('tbody')).not.toContainText(/\bFAIL\b/);
 expect(external).toEqual([]);
});

test('DTA widget refuses a corpus hash mismatch before running calculations',async({page})=>{
 await page.route('**/dta-sroc/validate/corpus/reference.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...corpus['validate/corpus/reference.json'],mada:'tampered'})}));
 const external=await open(page);const mount=await widget(page);
 await page.evaluate(()=>{window.__dtaCorpusCalled=false;window.AlmDTAValidateAdapter.corpus.run=()=>{window.__dtaCorpusCalled=true;throw new Error('must not run');};});
 await corpusButton(mount).click();
 await expect(mount).toContainText(/hash|SHA-?256/i,{timeout:60000});
 await expect(mount).toContainText(/mismatch|refus|fail/i);
 expect(await page.evaluate(()=>window.__dtaCorpusCalled)).toBe(false);
 expect(external).toEqual([]);
});

test('DTA AuditC current-data mada check @slow',async({page})=>{
 test.setTimeout(180000);
 const external=await open(page);
 await page.selectOption('#f-example','AuditC');await page.click('#btn-example');
 const mount=await widget(page);await liveButton(mount).click();
 await expect(mount).toContainText(/PASS|unavailable|not available|cannot load|failed to load/i,{timeout:170000});
 await expect(mount).toContainText('0.5.12');
 const rows=mount.locator('tbody tr');expect(await rows.count()).toBeGreaterThanOrEqual(20);
 for(const row of await rows.all())await expect(row.locator('td').last()).toHaveText('PASS');
 expect(external).toEqual([]);
});