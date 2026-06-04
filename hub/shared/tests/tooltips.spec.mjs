import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'tooltips.js'), 'utf-8');
const GLOSSARY_SRC = readFileSync(join(__dirname, '..', 'glossary.json'), 'utf-8');
const GLOSSARY_ES = readFileSync(join(__dirname, '..', 'glossary.es.json'), 'utf-8');
const GLOSSARY_AR = readFileSync(join(__dirname, '..', 'glossary.ar.json'), 'utf-8');
const GLOSSARY_ZH = readFileSync(join(__dirname, '..', 'glossary.zh.json'), 'utf-8');

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

// Multi-language method help: machine-translated glossaries (ES/AR/ZH) with a
// per-language disclaimer, RTL for Arabic, persistence, and English fallback.
test.describe('tooltips i18n', () => {
  // Build a harness that optionally pre-seeds the stored language before init.
  const harnessFor = (storedLang) => `
<!doctype html><html><body>
<p>Using <abbr data-gloss="HKSJ">HKSJ</abbr> here.</p>
<script src="/hub/shared/tooltips.js"></script>
<script>
  ${storedLang ? `try{localStorage.setItem('alm-lang','${storedLang}');}catch(e){}` : ''}
  window.alm.tooltips({ src: '/hub/shared/glossary.json' });
</script>
</body></html>`;

  const routeAll = async (page, { esStatus = 200 } = {}) => {
    await page.route('/hub/shared/tooltips.js', r =>
      r.fulfill({ contentType: 'application/javascript', body: MODULE_SRC }));
    await page.route('/hub/shared/glossary.json', r =>
      r.fulfill({ contentType: 'application/json', body: GLOSSARY_SRC }));
    await page.route('/hub/shared/glossary.es.json', r =>
      esStatus === 200
        ? r.fulfill({ contentType: 'application/json', body: GLOSSARY_ES })
        : r.fulfill({ status: esStatus, contentType: 'text/plain', body: 'not found' }));
    await page.route('/hub/shared/glossary.ar.json', r =>
      r.fulfill({ contentType: 'application/json', body: GLOSSARY_AR }));
    await page.route('/hub/shared/glossary.zh.json', r =>
      r.fulfill({ contentType: 'application/json', body: GLOSSARY_ZH }));
  };

  const tipText = async (page) => {
    await page.waitForFunction(() => document.querySelector('[data-gloss="HKSJ"]').hasAttribute('aria-describedby'));
    const id = await page.locator('[data-gloss="HKSJ"]').getAttribute('aria-describedby');
    return { id, tip: page.locator('#' + id) };
  };

  test('language switcher is injected where glossary terms exist', async ({ page }) => {
    await routeAll(page);
    await page.goto('http://localhost:8088/');
    await page.setContent(harnessFor(), { baseURL: 'http://localhost:8088/' });
    const sel = page.locator('.alm-lang-switch select');
    await expect(sel).toBeVisible();
    await expect(sel.locator('option')).toHaveCount(4); // en/es/ar/zh
  });

  test('switching to Spanish loads es glossary and shows the disclaimer', async ({ page }) => {
    await routeAll(page);
    await page.goto('http://localhost:8088/');
    await page.setContent(harnessFor(), { baseURL: 'http://localhost:8088/' });
    const { tip } = await tipText(page);
    await page.evaluate(() => window.alm.tooltips.setLang('es'));
    await expect(tip).toContainText('Corrección de varianza');
    await expect(tip).toContainText('Traducción automática');
  });

  test('Arabic sets dir=rtl on the tooltip and shows the Arabic disclaimer', async ({ page }) => {
    await routeAll(page);
    await page.goto('http://localhost:8088/');
    await page.setContent(harnessFor(), { baseURL: 'http://localhost:8088/' });
    const { tip } = await tipText(page);
    await page.evaluate(() => window.alm.tooltips.setLang('ar'));
    await expect(tip).toHaveAttribute('dir', 'rtl');
    await expect(tip).toContainText('ترجمة آلية');
  });

  test('stored language (zh) is applied on load', async ({ page }) => {
    await routeAll(page);
    await page.goto('http://localhost:8088/');
    await page.setContent(harnessFor('zh'), { baseURL: 'http://localhost:8088/' });
    const { tip } = await tipText(page);
    await expect(tip).toContainText('机器翻译'); // disclaimer
  });

  test('missing translation falls back to authoritative English', async ({ page }) => {
    await routeAll(page, { esStatus: 404 });
    await page.goto('http://localhost:8088/');
    await page.setContent(harnessFor(), { baseURL: 'http://localhost:8088/' });
    const { tip } = await tipText(page);
    await page.evaluate(() => window.alm.tooltips.setLang('es'));
    await expect(tip).toContainText('variance correction'); // English long text
    await expect(tip).not.toContainText('Traducción'); // no machine-translation disclaimer
  });
});
