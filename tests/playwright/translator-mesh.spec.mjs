/**
 * Regression for search-translator fixes:
 *  #3 [Mesh:NoExp] (do-NOT-explode) was inverted to /exp ([mh "term"]); now maps to
 *     non-exploded forms (Embase /de, CENTRAL [mh ^"term"]).
 *  #2 unsupported/unquoted PubMed field tags leaked into Embase output with no warning;
 *     now a residual-tag warning fires.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/search-translator/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('search-translator: NoExp not inverted to explode; untranslated tags warned', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almTranslate === 'function', { timeout: 10000 });

  const r = await page.evaluate(() => {
    const noexp = window.__almTranslate('"heart failure"[Mesh:NoExp]');
    const exp = window.__almTranslate('"heart failure"[Mesh]');
    const badtag = window.__almTranslate('"english"[la]');
    return {
      noexpCentral: noexp.central,
      expCentral: exp.central,
      badEmbase: badtag.embase,
      badWarns: badtag.warnings,
    };
  });
  console.log('  translator:', JSON.stringify(r));

  // NoExp → CENTRAL non-exploded form [mh ^"…"]; plain Mesh → [mh "…"] (no caret).
  expect(r.noexpCentral, 'NoExp → non-exploded [mh ^…]').toContain('[mh ^"heart failure"]');
  expect(r.expCentral, 'plain Mesh → exploded [mh …]').toContain('[mh "heart failure"]');
  expect(r.expCentral, 'plain Mesh is NOT marked no-explode').not.toContain('^');
  // Unsupported [la] tag leaks into Embase → must be warned, not silent.
  expect(r.badEmbase, '[la] survives into Embase output').toContain('[la]');
  expect(r.badWarns.some(w => /[Uu]ntranslated/.test(w) && w.includes('[la]')), 'residual-tag warning fired').toBe(true);

  expect(errors, 'no console errors').toEqual([]);
});
