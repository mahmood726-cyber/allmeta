import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'tooltips.js'), 'utf-8');
const GLOSSARY_SRC = readFileSync(join(__dirname, '..', 'glossary.json'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<p>Using <abbr data-gloss="HKSJ">HKSJ</abbr> here and <abbr data-gloss="UNKNOWN_TERM">UT</abbr> here.</p>
<script src="/hub/shared/tooltips.js"></script>
<script>
  window.alm.tooltips({ src: '/hub/shared/glossary.json' });
</script>
</body></html>`;

test.describe('tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/tooltips.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
    await page.route('/hub/shared/glossary.json', route => {
      route.fulfill({ contentType: 'application/json', body: GLOSSARY_SRC });
    });
  });

  test('known term gets aria-describedby and a tooltip element', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => document.querySelector('[data-gloss="HKSJ"]').hasAttribute('aria-describedby'));
    const id = await page.locator('[data-gloss="HKSJ"]').getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const tip = page.locator('#' + id);
    await expect(tip).toHaveAttribute('role', 'tooltip');
    await expect(tip).toContainText(/Hartung-Knapp/);
  });

  test('unknown term falls back to abbr textContent', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => document.querySelector('[data-gloss="UNKNOWN_TERM"]').hasAttribute('aria-describedby'));
    const id = await page.locator('[data-gloss="UNKNOWN_TERM"]').getAttribute('aria-describedby');
    const tip = page.locator('#' + id);
    await expect(tip).toContainText('UT');
  });
});
