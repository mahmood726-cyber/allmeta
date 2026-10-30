import {test,expect} from './validation-fixture.mjs';
import {writeFileSync} from 'node:fs';
test('diag',async({page})=>{
 test.setTimeout(600000);
 await page.goto('/correlation-ma/index.html');await page.waitForFunction(()=>!!window.AlmCorrValidation);
 const t0=Date.now();
 const r=await page.evaluate(()=>AlmCorrValidation.runCorpus());
 writeFileSync(process.env.DIAG_OUT,JSON.stringify({ms:Date.now()-t0,checks:r.checks,passed:r.passed,failed:r.failed},null,1));
});
