/**
 * prisma-screen-behavior.spec.mjs — Cohen's kappa + PRISMA count rollup.
 *
 * Deterministic. Cohen's κ over dual-reviewer tags: κ=(po-pe)/(1-pe),
 * po=agree/n, pe=Σ p1c·p2c (only records with BOTH tags; n<2 → null).
 * effectiveTag: agree→tag, single-reviewer→that, disagree→"maybe".
 * computeCounts rolls up the PRISMA-shaped stage counts. Constructed
 * oracle with a hand-computed kappa.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/prisma-screen/';
const TOL = 1e-6;

test.describe('prisma-screen', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => window.__almScreen && typeof window.__almScreen.kappa === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test("Cohen's kappa + effectiveTag + PRISMA counts", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => window.__almScreen, { timeout: 10_000 });
    const K = (r) => page.evaluate((x) => window.__almScreen.kappa(x), r);
    const C = (r) => page.evaluate((x) => window.__almScreen.counts(x), r);
    const E = (r) => page.evaluate((x) => window.__almScreen.effectiveTag(x), r);
    const near = (g, e, n) =>
      expect(Math.abs(g - e), `${n}: js=${g} exp=${e}`).toBeLessThan(TOL);

    // Hand-computed κ: 10 paired records.
    // 6× (include,include), 1× (exclude,exclude), 1× (maybe,maybe),
    // 1× (include,exclude), 1× (exclude,include).
    // marginals tag1: inc .7 exc .2 maybe .1 ; tag2 identical.
    // po=8/10=.8 ; pe=.49+.04+.01=.54 ; κ=(.8-.54)/(1-.54)=.5652173913.
    const pairs = [
      ...Array(6).fill({ tag1: 'include', tag2: 'include' }),
      { tag1: 'exclude', tag2: 'exclude' },
      { tag1: 'maybe', tag2: 'maybe' },
      { tag1: 'include', tag2: 'exclude' },
      { tag1: 'exclude', tag2: 'include' },
    ];
    const k = await K(pairs);
    expect(k.n).toBe(10);
    expect(k.agree).toBe(8);
    near(k.po, 0.8, 'po');
    near(k.pe, 0.54, 'pe');
    near(k.kappa, (0.8 - 0.54) / (1 - 0.54), 'Cohen kappa');

    // n < 2 (only one fully-paired record) → null.
    expect(await K([{ tag1: 'include', tag2: 'include' },
      { tag1: 'exclude' }]), 'n<2 → null').toBeNull();

    // effectiveTag rules.
    expect(await E({ tag1: 'include', tag2: 'include' })).toBe('include');
    expect(await E({ tag1: 'exclude' })).toBe('exclude');
    expect(await E({ tag2: 'maybe' })).toBe('maybe');
    expect(await E({ tag1: 'include', tag2: 'exclude' }),
      'disagreement → maybe').toBe('maybe');

    // PRISMA count rollup (single-reviewer tag via tag1).
    const recs = [
      { tag1: 'duplicate' }, { tag1: 'duplicate' },
      { tag1: 'exclude', stage: 'title_abstract' },
      { tag1: 'exclude', stage: 'title_abstract' },
      { tag1: 'exclude', stage: 'title_abstract' },
      { tag1: 'exclude', stage: 'full_text' },
      { tag1: 'maybe' },
      { tag1: 'include' }, { tag1: 'include' },
      { tag1: 'include', stage: 'full_text' },
    ];
    const c = await C(recs);
    expect(c.identified).toBe(10);
    expect(c.duplicates).toBe(2);
    expect(c.screened).toBe(8);                 // 10 - 2
    expect(c.excludedScreen).toBe(3);
    expect(c.excludedFull).toBe(1);
    expect(c.maybe).toBe(1);
    expect(c.included).toBe(3);
    expect(c.sought).toBe(4);                    // 8 - 3 - 1(maybe)
    expect(c.assessed).toBe(4);                  // 4 - 0 notRetrieved

    // "not retrieved" reason regex bumps notRetrieved and lowers assessed.
    const c2 = await C([
      { tag1: 'include' }, { tag1: 'include' }, { tag1: 'include' },
      { tag1: 'exclude', stage: 'full_text', reason: 'full text not obtainable' },
    ]);
    expect(c2.notRetrieved, 'reason matched not-retrieved').toBe(1);
    // identified 4, dup 0 → screened 4; excludedScreen 0, maybe 0 →
    // sought 4; notRetrieved 1 → assessed 3.
    expect(c2.assessed).toBe(3);
  });
});
