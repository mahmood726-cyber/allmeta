import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../../pubbias-tests/validate/MANIFEST.json',import.meta.url),'utf8'));
const expected=manifest.knownExceptions.map(e=>`${e.dataset_configuration} | ${e.method} | ${e.quantity}`).sort();
test('pubbias published replay: 2107/2113 and six named Table 2 exceptions',async({page,context})=>{
  test.setTimeout(180000);
  await page.goto('/pubbias-tests/index.html');
  const before=await page.locator('#src').inputValue();
  await page.evaluate(()=>AlmPubbiasValidation.prepare());
  const requests=[];context.on('request',r=>requests.push(r.url()));
  await context.setOffline(true);
  const result=await page.evaluate(()=>AlmPubbiasValidation.runCorpus());
  console.log('PUBBIAS CORPUS',JSON.stringify({checks:result.checks,passed:result.passed,failed:result.failed}));
  expect(result.checks).toBe(2113);expect(result.passed).toBe(2107);
  expect(result.failed.map(f=>f.label).sort()).toEqual(expected);
  expect(requests).toEqual([]);
  await expect(page.locator('#src')).toHaveValue(before);
  for(const name of expected)await expect(page.locator('#alm-validate')).toContainText(name);
  await expect(page.locator('#alm-validate [role=status]')).toContainText('2107/2113 passed; 6 failed');
});
for(const binary of [false,true])test(`pubbias ${binary?'binary':'built-in'} current input live R @slow`,async({page})=>{
  // A cold meta namespace load follows extraction of its vendored dependency
  // tree; allow this without relaxing any numerical assertion.
  test.setTimeout(480000);
  await page.goto('/pubbias-tests/index.html');
  if(binary)await page.locator('#format').selectOption('binary');
  page.on('console',m=>console.log(m.text()));
  const result=await page.evaluate(async()=>{
    const heartbeat=setInterval(()=>console.log('PUBBIAS R STATUS',document.querySelector('#alm-validate [role=status]').textContent),15000);
    try{return await AlmPubbiasValidation.runLive();}finally{clearInterval(heartbeat);}
  });
  console.log('PUBBIAS LIVE',JSON.stringify(result));
  expect(result.rows).toHaveLength(binary?15:11);
  expect(result.rows.filter(r=>!r.pass)).toEqual([]);
  expect(result.versions).toMatchObject({webR:'0.5.5',metafor:'4.8-0',meta:'8.3-0'});
  expect(result.versions.R).toContain('R version');
  await expect(page.locator('#alm-validate')).toContainText('metafor 5.2-1');
  await expect(page.locator('#alm-validate')).toContainText('meta 8.5-0');
  await expect(page.locator('#alm-validate')).toContainText('Selection model: experimental, not validated');
  // Change current textarea without clicking Run: validation must not reuse saved results.
  if(!binary){
    await page.locator('#src').fill('0.2,0.1\n0.4,0.15\n0.1,0.07\n0.3,0.08\n0.5,0.2\n0.22,0.12');
    const changed=await page.evaluate(()=>AlmPubbiasValidation.runLive());
    expect(changed.rows.filter(r=>!r.pass)).toEqual([]);
    expect(changed.rows.find(r=>r.label==='Egger b0').app).not.toBe(result.rows.find(r=>r.label==='Egger b0').app);
  }
});
test('pubbias altered reference fails closed',async({page})=>{
  await page.goto('/pubbias-tests/index.html');
  await page.route('**/validate/corpus/reference.json',r=>r.fulfill({body:'{}',contentType:'application/json'}));
  await page.getByRole('button',{name:'Re-run full validation',exact:true}).click();
  await expect(page.locator('#alm-validate [role=status]')).toContainText('SHA-256 mismatch');
});
