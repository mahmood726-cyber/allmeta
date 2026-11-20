import { test, expect } from '@playwright/test';

// Requirement: the TruthCert verdict (AppState.truthcert, which saveProject also saves) belongs to
// the analysis result it sits next to, from the moment that result is published. It used to be
// filled in by a 1000 ms timer after Run, so a project saved inside that window stored no verdict
// (first run) or the PREVIOUS run's verdict beside the new results (rerun).
// The fake clock runs only the engine's own 50 ms analysis timer, i.e. what a user or a fast CI
// runner can do before any later timer has fired.
const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
  ['Pairwise AI dist', '/Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html'],
  ['Pairwise AI fast', '/Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html'],
  ['Pairwise AI min', '/Pairwiseai/TruthCert-PairwisePro-v1.0-min.html'],
];
// The verdict's per-study rows must be the rows this result was computed from (events too, not
// only yi): runTruthCertAnalysis reads AppState.studies, a cache of the table refreshed by a
// 150 ms debounce, so a Run right after loading/editing data must not pair old rows with new results.
function expectSameStudies(snapshot) {
  const rows = snapshot.truthcert.results.studies, used = snapshot.results.studies;
  expect(rows.length).toBe(used.length);
  rows.forEach((row, i) => {
    for (const key of ['yi', 'events_t', 'events_c', 'n_t', 'n_c']) expect(row[key], `study ${i} ${key}`).toBe(used[i][key]);
  });
}
const snap = page => page.evaluate(() => JSON.parse(JSON.stringify({ results: AppState.results, truthcert: AppState.truthcert })));

async function runOnce(page) {
  await page.locator('#runAnalysisBtn').click();
  await page.clock.runFor(100);
  return snap(page);
}

for (const [name, path] of PAGES) {
  test(`${name}: TruthCert verdict is published with the result it describes`, async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    page.on('dialog', d => d.dismiss());
    await page.goto(path, { waitUntil: 'load' });
    // Freeze time BEFORE loading data: install() alone lets fake timers keep firing in real time.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));

    // First run: the verdict must already exist and describe this result.
    const first = await runOnce(page);
    expect(first.results.pooled).toBeTruthy();
    expect(first.truthcert, 'no verdict at publication').toBeTruthy();
    expect(first.truthcert.results.theta).toBe(first.results.pooled.theta);
    expect(first.truthcert.results.k).toBe(first.results.k);
    expectSameStudies(first);
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(saveProject())));
    expect(saved.truthcert).toEqual(first.truthcert);
    // No later timer may rewrite it underneath the save.
    await page.clock.runFor(3000);
    expect(await snap(page)).toEqual(first);

    // Rerun on different data: the published verdict must be the new one, never the previous run's.
    await page.evaluate(() => loadDemoDataset('SGLT2_HFH'));
    const second = await runOnce(page);
    expect(second.results.pooled.theta).not.toBe(first.results.pooled.theta);
    expect(second.truthcert.results.theta).toBe(second.results.pooled.theta);
    expect(second.truthcert.results.k).toBe(second.results.k);
    expectSameStudies(second);
    await page.clock.runFor(3000);
    expect(await snap(page)).toEqual(second);
  });
}
