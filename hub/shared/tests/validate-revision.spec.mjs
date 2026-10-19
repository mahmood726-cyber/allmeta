import {test, expect} from './validation-fixture.mjs';

const apps = [
  ['multilevel-ma', 'AlmMultilevelValidationAdapter', '#src', 1],
  ['heterogeneity', 'AlmHetValidationAdapter', '#f-data', 1],
  ['dose-response-ma', 'AlmDoseValidate', '#f-data', 4],
  ['dta-sroc', 'AlmDTAValidateAdapter', '#f-data', 1],
  ['nma', 'AlmNmaValidateAdapter', '#f-data', 3]
];
async function editAndFit(page, app, selector, column) {
  const original = await page.locator(selector).inputValue();
  let edited = false;
  const text = original.split('\n').map(line => {
    const cols = line.split(',');
    if (!edited && !line.trim().startsWith('#') && cols[column]?.trim() && Number.isFinite(Number(cols[column])) && Number(cols[column]) !== 0) {
      cols[column] = String(Number(cols[column]) + (app === 'dta-sroc' ? 1 : 0.01)); edited = true;
      return cols.join(',');
    }
    return line;
  }).join('\n');
  expect(edited).toBe(true);
  await page.locator(selector).fill(text);
  if (app === 'multilevel-ma') await page.locator('#btn-run').click();
  else await page.locator(selector).dispatchEvent('input');
}
for (const [app, adapter, selector, column] of apps) {
  test(`${app} clears a real live R verdict on data edit and refit @slow`, async ({page}) => {
    test.setTimeout(240000);
    await page.goto('/'+app+'/index.html');
    const result = await page.evaluate(async name => {
      window.revisionWidget = AlmValidate.mount(document.getElementById('alm-validate'), window[name]);
      return revisionWidget.runLive();
    }, adapter);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.filter(r => !r.pass)).toEqual([]);
    await expect(page.locator('#alm-validate tbody tr')).toHaveCount(result.rows.length);
    await editAndFit(page, app, selector, column);
    await expect(page.locator('#alm-validate [role=status]')).toContainText('out of date');
    await expect(page.locator('#alm-validate table')).toHaveCount(0);
    await expect(page.locator('#alm-validate')).not.toContainText('live R quantities passed');
  });
  test(`${app} refuses a real R result after an in-flight input edit @slow`, async ({page}) => {
    test.setTimeout(240000);
    await page.goto('/'+app+'/index.html');
    await page.addScriptTag({url:'/shared/webr-runner.js'});
    await page.evaluate(name => {
      window.revisionWidget = AlmValidate.mount(document.getElementById('alm-validate'), window[name]);
      const realRun = AlmWebR.runR;
      const gate = new Promise(resolve => { window.releaseR = resolve; });
      AlmWebR.runR = async opts => {
        window.rStarted = true;
        const result = await realRun(opts);
        window.realRResult = result;
        await gate;
        return result;
      };
      window.pendingRevision = revisionWidget.runLive();
    }, adapter);
    await page.waitForFunction(() => window.rStarted);
    await editAndFit(page, app, selector, column);
    await expect(page.locator('#alm-validate [role=status]')).toContainText('Inputs changed while R was running');
    const result = await page.evaluate(async () => { releaseR(); return pendingRevision; });
    expect(await page.evaluate(() => realRResult.ok)).toBe(true);
    expect(result).toEqual({stale:true, rows:[]});
    await expect(page.locator('#alm-validate table')).toHaveCount(0);
    await expect(page.locator('#alm-validate [role=status]')).toContainText('run the check again');
  });
}

test('screen explicitly has no live R check before or after input changes', async ({page}) => {
  await page.goto('/screen/index.html');
  await page.evaluate(() => ScreenValidationAdapter.ready);
  expect(await page.evaluate(() => ScreenValidationAdapter.live)).toBeNull();
  await expect(page.getByRole('button', {name:'Validate this analysis in R', exact:true})).toHaveCount(0);
  await page.evaluate(() => {
    const input = document.querySelector('input,textarea');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  });
  await expect(page.locator('#alm-validate table')).toHaveCount(0);
  await expect(page.getByRole('link', {name:'Python reference and re-execution', exact:true})).toBeVisible();
});

for (const [app, adapter, selector] of apps.slice(0,2)) {
  test(`${app} failed replay preserves URL history and inputs and releases write guard`, async ({page}) => {
    await page.goto('/'+app+'/index.html');
    const result = await page.evaluate(async ({adapter, selector}) => {
      const a = window[adapter];
      const loaded = await AlmValidate.loadFiles(a.corpus.files);
      const before = {href:location.href, length:history.length, input:document.querySelector(selector).value};
      let error;
      try { await a.corpus.run(loaded, () => { throw new Error('test replay interruption'); }); }
      catch (e) { error = e.message; }
      const after = {href:location.href, length:history.length, input:document.querySelector(selector).value};
      return {before, after, error, writable:alm.urlState.write({test:'guard released'})};
    }, {adapter, selector});
    expect(result.error).toBe('test replay interruption');
    expect(result.after).toEqual(result.before);
    expect(result.writable).toBe(true);
  });
}
