import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('@playwright/test')); }
catch { ({chromium}=require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/User/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core')); }
let browser;
try {browser=await chromium.launch({channel:'msedge',headless:true});}
catch(e){
  const report={status:'blocked',checks:null,passed:null,error:e.message,reason:'Browser process could not be launched; no replay checks ran.'};
  writeFileSync(new URL('../../../multilevel-ma/validate/'+(process.env.REPLAY_STAGE || 'before')+'-replay.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  throw e;
}
try {
  const page=await browser.newPage();
  await page.goto('http://localhost:8088/multilevel-ma/');
  const before=await page.locator('#src').inputValue();
  const result=await page.evaluate(()=>AlmMultilevelValidation.runCorpus());
  const restored=await page.locator('#src').inputValue()===before;
  const report={...result,restored};
  writeFileSync(new URL('../../../multilevel-ma/validate/'+(process.env.REPLAY_STAGE || 'before')+'-replay.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(result.checks!==528||result.passed!==528||result.failed.length||!restored)process.exitCode=1;
} finally {await browser.close();}
