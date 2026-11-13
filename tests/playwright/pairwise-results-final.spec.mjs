import { test, expect } from '@playwright/test';

// Requirement: once runAnalysis publishes AppState.results, that object is FINAL.
// Nothing may rewrite it on a later timer, otherwise a project saved at that moment
// stores a different result from the one the screen shows a moment later.
// Regression for the intermittent failure at flagship-plot-rendering.spec.mjs:78
// (saved.results != before, differing only in `metaoverfit`).
// The fake clock runs only the engine's own 50 ms analysis timer, which is what a fast
// CI runner does: the result is observed before any later timer has fired.
for (const [name, path] of [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
]) {
  test(`${name}: published analysis result is final, so an immediate save matches it`, async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    page.on('dialog', d => d.dismiss());
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await page.clock.install();
    // install() alone lets fake timers keep firing in real time; pause so only runFor advances it.
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await page.locator('#runAnalysisBtn').click();
    await page.clock.runFor(100);
    const first = await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)));
    expect(first.pooled).toBeTruthy();
    // The metaoverfit assessment is part of the published result, not a later patch.
    expect(first.metaoverfit.skipped).toBeUndefined();
    expect(first.metaoverfit.k).toBe(first.k);
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(saveProject().results)));
    expect(saved).toEqual(first);
    // Let every deferred timer fire; the result must not change underneath the save.
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)))).toEqual(first);
  });
}
