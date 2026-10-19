// Self-checking R script export (shared/alm-validate.js, opt-in `live.scriptExport`).
// For each enabled app, drive the page through its built-in examples and model options, press
// "Download R script", and check the script's structure. The scripts are written to RSCRIPT_OUT
// (default test-results/rscripts) with a manifest; scripts/check_rscripts.py then runs every one
// in native R (must print RESULT: PASS, exit 0) and a planted-defect copy of each (must FAIL, exit 1).
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.RSCRIPT_OUT || join(process.cwd(), 'test-results', 'rscripts');
mkdirSync(OUT, { recursive: true });

// Dose-response has no example selector: feed published corpus datasets (the app's own validation corpus) as text.
const root = new URL('../../../', import.meta.url);
const doseCorpus = JSON.parse(readFileSync(new URL('dose-response-ma/validate/corpus/reference.json', root), 'utf8'));
const doseData = Object.fromEntries(['coffee_mort', 'alcohol_cvd', 'coffee_stroke', 'alcohol_lc'].map(name => {
  const ds = doseCorpus.datasets.find(d => d.dataset === name);
  if (!ds) throw new Error('dose corpus dataset missing: ' + name);
  return [name, '# study,dose,cases,n,logRR,SE,type,covariate\n' + ds.rows.map(r =>
    [r.id, r.dose, r.cases, r.n, r.logrr, r.se == null ? '' : r.se, r.type, r.mod ?? ''].join(',')).join('\n')];
}));

// Variants: every combination of the listed values. `data` = text placed in #f-data; `f-example` values are loaded with
// #btn-example (choosing in the select alone does not load an example). Options the page disables are skipped and listed.
const APPS = {
  'dose-response-ma': { page: 'dose-response-ma/index.html', data: doseData, selects: {
    'f-shape': 'all', 'f-proc': 'all', 'f-method': ['REML', 'ML', 'FE', 'MM'] } },
  'dta-sroc': { page: 'dta-sroc/index.html', exampleButton: 'btn-example', selects: { 'f-example': 'all', 'f-method': 'all' } },
  'nma': { page: 'nma/index.html', exampleButton: 'btn-example', selects: { 'f-example': 'all', 'f-model': 'all' } },
  'heterogeneity': { page: 'heterogeneity/index.html', selects: { 'f-tau2': 'all' } },
};

function product(lists) {
  return lists.reduce((acc, [id, values]) => acc.flatMap(a => values.map(v => ({ ...a, [id]: v }))), [{}]);
}
function parseList(script, name) {
  const m = script.match(new RegExp('^\\' + name + ' <- list\\(([\\s\\S]*?)\\)\\n', 'm'));
  if (!m) return null;
  return [...m[1].matchAll(/^\s*("(?:[^"\\]|\\.)*")=/gm)].map(x => JSON.parse(x[1]));
}

for (const [app, spec] of Object.entries(APPS)) {
  test(`${app}: Download R script exports a self-checking script for every example and option`, async ({ page, baseURL }) => {
    test.setTimeout(1_800_000);
    page.on('dialog', d => d.accept());   // "replace current data?" confirmations when loading an example
    await page.goto(new URL(spec.page, baseURL).href);
    const widget = page.locator('#alm-validate');
    const button = widget.getByRole('button', { name: 'Download R script (re-run and check in R)', exact: true });
    await expect(button).toBeVisible();
    const lists = [];
    if (spec.data) lists.push(['__data', Object.keys(spec.data)]);
    for (const [id, want] of Object.entries(spec.selects)) {
      const values = await page.locator('#' + id + ' option').evaluateAll(os => os.map(o => o.value));
      lists.push([id, want === 'all' ? values : want.filter(v => values.includes(v))]);
    }
    const manifest = [], dataBySource = new Map();
    variants: for (const variant of product(lists)) {
      for (const [id, value] of Object.entries(variant)) {
        if (id === '__data') {
          await page.locator('#f-data').fill(spec.data[value]);
          await page.locator('#f-data').dispatchEvent('input');
          continue;
        }
        const disabled = await page.locator('#' + id).evaluate((el, v) => [...el.options].find(o => o.value === v)?.disabled ?? true, value);
        if (disabled) { manifest.push({ name: app + '__' + Object.values(variant).join('_'), variant, exported: false, notOffered: true, reason: `#${id}=${value} is disabled for this combination` }); continue variants; }
        await page.locator('#' + id).selectOption(value);
        if (id === 'f-example' && spec.exampleButton) await page.locator('#' + spec.exampleButton).click();
      }
      await page.locator('#btn-run').click();
      // Each data source (example or dataset) must really change the analysed data: guards against a harness that
      // silently re-exports the default example for every variant.
      const source = variant.__data ?? variant['f-example'];
      if (source !== undefined) {
        const text = await page.locator('#f-data').inputValue();
        if (dataBySource.has(source)) expect(dataBySource.get(source), `${source}: data changed between variants`).toBe(text);
        else dataBySource.set(source, text);
      }
      const name = app + '__' + Object.values(variant).join('_').replace(/[^A-Za-z0-9.-]+/g, '-');
      const status = widget.locator('[role=status]');
      await status.evaluate(el => { el.textContent = ''; });   // so a previous variant's message cannot satisfy the wait
      const download = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
      await button.click();
      await expect(status).toHaveText(/^(Downloaded |R script export refused: )/, { timeout: 60_000 });
      const message = await status.innerText();
      const dl = message.startsWith('Downloaded ') ? await download : null;
      if (!dl) {
        // Refusal must be explicit (e.g. a model the reference package does not implement); never silent.
        expect(message, `${name}: no download and no explicit refusal`).toMatch(/^R script export refused: .+/);
        manifest.push({ name, variant, exported: false, reason: message });
        continue;
      }
      expect(dl.suggestedFilename()).toBe(app + '-check.R');
      const file = join(OUT, name + '.R');
      await dl.saveAs(file);
      const script = readFileSync(file, 'utf8');
      const keys = parseList(script, '.alm_app');
      expect(keys && keys.length, `${name}: app quantities`).toBeGreaterThan(0);
      expect(parseList(script, '.alm_tol')).toEqual(keys);
      expect(parseList(script, '.alm_kind')).toEqual(keys);
      expect(script).toContain('.alm_out <- capture.output({');
      expect(script).toContain('RESULT: PASS');
      expect(message).toContain('Downloaded ' + app + '-check.R');
      manifest.push({ name, variant, exported: true, file: name + '.R', quantities: keys.length });
    }
    writeFileSync(join(OUT, app + '.manifest.json'), JSON.stringify(manifest, null, 2));
    if (dataBySource.size > 1) expect(new Set(dataBySource.values()).size, `${app}: every example/dataset loads different data`).toBe(dataBySource.size);
    expect(manifest.filter(m => m.exported).length, `${app}: exported scripts`).toBeGreaterThan(0);
  });
}
