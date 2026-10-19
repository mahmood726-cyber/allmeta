/**
 * Engine-independent log for the ma-comparisons-v1 binary (OR/RR) contrasts.
 *
 * Why: ECMAScript leaves Math.log implementation-approximated. For the log-OR of
 * a zero-cell-corrected study (2.5/9.5 vs 0.5/13.5, ratio 7.105263157894737)
 * V8 in Chromium 147 / Node 24 returns 1.960835799271989 while V8 in Chrome and
 * Edge 155 returns 1.9608357992719891 (one ulp apart; the exact value lies almost
 * midway between them). That made the bus-imported input text, parsed rows and
 * plot of nma-inconsistency's pinned replay depend on the browser.
 * MaComparisons.detLog is a port of fdlibm __ieee754_log built only from IEEE
 * +, -, *, / and bit extraction, so its result is the same in every engine.
 * The expected values below are therefore exact, not engine-specific pins.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test ma-comparisons-detlog.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

test('detLog is bit-identical to fdlibm reference values and within 1 ulp of Math.log', async ({ page }) => {
  await page.goto('/nma-inconsistency/');
  await page.waitForFunction(() => window.MaComparisons && typeof window.MaComparisons.detLog === 'function');
  const r = await page.evaluate(() => {
    const L = MaComparisons.detLog;
    const pins = [[2, 0.6931471805599453], [10, 2.302585092994046], [0.1, -2.3025850929940455],
      [5e-324, -744.4400719213812], [2.2250738585072014e-308, -708.3964185322641],
      [1.0000001, 9.999999505838704e-8], [0.9999999, -1.0000000494736474e-7], [1e300, 690.7755278982137],
      [7.105263157894737, 1.960835799271989], [0.0962962962962963, -2.340325420976893]];
    const pinMiss = pins.filter(([x, y]) => !Object.is(L(x), y)).map(([x, y]) => [x, y, L(x)]);
    const special = [L(1), L(0), L(-0), L(-1), L(Infinity), L(NaN)];
    // One-ulp agreement with the engine's own Math.log on a seeded sample.
    const buf = new DataView(new ArrayBuffer(8));
    const ulp = v => { buf.setFloat64(0, v); const hi = buf.getUint32(0), lo = buf.getUint32(4);
      return hi * 4294967296 + lo; };
    let s = 12345, worst = 0;
    const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 20000; i++) {
      const x = Math.exp((rnd() - 0.5) * 60);
      const a = L(x), b = Math.log(x);
      if (Math.sign(a) !== Math.sign(b) && a !== 0 && b !== 0) { worst = Infinity; break; }
      worst = Math.max(worst, Math.abs(ulp(Math.abs(a)) - ulp(Math.abs(b))));
    }
    // The bus contrast that differed across engines now uses detLog.
    const rows = MaComparisons.toContrasts({ effectMeasure: 'OR', studies: [{ id: 's3', arms: [
      { treatment: 'A', events: 2, n: 11 }, { treatment: 'C', events: 0, n: 13 }] }] });
    return { pinMiss, special, worst, te: rows[0].te };
  });
  expect(r.pinMiss).toEqual([]);
  expect(r.special).toEqual([0, -Infinity, -Infinity, NaN, Infinity, NaN]);
  expect(r.worst).toBeLessThanOrEqual(1);
  expect(r.te).toBe(1.960835799271989);
  // metafor::escalc reference for the same study (R gives the correctly rounded
  // 1.9608357992719891); detLog is within its documented < 1 ulp error.
  expect(Math.abs(r.te - 1.9608357992719891)).toBeLessThanOrEqual(2.3e-16);
});
