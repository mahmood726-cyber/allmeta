import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'csv-upload.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<div id="csv-mount"></div>
<script src="/hub/shared/csv-upload.js"></script>
<script>
  window._lastParse = null;
  window.alm.csvUpload({
    target: '#csv-mount',
    columns: [
      { name: 'study', required: true },
      { name: 'yi', required: true, type: 'float' },
      { name: 'vi', required: true, type: 'float' },
    ],
    onParse: (data) => { window._lastParse = data; },
  });
${'<'}/script>
</body></html>`;

test.describe('csv-upload UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/csv-upload.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.alm !== 'undefined');
  });

  // ------------------------------------------------------------------ T1
  test('renders file input + paste textarea + format panel', async ({ page }) => {
    await expect(page.locator('#csv-mount input[type="file"]')).toHaveCount(1);
    await expect(page.locator('#csv-mount textarea')).toHaveCount(1);
    await expect(page.locator('#csv-mount [data-section="format"]')).toBeVisible();
  });

  // ------------------------------------------------------------------ T2
  test('paste triggers onParse', async ({ page }) => {
    await page.fill('#csv-mount textarea', 'study,yi,vi\nA,0.2,0.04\nB,-0.1,0.03');
    await page.click('[data-action="parse-paste"]');
    const rowCount = await page.evaluate(() => window._lastParse && window._lastParse.rows.length);
    expect(rowCount).toBe(2);
  });

  // ------------------------------------------------------------------ T3
  test('download sample button produces a valid CSV', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-action="sample"]'),
    ]);
    const path = await download.path();
    const firstLine = readFileSync(path, 'utf-8').split(/\r?\n/)[0];
    expect(firstLine).toMatch(/^study,yi,vi$/);
  });
});
