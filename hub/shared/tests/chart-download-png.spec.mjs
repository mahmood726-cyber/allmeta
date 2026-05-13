import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'chart-download.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<svg id="chart" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="30" fill="#14532d"/>
</svg>
<div id="dl-mount"></div>
<script src="/hub/shared/chart-download.js"></script>
<script>
  window.alm.chartDownload({ target: '#dl-mount', getSvg: () => document.querySelector('#chart'), basename: 'chart' });
</script>
</body></html>`;

test.describe('chart-download PNG', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/chart-download.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  test('PNG button produces a valid PNG (magic bytes)', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => !!document.querySelector('#dl-mount button[data-fmt="png"]'));
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.click('#dl-mount button[data-fmt="png"]'),
    ]);
    const buf = readFileSync(await download.path());
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect([...buf.slice(0, 8)]).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  });
});
