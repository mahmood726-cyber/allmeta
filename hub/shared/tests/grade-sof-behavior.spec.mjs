/**
 * grade-sof-behavior.spec.mjs — GRADE certainty algorithm.
 *
 * Deterministic: start High (RCT, score 4) / Low (observational, 2),
 * downgrade rob/inc/ind/imp/pub (0/1/2 each), upgrade large/dose/conf
 * ONLY for observational studies with zero downgrades, clamp to [1,4]
 * → {1:verylow,2:low,3:moderate,4:high}. Constructed oracle; a
 * misclassified certainty propagates a wrong evidence grade into an SoF
 * table.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/grade-sof/';
const G = (o) => ({ design: 'rct', rob: 0, inc: 0, ind: 0, imp: 0, pub: 0,
  large: 0, dose: false, conf: false, ...o });

test.describe('grade-sof', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almGrade === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('GRADE certainty: start / downgrade / upgrade / clamp / gating',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almGrade === 'function',
        { timeout: 10_000 });
      const lvl = (o) => page.evaluate((g) => window.__almGrade(g).level, G(o));

      // Start levels.
      expect(await lvl({ design: 'rct' }), 'RCT no concerns → high')
        .toBe('high');
      expect(await lvl({ design: 'obs' }), 'Obs no concerns → low')
        .toBe('low');

      // RCT downgrades.
      expect(await lvl({ design: 'rct', imp: 1 }), 'RCT -1 → moderate')
        .toBe('moderate');
      expect(await lvl({ design: 'rct', rob: 2 }), 'RCT -2 → low')
        .toBe('low');
      expect(await lvl({ design: 'rct', rob: 2, inc: 1, imp: 1 }),
        'RCT -4 → very low (clamped at 1)').toBe('verylow');

      // Observational upgrades — only when zero downgrades.
      expect(await lvl({ design: 'obs', large: 2 }),
        'Obs +2 (very large effect) → high').toBe('high');
      expect(await lvl({ design: 'obs', large: 1, dose: true, conf: true }),
        'Obs +3 → high (clamped at 4)').toBe('high');

      // GATING: an observational study with ANY downgrade gets NO
      // upgrades (key GRADE rule), even with a very large effect.
      expect(await lvl({ design: 'obs', large: 2, imp: 1 }),
        'Obs large effect BUT imp=1 → upgrades gated off → very low')
        .toBe('verylow');

      // RCT cannot be upgraded (large/dose/conf ignored for RCT).
      expect(await lvl({ design: 'rct', large: 2, dose: true }),
        'RCT upgrade factors ignored → still high').toBe('high');

      // rationale is structurally consistent with the level.
      const r = await page.evaluate(
        (g) => window.__almGrade(g), G({ design: 'rct', imp: 1 }));
      expect(r.level).toBe('moderate');
      expect(r.rationale.toLowerCase()).toContain('imprecision');
    });
});
