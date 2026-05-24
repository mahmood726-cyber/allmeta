/**
 * robins-i-behavior.spec.mjs — ROBINS-I (Sterne 2016) per-domain D1–D7
 * + worst-domain overall. Deterministic; constructed oracle
 * (answer sets hand-derived from each judge()). overall = ni-precedence
 * then worst of crit > ser > mod > low (matches the documented footer).
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/robins-i/';

// Per-domain "low" presets (form the all-low baseline study).
const L = {
  D1: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'Y', '1.5': 'Y', '1.6': 'N' },
  D2: { '2.1': 'N', '2.2': 'Y', '2.3': 'Y', '2.4': 'N' },
  D3: { '3.1': 'Y', '3.2': 'Y', '3.3': 'N' },
  D4: { '4.1': 'N', '4.2': 'N', '4.3': 'Y' },
  D5: { '5.1': 'Y', '5.2': 'N', '5.3': 'N', '5.4': 'Y' },
  D6: { '6.1': 'N', '6.2': 'N', '6.3': 'Y', '6.4': 'Y', '6.5': 'N' },
  D7: { '7.1': 'N', '7.2': 'N', '7.3': 'N', '7.4': 'N' },
};
// Per-domain presets at mod / ser / crit.
const P = {
  D1: { mod: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'Y', '1.5': 'Y', '1.6': 'NI' },
        ser: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'N', '1.5': 'Y', '1.6': 'N' },
        crit: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'Y', '1.5': 'Y', '1.6': 'Y' } },
  D2: { mod: { '2.1': 'Y', '2.2': 'Y', '2.3': 'Y', '2.4': 'N' },
        ser: { '2.1': 'Y', '2.2': 'Y', '2.3': 'N', '2.4': 'N' },
        crit: { '2.1': 'Y', '2.2': 'Y', '2.3': 'Y', '2.4': 'Y' } },
  D3: { mod: { '3.1': 'Y', '3.2': 'N', '3.3': 'N' },
        ser: { '3.1': 'N', '3.2': 'Y', '3.3': 'N' } },
  D4: { mod: { '4.1': 'Y', '4.2': 'N', '4.3': 'Y' },
        ser: { '4.1': 'Y', '4.2': 'Y', '4.3': 'N' } },
  D5: { mod: { '5.1': 'N', '5.2': 'N', '5.3': 'N', '5.4': 'Y' },
        ser: { '5.1': 'N', '5.2': 'N', '5.3': 'N', '5.4': 'N' } },
  D6: { mod: { '6.1': 'Y', '6.2': 'N', '6.3': 'Y', '6.4': 'Y', '6.5': 'N' },
        ser: { '6.1': 'Y', '6.2': 'Y', '6.3': 'Y', '6.4': 'Y', '6.5': 'N' },
        crit: { '6.1': 'N', '6.2': 'N', '6.3': 'Y', '6.4': 'Y', '6.5': 'Y' } },
  D7: { mod: { '7.1': 'NI', '7.2': 'N', '7.3': 'N', '7.4': 'N' },
        ser: { '7.1': 'Y', '7.2': 'N', '7.3': 'N', '7.4': 'N' },
        crit: { '7.1': 'N', '7.2': 'N', '7.3': 'N', '7.4': 'Y' } },
};

test.describe('robins-i', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almRobinsI === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('per-domain D1–D7 judgments + worst-domain overall', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almRobinsI === 'function',
      { timeout: 10_000 });
    const ev = (a) => page.evaluate((x) => window.__almRobinsI(x), a);
    const withDom = (id, preset) => ({ ...L, [id]: preset });

    // Per-domain: each level embedded in an otherwise all-low study.
    for (const id of Object.keys(P)) {
      expect((await ev(withDom(id, L[id])))[id], `${id} low`).toBe('low');
      for (const lvl of Object.keys(P[id])) {
        expect((await ev(withDom(id, P[id][lvl])))[id], `${id} ${lvl}`)
          .toBe(lvl);
      }
    }

    // Overall = worst domain.
    expect((await ev(L)).overall, 'all low → low').toBe('low');
    expect((await ev(withDom('D4', P.D4.mod))).overall, 'one mod → mod')
      .toBe('mod');
    expect((await ev(withDom('D3', P.D3.ser))).overall, 'one ser → ser')
      .toBe('ser');
    expect((await ev(withDom('D7', P.D7.crit))).overall, 'one crit → crit')
      .toBe('crit');
    // ser present alongside mod → ser (worse wins).
    expect((await ev({ ...L, D4: P.D4.mod, D3: P.D3.ser })).overall,
      'mod+ser → ser').toBe('ser');

    // ni-precedence: an unanswered domain dominates even over Critical.
    const niPlusCrit = {
      ...L,
      D1: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'Y', '1.5': 'Y' }, // 1.6 missing
      D7: P.D7.crit,
    };
    const r = await ev(niPlusCrit);
    expect(r.D1, 'D1 unanswered → ni').toBe('ni');
    expect(r.overall, 'ni precedence over crit').toBe('ni');
  });
});
