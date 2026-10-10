import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new globalThis.URL('../../../',import.meta.url));
// Port 8000 may host another worktree. Route the loopback origin to THIS worktree
// using Playwright's static-file transport; never touch another lane's server.
test.beforeEach(async({context})=>{
  await context.route('http://127.0.0.1:8000/**',async route=>{
    const pathname=decodeURIComponent(new globalThis.URL(route.request().url()).pathname);
    const file=resolve(ROOT,'.'+pathname);
    const rel=file.slice(resolve(ROOT).length);
    if(!file.startsWith(resolve(ROOT)) || !/^[\\/]/.test(rel))return route.abort();
    const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css','.svg':'image/svg+xml'};
    try{await route.fulfill({body:await readFile(file),contentType:types[extname(file)]||'application/octet-stream'});}
    catch{await route.fulfill({status:404,body:'Not found'});}
  });
});

const URL='http://127.0.0.1:8000/heterogeneity/index.html';
test('published corpus: 131781 numerical checks and separate 120720 rendered numbers',async({page,context})=>{
  test.setTimeout(180000);
  const outside=[];context.on('request',r=>{if(new globalThis.URL(r.url()).origin!=='http://127.0.0.1:8000')outside.push(r.url());});
  await page.goto(URL);
  await expect(page.getByRole('button',{name:'Validate this analysis in R',exact:true})).toBeVisible();
  const before=await page.locator('#f-data').inputValue();
  const result=await page.evaluate(()=>AlmHetValidation.runCorpus());
  console.log('CORPUS',JSON.stringify({checks:result.checks,passed:result.passed,displayed:result.displayed,displayFailures:result.displayFails.length,maxima:result.maxima}));
  expect(result.checks).toBe(131781);expect(result.passed).toBe(131781);expect(result.failed).toEqual([]);
  expect(result.refusals).toEqual({configurations:704,refused:28,compared:676});
  expect(result.displayed).toBe(120720);expect(result.displayFails.slice(0,3)).toEqual([]);
  await expect(page.locator('#f-data')).toHaveValue(before);expect(outside).toEqual([]);
});
test('built-in example agrees with pinned metafor; session versions shown @slow',async({page,context})=>{
  test.setTimeout(180000);
  const outside=[];context.on('request',r=>{if(new globalThis.URL(r.url()).origin!=='http://127.0.0.1:8000')outside.push(r.url());});
  await page.goto(URL);
  page.on('console',m=>console.log('BROWSER',m.type(),m.text()));
  page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
  page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url(),r.failure()));
  const result=await page.evaluate(async()=>{
    const heartbeat=setInterval(()=>console.log('R STATUS',document.querySelector('#alm-validate [role=status]').textContent),10000);
    try{return await AlmHetValidation.runLive();}finally{clearInterval(heartbeat);}
  });
  console.log('LIVE R',JSON.stringify({versions:result.versions,failed:result.rows.filter(r=>!r.pass)}));
  expect(result.rows.length).toBe(18);
  expect(result.rows.filter(r=>!r.pass)).toEqual([]);
  const legacy=await page.evaluate(()=>AlmWebR.runMetafor({studies:window._almLastStudies().map(s=>({est:s.est,se:Math.sqrt(s.v)})),method:'PM'}));
  expect(legacy.ok).toBe(true);expect(legacy.result.k).toBeGreaterThan(1);
  expect(result.versions.webR).toBe('0.5.5');expect(result.versions.metafor).toBe('4.8-0');expect(result.versions.R).toContain('R version');
  await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
  expect(outside).toEqual([]);
});
