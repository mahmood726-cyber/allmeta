import { test, expect } from './validation-fixture.mjs';
const panel = page => page.locator('#alm-validate');
const replay = page => panel(page).getByRole('button', {name:'Replay published corpus (stored references)', exact:true});

test('dose widget retains all diagnostics when one combination fails several quantities', async ({page}) => {
  test.setTimeout(120000);
  await page.goto('/dose-response-ma/index.html');
  const result = await page.evaluate(async () => {
    const original = AlmDoseResponse.fitDR;
    AlmDoseResponse.fitDR = (...args) => {
      const r = original(...args); if (r.ok) r.coef[0] += 1; return r;
    };
    try { return await AlmValidate.mount('#alm-validate', AlmDoseValidate).runCorpus(); }
    finally { AlmDoseResponse.fitDR = original; }
  });
  expect(result.checks).toBe(724);
  expect(result.passed).toBe(148);
  expect(result.failedChecks).toBe(576);
  expect(result.failed.length).toBeGreaterThanOrEqual(576);
  await expect(panel(page).getByRole('status')).toContainText('576 failed checks');
  await expect(panel(page)).not.toContainText('Invalid check accounting');
  await expect(panel(page).locator('tbody')).toContainText('coef');
  await expect(panel(page).locator('tbody')).toContainText('FAIL');
  expect(await panel(page).locator('tbody tr').count()).toBe(result.failed.length + result.coverageFails.length);
});

for (const [app, adapter, engine] of [['dta-sroc','AlmDTAValidateAdapter','AlmDTABivariate'],['nma','AlmNmaValidateAdapter','AlmNmaMultiarm']]) {
  test(`${app} widget shows unexpected engine refusals and incomplete coverage`, async ({page}) => {
    await page.goto('/'+app+'/index.html');
    const result = await page.evaluate(async ({adapter, engine}) => {
      const E = window[engine], key = engine === 'AlmDTABivariate' ? 'fit' : 'analyse', original = E[key];
      E[key] = () => { if (key === 'fit') throw Error('Injected fit refusal'); return {ok:false,error:'Injected analysis refusal'}; };
      try { return await AlmValidate.mount('#alm-validate', window[adapter]).runCorpus(); }
      finally { E[key] = original; }
    }, {adapter, engine});
    expect(result.failed.length).toBeGreaterThan(0);
    await expect(panel(page).getByRole('status')).toContainText('FAIL: check count differs');
    await expect(panel(page).locator('tbody')).toContainText('FAIL');
    await expect(panel(page)).not.toContainText('Invalid check accounting');
    await expect(panel(page).locator('tbody')).toContainText('Selected corpus scope: check count');
  });
}

test('an invalid adapter report cannot conceal its available discrepancy rows', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  const error = await page.evaluate(async () => {
    const a = {...AlmHetValidationAdapter, live:null, corpus:{files:[], run:async()=>({checks:1,passed:1,failed:[{id:'example',quantity:'tau2',app:10,ref:0,diff:10,tol:1e-9}]})}};
    try { await AlmValidate.mount('#alm-validate',a).runCorpus(); return 'accepted'; }
    catch(e) { return e.message; }
  });
  expect(error).toContain('Invalid check accounting');
  await expect(panel(page).locator('tbody')).toContainText('example: tau2');
  await expect(panel(page).locator('tbody')).toContainText('FAIL');
});

test('rendered-number failures cannot leave a PASS row for the whole corpus', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  await page.evaluate(async () => {
    const a = {...AlmHetValidationAdapter, live:null, paper:{...AlmHetValidationAdapter.paper, checks:1}, corpus:{files:[],run:async()=>({checks:1,passed:1,failed:[],displayFails:['PI upper shows an incorrect value'],maxima:{},refusals:{}})}};
    await AlmValidate.mount('#alm-validate',a).runCorpus();
  });
  await expect(panel(page).getByRole('status')).toContainText('FAIL: rendered-number audit');
  await expect(panel(page).locator('tbody')).toContainText('incorrect value');
  await expect(panel(page).locator('tbody')).not.toContainText('PASS');
});

test('R discrepancies and version differences remain visible as FAIL', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url:'/shared/webr-runner.js'});
  const r = await page.evaluate(async () => {
    const a = AlmHetValidationAdapter;
    const state = a.live.currentState(), quantities = a.live.appValues(state);
    const old = AlmWebR.runR;
    AlmWebR.runR = async()=>({ok:true,stdout:'ALMJSON:'+JSON.stringify(Object.fromEntries(quantities.map(q=>[q.key,q.value+1]))),versions:{R:'R version 4.5.1',webR:'0.5.5',metafor:'4.8-0'}});
    try { return await AlmValidate.mount('#alm-validate',a).runLive(); }
    finally { AlmWebR.runR = old; }
  });
  expect(r.rows.every(row=>!row.pass)).toBe(true);
  await expect(panel(page).getByRole('status')).toContainText('FAIL: discrepancies exceed tolerance');
  await expect(panel(page)).toContainText('metafor 4.8-0');
  await expect(panel(page)).toContainText('metafor 5.2-1');
  await expect(panel(page).locator('tbody')).not.toContainText('PASS');
});

test('editing data removes a completed live PASS', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url:'/shared/webr-runner.js'});
  // State-lifetime regression; real R execution is covered separately below.
  await page.evaluate(async () => {
    const a = AlmHetValidationAdapter, original = AlmWebR.runR;
    AlmWebR.runR = async()=>({ok:true,stdout:'ALMJSON:'+JSON.stringify(Object.fromEntries(a.live.appValues(a.live.currentState()).map(q=>[q.key,q.value]))),versions:{metafor:'4.8-0'}});
    try { await AlmValidate.mount('#alm-validate',a).runLive(); }
    finally { AlmWebR.runR = original; }
  });
  await expect(panel(page).getByRole('status')).toContainText('18/18 live R quantities passed');
  await page.locator('#f-data').fill('A,0.5,0.1\nB,0.2,0.2\nC,-0.1,0.3');
  await expect(panel(page).getByRole('status')).toContainText('Inputs changed');
  await expect(panel(page).locator('tbody tr')).toHaveCount(0);
});

test('editing inputs during an R fit refuses a stale result', async ({page}) => {
  await page.goto('/dose-response-ma/index.html');
  await page.evaluate(() => {
    const a = AlmDoseValidate, original = AlmWebR.runR;
    AlmWebR.runR = () => new Promise(resolve=>{window.auditResolveR=resolve;});
    window.auditLiveResult = AlmValidate.mount('#alm-validate',a).runLive().then(()=> 'accepted', e=>e.message).finally(()=>{AlmWebR.runR=original;});
  });
  await expect.poll(()=>page.evaluate(()=>typeof window.auditResolveR)).toBe('function');
  await page.locator('#f-xref').fill('10');
  const error = await page.evaluate(async () => {auditResolveR({ok:true,stdout:'ALMJSON:{}',versions:{dosresmeta:'2.2.0'}});return auditLiveResult;});
  expect(error).toContain('Inputs changed while R was running');
  await expect(panel(page).locator('tbody tr')).toHaveCount(0);
  await expect(panel(page).getByRole('status')).not.toContainText('quantities passed');
});

test('asynchronous imported data without an input event remove a completed live PASS', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url:'/shared/webr-runner.js'});
  await page.evaluate(async () => {
    const a = AlmHetValidationAdapter, original = AlmWebR.runR;
    AlmWebR.runR = async()=>({ok:true,stdout:'ALMJSON:'+JSON.stringify(Object.fromEntries(a.live.appValues(a.live.currentState()).map(q=>[q.key,q.value]))),versions:{metafor:'4.8-0'}});
    try { await AlmValidate.mount('#alm-validate',a).runLive(); }
    finally { AlmWebR.runR = original; }
    // File import / reset handlers can assign value without an input event.
    document.getElementById('f-data').value = 'A,0.5,0.1\nB,0.2,0.2\nC,-0.1,0.3';
  });
  await expect(panel(page).getByRole('status')).toContainText('Inputs changed');
  await expect(panel(page).locator('tbody tr')).toHaveCount(0);
});

test('DTA meta-regression cannot silently validate an intercept-only fit', async ({page}) => {
  await page.goto('/dta-sroc/index.html');
  await page.selectOption('#f-example','smoking'); await page.click('#btn-example');
  const state = await page.evaluate(() => {
    try { AlmDTAValidateAdapter.live.currentState(); return 'accepted'; } catch(e) { return e.message; }
  });
  expect(state).toContain('Live R comparison of DTA meta-regression is unavailable');
});

test('Screen names Python and corpus replay without claiming a live oracle', async ({page}) => {
  await page.goto('/screen/index.html'); await page.evaluate(()=>ScreenValidationAdapter.ready);
  await expect(panel(page).getByRole('link',{name:'Python reference and re-execution'})).toBeVisible();
  await expect(panel(page)).toContainText('Live Python comparison is unavailable');
  await expect(replay(page)).toBeVisible();
  await expect(panel(page)).not.toContainText('R check available');
  await expect(panel(page)).toContainText('does not run R or Python or validate your current data');
});

for (const app of ['heterogeneity','dose-response-ma','dta-sroc','nma']) {
  test(`${app} altered user data reach the real reference software @slow`, async ({page}) => {
    test.setTimeout(240000);
    await page.goto('/'+app+'/index.html');
    const modified = await page.locator('#f-data').inputValue();
    const data = app==='heterogeneity' ? modified.replace('-0.20','1.20') : app==='dose-response-ma' ? modified.replace('-0.223144','-0.123144') : app==='dta-sroc' ? modified.replace('85, 10','95, 10') : modified.replace('-0.22','-0.52');
    expect(data).not.toBe(modified); await page.locator('#f-data').fill(data);
    await page.getByRole('button',{name:'Validate this analysis in R',exact:true}).click();
    await expect(panel(page).getByRole('status')).toContainText('live R quantities passed.',{timeout:220000});
    await expect(panel(page).locator('tbody')).not.toContainText('FAIL');
    expect(await panel(page).locator('tbody tr').count()).toBeGreaterThan(15);
  });
}
