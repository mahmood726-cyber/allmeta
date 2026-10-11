import { test, expect } from './validation-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'nma/validate/MANIFEST.json'), 'utf8'));
const corpusPaths = manifest.files.map(f => path.join(root, 'nma', f.path));
const files = Object.fromEntries(manifest.files.map((f,i) => [f.path, JSON.parse(fs.readFileSync(corpusPaths[i], 'utf8'))]));
const framework = fs.existsSync(path.join(root, 'shared/alm-validate.js'));
const fileURL = pathToFileURL(path.join(root, 'nma/index.html')).href;
function watch(page, origin) {
  const external = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(url.href);
  });
  return external;
}

test('NMA corpus uses shipped engine offline: 410 checks and matching refusals', async ({page, context}) => {
  await context.setOffline(true);
  const external = watch(page, 'null');
  await page.goto(fileURL);
  const result = await page.evaluate(f => window.AlmNmaValidateAdapter.corpus.run(f), files);
  expect(result.checks).toBe(410);
  expect(result.passed).toBe(410);
  expect(result.failed).toEqual([]);
  expect(result.analyses).toBe(26);
  expect(result.within).toBe(24);
  expect(result.refusals.matched).toBe(2);
  expect(result.summaryLines[0]).toBe('410/410 checks passed; 26 analyses (24 within 1e-9; 2 identical refusals).');
  // Changing the actual engine must change the verdict (no replay of stored app results).
  const broken = await page.evaluate(f => {
    const original = window.AlmNmaMultiarm.analyse;
    window.AlmNmaMultiarm.analyse = () => ({ok:false,error:'test engine refusal'});
    return window.AlmNmaValidateAdapter.corpus.run(f).then(r=>r.failed.length).finally(()=>{window.AlmNmaMultiarm.analyse=original;});
  }, files);
  expect(broken).toBeGreaterThan(0);
  expect(external).toEqual([]);
});

test('NMA buttons replay hash-verified corpus through file selection offline', async ({page, context}) => {
  test.skip(!framework, 'Shared validation framework has not been integrated');
  await context.setOffline(true);
  const external = watch(page, 'null');
  await page.goto(fileURL);
  const widget = page.locator('#alm-validate');
  await expect(widget.getByRole('button', {name:'Validate this analysis in R'})).toBeVisible();
  await widget.locator('input[type=file]').setInputFiles(corpusPaths);
  await widget.getByRole('button', {name:'Re-run full validation'}).click();
  await expect(widget.getByRole('status')).toHaveText('410/410 passed; 0 failed. Paper: 410 checks.');
  await expect(widget).toContainText('SHA-256 verified');
  expect(external).toEqual([]);
});

test('NMA refuses a tampered corpus before calling engine', async ({page, context}) => {
  test.skip(!framework, 'Shared validation framework has not been integrated');
  await context.setOffline(true);
  const external = watch(page, 'null');
  await page.goto(fileURL);
  await page.evaluate(() => { window.__nmaCalls=0; const old=AlmNmaValidateAdapter.corpus.run; AlmNmaValidateAdapter.corpus.run=(...args)=>{window.__nmaCalls++;return old(...args);}; });
  const widget=page.locator('#alm-validate');
  await widget.locator('input[type=file]').setInputFiles(corpusPaths.map((p,i)=>({name:path.basename(p),mimeType:'application/json',buffer:Buffer.from(fs.readFileSync(p,'utf8')+(i===0?' ':''))})));
  await widget.getByRole('button',{name:'Re-run full validation'}).click();
  await expect(widget.getByRole('status')).toContainText('SHA-256 mismatch; refused');
  expect(await page.evaluate(()=>window.__nmaCalls)).toBe(0);
  expect(external).toEqual([]);
});

test('NMA live script snapshots current smoking cessation options', async ({page}) => {
  await page.goto(fileURL);
  await page.selectOption('#f-example','smokingcessation');
  await page.click('#btn-example');
  await page.selectOption('#f-ci','t-dist');
  const result=await page.evaluate(()=>{const a=AlmNmaValidateAdapter.live,s=a.currentState();return {script:a.buildScript(s),values:a.appValues(s),rows:s.rows.length};});
  expect(result.script).toContain('method.random.ci="t-dist"');
  expect(result.script).toContain('small.values="undesirable"');
  expect(result.script).toContain('sprintf("%.17g", x)');
  expect(result.script.match(/ALMJSON:/g)).toHaveLength(1);
  expect(result.script).not.toContain('jsonlite');
  expect(result.rows).toBeGreaterThan(0);
  expect(result.values.length).toBeGreaterThan(20);
  expect(result.values.every(v=>Number.isFinite(v.value))).toBe(true);
});

test('NMA smoking cessation live R @slow', async ({page}) => {
  test.setTimeout(180_000);
  test.skip(!framework, 'Shared validation framework has not been integrated');
  // Run with a server bound to localhost:8088, including the vendored webR repository.
  const origin='http://localhost:8088';
  const external=watch(page,origin);
  await page.goto(origin+'/nma/index.html');
  await page.selectOption('#f-example','smokingcessation');
  await page.click('#btn-example');
  const widget=page.locator('#alm-validate');
  await widget.getByRole('button',{name:'Validate this analysis in R'}).click();
  await expect(widget.getByRole('status')).toHaveText(/live R quantities passed\.|Validation refused:/,{timeout:170_000});
  const status=await widget.getByRole('status').innerText();
  expect(status).not.toContain('Validation refused:');
  {
    const rows=widget.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(20);
    for(const row of await rows.all()) await expect(row.locator('td').last()).toHaveText('PASS');
    await expect(widget).toContainText('3.7-0');
    await expect(widget).toContainText('3.4');
  }
  expect(external).toEqual([]);
});
