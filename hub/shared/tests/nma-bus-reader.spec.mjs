/**
 * NMA contrast-reader bus spec (ma-comparisons-v1 → toContrasts).
 *
 * bayesian-nma and nma-inconsistency consume contrast-level "t1, t2, te, se"
 * rows. They now expose a "Load from bus" button that reads the shared
 * arm-level ma-comparisons-v1 network and converts it via
 * MaComparisons.toContrasts() (log-OR/RR). This spec seeds the bus with a
 * 3-arm OR study, clicks Load, and asserts the textarea is populated with the
 * correct pairwise contrasts.
 *
 * Expected contrasts for the seed (A 10/100, B 20/100, C 30/100, OR),
 * independently derived in Python:
 *   A-B: te = -0.810930, se = 0.416667
 *   A-C: te = -1.349927, se = 0.398410
 *   B-C: te = -0.538997, se = 0.331842
 *
 * Run from hub/shared/tests/:
 *   npx playwright test nma-bus-reader.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const APPS = [
  { name: 'bayesian-nma', url: 'http://localhost:8088/bayesian-nma/' },
  { name: 'nma-inconsistency', url: 'http://localhost:8088/nma-inconsistency/' },
];

const SEED = {
  _schema: 'ma-comparisons-v1',
  effectMeasure: 'OR',
  studies: [
    { id: 'Tri', arms: [
      { treatment: 'A', events: 10, n: 100 },
      { treatment: 'B', events: 20, n: 100 },
      { treatment: 'C', events: 30, n: 100 },
    ] },
  ],
};

async function waitReady(page) {
  await page.waitForFunction(
    () => window.MaComparisons && typeof window.MaComparisons.toContrasts === 'function'
       && document.getElementById('btn-run'),
    { timeout: 10_000 }
  );
}

for (const app of APPS) {
  test.describe(`${app.name} ← ma-comparisons-v1 reader`, () => {

    test('Load from bus button is injected', async ({ page }) => {
      await page.goto(app.url);
      await waitReady(page);
      await expect(page.locator('#btn-bus-load')).toBeVisible();
    });

    test('Load from bus populates the textarea with correct contrasts', async ({ page }) => {
      await page.goto(app.url);
      await waitReady(page);
      // Seed the shared bus through the canonical writer.
      const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
      expect(wrote, 'MaComparisons.write should succeed').toBe(true);

      await page.locator('#btn-bus-load').click();

      const text = await page.inputValue('#src');
      const lines = text.trim().split('\n');
      expect(lines.length, 'expected 3 pairwise contrasts from a 3-arm study').toBe(3);

      // Parse "t1, t2, te, se" rows into a map keyed by the contrast.
      const byPair = {};
      for (const ln of lines) {
        const p = ln.split(',').map(s => s.trim());
        byPair[p[0] + '-' + p[1]] = { te: parseFloat(p[2]), se: parseFloat(p[3]) };
      }
      expect(Object.keys(byPair).sort()).toEqual(['A-B', 'A-C', 'B-C']);
      expect(byPair['A-B'].te).toBeCloseTo(-0.810930, 5);
      expect(byPair['A-B'].se).toBeCloseTo(0.416667, 5);
      expect(byPair['A-C'].te).toBeCloseTo(-1.349927, 5);
      expect(byPair['B-C'].te).toBeCloseTo(-0.538997, 5);
    });

    test('no console errors during the import + run flow', async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const t = msg.text();
        if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
        if (t.includes('ERR_CONNECTION_REFUSED')) return;
        errors.push(t);
      });
      page.on('pageerror', err => errors.push(err.message));
      await page.goto(app.url);
      await waitReady(page);
      await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
      await page.locator('#btn-bus-load').click();
      expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
    });

  });
}

// nma-global-inconsistency consumes a 5-column "t1, t2, te, se, design" format.
// The design tag must be the per-trial arm-set (shared across a multi-arm trial's
// contrasts), so the design-by-treatment model groups them as ONE design.
test.describe('nma-global-inconsistency ← ma-comparisons-v1 reader (with design)', () => {
  const URL = 'http://localhost:8088/nma-global-inconsistency/';

  test('Load from bus populates 5-column rows with the shared arm-set design', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
    expect(wrote).toBe(true);

    await page.locator('#btn-bus-load').click();

    const text = await page.inputValue('#src');
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(3);

    const byPair = {};
    const designs = new Set();
    for (const ln of lines) {
      const p = ln.split(',').map(s => s.trim());
      expect(p.length, 'expected 5 columns incl. design').toBe(5);
      byPair[p[0] + '-' + p[1]] = { te: parseFloat(p[2]), se: parseFloat(p[3]), design: p[4] };
      designs.add(p[4]);
    }
    // All three contrasts of the 3-arm trial share ONE design = the arm-set.
    expect([...designs]).toEqual(['A:B:C']);
    expect(byPair['A-B'].te).toBeCloseTo(-0.810930, 5);
    expect(byPair['A-C'].te).toBeCloseTo(-1.349927, 5);
    expect(byPair['B-C'].te).toBeCloseTo(-0.538997, 5);
  });

  test('no console errors during the import + run flow', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
      if (t.includes('ERR_CONNECTION_REFUSED')) return;
      errors.push(t);
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(URL);
    await waitReady(page);
    await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
    await page.locator('#btn-bus-load').click();
    expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
  });
});
