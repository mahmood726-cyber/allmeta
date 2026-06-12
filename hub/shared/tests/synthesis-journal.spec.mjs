/**
 * synthesis-journal — renders an allmeta review as a Synthēsis journal article
 * (browser port of the synthesis-paper-spec/metapaper STANDARD). Checks the
 * standard's structural elements render, the figure/table come from the data,
 * the demo banner is honest, and a live bus drives the numbers (truth-first).
 *
 * Host: synthesis-journal/index.html (loads ma-studies / ma-pooled / ma-core).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/synthesis-journal/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon/;

test('renders the Synthēsis standard from demo data, no errors', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => { if (!BENIGN.test(e.message)) errs.push(e.message); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('h1.title').length > 0, { timeout: 10000 });

  // real, non-empty <h1> (also satisfies the app-smoke contract)
  const h1 = (await page.locator('h1.title').first().textContent() || '').trim();
  expect(h1.length).toBeGreaterThan(0);

  // the standard's structural elements
  await expect(page.locator('.letterhead .wordmark')).toHaveText('Synthēsis');
  await expect(page.locator('.abstract h2')).toHaveText('Abstract');
  await expect(page.locator('.keyfinding .stmt')).toContainText('95% CI');
  await expect(page.locator('figure.fig svg')).toHaveCount(1);
  await expect(page.locator('table.booktabs')).toHaveCount(1);
  await expect(page.locator('.howtocite h3')).toContainText('How to cite');
  await expect(page.locator('.oa')).toContainText('CC BY 4.0');

  // no live data -> honest demo banner
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#demoBanner')).toContainText('DEMO');

  // forest figure has one red pooled diamond + the study squares
  const polys = await page.locator('figure.fig svg polygon[fill="#9c2b27"]').count();
  expect(polys).toBe(1);
  const squares = await page.locator('figure.fig svg rect[fill="#054f16"]').count();
  expect(squares).toBeGreaterThan(1);

  expect(errs, 'no console/page errors').toEqual([]);
});

test('a live synthesis bus drives the numbers, demo banner disappears', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.MaStudies && !!window.MaPooled, { timeout: 10000 });

  // seed the cross-tool buses the way the pipeline apps would
  await page.evaluate(() => {
    localStorage.setItem('ma-studies-v1', JSON.stringify({ _schema: 'ma-studies-v1', studies: [
      { label: 'Trial A', est: -0.22, se: 0.08 }, { label: 'Trial B', est: -0.16, se: 0.07 },
      { label: 'Trial C', est: -0.30, se: 0.10 }, { label: 'Trial D', est: -0.11, se: 0.09 },
    ] }));
    // fromEstSE takes the LOG estimate for ratio scale -> pointEstimate = exp(log 0.83) = 0.83
    window.MaPooled.write(window.MaPooled.fromEstSE(Math.log(0.83), 0.05, { scale: 'ratio', measure: 'HR', k: 4, label: 'All-cause mortality' }));
  });
  await page.locator('#btnRefresh').click();

  // demo banner gone; title comes from the pooled label; k=4 studies in the table
  await expect(page.locator('#demoBanner')).toBeHidden();
  await expect(page.locator('h1.title')).toHaveText('All-cause mortality');
  await expect(page.locator('table.booktabs tbody tr')).toHaveCount(4);
  // pooled HR read verbatim from the bus (0.83), not re-pooled
  await expect(page.locator('.keyfinding .stmt')).toContainText('0.83');
});
