/**
 * robins-e-behavior.spec.mjs — ROBINS-E (exposures) per-domain D1–D7 +
 * worst-domain overall. Deterministic; constructed oracle. Per-domain
 * judgments are Low/Moderate/Serious only (this simplified tool does not
 * auto-derive Critical); overall = ni-precedence then ser>mod>low.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/robins-e/';

const L = {
  D1: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'N' },
  D2: { '2.1': 'Y', '2.2': 'Y', '2.3': 'N' },
  D3: { '3.1': 'Y', '3.2': 'Y', '3.3': 'N' },
  D4: { '4.1': 'N', '4.2': 'N', '4.3': 'Y' },
  D5: { '5.1': 'Y', '5.2': 'Y', '5.3': 'N', '5.4': 'Y' },
  D6: { '6.1': 'Y', '6.2': 'N', '6.3': 'Y' },
  D7: { '7.1': 'N', '7.2': 'N', '7.3': 'Y' },
};
const P = {
  D1: { ser: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'Y' },
        mod: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y', '1.4': 'NI' } },
  D2: { ser: { '2.1': 'N', '2.2': 'Y', '2.3': 'N' },
        mod: { '2.1': 'Y', '2.2': 'N', '2.3': 'N' } },
  D3: { ser: { '3.1': 'N', '3.2': 'Y', '3.3': 'N' },
        mod: { '3.1': 'Y', '3.2': 'N', '3.3': 'N' } },
  D4: { ser: { '4.1': 'Y', '4.2': 'Y', '4.3': 'N' },
        mod: { '4.1': 'Y', '4.2': 'N', '4.3': 'Y' } },
  D5: { ser: { '5.1': 'Y', '5.2': 'Y', '5.3': 'Y', '5.4': 'N' },
        mod: { '5.1': 'N', '5.2': 'Y', '5.3': 'N', '5.4': 'Y' } },
  D6: { ser: { '6.1': 'N', '6.2': 'N', '6.3': 'Y' },
        mod: { '6.1': 'Y', '6.2': 'N', '6.3': 'N' } },
  D7: { ser: { '7.1': 'Y', '7.2': 'N', '7.3': 'Y' },
        mod: { '7.1': 'N', '7.2': 'N', '7.3': 'N' } },
};

test.describe('robins-e', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almRobinsE === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('per-domain D1–D7 + worst-domain overall', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almRobinsE === 'function',
      { timeout: 10_000 });
    const ev = (a) => page.evaluate((x) => window.__almRobinsE(x), a);
    const withDom = (id, p) => ({ ...L, [id]: p });

    for (const id of Object.keys(P)) {
      expect((await ev(withDom(id, L[id])))[id], `${id} low`).toBe('low');
      expect((await ev(withDom(id, P[id].mod)))[id], `${id} mod`).toBe('mod');
      expect((await ev(withDom(id, P[id].ser)))[id], `${id} ser`).toBe('ser');
    }

    expect((await ev(L)).overall, 'all low → low').toBe('low');
    expect((await ev(withDom('D4', P.D4.mod))).overall, 'one mod → mod')
      .toBe('mod');
    expect((await ev(withDom('D2', P.D2.ser))).overall, 'one ser → ser')
      .toBe('ser');
    expect((await ev({ ...L, D4: P.D4.mod, D2: P.D2.ser })).overall,
      'mod + ser → ser (worst wins)').toBe('ser');

    // No per-domain judge yields "crit", so overall is never crit here.
    const allSer = {};
    for (const id of Object.keys(P)) allSer[id] = P[id].ser;
    expect((await ev(allSer)).overall, 'all serious → ser (never crit)')
      .toBe('ser');

    // NI-precedence: an unanswered domain dominates even over Serious.
    const r = await ev({
      ...L,
      D1: { '1.1': 'Y', '1.2': 'Y', '1.3': 'Y' }, // 1.4 missing → ni
      D2: P.D2.ser,
    });
    expect(r.D1, 'D1 unanswered → ni').toBe('ni');
    expect(r.overall, 'ni precedence over ser').toBe('ni');
  });
});
