/**
 * cerqual-behavior.spec.mjs — GRADE-CERQual (Lewin 2018) worst-component
 * anchoring. Deterministic: worst of the four components (none<minor<
 * mod<ser); none/minor → High; mod → Moderate; ser → Low, or Very low
 * if serious in >=2 components; missing component defaults to none.
 * Constructed oracle.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/cerqual/';

test.describe('cerqual', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almCerqual === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('worst-component anchoring → confidence', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.__almCerqual === 'function',
      { timeout: 10_000 });
    const c = (r) => page.evaluate((x) => window.__almCerqual(x), r);
    const C = (m, co, a, re) =>
      ({ method: m, coherence: co, adequacy: a, relevance: re });

    // all none / all minor / mixed none-minor → High.
    expect(await c(C('none', 'none', 'none', 'none')))
      .toEqual({ worst: 'none', conf: 'High' });
    expect(await c(C('minor', 'minor', 'minor', 'minor')))
      .toEqual({ worst: 'minor', conf: 'High' });
    expect((await c(C('none', 'minor', 'none', 'minor'))).conf).toBe('High');

    // any moderate (worst) → Moderate.
    expect(await c(C('none', 'mod', 'minor', 'none')))
      .toEqual({ worst: 'mod', conf: 'Moderate' });

    // exactly one serious → Low (serious worst, nSer=1).
    expect(await c(C('ser', 'mod', 'minor', 'none')))
      .toEqual({ worst: 'ser', conf: 'Low' });

    // serious in >=2 components → Very low.
    expect(await c(C('ser', 'ser', 'minor', 'none')))
      .toEqual({ worst: 'ser', conf: 'Very low' });
    expect((await c(C('ser', 'mod', 'ser', 'ser'))).conf).toBe('Very low');

    // serious dominates moderate (worst-anchor), single serious → Low.
    expect((await c(C('mod', 'mod', 'mod', 'ser'))).conf).toBe('Low');

    // missing components default to "none".
    expect(await c({ method: 'mod' }))
      .toEqual({ worst: 'mod', conf: 'Moderate' });
    expect(await c({})).toEqual({ worst: 'none', conf: 'High' });
  });
});
