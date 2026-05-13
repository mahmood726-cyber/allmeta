import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'axis-controls.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<div id="axis-mount"></div>
<script src="/hub/shared/axis-controls.js"></script>
<script>
  window._last = null;
  window.alm.axisControls({
    target: '#axis-mount',
    axes: [{ key: 'x', label: 'X', range: [0, 10], log: false },
           { key: 'y', label: 'Y', range: [-1, 1], log: false }],
    onChange: (state) => { window._last = state; },
  });
</script>
</body></html>`;

test.describe('axis-controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/axis-controls.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  test('emits change with new range when user edits min', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => window.alm && window.alm.axisControls);

    const minInput = page.locator('#axis-mount input[data-axis="x"][data-edge="min"]');
    await minInput.fill('2');
    await minInput.press('Tab');

    const last = await page.evaluate(() => window._last);
    expect(last).not.toBeNull();
    expect(last.x).toEqual([2, 10]);
  });

  test('rejects min >= max with inline error', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => window.alm && window.alm.axisControls);

    const minInput = page.locator('#axis-mount input[data-axis="x"][data-edge="min"]');
    await minInput.fill('99');
    await minInput.press('Tab');

    const errorEl = page.locator('#axis-mount [data-error]');
    const errorText = await errorEl.textContent();
    expect(errorText).toMatch(/min.*max/i);
  });

  test('log toggle emits xLog: true', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => window.alm && window.alm.axisControls);

    const logCheckbox = page.locator('#axis-mount input[data-axis="x"][data-edge="log"]');
    await logCheckbox.check();

    const last = await page.evaluate(() => window._last);
    expect(last).not.toBeNull();
    expect(last.xLog).toBe(true);
  });
});
