/**
 * Reproducible-R download (P1-8): shared/webr-runner.js buildReproScript() emits a clean,
 * runnable metafor script that reproduces the app's pooled estimate. The "Verify in R"
 * modal now offers it as a downloadable .R. CI checks the SCRIPT STRUCTURE + data
 * (deterministic, no R at runtime); the numeric round-trip (running the script in metafor
 * → matches ma-core to ~1e-7) is verified locally.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/forest-plot/index.html'; // loads webr-runner
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('buildReproScript emits a well-formed, data-faithful metafor script', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const s = await page.evaluate(() => window.AlmWebR.buildReproScript(
    [{ est: 0.10, se: 0.20, label: 'A' }, { est: 0.30, se: 0.25, label: 'B' }, { est: 0.50, se: 0.18, label: 'C' }],
    'REML', 'z'));
  expect(s).toContain('library(metafor)');
  expect(s).toContain('rma(yi = yi, sei = sei, method = "REML", test = "z"');
  expect(s).toMatch(/yi\s*=\s*c\(0\.1, 0\.3, 0\.5\)/);
  expect(s).toMatch(/sei\s*=\s*c\(0\.2, 0\.25, 0\.18\)/);
  expect(s).toContain('study = c("A", "B", "C")');
  expect(s).toContain('predict(res)');
  expect(s).toContain('confint(res)');
  expect(s).toContain('forest(res)');
  expect(errs, 'no console errors').toEqual([]);
});
