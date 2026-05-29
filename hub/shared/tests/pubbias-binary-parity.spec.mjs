/**
 * R-parity for the binary small-study tests (Peters, Harbord) vs
 * meta::metabias() — these branches were previously UNtested (only Egger/Begg/
 * trim-fill had parity). Two bugs were fixed 2026-05-29:
 *   - Harbord regressed (a−E)/V on √V (divided by √V twice) → inflated ~57%.
 *     Correct: regress Z/√V on √V (Z = a−E).  meta t = -7.43.
 *   - Peters used the inverse-variance-of-logOR weight; canonical Peters weights
 *     by the inverse variance of the average event probability,
 *     w = 1/(1/(e1+e2) + 1/(noevent1+noevent2)).  meta t = -10.68.
 *
 * Ground truth from meta::metabias(metabin(...,sm="OR",method="Inverse")):
 *   Egger t=-7.7118, Begg z=-2.7218, Harbord t=-7.4306, Peters t=-10.6751.
 * (Both tests use a t-distribution with df=k-2=6 and multiplicative dispersion.)
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/pubbias-tests/index.html';

// 8 binary 2×2 studies: events1, n1, events2, n2
const BINARY = [
  [12, 100, 18, 102], [8, 90, 14, 95], [20, 150, 28, 155], [15, 120, 22, 118],
  [5, 60, 11, 62], [25, 200, 30, 205], [10, 80, 17, 82], [18, 140, 25, 145],
].map(r => r.join(', ')).join('\n');

test('pubbias Peters & Harbord match meta::metabias (binary)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate((txt) => {
    const E = window.__almPubBiasEngine;
    const rows = E.parseBinary(txt);
    return {
      k: rows.length,
      peters: E.petersTest(rows),
      harbord: E.harbordTest(rows),
    };
  }, BINARY);
  console.log('  pubbias binary:', JSON.stringify({ peters: r.peters.statistic, harbord: r.harbord.statistic }));

  expect(r.k).toBe(8);
  // Harbord intercept t — was -11.67 before the √V fix.
  expect(r.harbord.statistic).toBeCloseTo(-7.4306, 2);
  // Peters slope t — was -10.45 before the weight fix.
  expect(r.peters.statistic).toBeCloseTo(-10.6751, 2);
});
