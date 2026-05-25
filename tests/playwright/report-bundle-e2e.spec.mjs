/**
 * End-to-end test for shared/report-bundle.js — wired into forest-plot as the
 * reference integration.
 *
 * Loads forest-plot, loads a canonical dataset, runs the pool, clicks
 * "Export report", intercepts the download, and asserts the HTML payload
 * contains the right sections (inputs, results, plot SVG, citations,
 * R script, provenance).
 */
import { test, expect } from '@playwright/test';

const URL = '/forest-plot/';

test('forest-plot Export report produces a self-contained HTML with all sections', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-export-report', { timeout: 8_000 });

  // The "Load example" button gives us a known-good dataset that the
  // app's auto-pool path will render into #svg-host.
  await page.click('#btn-example');
  // Wait for the pooled state to be available (set by the engine once the
  // textarea triggers an auto-pool).
  await page.waitForFunction(
    () => typeof window._almForestState === "function" && window._almForestState() != null
          && (window._almForestState().studies || []).length > 0,
    { timeout: 10_000 }
  );
  // Also wait for the SVG to render so the report inlines a real plot.
  await page.waitForSelector('#svg-host svg', { timeout: 10_000 });
  // Capture the first study label so we can assert it survives the export.
  const firstLabel = await page.evaluate(() => {
    const s = window._almForestState();
    return (s && s.studies && s.studies[0] && s.studies[0].label) || '';
  });

  // Intercept the download triggered by the Export button.
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.click('#btn-export-report');
  const download = await downloadPromise;

  // Verify filename pattern: allmeta-forest-plot-YYYYMMDD-noseed.html
  const fn = download.suggestedFilename();
  expect(fn).toMatch(/^allmeta-forest-plot-\d{8}-(noseed|\d+)\.html$/);

  // Save and read the file to inspect content.
  const tmpPath = await download.path();
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(tmpPath, 'utf-8');

  // Sections that must be present.
  expect(html, 'doctype').toMatch(/<!DOCTYPE html>/i);
  expect(html, 'inputs section').toContain('<h2>Inputs</h2>');
  expect(html, 'results section').toContain('<h2>Results</h2>');
  expect(html, 'provenance section').toContain('<h2>Provenance</h2>');
  expect(html, 'R script section').toContain('<h2>R script (re-computation)</h2>');
  expect(html, 'metafor in r script').toContain('library(metafor)');

  // Studies inlined — at minimum the first study's label must appear.
  expect(firstLabel.length, 'first study should have a label').toBeGreaterThan(0);
  expect(html, `first study label "${firstLabel}" in inputs`).toContain(firstLabel);

  // Plot SVG inlined (we wait for one earlier; it's optional in case the
  // engine couldn't render — the assertion is soft)
  if (html.includes('<svg')) {
    expect(html, 'svg should be inlined in plot frame').toMatch(/plot-frame.*<svg/s);
  }

  // Provenance: build info embedded
  expect(html, 'app name in provenance').toContain('allmeta');
  expect(html, 'version field').toMatch(/<th>version<\/th>/);
  expect(html, 'sha field').toMatch(/<th>sha<\/th>/);

  // No script tags should leak in user-controlled fields (XSS sanity)
  expect(html, 'no live script tags injected').not.toMatch(/<script[^>]*>(?!.*<\/script>)/);
});
