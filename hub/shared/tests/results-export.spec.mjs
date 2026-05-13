import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'results-export.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<div id="export-mount"></div>
<script src="/hub/shared/results-export.js"></script>
<script>
  window.alm.resultsExport({
    target: '#export-mount',
    basename: 'demo',
    getResults: () => ({
      pooled_effect: 0.214,
      ci_lb: -0.012,
      ci_ub: 0.440,
      label: '=SUM(A1:A9)',
      studies: [{ id: 'A', y: 0.2 }, { id: 'B', y: -0.1 }],
    }),
  });
</script>
</body></html>`;

test.describe('results-export', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/results-export.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  test('JSON download contains expected payload', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => !!document.querySelector('#export-mount [data-action="json"]'));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-mount [data-action="json"]'),
    ]);
    const filePath = await download.path();
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.pooled_effect).toBe(0.214);
  });

  test('CSV cells starting with = are prefixed with apostrophe', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => !!document.querySelector('#export-mount [data-action="csv"]'));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-mount [data-action="csv"]'),
    ]);
    const filePath = await download.path();
    const text = readFileSync(filePath, 'utf-8');
    expect(text).toMatch(/'=SUM/);
  });

  test('Markdown is pipe-table with expected rows', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => !!document.querySelector('#export-mount [data-action="md"]'));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-mount [data-action="md"]'),
    ]);
    const filePath = await download.path();
    const text = readFileSync(filePath, 'utf-8');
    expect(text).toMatch(/\| key\s*\| value\s*\|/);
    expect(text).toMatch(/\| pooled_effect\s*\| 0\.214\s*\|/);
  });
});
