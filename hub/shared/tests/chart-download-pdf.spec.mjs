import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://localhost:8088').replace(/\/+$/, '');

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'chart-download.js'), 'utf-8');
const JSPDF_SRC = readFileSync(join(__dirname, '..', 'vendor', 'jspdf.min.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<svg id="chart" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="30" fill="#14532d"/>
</svg>
<div id="dl-mount"></div>
<script src="/hub/shared/vendor/jspdf.min.js"></script>
<script src="/hub/shared/chart-download.js"></script>
<script>
  window.alm.chartDownload({ target: '#dl-mount', getSvg: () => document.querySelector('#chart'), basename: 'chart' });
</script>
</body></html>`;

test.describe('chart-download PDF', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/chart-download.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
    await page.route('/hub/shared/vendor/jspdf.min.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: JSPDF_SRC });
    });
  });

  test('PDF button produces a valid PDF (magic bytes %PDF-)', async ({ page }) => {
    await page.goto(ALM_BASE_URL + '/');
    await page.setContent(HARNESS, { baseURL: ALM_BASE_URL + '/' });
    await page.waitForFunction(() => typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined');
    await page.waitForFunction(() => !!document.querySelector('#dl-mount button[data-fmt="pdf"]'));
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.click('#dl-mount button[data-fmt="pdf"]'),
    ]);
    const buf = readFileSync(await download.path());
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
