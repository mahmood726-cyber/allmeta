import { test, expect } from '@playwright/test';

// Requirements (lane pwbias):
// 1. Loading a project shows the SAVED TruthCert verdict beside the saved results, or no verdict at all --
//    never the verdict of whatever was analysed before the load. applyProjectState used to repaint the saved
//    results and leave AppState.truthcert alone, so run A, run B, load A showed B's verdict beside A's results,
//    and saving again stored that pair.
// 2. A Run that fails (fewer than 2 valid studies, or an error in the engine) leaves the verdict exactly as it
//    was: it used to leave the "compute a verdict at the next repaint" flag armed, so the next repaint of any
//    result computed a verdict nobody's Run produced.
// 3. (bundle) A project saved before #566 does not print the Cross-Disciplinary numbers #566 removed
//    ("Bias-adjusted consensus estimate", the fixed-MCID and NNT figures).
const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
];

async function open(page, path) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof saveProject === 'function');
}

// run the analysis the way the Run button does and wait until its verdict is published
async function run(page) {
  await page.waitForTimeout(400);  // the 150 ms table debounce
  await page.evaluate(() => { window.__prevResults = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results !== window.__prevResults && AppState.truthcert
    && AppState.truthcert.results && AppState.truthcert.results.theta === AppState.results.pooled.theta, null, { timeout: 20000 });
}

const pair = page => page.evaluate(() => ({
  theta: AppState.results && AppState.results.pooled.theta,
  vTheta: AppState.truthcert ? AppState.truthcert.results.theta : null,
  verdict: AppState.truthcert ? AppState.truthcert.verdict.verdict : null,
  panel: (document.getElementById('panel-verdict') || {}).innerText || '',
}));

for (const [name, path] of PAGES) {
  test(`${name}: loading a project restores its own verdict or none, never the previous analysis's`, async ({ page }) => {
    test.setTimeout(90000);
    await open(page, path);
    await page.evaluate(() => loadDemoDataset('BCG'));
    await run(page);
    const a = await pair(page);
    const stateA = await page.evaluate(() => JSON.stringify(saveProject()));
    // analysis B: drop the first two studies
    const runB = async () => { await page.evaluate(() => { const rows = document.querySelectorAll('#studyTableBody tr'); rows[0].remove(); rows[1].remove(); updateDataSummary(); }); await run(page); };
    await runB();
    const b = await pair(page);
    expect(b.theta).not.toBe(a.theta);

    // load A (saved with its verdict): A's verdict comes back with A's results
    await page.evaluate(s => loadProject(s), stateA);
    await page.waitForTimeout(300);
    const loaded = await pair(page);
    expect(loaded.theta).toBe(a.theta);
    expect(loaded.vTheta).toBe(a.theta);
    expect(loaded.verdict).toBe(a.verdict);
    const resaved = await page.evaluate(() => { const s = saveProject(); return { t: s.results.pooled.theta, v: s.truthcert && s.truthcert.results.theta }; });
    expect(resaved.v).toBe(resaved.t);

    // load A saved WITHOUT a verdict, or with B's verdict: no verdict is shown or saved
    await runB();  // B again (A's table minus two studies), so B's verdict is on the page
    const stale = await page.evaluate(() => JSON.parse(JSON.stringify(AppState.truthcert)));
    expect(stale.results.theta).toBe(b.theta);
    for (const tc of [null, 'B']) {
      await page.evaluate(([s, tc, stale]) => { const o = JSON.parse(s); o.truthcert = tc === 'B' ? stale : null; return loadProject(JSON.stringify(o)); }, [stateA, tc, stale]);
      await page.waitForTimeout(300);
      const cleared = await pair(page);
      expect(cleared.theta).toBe(a.theta);
      expect(cleared.vTheta).toBeNull();
      expect(cleared.panel).toContain('Run analysis first to generate TruthCert verdict');
      const saved = await page.evaluate(() => saveProject().truthcert);
      expect(saved).toBeNull();
      if (tc === null) await runB();  // put B's verdict back on the page before the next load
    }
  });

  test(`${name}: a failed Run leaves the verdict as it was`, async ({ page }) => {
    test.setTimeout(90000);
    await open(page, path);
    await page.evaluate(() => loadDemoDataset('BCG'));
    await run(page);
    await page.evaluate(() => { AppState.truthcert.__mark = 'before'; });
    // (a) fewer than 2 valid studies: runAnalysis alerts and returns
    await page.evaluate(() => { const rows = [...document.querySelectorAll('#studyTableBody tr')]; rows.slice(1).forEach(r => r.remove()); updateDataSummary(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => runAnalysis());
    await page.waitForTimeout(400);
    // the table is filled again (no Run), then any repaint of the (unchanged) result
    await page.evaluate(() => loadDemoDataset('BCG'));
    await page.waitForTimeout(400);
    await page.evaluate(() => renderResults());
    expect(await page.evaluate(() => AppState.truthcert && AppState.truthcert.__mark)).toBe('before');
    // (b) the engine throws inside the Run
    await page.evaluate(() => loadDemoDataset('BCG'));
    await run(page);
    await page.evaluate(() => { AppState.truthcert.__mark = 'before2'; window.__realConvert = window.convertToEffectSizes; window.convertToEffectSizes = () => { throw new Error('planted failure'); }; });
    await page.evaluate(() => runAnalysis());
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.convertToEffectSizes = window.__realConvert; renderResults(); });
    expect(await page.evaluate(() => AppState.truthcert && AppState.truthcert.__mark)).toBe('before2');
  });
}

test('Pairwise AI bundle: a project saved before #566 does not print the Cross-Disciplinary numbers #566 removed', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html');
  await page.evaluate(() => loadDemoDataset('BCG'));
  await run(page);
  const old = await page.evaluate(() => {
    const s = saveProject();
    s.results.crossDisc = Object.assign({}, s.results.crossDisc || {}, {
      winnersCurse: { available: true, interpretation: 'Minimal inflation detected', bootstrap_correction: { inflation_pct: 4.2 },
        conditional_correction: { theta_corrected: -0.9, theta_corrected_exp: 0.41 }, empirical_bayes: { theta_corrected: -0.6, theta_corrected_exp: 0.55 },
        consensus_estimate: { theta: -0.777, theta_exp: 0.4598, interpretation: 'Weighted average (bootstrap 40-50%, conditional 30%, EB 30-50%)' } },
      responseDistribution: { available: true, response_rates: { P_benefit: 0.9, P_mcid: 0.8, P_harm: 0.1, P_large_benefit: 0.5, P_large_harm: 0.01 },
        clinical_summary: { responder_rate: '90%', mcid_rate: '80% expected to reach clinically meaningful threshold', nnt_standard: '12.3', nnt_responder_adjusted: '13.7' },
        heterogeneity_contribution: 1 },
    });
    return JSON.stringify(s);
  });
  await page.evaluate(s => loadProject(s), old);
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ({ wc: AppState.results.crossDisc.winnersCurse, rd: AppState.results.crossDisc.responseDistribution,
    report: generateResultsSection(AppState.results, {}) }));
  expect(got.wc.consensus_estimate).toBeUndefined();
  expect(got.wc.empirical_bayes).toBeUndefined();
  expect(got.wc.conditional_correction).toBeUndefined();
  expect(got.rd.response_rates.P_mcid).toBeUndefined();
  expect(got.rd.clinical_summary.nnt_responder_adjusted).toBeUndefined();
  expect(got.report).not.toContain('Bias-adjusted consensus');
  expect(got.report).toContain('Estimated inflation was 4.2%');
});
