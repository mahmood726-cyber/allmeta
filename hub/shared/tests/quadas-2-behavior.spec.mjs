/**
 * quadas-2-behavior.spec.mjs — QUADAS-2 (Whiting 2011) auto-suggested
 * risk-of-bias per domain. Deterministic suggestRoB rules; constructed
 * oracle. (Applicability + final RoB are reviewer overrides in the UI;
 * the suggestion is the algorithmic part worth pinning.)
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/quadas-2/';

test.describe('quadas-2', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almQuadas === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('per-domain suggested risk of bias (D1–D4)', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almQuadas === 'function',
      { timeout: 10_000 });
    const ev = (a) => page.evaluate((x) => window.__almQuadas(x), a);

    // D1: all Y → low; any N → high; mix of Y/U (no N) → unclear;
    //     incomplete → unclear.
    expect((await ev({ D1: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y' } })).D1)
      .toBe('low');
    expect((await ev({ D1: { '1.1': 'Y', '1.2': 'N', '1.3': 'Y' } })).D1)
      .toBe('high');
    expect((await ev({ D1: { '1.1': 'Y', '1.2': 'U', '1.3': 'Y' } })).D1)
      .toBe('unclear');
    expect((await ev({ D1: { '1.1': 'Y', '1.2': 'Y' } })).D1,
      'incomplete → unclear').toBe('unclear');

    // D2: 2.1&2.2 Y → low; 2.1 N → high (dominates); 2.1 Y,2.2 U →
    //     unclear; 2.1 U → unclear.
    expect((await ev({ D2: { '2.1': 'Y', '2.2': 'Y' } })).D2).toBe('low');
    expect((await ev({ D2: { '2.1': 'N', '2.2': 'Y' } })).D2,
      '2.1=N dominates → high').toBe('high');
    expect((await ev({ D2: { '2.1': 'Y', '2.2': 'U' } })).D2)
      .toBe('unclear');
    expect((await ev({ D2: { '2.1': 'U', '2.2': 'Y' } })).D2)
      .toBe('unclear');

    // D3: same shape as D2 on 3.1/3.2.
    expect((await ev({ D3: { '3.1': 'Y', '3.2': 'Y' } })).D3).toBe('low');
    expect((await ev({ D3: { '3.1': 'N', '3.2': 'Y' } })).D3).toBe('high');
    expect((await ev({ D3: { '3.1': 'Y', '3.2': 'U' } })).D3)
      .toBe('unclear');

    // D4: all four Y → low; 4.2 OR 4.4 = N → high; other non-low → unclear.
    expect((await ev({ D4:
      { '4.1': 'Y', '4.2': 'Y', '4.3': 'Y', '4.4': 'Y' } })).D4).toBe('low');
    expect((await ev({ D4:
      { '4.1': 'Y', '4.2': 'N', '4.3': 'Y', '4.4': 'Y' } })).D4,
      '4.2=N → high').toBe('high');
    expect((await ev({ D4:
      { '4.1': 'Y', '4.2': 'Y', '4.3': 'Y', '4.4': 'N' } })).D4,
      '4.4=N → high').toBe('high');
    expect((await ev({ D4:
      { '4.1': 'N', '4.2': 'Y', '4.3': 'N', '4.4': 'Y' } })).D4,
      'not all Y, 4.2/4.4 not N → unclear').toBe('unclear');

    // Unspecified domains default to unclear (no answers).
    const all = await ev({});
    expect([all.D1, all.D2, all.D3, all.D4])
      .toEqual(['unclear', 'unclear', 'unclear', 'unclear']);
  });
});
