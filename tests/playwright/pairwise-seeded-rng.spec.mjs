import { test, expect } from '@playwright/test';

// Requirement: the analysis result is a function of the data and the settings, including the
// Monte Carlo seed. Running the same data twice must give a deep-equal AppState.results, and a
// project saved with a seed must reproduce the same bootstrap / MCMC numbers when it is reopened
// and rerun in a NEW browser session.
// Regression for the engine's unseeded Math.random in winnersCurseCorrection (1000-resample
// bootstrap, reported as crossDisc.winnersCurse) and bayesianMetaAnalysis (MCMC, reported as
// results.bayesian), plus the orchard-plot jitter (crossDisc.orchardPlot.studies[].y).
const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
  ['Pairwise AI dist', '/Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html'],
  ['Pairwise AI fast', '/Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html'],
  ['Pairwise AI min', '/Pairwiseai/TruthCert-PairwisePro-v1.0-min.html'],
];
// Paths at which two JSON values differ (first 20). toEqual on a ~650 kB result with
// thousands of differing MCMC draws makes the diff printer hang, so compare paths instead.
function diffPaths(a, b, path = '$', out = []) {
  if (out.length >= 20) return out;
  if (a === b) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    out.push(path); return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffPaths(a[k], b[k], path + '.' + k, out);
  return out;
}
const same = (a, b, msg) => expect(diffPaths(a, b), msg).toEqual([]);
const snap = page => page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)));

async function open(page, path) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(path, { waitUntil: 'load' });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
}
async function run(page) {
  await page.locator('#runAnalysisBtn').click();
  await page.clock.runFor(100);
  return snap(page);
}
async function setBayesian(page, on) {
  await page.evaluate(on => {
    const cb = document.getElementById('bayesianCheckbox');
    if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    // Keep the MCMC short: the requirement is reproducibility, not convergence.
    const it = document.getElementById('mcmcIterations'); if (it) it.value = '1000';
  }, on);
}
// The B / seed / Monte Carlo SE behind each Monte Carlo number is shown next to it.
async function expectMcVisible(page, res, seed) {
  const bayesText = await page.locator('#panel-analysis').innerText();
  expect(bayesText, 'Bayesian panel does not show its Monte Carlo SE').toMatch(/Monte Carlo SE of posterior mean/);
  expect(bayesText, 'Bayesian panel does not show its seed').toContain(`seed ${seed}`);
  if (res.crossDisc && res.crossDisc.winnersCurse && res.crossDisc.winnersCurse.available) {
    expect(res.crossDisc.winnersCurse.bootstrap_correction.mc_se, 'bootstrap Monte Carlo SE not recorded').toBeGreaterThan(0);
    // The cross-disciplinary panel is drawn when its tab is opened, as a user would a moment after Run.
    // (A page wrapper on bundle/dist/fast/min repaints this panel with a summary card 500 ms after Run;
    // opening the tab after that draws the full engine panel.)
    await page.clock.runFor(1000);
    const back = await page.evaluate(() => { const b = document.querySelector('button.tab-btn.tab-btn--active'); return b ? b.dataset.tab : 'data'; });
    await page.locator('button.tab-btn[data-tab="crossdisciplinary"]').first().click();
    await page.clock.runFor(500);
    const cdText = await page.locator('#panel-crossdisciplinary').innerText();
    await page.locator(`button.tab-btn[data-tab="${back}"]`).first().click();
    await page.clock.runFor(100);
    expect(cdText, "winner's-curse card does not show B, seed and Monte Carlo SE").toMatch(new RegExp(`B = 1000 resamples, seed ${seed}, Monte Carlo SE`));
  }
}
// The Monte Carlo outputs this page reports, whichever of them its engine computes.
const mcOutputs = r => ({
  winnersCurse: r.crossDisc && r.crossDisc.winnersCurse ? r.crossDisc.winnersCurse : null,
  orchard: r.crossDisc && r.crossDisc.orchardPlot ? r.crossDisc.orchardPlot.studies : null,
  bayesian: r.bayesian ? r.bayesian.summary : null,
});

for (const [name, path] of PAGES) {
  test(`${name}: default settings, the same data run twice gives deep-equal results`, async ({ page }) => {
    test.setTimeout(120000);
    await open(page, path);
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await page.clock.runFor(500);
    const first = await run(page);
    expect(first.pooled).toBeTruthy();
    const second = await run(page);
    same(second, first, 'results differ between two runs of the same data (default settings)');
  });

  test(`${name}: Bayesian on, the same data run twice gives deep-equal results`, async ({ page }) => {
    test.setTimeout(120000);
    await open(page, path);
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await setBayesian(page, true);
    await page.clock.runFor(500);
    const first = await run(page);
    expect(first.pooled).toBeTruthy();
    expect(first.bayesian && first.bayesian.summary, 'Bayesian run produced no summary').toBeTruthy();
    const second = await run(page);
    same(second, first, 'results differ between two runs of the same data');
  });

  test(`${name}: a saved seed reproduces the Monte Carlo numbers in a new session`, async ({ browser }) => {
    test.setTimeout(120000);
    // Session A: choose a seed, run, save.
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    await open(a, path);
    await a.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await setBayesian(a, true);
    await a.clock.runFor(500);
    await a.evaluate(() => { AppState.settings.rngSeed = 777; });
    const resA = await run(a);
    await expectMcVisible(a, resA, 777);
    const saved = await a.evaluate(() => JSON.stringify(saveProject()));
    expect(JSON.parse(saved).settings.rngSeed, 'seed not saved with the project').toBe(777);
    // The seed is recorded beside every number it produced.
    expect(resA.bayesian.settings.seed, 'MCMC seed not recorded in the result').toBeDefined();
    if (resA.crossDisc && resA.crossDisc.winnersCurse) {
      expect(resA.crossDisc.winnersCurse.bootstrap_correction.seed, 'bootstrap seed not recorded').toBeDefined();
      expect(resA.crossDisc.winnersCurse.bootstrap_correction.B).toBe(1000);
    }
    // A different seed must change the Monte Carlo numbers (the seed is actually used).
    await a.evaluate(() => { AppState.settings.rngSeed = 778; });
    const resOther = await run(a);
    expect(diffPaths(mcOutputs(resOther).bayesian, mcOutputs(resA).bayesian).length, 'changing the seed did not change the MCMC').toBeGreaterThan(0);
    if (mcOutputs(resA).winnersCurse) expect(mcOutputs(resOther).winnersCurse.bootstrap_correction.bias, 'changing the seed did not change the bootstrap').not.toBe(mcOutputs(resA).winnersCurse.bootstrap_correction.bias);
    await ctxA.close();

    // Session B: a fresh browser context opens the saved project and reruns it.
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await open(b, path);
    await b.evaluate(json => loadProject(json), saved);
    await b.clock.runFor(500);
    const reopened = await snap(b);
    // Reopening restores the COMPLETE saved result (cross-disciplinary and Bayesian outputs included)
    // and repaints it without refitting.
    same(reopened, resA, 'reopened project does not restore the saved result');
    await expectMcVisible(b, resA, 777);
    expect(await b.evaluate(() => AppState.settings.rngSeed)).toBe(777);
    await setBayesian(b, true);
    const resB = await run(b);
    same(mcOutputs(resB), mcOutputs(resA), 'same seed, new session: Monte Carlo outputs differ');
    same(resB, resA, 'same seed, new session: results differ');
    await ctxB.close();
  });
}
