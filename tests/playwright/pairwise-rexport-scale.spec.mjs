import { test, expect } from '@playwright/test';

// Requirement: the Pairwise AI bundle's R export (the Code tab's main script and its forest-plot options)
// back-transforms the pooled estimate, its CI and PI, the leave-one-out table and the forest plots only where yi
// are on a transformed scale, and the way this page displays the measure: exp() for a ratio measure (OR, RR, HR),
// the page's inverse for a logit / arcsine / Freeman-Tukey proportion, and nothing for MD, SMD, RD, PR and GEN
// (lane pwrest4, follow-up to #572).
// Defect guarded: the export applied exp() to every measure, so BP_REDUCTION (MD -7.77 mmHg, 95% CI -9.16 to
// -6.38) was printed as "MD: 4e-04, 95% CI: 1e-04 - 0.0017" and MORTALITY_RATE (PLO) as the odds 0.1509 instead
// of the proportion 0.1311; the forest plots used a log axis with ratio tick marks for every measure.
// R check (R 4.6.0, metafor 5.2.1): all 9 demos run (exit 0) and the printed estimate and 95% CI equal the
// page's pooled estimate and HKSJ CI on the measure's scale (lane evidence item2_R_compare.txt).

const PATH = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';
const EXP = /(?<![A-Za-z._])exp\(/;
const DEMOS = {
  SGLT2_ACM: ['OR', 'bt <- exp'], BINARY_RR: ['RR', 'bt <- exp'], SGLT2_HR: ['HR', 'bt <- exp'], BCG: ['OR', 'bt <- exp'],
  BINARY_RD: ['RD', 'bt <- identity'], BP_REDUCTION: ['MD', 'bt <- identity'], CONTINUOUS_SMD: ['SMD', 'bt <- identity'],
  GENERIC_EFFECTS: ['GEN', 'bt <- identity'], MORTALITY_RATE: ['PLO', 'bt <- transf.ilogit'],
};

async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  return errors;
}

test('the R export back-transforms on the scale of each measure', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await open(page);
  for (const [demo, [measure, def]] of Object.entries(DEMOS)) {
    const g = await page.evaluate(async demo => {
      loadDemoDataset(demo); await new Promise(r => setTimeout(r, 400));
      const prev = AppState.results; runAnalysis();
      for (let i = 0; i < 300 && (!AppState.results || AppState.results === prev || !AppState.results.pooled); i++) await new Promise(r => setTimeout(r, 100));
      const e = AppState.results;
      return { measure: e.measure, main: generateRCode(e, { method: AppState.settings.tau2Method, hksj: AppState.settings.hksj }),
        forest: generateRCodeForestOptions(e) };
    }, demo);
    expect(g.measure, demo).toBe(measure);
    for (const [part, code] of [['main', g.main], ['forest options', g.forest]]) {
      expect(code, `${demo} ${part}: defines bt()`).toContain(def);
      expect(code, `${demo} ${part}`).not.toContain('atransf = exp');
      if (def === 'bt <- exp') {
        // the only exp() left is bt itself and the NNT section's ratio <- exp(est)
        const left = code.split('\n').filter(l => EXP.test(l) && !/ratio <- exp\(est\)/.test(l));
        expect(left, `${demo} ${part}: exp() outside bt`).toEqual([]);
      } else {
        expect(code.split('\n').filter(l => EXP.test(l)), `${demo} ${part}: no exp() for a ${measure}`).toEqual([]);
        expect(code, `${demo} ${part}: no log axis for a ${measure}`).not.toMatch(/scale_x_log10|at = log\(c\(|xlim = c\(0\.25, 4\)/);
      }
    }
    expect(g.main).toContain(`--- On the ${measure} scale`);
    // bt() is applied to every reported / plotted estimate, not only defined (agy review of #573)
    for (const use of ['round(bt(coef(res)), 4)', 'round(bt(res$ci.lb), 4)', 'round(bt(res$ci.ub), 4)', 'round(bt(pred$pi.lb), 4)',
      'round(bt(pred$pi.ub), 4)', 'Estimate = round(bt(loo$estimate), 4)', 'CI_Lower = round(bt(loo$ci.lb), 4)', 'yi_bt = bt(yi)',
      'ci_lower = bt(yi - 1.96 * sei)', 'estimate = bt(coef(res))', 'pi_lower = bt(pred$pi.lb)'])
      expect(g.main, `${demo}: ${use}`).toContain(use);
    // the five forest() calls and the regplot() example the script prints
    expect(g.main.split('atransf = bt').length - 1, `${demo}: every forest plot back-transforms`).toBe(6);
    for (const use of ['Effect = paste0(round(bt(yi), 2)', 'est = c(bt(yi), bt(coef(res)))', 'estimate = c(bt(yi), bt(coef(res)))', 'xmin = bt(pred$pi.lb)'])
      expect(g.forest, `${demo} forest options: ${use}`).toContain(use);
    if (def !== 'bt <- exp') expect(g.main).not.toContain('exponentiated');
    if (def === 'bt <- identity') expect(g.main).toContain('geom_vline(xintercept = 0');
    if (def === 'bt <- transf.ilogit') expect(g.main).not.toContain('geom_vline(xintercept');
  }
  // the proportion measures the demos do not cover: the same inverse as the page's backTransformProportion
  const bt = await page.evaluate(() => ['PAS', 'PFT', 'PR'].map(m => [m, rExportBackTransform(m)]));
  expect(bt[0][1].def).toContain('bt <- transf.iarcsin');
  expect(bt[1][1].def).toContain('bt <- function(x) sin(x / 2)^2');
  expect(bt[2][1].def).toContain('bt <- identity');
  for (const [, b] of bt) { expect(b.ratio).toBe(false); expect(b.nul).toBeNull(); }
  const page2 = await page.evaluate(() => [backTransformProportion(0.7, 'PAS'), Math.pow(Math.sin(0.7), 2),
    backTransformProportion(1.4, 'PFT'), Math.pow(Math.sin(1.4 / 2), 2)]);
  expect(page2[0]).toBeCloseTo(page2[1], 12);
  expect(page2[2]).toBeCloseTo(page2[3], 12);
  expect(errors).toEqual([]);
});
