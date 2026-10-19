/**
 * NMA contrast-reader bus spec (ma-comparisons-v1 → toContrasts).
 *
 * bayesian-nma and nma-inconsistency consume contrast-level "t1, t2, te, se"
 * rows. They expose a "Load from bus" button that reads the shared arm-level
 * ma-comparisons-v1 network and converts it via MaComparisons.toContrasts()
 * (log-OR/RR).
 *
 * bayesian-nma accepts a 3-arm OR study and must emit all three pairwise
 * contrasts. nma-inconsistency deliberately REFUSES studies with more than two
 * arms (its engine assumes independent two-arm contrasts; correlated multi-arm
 * contrasts need study covariance it does not model). For that app the spec
 * asserts the requirement instead: the refusal reaches the user as visible text
 * naming the study, the input box is left as it was and is not analysed, no
 * earlier result stays on screen as if it were the import, and a bus of
 * two-arm studies still imports one contrast per study.
 *
 * Expected contrasts (A 10/100, B 20/100, C 30/100, OR), independently derived
 * in Python:
 *   A-B: te = -0.810930, se = 0.416667
 *   A-C: te = -1.349927, se = 0.398410
 *   B-C: te = -0.538997, se = 0.331842
 *
 * URLs are relative to the config's baseURL so the spec runs on any port.
 *
 * Run from hub/shared/tests/:
 *   npx playwright test nma-bus-reader.spec.mjs --reporter=list
 */
import { test, expect } from '@playwright/test';

const APPS = [
  { name: 'bayesian-nma', url: '/bayesian-nma/' },
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

// nma-inconsistency analyses independent two-arm contrasts only. A multi-arm bus
// study must be refused visibly, and the refusal must not leave the user looking
// at the untouched default example (or an earlier result) as if it were theirs.
test.describe('nma-inconsistency ← ma-comparisons-v1 reader (two-arm only)', () => {
  const URL = '/nma-inconsistency/';
  const REFUSAL = 'Load from bus refused: study \u201cTri\u201d (3 arms). Multi-arm studies are unsupported: ' +
      'correlated contrasts require study covariance. The input box was left unchanged and nothing was analysed.';
  const TWO_ARM = {
    _schema: 'ma-comparisons-v1',
    effectMeasure: 'OR',
    studies: [
      { id: 'S1', arms: [{ treatment: 'A', events: 10, n: 100 }, { treatment: 'B', events: 20, n: 100 }] },
      { id: 'S2', arms: [{ treatment: 'A', events: 10, n: 100 }, { treatment: 'C', events: 30, n: 100 }] },
      { id: 'S3', arms: [{ treatment: 'B', events: 20, n: 100 }, { treatment: 'C', events: 30, n: 100 }] },
    ],
  };

  test('Load from bus button is injected', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    await expect(page.locator('#btn-bus-load')).toBeVisible();
  });

  test('a 3-arm bus study is refused visibly; the input is neither replaced nor analysed', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    // The page analyses its built-in example on load, so a result is on screen.
    const before = await page.inputValue('#src');
    expect(before.trim().split('\n').length).toBe(11);
    await expect(page.locator('#ns-body tr').first()).toBeVisible();
    expect(await page.evaluate(() => window._almLastInco().status)).toBeUndefined();

    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), SEED);
    expect(wrote, 'MaComparisons.write should succeed').toBe(true);
    await page.locator('#btn-bus-load').click();

    // The refusal is visible page text naming the import, the study and the reason
    // (not only a console line or an internal state field).
    const msg = page.locator('#dbt');
    await expect(msg).toBeVisible();
    await expect(msg).toHaveText(REFUSAL);
    // The default example was not replaced by, nor passed off as, the bus data ...
    expect(await page.inputValue('#src')).toBe(before);
    // ... and nothing was analysed: the earlier example result is cleared, not left on screen.
    await expect(page.locator('#ns-body tr')).toHaveCount(0);
    expect(await page.evaluate(() => document.getElementById('ns-plot').childElementCount)).toBe(0);
    expect(await page.evaluate(() => window._almLastInco())).toEqual({ status: 'refused', reason: REFUSAL });
    // The exported results carry the refusal, not the example's numbers.
    expect(await page.evaluate(() => window._almLastInco().nodeSplit)).toBeUndefined();
  });

  test('a bus of two-arm studies imports one contrast per study and is analysed', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), TWO_ARM);
    expect(wrote).toBe(true);
    await page.locator('#btn-bus-load').click();

    const lines = (await page.inputValue('#src')).trim().split('\n');
    expect(lines.length, 'one contrast per two-arm study').toBe(3);
    const byPair = {};
    for (const ln of lines) {
      const p = ln.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      expect(p.length, 'expected t1, t2, te, se, study').toBe(5);
      byPair[p[0] + '-' + p[1]] = { te: parseFloat(p[2]), se: parseFloat(p[3]), study: p[4] };
    }
    expect(Object.keys(byPair).sort()).toEqual(['A-B', 'A-C', 'B-C']);
    expect(byPair['A-B'].study).toBe('S1');
    expect(byPair['A-C'].study).toBe('S2');
    expect(byPair['B-C'].study).toBe('S3');
    expect(byPair['A-B'].te).toBeCloseTo(-0.810930, 5);
    expect(byPair['A-B'].se).toBeCloseTo(0.416667, 5);
    expect(byPair['A-C'].te).toBeCloseTo(-1.349927, 5);
    expect(byPair['A-C'].se).toBeCloseTo(0.398410, 5);
    expect(byPair['B-C'].te).toBeCloseTo(-0.538997, 5);
    expect(byPair['B-C'].se).toBeCloseTo(0.331842, 5);

    // The imported rows, not the example, were analysed.
    const state = await page.evaluate(() => window._almLastInco());
    expect(state.status).toBeUndefined();
    expect([...state.trts].sort()).toEqual(['A', 'B', 'C']);
    await expect(page.locator('#ns-body tr')).toHaveCount(3);
  });

  test('no console errors during the refused import', async ({ page }) => {
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

// nma-global-inconsistency consumes a 5-column "t1, t2, te, se, design" format.
// The design tag must be the per-trial arm-set (shared across a multi-arm trial's
// contrasts), so the design-by-treatment model groups them as ONE design.
test.describe('nma-global-inconsistency ← ma-comparisons-v1 reader (with design)', () => {
  const URL = '/nma-global-inconsistency/';

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

// component-nma consumes a pipe-delimited "armA | armB | te | se" format and
// decomposes additive component treatment names (e.g. "drug+exercise") on "+".
// The bus treatment names pass through verbatim.
test.describe('component-nma ← ma-comparisons-v1 reader (pipe + components)', () => {
  const URL = '/component-nma/';
  const CSEED = {
    _schema: 'ma-comparisons-v1',
    effectMeasure: 'OR',
    studies: [
      { id: 'S1', arms: [
        { treatment: 'control', events: 20, n: 100 },
        { treatment: 'drug+exercise', events: 40, n: 100 },
      ] },
      { id: 'S2', arms: [
        { treatment: 'control', events: 20, n: 100 },
        { treatment: 'drug', events: 30, n: 100 },
      ] },
      { id: 'S3', arms: [
        { treatment: 'control', events: 20, n: 100 },
        { treatment: 'exercise', events: 25, n: 100 },
      ] },
    ],
  };

  test('Load from bus populates pipe-delimited contrasts with component names', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), CSEED);
    expect(wrote).toBe(true);

    await page.locator('#btn-bus-load').click();

    const text = await page.inputValue('#src');
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(3);

    const byArm = {};
    for (const ln of lines) {
      const p = ln.split('|').map(s => s.trim());
      expect(p.length, 'expected 4 pipe-delimited fields').toBe(4);
      expect(p[0]).toBe('control'); // treatment1 = study reference arm (entered first)
      byArm[p[1]] = { te: parseFloat(p[2]), se: parseFloat(p[3]) };
    }
    expect(Object.keys(byArm).sort()).toEqual(['drug', 'drug+exercise', 'exercise']);
    // The combination treatment name survived intact for the app to decompose.
    expect(byArm['drug+exercise'].te).toBeCloseTo(-0.980829, 5);
    expect(byArm['drug+exercise'].se).toBeCloseTo(0.322749, 5);
    expect(byArm['drug'].te).toBeCloseTo(-0.538997, 5);
    expect(byArm['exercise'].te).toBeCloseTo(-0.287682, 5);
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
    await page.evaluate((seed) => window.MaComparisons.write(seed), CSEED);
    await page.locator('#btn-bus-load').click();
    expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
  });
});

// bucher is a single-triangle indirect calculator (4 scalar fields), not a
// list app. Its "Load from bus" maps toContrasts into the existing
// __almBucherLoad, which pools the explicitly chosen A-C and B-C links.
// A star seed (A-vs-control, B-vs-control) yields the A-vs-B-via-control triangle.
test.describe('bucher ← ma-comparisons-v1 reader (triangle prefill)', () => {
  const appURL = () => new globalThis.URL('/bucher/', test.info().project.use.baseURL).href;
  const BSEED = {
    _schema: 'ma-comparisons-v1',
    effectMeasure: 'OR',
    studies: [
      { id: 'S1', arms: [
        { treatment: 'control', events: 20, n: 100 },
        { treatment: 'A', events: 40, n: 100 },
      ] },
      { id: 'S2', arms: [
        { treatment: 'control', events: 20, n: 100 },
        { treatment: 'B', events: 30, n: 100 },
      ] },
    ],
  };

  async function ready(page) {
    await page.waitForFunction(
      () => window.MaComparisons && typeof window.MaComparisons.toContrasts === 'function'
         && typeof window.__almBucherLoad === 'function' && document.getElementById('btn-run'),
      { timeout: 10_000 }
    );
  }

  test('Load from bus fills the AC/BC triangle fields on the log scale', async ({ page }) => {
    await page.goto(appURL());
    await ready(page);
    await page.locator('#treatC').fill('control');
    const wrote = await page.evaluate((seed) => window.MaComparisons.write(seed), BSEED);
    expect(wrote).toBe(true);

    await page.locator('#btn-bus-load').click();

    // AC = A-vs-control, BC = B-vs-control (the two arms sharing comparator).
    expect(parseFloat(await page.inputValue('#dAC'))).toBeCloseTo(0.980829, 4);
    expect(parseFloat(await page.inputValue('#seAC'))).toBeCloseTo(0.322749, 4);
    expect(parseFloat(await page.inputValue('#dBC'))).toBeCloseTo(0.538997, 4);
    expect(parseFloat(await page.inputValue('#seBC'))).toBeCloseTo(0.331842, 4);
    expect(await page.inputValue('#scale')).toBe('log');

    // The computed indirect A-vs-B (log scale) = dAC - dBC.
    const indirect = await page.evaluate(() => window._almLastBucher && window._almLastBucher().d_indirect_AB);
    expect(indirect).toBeCloseTo(0.441832, 4);
  });

  test('no console errors during the import flow', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (t.includes('frame-ancestors') && t.includes('Content Security Policy')) return;
      if (t.includes('ERR_CONNECTION_REFUSED')) return;
      errors.push(t);
    });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(appURL());
    await ready(page);
    await page.locator('#treatC').fill('control');
    await page.evaluate((seed) => window.MaComparisons.write(seed), BSEED);
    await page.locator('#btn-bus-load').click();
    expect(errors, 'console errors: ' + errors.join('; ')).toEqual([]);
  });
});
