import {test,expect} from './validation-fixture.mjs';
import {appendFileSync} from 'node:fs';
const log=m=>appendFileSync(process.env.DIAG_OUT,m+'\n');
for(const refused of [false,true])test('diag2 '+refused,async({page})=>{
 test.setTimeout(600000);let t=Date.now();const lap=n=>{log(refused+' '+n+' '+(Date.now()-t));t=Date.now();};
 await page.goto('/correlation-ma/index.html');lap('goto');await page.waitForFunction(()=>!!window.AlmCorrValidation);lap('wait');
 await page.locator('#f-method').selectOption('FE');lap('select');
 await page.locator('#f-data').fill(refused?'A, .3, 20':'A, .3, 20\nB, -.2, 30');lap('fill');
 await page.evaluate(()=>alm.chartExportAuto.scan());lap('scan');
 const r=await page.evaluate(()=>AlmCorrValidation.runCorpus());lap('replay '+r.checks+' '+r.passed+' '+JSON.stringify(r.failed.slice(0,3)));
});
