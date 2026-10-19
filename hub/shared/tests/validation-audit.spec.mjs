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
    // Read the app values before mounting: heterogeneity's state reader re-renders
    // (an input event), which must not occur inside the mocked R call itself.
    const stdout = 'ALMJSON:'+JSON.stringify(Object.fromEntries(a.live.appValues(a.live.currentState()).map(q=>[q.key,q.value])));
    AlmWebR.runR = async()=>({ok:true,stdout,versions:{metafor:'4.8-0'}});
    try { await AlmValidate.mount('#alm-validate',a).runLive(); }
    finally { AlmWebR.runR = original; }
  });
  await expect(panel(page).getByRole('status')).toContainText('18/18 live R quantities passed');
  await page.locator('#f-data').fill('A,0.5,0.1\nB,0.2,0.2\nC,-0.1,0.3');
  await expect(panel(page).getByRole('status')).toContainText('Live R result out of date');
  await expect(panel(page).locator('tbody tr')).toHaveCount(0);
});

test('editing inputs during an R fit refuses a stale result', async ({page}) => {
  await page.goto('/dose-response-ma/index.html');
  await page.evaluate(() => {
    const a = AlmDoseValidate, original = AlmWebR.runR;
    AlmWebR.runR = () => new Promise(resolve=>{window.auditResolveR=resolve;});
    window.auditLiveResult = AlmValidate.mount('#alm-validate',a).runLive().then(r=> r && r.stale ? 'stale' : 'accepted', e=>e.message).finally(()=>{AlmWebR.runR=original;});
  });
  await expect.poll(()=>page.evaluate(()=>typeof window.auditResolveR)).toBe('function');
  await page.locator('#f-xref').fill('10');
  const error = await page.evaluate(async () => {auditResolveR({ok:true,stdout:'ALMJSON:{}',versions:{dosresmeta:'2.2.0'}});return auditLiveResult;});
  // Main's mechanism resolves a superseded check as {stale:true} rather than throwing.
  expect(error).toBe('stale');
  await expect(panel(page).getByRole('status')).toContainText('Inputs changed while R was running');
  await expect(panel(page).locator('tbody tr')).toHaveCount(0);
  await expect(panel(page).getByRole('status')).not.toContainText('quantities passed');
});

test('asynchronous imported data without an input event remove a completed live PASS', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url:'/shared/webr-runner.js'});
  await page.evaluate(async () => {
    const a = AlmHetValidationAdapter, original = AlmWebR.runR;
    // Read the app values before mounting: heterogeneity's state reader re-renders
    // (an input event), which must not occur inside the mocked R call itself.
    const stdout = 'ALMJSON:'+JSON.stringify(Object.fromEntries(a.live.appValues(a.live.currentState()).map(q=>[q.key,q.value])));
    AlmWebR.runR = async()=>({ok:true,stdout,versions:{metafor:'4.8-0'}});
    try { await AlmValidate.mount('#alm-validate',a).runLive(); }
    finally { AlmWebR.runR = original; }
    // File import / reset handlers can assign value without an input event.
    document.getElementById('f-data').value = 'A,0.5,0.1\nB,0.2,0.2\nC,-0.1,0.3';
  });
  await expect(panel(page).getByRole('status')).toContainText('Live R result out of date');
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

test('DTA live state reader has no side effects and refuses a fit that no longer matches the inputs', async ({page}) => {
  await page.goto('/dta-sroc/index.html');
  const r = await page.evaluate(() => {
    const a = AlmDTAValidateAdapter, data = document.getElementById('f-data');
    const fresh = a.live.currentState();
    let events = 0; const count = () => events++;
    for (const type of ['input','change']) document.addEventListener(type, count, true);
    // Programmatic assignment (as file/project loaders do) without an input event:
    data.value = data.value.replace('85, 10', '95, 10');
    let refusal = 'accepted';
    try { a.live.currentState(); } catch (e) { refusal = e.message; }
    for (const type of ['input','change']) document.removeEventListener(type, count, true);
    return {freshRows: fresh.rows.length, refusal, events, rendered: window.__almBivariate() === fresh.fit};
  });
  expect(r.freshRows).toBeGreaterThan(0);
  expect(r.refusal).toContain('does not match the current inputs');
  expect(r.events).toBe(0);
  expect(r.rendered).toBe(true);
});

test('unknown comparison kinds fail closed with a reason while known kinds still work', async ({page}) => {
  await page.goto('/heterogeneity/index.html');
  const r = await page.evaluate(() => ({
    unknown: AlmValidate.compare(1, 1, 'approx', 1e-6),
    missing: AlmValidate.compare(1, 1, undefined, 1e-6),
    abs: AlmValidate.compare(1, 1 + 1e-9, 'abs', 1e-6).pass,
    rel: AlmValidate.compare(1000, 1000.0001, 'rel', 1e-6).pass,
    exact: AlmValidate.compare(true, true, 'exact', 0).pass,
    negTol: AlmValidate.compare(1, 1, 'abs', -1).pass
  }));
  expect(r.unknown.pass).toBe(false); expect(r.unknown.reason).toContain('Unknown comparison kind: approx');
  expect(r.missing.pass).toBe(false);
  expect([r.abs, r.rel, r.exact, r.negTol]).toEqual([true, true, true, false]);
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
