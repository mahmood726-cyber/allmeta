/**
 * search-translator-behavior.spec.mjs — deterministic PubMed→Embase/
 * CENTRAL syntax translation. Constructed oracle (expected output is
 * derived exactly from the documented rewrite rules). A silent
 * translation bug corrupts a systematic-review search strategy.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/search-translator/';

test.describe('search-translator', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(
      () => typeof window.__almTranslate === 'function', { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('PubMed → Embase / CENTRAL field-tag rewrites (exact)',
    async ({ page }) => {
      await page.goto(URL);
      await page.waitForFunction(
        () => typeof window.__almTranslate === 'function', { timeout: 10_000 });
      const tr = (s) => page.evaluate((t) => window.__almTranslate(t), s);

      // 1. mapped MeSH
      let r = await tr('"heart failure"[MeSH Terms]');
      expect(r.embase).toBe("'heart failure'/exp");
      expect(r.central).toBe('[mh "heart failure"]');

      // 2. unmapped MeSH → free-text + warning
      r = await tr('"glucagon receptor"[Mesh]');
      expect(r.embase).toBe("'glucagon receptor':ti,ab");
      expect(r.central).toBe('[mh "glucagon receptor"]');
      expect(r.warnings.some(w => w.includes('Unmapped MeSH') &&
        w.includes('glucagon receptor')), 'unmapped warning').toBe(true);

      // 3. tiab / 4. ti / 5. tw / 6. all
      r = await tr('"cardiac failure"[tiab]');
      expect(r.embase).toBe("'cardiac failure':ti,ab");
      expect(r.central).toBe('("cardiac failure"):ti,ab');
      r = await tr('"stroke"[ti]');
      expect(r.embase).toBe("'stroke':ti");
      expect(r.central).toBe('("stroke"):ti');
      r = await tr('"aspirin"[tw]');
      expect(r.embase).toBe("'aspirin':ti,ab,kw");
      expect(r.central).toBe('("aspirin"):ti,ab,kw');
      r = await tr('"placebo"[all]');
      expect(r.embase).toBe("'placebo'");
      expect(r.central).toBe('"placebo"');

      // 7. publication type — RCT special-cased
      r = await tr('"randomized controlled trial"[pt]');
      expect(r.embase).toBe("'randomized controlled trial'/de");
      expect(r.central).toBe('("randomized controlled trial"):pt');

      // 8. dictionary mapping (SGLT2)
      r = await tr('"sodium-glucose transporter 2 inhibitors"[MeSH Terms]');
      expect(r.embase).toBe("'sodium glucose cotransporter 2 inhibitor'/exp");

      // 9. combined line preserves boolean + rewrites each term
      r = await tr('"heart failure"[MeSH Terms] OR "cardiac failure"[tiab]');
      expect(r.embase).toBe("'heart failure'/exp OR 'cardiac failure':ti,ab");
      expect(r.central)
        .toBe('[mh "heart failure"] OR ("cardiac failure"):ti,ab');

      // 10. standalone boolean line passes through (upper-cased)
      r = await tr('or');
      expect(r.embase).toBe('OR');
      expect(r.central).toBe('OR');

      // 11. multi-line block round-trips line-for-line
      r = await tr('"heart failure"[MeSH Terms]\nAND\n"aspirin"[tw]');
      expect(r.embase).toBe("'heart failure'/exp\nAND\n'aspirin':ti,ab,kw");
      expect(r.central)
        .toBe('[mh "heart failure"]\nAND\n("aspirin"):ti,ab,kw');
    });
});
