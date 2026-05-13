import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(
  join(__dirname, '..', 'url-state.js'),
  'utf-8'
);

const HARNESS = `
<!doctype html><html><body>
<script src="/hub/shared/url-state.js"></script>
<script>
  window.alm.urlState({ version: 1 });
  window.writeState = (s) => window.alm.urlState.write(s);
  window.readState = () => window.alm.urlState.read();
</script>
</body></html>`;

test.describe('url-state', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/url-state.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  test('roundtrip small state', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.writeState === 'function');
    await page.evaluate(() => window.writeState({ foo: 'bar', n: 42 }));
    const got = await page.evaluate(() => window.readState());
    expect(got).toEqual({ foo: 'bar', n: 42 });
  });

  test('version mismatch returns null', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.readState === 'function');
    await page.evaluate(() => {
      const blob = btoa(JSON.stringify({ v: 99, foo: 'x' }));
      window.location.hash = blob;
    });
    const got = await page.evaluate(() => window.readState());
    expect(got).toBeNull();
  });

  test('over-size emits warning', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.writeState === 'function');
    const warnings = [];
    page.on('console', msg => { if (msg.type() === 'warning') warnings.push(msg.text()); });
    await page.evaluate(() => {
      const big = { blob: 'x'.repeat(6000) };  // > 4 KB
      window.writeState(big);
    });
    expect(warnings.some(w => /too long/i.test(w))).toBe(true);
  });
});
