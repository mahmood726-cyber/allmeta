/**
 * prisma-flow-behavior.spec.mjs — PRISMA 2020 flow-count reconciliation.
 *
 * Deterministic validate(): identified = db+reg; screened must equal
 * identified-removed; sought = screened-excludedScreen; assessed =
 * sought-notRetrieved; plus excludedScreen<=screened and
 * excludedEligible<=assessed; zero values suppress the corresponding
 * check. Constructed oracle — a silent reconciliation bug produces an
 * internally inconsistent PRISMA diagram.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/prisma-flow/';
const S = (o) => ({ db: 0, reg: 0, removed: 0, screened: 0,
  excludedScreen: 0, sought: 0, notRetrieved: 0, assessed: 0,
  excludedEligible: 0, ...o });

test.describe('prisma-flow', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almPrisma === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('stage-count reconciliation warnings', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almPrisma === 'function',
      { timeout: 10_000 });
    const v = (s) => page.evaluate((x) => window.__almPrisma(x), S(s));

    // Fully consistent flow → no warnings.
    // id=120; screened=120-20=100; sought=100-60=40; assessed=40-5=35;
    // excludedEligible=10 (<=35).
    expect(await v({ db: 100, reg: 20, removed: 20, screened: 100,
      excludedScreen: 60, sought: 40, notRetrieved: 5, assessed: 35,
      excludedEligible: 10 }), 'consistent → []').toEqual([]);

    // Wrong "screened" → exactly one warning, naming the expected value.
    let w = await v({ db: 100, reg: 20, removed: 20, screened: 90,
      excludedScreen: 0, sought: 0, assessed: 0 });
    expect(w.length, 'screened mismatch → 1').toBe(1);
    expect(w[0]).toContain('Records screened');
    expect(w[0]).toContain('= 100');

    // excludedScreen > screened.
    w = await v({ db: 50, reg: 0, removed: 0, screened: 50,
      excludedScreen: 60 });
    expect(w.some(x => x.includes('exceeds records screened')),
      'excludedScreen>screened').toBe(true);

    // Wrong "sought" (screened-excludedScreen).
    w = await v({ db: 100, reg: 0, removed: 0, screened: 100,
      excludedScreen: 40, sought: 70 });   // expected 60
    expect(w.some(x => x.includes('Reports sought') && x.includes('= 60')),
      'sought mismatch').toBe(true);

    // Wrong "assessed" (sought-notRetrieved).
    w = await v({ db: 100, reg: 0, removed: 0, screened: 100,
      excludedScreen: 40, sought: 60, notRetrieved: 10, assessed: 45 });
    expect(w.some(x => x.includes('Reports assessed') && x.includes('= 50')),
      'assessed mismatch').toBe(true);

    // excludedEligible > assessed.
    w = await v({ db: 100, reg: 0, removed: 0, screened: 100,
      excludedScreen: 40, sought: 60, notRetrieved: 10, assessed: 50,
      excludedEligible: 80 });
    expect(w.some(x => x.includes('exceeds assessed')),
      'excludedEligible>assessed').toBe(true);

    // Zero-gating: screened=0 suppresses the screened-mismatch check
    // even though identified(120) - removed(20) = 100 ≠ 0.
    expect(await v({ db: 100, reg: 20, removed: 20, screened: 0 }),
      'screened=0 → no warning (gated)').toEqual([]);

    // Multiple simultaneous mismatches accumulate.
    w = await v({ db: 100, reg: 0, removed: 10, screened: 80,
      excludedScreen: 90 });   // screened≠90; excludedScreen>screened
    expect(w.length, 'two problems → ≥2 warnings')
      .toBeGreaterThanOrEqual(2);
  });
});
