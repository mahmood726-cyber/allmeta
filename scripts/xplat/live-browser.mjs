// Shared by the browser specs and the portable desktop-R exporter.
export const apps = ['nma-inconsistency', 'multivariate-ma', 'rve-meta', 'component-nma'];

export async function loadExample(page, app, baseURL = '') {
  await page.goto(`${baseURL}/${app}/index.html`);
  await page.waitForFunction(app => Boolean(window.AlmLiveAdapters?.[app]), app);
  // A fresh browser context has no saved draft. Explicitly submit the shipped
  // textarea default, using the page's own event path.
  await page.evaluate(app => {
    if (app === 'multivariate-ma') {
      document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.getElementById('src').value = document.getElementById('src').defaultValue;
      document.getElementById('btn-run').click();
    }
  }, app);
}

export async function payload(page, app) {
  return page.evaluate(app => {
    const a = window.AlmLiveAdapters[app], state = a.currentState();
    return { app, script: a.buildScript(state), packages: a.packages, appValues: a.appValues(state), compare: a.compare };
  }, app);
}

export async function runBrowserR(page, app) {
  if (!await page.evaluate(() => Boolean(window.AlmWebR))) await page.addScriptTag({ url: '/shared/webr-runner.js' });
  if (!await page.evaluate(() => Boolean(window.AlmValidate))) await page.addScriptTag({ url: '/shared/alm-validate.js' });
  const data = await payload(page, app);
  const result = await page.evaluate(data => window.AlmWebR.runR({ script: data.script, packages: data.packages }), data);
  if (!result.ok) return { data, result };
  const lines = result.stdout.split(/\r?\n/).filter(l => l.startsWith('ALMJSON:'));
  if (lines.length !== 1) throw Error(`Expected one ALMJSON record, got ${lines.length}: ${result.stdout}`);
  const reference = JSON.parse(lines[0].slice(8));
  if (JSON.stringify(Object.keys(reference).sort()) !== JSON.stringify(data.appValues.map(v => v.key).sort())) {
    throw Error('R output keys differ from app values');
  }
  return { data, result, reference };
}

export async function compareInPage(page, data, reference, planted = false) {
  return page.evaluate(({ data, reference, planted }) => {
    const values = structuredClone(data.appValues);
    // A real nonzero estimate, perturbed multiplicatively by 1e-3.
    const target = values.find(v => /^(split\.0\.direct|mu1|coef\.0\.estimate|components_0_est)$/.test(v.key));
    if (planted) {
      if (!target || !Number.isFinite(target.value) || target.value === 0) throw Error('No nonzero defect target');
      target.value *= 1.001;
    }
    return values.map(v => ({
      key: v.key,
      ...window.AlmValidate.compare(v.value, reference[v.key],
        data.compare.kind[v.key] || 'abs', data.compare.tolerance[v.key] ?? data.compare.tolerance.default)
    }));
  }, { data, reference, planted });
}
