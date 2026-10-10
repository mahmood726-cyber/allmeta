import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const URL = 'http://127.0.0.1:8000/heterogeneity/index.html';
function watch(page) {
  const outside=[];
  page.on('request',r=>{if(new globalThis.URL(r.url()).origin!==new globalThis.URL(URL).origin)outside.push(r.url());});
  return outside;
}
test('framework refuses changed corpus bytes before running the adapter',async({page})=>{
  const outside=watch(page);await page.goto(URL);
  await page.route('**/validate/corpus/corpus.json',route=>route.fulfill({contentType:'application/json',body:'[]'}));
  await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
  expect(outside).toEqual([]);
});
test('verified corpus replays offline with hashes and build identity',async({page,context})=>{
  test.setTimeout(180000);
  const outside=watch(context);const requests=[];context.on('request',r=>requests.push(r.url()));await page.goto(URL);
  await page.evaluate(()=>AlmHetValidation.prepare());
  const preparedRequests=requests.length;
  await context.setOffline(true);
  const result=await page.evaluate(()=>AlmHetValidation.runCorpus());
  expect(result.checks).toBe(131781);expect(result.failed).toEqual([]);
  expect(requests.length).toBe(preparedRequests);
  await expect(page.locator('#alm-validate')).toContainText('SHA-256 verified');
  await expect(page.locator('#alm-validate')).toContainText('Allmeta build');
  expect(outside).toEqual([]);
});
test('comparison fails closed on absent or nonfinite values; unavailable R links to repository',async({page})=>{
  await page.goto(URL);
  const result=await page.evaluate(()=>{
    const absent=AlmValidate.compare(undefined,undefined,'abs',1e-6);
    const nan=AlmValidate.compare(NaN,NaN,'abs',1e-6);
    AlmValidate.mount(document.getElementById('alm-validate'),{...AlmHetValidationAdapter,live:null});
    return {absent:absent.pass,nan:nan.pass};
  });
  expect(result).toEqual({absent:false,nan:false});
  await expect(page.getByRole('link',{name:'R check available via the reproducible repo'})).toHaveAttribute('href',/heterogeneity-reproducible$/);
});
test('R package hash mismatch is refused before boot @slow',async({page})=>{
  test.setTimeout(180000);
  const outside=watch(page);await page.goto(URL);
  await page.route('**/repo/**/*.tgz',route=>route.fulfill({body:'corrupt'}));
  await page.getByRole('button',{name:'Validate this analysis in R',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('mismatch',{timeout:120000});
  expect(outside).toEqual([]);
});

test('file protocol verifies selected corpus files and replays without a server',async({page,context})=>{
  test.setTimeout(180000);
  await page.goto(pathToFileURL(resolve(ROOT,'heterogeneity/index.html')).href);
  await context.setOffline(true);
  await page.locator('#alm-validate input[type=file]').setInputFiles([
    resolve(ROOT,'heterogeneity/validate/corpus/corpus.json'),resolve(ROOT,'heterogeneity/validate/corpus/reference.json')
  ]);
  const result=await page.evaluate(()=>AlmHetValidation.runCorpus());
  expect(result.checks).toBe(131781);expect(result.passed).toBe(131781);expect(result.displayFails.slice(0,3)).toEqual([]);
});
