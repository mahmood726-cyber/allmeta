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

// Variants: every combination of the listed select values (null = keep the page default).
const APPS = {
  'dose-response-ma': { page: 'dose-response-ma/index.html', selects: {
    'f-shape': 'all', 'f-proc': 'all', 'f-method': ['REML', 'ML', 'FE', 'MM'] } },
  'dta-sroc': { page: 'dta-sroc/index.html', selects: { 'f-example': 'all', 'f-method': 'all' } },
  'nma': { page: 'nma/index.html', selects: { 'f-example': 'all', 'f-model': 'all' } },
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
    test.setTimeout(600_000);
    await page.goto(new URL(spec.page, baseURL).href);
    const widget = page.locator('#alm-validate');
    const button = widget.getByRole('button', { name: 'Download R script (re-run and check in R)', exact: true });
    await expect(button).toBeVisible();
    const lists = [];
    for (const [id, want] of Object.entries(spec.selects)) {
      const values = await page.locator('#' + id + ' option').evaluateAll(os => os.map(o => o.value));
      lists.push([id, want === 'all' ? values : want.filter(v => values.includes(v))]);
    }
    const manifest = [];
    for (const variant of product(lists)) {
      for (const [id, value] of Object.entries(variant)) {
        await page.locator('#' + id).selectOption(value);
      }
      await page.locator('#btn-run').click();
      const name = app + '__' + Object.values(variant).join('_').replace(/[^A-Za-z0-9.-]+/g, '-');
      const status = widget.locator('[role=status]');
      const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
      await button.click();
      const dl = await download;
      const message = await status.innerText();
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
    expect(manifest.filter(m => m.exported).length, `${app}: exported scripts`).toBeGreaterThan(0);
  });
}
