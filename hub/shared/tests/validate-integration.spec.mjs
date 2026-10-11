import {test, expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url);
for (const [app,globalName,count] of [['dose-response-ma','AlmDoseValidate',724],['dta-sroc','AlmDTAValidateAdapter',855],['nma','AlmNmaValidateAdapter',410]]) {
 test(`${app} HTTP preparation then offline widget replay`,async({page,context})=>{
  test.setTimeout(180000);
  await page.goto('/'+app+'/index.html');
  await page.evaluate(async name=>{window.integrationWidget=AlmValidate.mount(document.getElementById('alm-validate'),window[name]);await integrationWidget.prepare();},globalName);
  const requests=[];context.on('request',r=>requests.push(r.url()));
  await context.setOffline(true);
  const result=await page.evaluate(()=>integrationWidget.runCorpus());
  expect(result.checks).toBe(count);expect(result.passed).toBe(count);expect(result.failed).toEqual([]);expect(requests).toEqual([]);
 });
 if(app!=='nma')test(`${app} file picker offline widget replay`,async({page,context})=>{
  test.setTimeout(180000);
  await context.setOffline(true);
  await page.goto(new URL(app+'/index.html',root).href);
  const manifest=JSON.parse(readFileSync(new URL(app+'/validate/MANIFEST.json',root),'utf8'));
  await page.locator('#alm-validate input[type=file]').setInputFiles(manifest.files.map(f=>fileURLToPath(new URL(app+'/'+f.path,root))));
  await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText(`${count}/${count} passed; 0 failed`,{timeout:150000});
 });
}
test('dose built-in alcohol example live R @slow',async({page})=>{
 test.setTimeout(240000);
 await page.goto('/dose-response-ma/index.html');
 const result=await page.evaluate(async()=>AlmValidate.mount(document.getElementById('alm-validate'),AlmDoseValidate).runLive());
 console.log('BUILT-IN DOSE LIVE',JSON.stringify(result));
 expect(result.versions.dosresmeta).toBe('2.2.0');
 expect(result.rows.length).toBeGreaterThan(10);expect(result.rows.filter(r=>!r.pass)).toEqual([]);
});
