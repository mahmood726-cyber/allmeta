import { test, expect } from '@playwright/test';

// Requirement: once runAnalysis has run, the Cross-Disciplinary and Code Export panels show what
// the engine rendered from AppState.results (renderCrossDisciplinaryPanel / renderCodePanel via
// onTabActivate) and nothing rewrites them on a later timer.
// Regression for the same race class as #543: a page wrapper ran updateCrossDisciplinary() and
// updateCodePanel() from setTimeout(..., 500) after every run. A user who opened either tab
// within 0.5 s of Run (or stayed on it) saw the engine's panel replaced by hard-coded
// "illustrative" cards (Cost per QALY = |theta| * 10000, Cohen's d = |theta|, Hedges' g =
// 0.95 * theta) and a REML-only R script that ignored the chosen tau2 method; opening the tab
// later showed the engine's panel again, so what the user saw depended on timing.
// In TruthCert Pairwise Pro (Truthcert1, engine app.min.js) the engine never renders these two
// tabs, so there the wrapper's cards are the only content: they must be painted when the result
// is published, not half a second later.
// After Run the fake clock runs only the engine's own 50 ms analysis timer, then every later timer.
const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html', false],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html', true],
  ['Pairwise AI dist', '/Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html', true],
  ['Pairwise AI fast', '/Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html', true],
  ['Pairwise AI min', '/Pairwiseai/TruthCert-PairwisePro-v1.0-min.html', true],
];
for (const [name, path, engineRendersPanels] of PAGES) {
  test(`${name}: cross-disciplinary and code panels are not rewritten after Run`, async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    page.on('dialog', d => d.dismiss());
    // Fake every timer from the start, so no real-time timer can fire between steps.
    await page.clock.install();
    await page.goto(path, { waitUntil: 'load' });
    await page.clock.runFor(2000);
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await page.clock.runFor(2000);
    // Mark both panels, so a panel still showing an earlier paint (or nothing new) is detected.
    await page.evaluate(() => ['crossdisciplinary', 'code'].forEach(t => {
      document.getElementById('panel-' + t).innerHTML = '<div class="card"><div class="card__body">STALE-' + t + '</div></div>';
    }));
    await page.evaluate(() => { window.__prevResults = AppState.results; });
    await page.locator('#runAnalysisBtn').click();
    // Wait (in 5 ms fake-clock steps, at most 2 s) for THIS run's result: part of the analysis may complete
    // outside the page's timers (e.g. a worker message), and the demo load may already have published one.
    let fresh = false;
    const isFresh = () => page.evaluate(() => !!(AppState.results && AppState.results.pooled && AppState.results !== window.__prevResults));
    for (let i = 0; i < 400 && !fresh; i++) {
      // give out-of-timer work real time first, so fake time advances only as far as the page's own timers need
      for (let j = 0; j < 10 && !(fresh = await isFresh()); j++) await new Promise(r => setTimeout(r, 20));
      if (!fresh) { await page.clock.runFor(5); fresh = await isFresh(); }
    }
    expect(fresh, 'this run published a result').toBe(true);
    const shown = {};
    for (const tab of ['crossdisciplinary', 'code']) {
      await page.evaluate(t => document.querySelector(`.tab-btn[data-tab="${t}"]`).click(), tab);
      await page.clock.runFor(150);  // renderCrossDisciplinaryPanel draws its orchard plot on a 100 ms timer
      shown[tab] = await page.evaluate(t => document.getElementById('panel-' + t).innerHTML, tab);
      expect(shown[tab], `panel-${tab} not painted when the result was published`).not.toContain('STALE-');
      expect(shown[tab].length).toBeGreaterThan(200);
    }
    if (engineRendersPanels) expect(shown.crossdisciplinary).not.toContain('Illustrative estimate');
    else expect(shown.code).toContain('library(metafor)');
    // Let every deferred timer fire; neither panel may change underneath the user.
    await page.clock.runFor(3000);
    for (const tab of ['crossdisciplinary', 'code']) {
      const now = await page.evaluate(t => document.getElementById('panel-' + t).innerHTML, tab);
      expect(now, `panel-${tab} rewritten after Run`).toBe(shown[tab]);
    }
  });
}
