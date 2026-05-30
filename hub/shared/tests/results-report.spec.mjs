/**
 * Regression for the Methods + Results prose report added to results-export.js:
 * every app wiring alm.resultsExport now offers a readable .md/.txt report that
 * pulls the app's own Methods copy (title/description/footer) and formats the
 * computed results beneath it.
 */
import { test, expect } from '@playwright/test';

const APPS = ['forest-plot', 'heterogeneity', 'pubbias-tests'];

for (const app of APPS) {
  test(`methods+results report downloads with both sections — ${app}`, async ({ page }) => {
    await page.goto('http://localhost:8088/' + app + '/index.html', { waitUntil: 'load' });
    for (const sel of ['#btn-run', '#btn-example']) { const b = await page.$(sel); if (b) await b.click().catch(() => {}); }
    await page.waitForTimeout(1200);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.click('.alm-export button:has-text("Methods+Results")'),
    ]);
    expect(dl.suggestedFilename()).toMatch(/report\.md$/);
    const fs = await import('fs');
    const txt = fs.readFileSync(await dl.path(), 'utf-8');
    expect(txt, 'has Methods section').toMatch(/## Methods/);
    expect(txt, 'has Results section').toMatch(/## Results/);
    expect(txt, 'has a generated date').toMatch(/Generated \d{4}-\d{2}-\d{2}/);
    expect(txt.length, 'non-trivial content').toBeGreaterThan(200);
  });
}
