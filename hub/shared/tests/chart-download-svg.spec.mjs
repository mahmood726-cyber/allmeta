import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'chart-download.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<style>.lbl{font-family:Helvetica;font-size:12px}</style>
<svg id="chart" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="30" fill="#dcfce7" stroke="#14532d"/>
  <text class="lbl" x="50" y="48" text-anchor="middle">long axis label</text>
</svg>
<div id="dl-mount"></div>
<script src="/hub/shared/chart-download.js"></script>
<script>
  window.alm.chartDownload({
    target: '#dl-mount',
    getSvg: () => document.querySelector('#chart'),
    basename: 'chart',
  });
</script>
</body></html>`;

test.describe('chart-download SVG path', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/chart-download.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    // Wait until the buttons are rendered
    await page.waitForSelector('#dl-mount button[data-fmt="svg"]');
  });

  test('renders 3 buttons (png, svg, pdf)', async ({ page }) => {
    const png = page.locator('#dl-mount button[data-fmt="png"]');
    const svg = page.locator('#dl-mount button[data-fmt="svg"]');
    const pdf = page.locator('#dl-mount button[data-fmt="pdf"]');
    await expect(png).toBeVisible();
    await expect(svg).toBeVisible();
    await expect(pdf).toBeVisible();
  });

  test('SVG download expands viewBox by 12px on every side', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dl-mount button[data-fmt="svg"]'),
    ]);
    const path = await download.path();
    const content = readFileSync(path, 'utf-8');
    // Original viewBox="0 0 100 50" => -12 -12 124 74
    expect(content).toMatch(/viewBox="-12\s+-12\s+124\s+74"/);
  });

  test('SVG download inlines external font-family from page CSS', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dl-mount button[data-fmt="svg"]'),
    ]);
    const path = await download.path();
    const content = readFileSync(path, 'utf-8');
    // The .lbl class has font-family:Helvetica — should be inlined on <text>
    expect(content).toMatch(/<text[^>]*style="[^"]*font-family[^"]*Helvetica/);
  });
});
