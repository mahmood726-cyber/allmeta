import { test, expect } from '@playwright/test';

// Requirement (lane pwbias; the #547 rule for runAnalysis, applied to two buttons): a Monte Carlo number is
// a function of the data and the seed, and the page says which seed, how many draws, and its Monte Carlo SE.
// - "Run Multiverse": for k >= 10 it samples 1000 of the 2^k - 1 subsets with Math.random (unseeded).
// - "Run Full MCMC": fullMCMCBayesianMA was called with no seed, so it drew from Math.random.
const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
];

async function open(page, path) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function');
  // dat.bcg, k = 13: the multiverse samples 1000 of its 8191 subsets
  await page.evaluate(() => {
    loadDemoDataset('BCG');
    const s13 = [[4,119,11,128],[6,300,29,274],[3,228,11,209],[62,13536,248,12619],[33,5036,47,5761],[180,1361,372,1079],[8,2537,10,619],
      [505,87886,499,87892],[29,7470,45,7232],[17,1699,65,1600],[186,50448,141,27197],[5,2493,3,2338],[27,16886,29,17825]];
    document.getElementById('studyTableBody').innerHTML = '';
    s13.forEach((r, i) => addStudyRow({ name: 'S' + (i + 1), events_t: r[0], n_t: r[0] + r[1], events_c: r[2], n_c: r[2] + r[3] }));
    updateDataSummary();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__prev = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results !== window.__prev && AppState.results.studies, null, { timeout: 20000 });
}

for (const [name, path] of PAGES) {
  test(`${name}: Run Multiverse is seeded and says so`, async ({ page }) => {
    test.setTimeout(90000);
    await open(page, path);
    const r = await page.evaluate(() => {
      const one = () => { runMultiverseAnalysis(); return document.getElementById('multiverseResults').innerText; };
      const yi = AppState.results.studies.map(s => s.yi), vi = AppState.results.studies.map(s => s.vi);
      const a = multiverseMetaAnalysis(yi, vi), b = multiverseMetaAnalysis(yi, vi);
      return { k: yi.length, same: JSON.stringify(a) === JSON.stringify(b), sampling: a.sampling, t1: one(), t2: one() };
    });
    expect(r.k).toBe(13);
    expect(r.same).toBe(true);
    expect(r.t1).toBe(r.t2);
    expect(r.sampling && r.sampling.enumerated).toBe(false);
    expect(r.sampling.B).toBe(1000);
    expect(Number.isInteger(r.sampling.seed)).toBe(true);
    expect(r.sampling.mc_se_proportion_significant).toBeGreaterThan(0);
    expect(r.t1).toContain('seed ' + r.sampling.seed);
    expect(r.t1).toMatch(/Monte Carlo SE/);
  });

  test(`${name}: Run Full MCMC is seeded and says so`, async ({ page }) => {
    test.setTimeout(180000);
    await open(page, path);
    const runMcmc = async () => {
      await page.evaluate(() => { AppState.fullMCMCResults = null; runFullMCMCAnalysis(); });
      await page.waitForFunction(() => AppState.fullMCMCResults, null, { timeout: 150000 });
      return page.evaluate(() => ({ mu: AppState.fullMCMCResults.combined.mu.slice(0, 50), summary: JSON.stringify(AppState.fullMCMCResults.summary),
        settings: AppState.fullMCMCResults.settings, mcse: AppState.fullMCMCResults.diagnostics.MCSE_mu,
        text: document.getElementById('fullMCMCResults').innerText }));
    };
    const a = await runMcmc(), b = await runMcmc();
    expect(a.mu).toEqual(b.mu);
    expect(a.summary).toBe(b.summary);
    expect(Number.isInteger(a.settings.seed)).toBe(true);
    expect(a.mcse).toBeGreaterThan(0);
    expect(a.text).toContain('seed ' + a.settings.seed);
    expect(a.text).toMatch(/Monte Carlo SE/);
  });
}
