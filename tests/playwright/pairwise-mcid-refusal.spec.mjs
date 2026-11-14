import { test, expect } from '@playwright/test';

// Requirement: the served Pairwise AI bundle shows no probability, sensitivity table or decision that
// depends on a minimal clinically important difference (MCID), because the page has no MCID input and
// the engine's MCID was a constant 0.15 (CONFIG.DEFAULT_MCID / `mcid = .15` defaults) applied on
// whatever scale the measure has: 0.15 on the log-OR scale is a 14% relative change, 0.15 on a mean
// difference in mmHg is 0.15 mmHg. Where such a number used to be, the page must say it is not computed
// and why (lane pwrest, follow-up to #566).
// Defects guarded:
//  - DDMA tab: runAnalysis does not compute the decision engine (ddma/decision/mcid_sens are stubs), and
//    renderDDMAPanel filled the gaps with defaults, so every run showed P(Benefit) 50.0%, P(Harm) 50.0%,
//    P(Exceeds MCID) 50.0% and a decision badge "UNDEFINED"; the "Compute DDMA" button called an
//    undefined function.
//  - Analysis tab (Bayesian on) and the full-MCMC card: "P(>MCID | Data)" / "P(clinically meaningful)"
//    were P(mu < -0.15) on any scale.
//  - Code tab: the R / Python / Stata exports printed P(exceeds MCID) at 0.15 and an MCID sensitivity
//    table labelled as "% reduction" (log-ratio labels) even for a mean difference.
//  - Report: Methods said the MCID "was set at a 15% relative change".

const PATH = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';

async function run(page, demo, before) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function');
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(300);
  if (before) await page.evaluate(before);
  await page.evaluate(() => { window.__prev = AppState.results; });
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev,
    null, { timeout: 60000 });
  return errors;
}

const NO_MCID_NUMBER = [/P\(Exceeds MCID\)\s*[\d.]+%/, /P\(>MCID[^)]*\)\s*[\d.]+%/, /P\(clinically meaningful\):?\s*[\d.]+%/,
  /P\(Large Benefit\)\s*[\d.]+%/, /exceeds N\/A% threshold/];

for (const demo of ['BP_REDUCTION', 'SGLT2_ACM']) {
  test(`${demo}: DDMA tab shows no invented probability or decision, and says what is not computed`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = await run(page, demo);
    const got = await page.evaluate(() => {
      renderDDMAPanel(AppState.results);
      const before = document.getElementById('panel-ddma').innerText;
      let threw = null;
      try { computeDDMA(); } catch (e) { threw = String(e); }
      return { before, after: document.getElementById('panel-ddma').innerText, threw, measure: AppState.results.measure };
    });
    expect(got.threw, 'Compute DDMA button handler').toBeNull();
    for (const txt of [got.before, got.after]) {
      for (const re of NO_MCID_NUMBER) expect(txt).not.toMatch(re);
      expect(txt, 'a stub was shown as 50%').not.toMatch(/50\.0%/);
      expect(txt).not.toContain('UNDEFINED');
      expect(txt).toContain('Not computed');
      expect(txt).toContain('MCID');
      expect(txt).toContain(got.measure);
    }
    expect(errors).toEqual([]);
  });
}

test('MD: R, Python and Stata exports compute no MCID probability or MCID table', async ({ page }) => {
  test.setTimeout(90000);
  await run(page, 'BP_REDUCTION');
  const got = await page.evaluate(() => {
    const e = AppState.results;
    return { r: generateRCode(e, { method: AppState.settings.tau2Method, hksj: AppState.settings.hksj }),
      py: generatePythonCode(e), st: generateStataCode(e),
      panel: (renderCodePanel(e), document.getElementById('panel-code').innerText) };
  });
  for (const [name, code] of Object.entries(got)) {
    expect(code, name).not.toMatch(/P_mcid\s*(<-|=)/);
    expect(code, name).not.toMatch(/local P_mcid/);
    expect(code, name).not.toMatch(/mcid_values\s*<-/);
    expect(code, name).not.toMatch(/P_large\s*<-/);
    expect(code, name).not.toContain('P(exceeds MCID');
  }
  expect(got.r).toContain('not computed');
  expect(got.r).toContain('MCID');
});

test('Bayesian summaries (analysis tab and full MCMC) show no P(> MCID)', async ({ page }) => {
  test.setTimeout(120000);
  await run(page, 'BP_REDUCTION', () => { AppState.settings.bayesian = true; });
  const got = await page.evaluate(() => {
    const r = AppState.results;
    const res = fullMCMCBayesianMA(r.studies.map(s => s.yi), r.studies.map(s => s.vi),
      { chains: 2, iterations: 1500, burnin: 500, thin: 1, tau2_prior: 'half_cauchy', tau2_scale: 1 });
    displayFullMCMCResults(res);
    renderAnalysisPanel(r);
    return { bayes: !!(r.bayesian && r.bayesian.summary), ddma: r.bayesian && r.bayesian.summary && r.bayesian.summary.ddma,
      analysis: document.getElementById('panel-analysis').textContent,
      full: document.getElementById('fullMCMCResults') ? document.getElementById('fullMCMCResults').innerText : null,
      fullDdma: res.summary.ddma };
  });
  expect(got.bayes, 'Bayesian analysis ran').toBe(true);
  expect(got.ddma.P_mcid ?? null).toBeNull();
  expect(got.fullDdma.P_mcid ?? null).toBeNull();
  for (const txt of [got.analysis, got.full]) {
    if (txt === null) continue;
    for (const re of NO_MCID_NUMBER) expect(txt).not.toMatch(re);
  }
  expect(got.analysis).toContain('P(Benefit | Data)');
  expect(got.analysis).toMatch(/not computed/i);
});

test('Report methods and results do not claim an MCID', async ({ page }) => {
  test.setTimeout(90000);
  await run(page, 'BP_REDUCTION');
  const got = await page.evaluate(() => {
    const o = {};
    for (const length of ['standard', 'extended']) {
      const t = { length, sections: { methods: true, results: true, ddma: true } };
      o['methods_' + length] = generateMethodsSection(AppState.results, t);
    }
    o.results = generateResultsSection(AppState.results, { length: 'extended', sections: { results: true, ddma: true } });
    return o;
  });
  for (const t of [got.methods_standard, got.methods_extended]) {
    expect(t).not.toMatch(/MCID\) threshold was set/);
    expect(t).not.toMatch(/relative change/);
    expect(t).not.toMatch(/We calculated posterior probabilities of clinically meaningful effects/);
  }
  expect(got.methods_extended).toMatch(/not computed/);
  // the DDMA paragraph printed "was N/A%" for a probability the run never computed
  expect(got.results).not.toContain('Decision-Driven Analysis');
  expect(got.results).not.toMatch(/beneficial effect[^.]*N\/A%/);
  expect(got.results).not.toMatch(/minimum clinically important difference was/);
});
