/**
 * rob2-behavior.spec.mjs — Cochrane RoB 2 (Sterne 2019) algorithm.
 *
 * Deterministic per-domain signaling-question judgments + the overall
 * aggregation. Constructed oracle (answer sets hand-derived from the
 * implemented Sterne logic). Also pins the contract-drift fix: multiple
 * "some concerns" domains do NOT auto-upgrade to High (reviewer
 * judgment, per the corrected footer), and a non-judged domain ("ni")
 * takes precedence over High in the overall.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/rob2/';

// Per-domain answer presets hitting each judge() branch.
const L1 = { '1.1': 'Y', '1.2': 'Y', '1.3': 'N' };
const S1 = { '1.1': 'Y', '1.2': 'Y', '1.3': 'NI' };
const H1 = { '1.1': 'N', '1.2': 'Y', '1.3': 'N' };
const L2 = { '2.1': 'N', '2.2': 'N', '2.3': 'N', '2.4': 'N', '2.5': 'Y' };
const S2 = { '2.1': 'Y', '2.2': 'N', '2.3': 'N', '2.4': 'N', '2.5': 'NI' };
const H2 = { '2.1': 'N', '2.2': 'N', '2.3': 'N', '2.4': 'N', '2.5': 'N' };
const L3 = { '3.1': 'Y', '3.2': 'N', '3.3': 'Y', '3.4': 'Y' };
const S3 = { '3.1': 'N', '3.2': 'N', '3.3': 'Y', '3.4': 'N' };
const H3 = { '3.1': 'N', '3.2': 'N', '3.3': 'Y', '3.4': 'Y' };
const L4 = { '4.1': 'N', '4.2': 'N', '4.3': 'N', '4.4': 'N', '4.5': 'N' };
const S4 = { '4.1': 'N', '4.2': 'N', '4.3': 'Y', '4.4': 'Y', '4.5': 'N' };
const H4 = { '4.1': 'Y', '4.2': 'N', '4.3': 'N', '4.4': 'N', '4.5': 'N' };
const L5 = { '5.1': 'Y', '5.2': 'N', '5.3': 'N' };
const S5 = { '5.1': 'N', '5.2': 'N', '5.3': 'N' };
const H5 = { '5.1': 'Y', '5.2': 'Y', '5.3': 'N' };
const ALLLOW = { D1: L1, D2: L2, D3: L3, D4: L4, D5: L5 };

test.describe('rob2', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almRoB2 === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('per-domain D1–D5 judgments + overall aggregation (Sterne 2019)',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(() => typeof window.__almRoB2 === 'function',
        { timeout: 10_000 });
      const ev = (a) => page.evaluate((x) => window.__almRoB2(x), a);
      const withDom = (id, preset) => ({ ...ALLLOW, [id]: preset });

      // Per-domain: each preset embedded in an otherwise all-low study.
      for (const [id, lo, so, hi] of [
        ['D1', L1, S1, H1], ['D2', L2, S2, H2], ['D3', L3, S3, H3],
        ['D4', L4, S4, H4], ['D5', L5, S5, H5]]) {
        expect((await ev(withDom(id, lo)))[id], `${id} low`).toBe('low');
        expect((await ev(withDom(id, so)))[id], `${id} some`).toBe('some');
        expect((await ev(withDom(id, hi)))[id], `${id} high`).toBe('high');
      }

      // Overall aggregation.
      expect((await ev(ALLLOW)).overall, 'all low → low').toBe('low');
      expect((await ev(withDom('D3', H3))).overall, 'any high → high')
        .toBe('high');
      expect((await ev(withDom('D1', S1))).overall, 'one some → some')
        .toBe('some');

      // Contract-drift pin: TWO some-concerns domains do NOT auto-upgrade
      // to High (left to reviewer judgment; matches corrected footer).
      const twoSome = { ...ALLLOW, D1: S1, D4: S4 };
      expect((await ev(twoSome)).overall,
        'two some-concerns → still Some (not auto-High)').toBe('some');

      // "ni" precedence: an unanswered domain dominates even over High.
      const niPlusHigh = {
        ...ALLLOW,
        D1: { '1.1': 'Y', '1.2': 'Y' },   // 1.3 missing → D1 ni
        D3: H3,                            // a High domain present
      };
      const r = await ev(niPlusHigh);
      expect(r.D1, 'D1 unanswered → ni').toBe('ni');
      expect(r.overall, 'ni precedence over high').toBe('ni');
    });
});
