/**
 * prospero-templater behavior spec.
 *
 * The PROSPERO templater is a standalone 39-field form → live preview +
 * Markdown export + localStorage autosave. No numeric engine, so this is a
 * behavior spec (not R-parity): it verifies the form→preview→export pipeline
 * and the state hook window.__almProspero() that other tooling reads.
 *
 * Run from hub/shared/tests/:  npx playwright test prospero-templater-behavior.spec.mjs
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/prospero-templater/';
const N_FIELDS = 39;

// Benign console noise: the frame-ancestors-via-meta CSP warning, dev-server
// connection refusals, and the /favicon.ico 404 the full browser fetches (the
// CI headless shell does not request it).
const benign = (t) =>
  (t.includes('frame-ancestors') && t.includes('Content Security Policy')) ||
  t.includes('ERR_CONNECTION_REFUSED') ||
  t.includes('favicon.ico') ||
  t.includes('Failed to load resource');

async function ready(page) {
  await page.waitForFunction(() => typeof window.__almProspero === 'function', { timeout: 10_000 });
}

test.describe('prospero-templater', () => {

  test('loads with no (non-benign) console errors and renders all 39 sections', async ({ page }) => {
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL, { waitUntil: 'load' });
    await ready(page);
    // The preview renders one <h3> per field even before anything is filled.
    expect(await page.locator('#preview h3').count()).toBe(N_FIELDS);
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('filling a field flows into the preview and the markdown export', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    await page.evaluate(() => { try { localStorage.removeItem('prospero-templater-v1'); } catch (_) {} });
    // f14 lives in a collapsed <details>; expand all sections so its field is
    // actionable (only section 1 is open by default).
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));

    const title = 'Effectiveness of X for outcome Y in population Z: a systematic review';
    await page.fill('#f1', title);
    await page.fill('#f14', 'In adults, does X vs placebo affect mortality?');
    await page.locator('#btn-update').click();

    // Preview reflects the title.
    await expect(page.locator('#preview')).toContainText(title);

    // State hook + markdown contain the filled values and all section headers.
    const out = await page.evaluate(() => window.__almProspero());
    expect(out.state.f1).toBe(title);
    expect(out.markdown).toContain('# PROSPERO submission draft');
    expect(out.markdown).toContain(title);
    expect(out.markdown).toContain('In adults, does X vs placebo affect mortality?');
    // One "## N. " section header per field.
    const headers = (out.markdown.match(/^## \d+\. /gm) || []).length;
    expect(headers).toBe(N_FIELDS);
  });

  test('autosave round-trips through localStorage on reload', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    await page.evaluate(() => { try { localStorage.removeItem('prospero-templater-v1'); } catch (_) {} });
    await page.fill('#f1', 'Persisted title');
    // input handler autosaves; reload should restore it.
    await page.reload();
    await ready(page);
    expect(await page.inputValue('#f1')).toBe('Persisted title');
  });

  test('unfilled fields show "(not filled)" in the markdown', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    await page.evaluate(() => { try { localStorage.removeItem('prospero-templater-v1'); } catch (_) {} });
    await page.reload();
    await ready(page);
    const out = await page.evaluate(() => window.__almProspero());
    expect(out.markdown).toContain('_(not filled)_');
  });

});
