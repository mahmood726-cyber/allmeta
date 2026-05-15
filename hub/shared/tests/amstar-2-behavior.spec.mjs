/**
 * amstar-2-behavior.spec.mjs — AMSTAR-2 (Shea 2017) overall confidence.
 *
 * Deterministic: critical domains {2,4,7,9,11,13,15}. "No" on a critical
 * domain = critical flaw; "No" on a non-critical domain = non-critical
 * weakness; "Partial Yes" = non-critical weakness (never a critical
 * flaw, even on a critical domain); "Yes"/"NA" = nothing. Rating:
 * >1 critical → Critically low; 1 critical → Low; >1 non-critical
 * (0 critical) → Moderate; else High. Constructed oracle.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/amstar-2/';

test.describe('amstar-2', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almAmstar === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('Shea 2017 overall-confidence rating', async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almAmstar === 'function',
      { timeout: 10_000 });
    const r = (s) => page.evaluate((x) => window.__almAmstar(x), s);
    const allY = {};
    for (let i = 1; i <= 16; i++) allY[String(i)] = 'Y';

    // All Yes → High (0 critical, 0 non-critical).
    let o = await r(allY);
    expect(o).toMatchObject({ critical: 0, nonc: 0, rating: 'High' });

    // One non-critical "No" (item 1) → 1 weakness, still High (0–1).
    o = await r({ ...allY, '1': 'N' });
    expect(o).toMatchObject({ critical: 0, nonc: 1, rating: 'High' });

    // Two non-critical "No" (items 1,3) → >1 weakness, 0 critical → Moderate.
    o = await r({ ...allY, '1': 'N', '3': 'N' });
    expect(o).toMatchObject({ critical: 0, nonc: 2, rating: 'Moderate' });

    // One critical "No" (item 2) → 1 critical flaw → Low.
    o = await r({ ...allY, '2': 'N' });
    expect(o).toMatchObject({ critical: 1, rating: 'Low' });

    // Two critical "No" (items 2,4) → >1 critical → Critically low.
    o = await r({ ...allY, '2': 'N', '4': 'N' });
    expect(o).toMatchObject({ critical: 2, rating: 'Critically low' });

    // 1 critical + many non-critical "No" → still Low (critical branch
    // precedes non-critical; critical===1 dominates Moderate).
    o = await r({ ...allY, '9': 'N', '1': 'N', '3': 'N', '5': 'N' });
    expect(o).toMatchObject({ critical: 1, rating: 'Low' });

    // "Partial Yes" on a CRITICAL domain (item 9) is NOT a critical flaw
    // — counts as a non-critical weakness (key Shea nuance).
    o = await r({ ...allY, '9': 'PY' });
    expect(o).toMatchObject({ critical: 0, nonc: 1, rating: 'High' });

    // Two PY on critical domains → 2 non-critical, 0 critical → Moderate.
    o = await r({ ...allY, '9': 'PY', '11': 'PY' });
    expect(o).toMatchObject({ critical: 0, nonc: 2, rating: 'Moderate' });

    // ">1 critical" precedence even with zero non-critical weaknesses.
    o = await r({ ...allY, '7': 'N', '13': 'N', '15': 'N' });
    expect(o).toMatchObject({ critical: 3, nonc: 0, rating: 'Critically low' });

    // "NA" is neither a flaw nor a weakness.
    o = await r({ ...allY, '4': 'NA', '7': 'NA' });
    expect(o).toMatchObject({ critical: 0, nonc: 0, rating: 'High' });
  });
});
