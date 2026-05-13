import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'csv-upload.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<script src="/hub/shared/csv-upload.js"></script>
<script>
  window._parse = (txt, cols) => window.alm.csvUpload.parse(txt, cols || []);
</script>
</body></html>`;

test.describe('csv-upload parser', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/csv-upload.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  // ------------------------------------------------------------------ T1
  test('parses simple CSV', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window._parse === 'function');

    const result = await page.evaluate(() =>
      window._parse(
        'study,yi,vi\nA,0.2,0.04\nB,-0.1,0.03',
        [{ name: 'study' }, { name: 'yi', type: 'float' }, { name: 'vi', type: 'float' }]
      )
    );

    expect(result.headers).toEqual(['study', 'yi', 'vi']);
    expect(result.rows).toEqual([
      { study: 'A', yi: 0.2, vi: 0.04 },
      { study: 'B', yi: -0.1, vi: 0.03 },
    ]);
    expect(result.warnings).toEqual([]);
  });

  // ------------------------------------------------------------------ T2
  test('handles quoted commas and embedded newlines', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window._parse === 'function');

    const result = await page.evaluate(() =>
      window._parse('label,note\n"Smith, 2024","line1\nline2"', [])
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe('Smith, 2024');
    expect(result.rows[0].note).toBe('line1\nline2');
  });

  // ------------------------------------------------------------------ T3
  test('handles doubled quotes inside quoted field', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window._parse === 'function');

    const result = await page.evaluate(() =>
      window._parse('q\n"He said ""hi"""', [{ name: 'q' }])
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].q).toBe('He said "hi"');
  });

  // ------------------------------------------------------------------ T4
  test('fuzzy column mapping warns on typo', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window._parse === 'function');

    const result = await page.evaluate(() =>
      window._parse('stody,yi\nA,0.2', [{ name: 'study' }, { name: 'yi', type: 'float' }])
    );

    // Row must expose the canonical mapped name, not the typo.
    expect(result.rows[0].study).toBe('A');
    expect(result.rows[0].yi).toBe(0.2);

    // At least one warning must mention both the typo and the canonical name.
    const hasWarn = result.warnings.some(w => /stody.*study/i.test(w));
    expect(hasWarn).toBe(true);
  });

  // ------------------------------------------------------------------ T5
  test('int validation warning on non-integer value', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window._parse === 'function');

    const result = await page.evaluate(() =>
      window._parse('n\n3\n4.5', [{ name: 'n', type: 'int' }])
    );

    const hasIntWarn = result.warnings.some(w => /int/i.test(w));
    expect(hasIntWarn).toBe(true);
  });
});
