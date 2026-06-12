/**
 * Behaviour-parity for shared/atlas-audits.js — per-MA audits ported from the
 * author's corpus-scale atlas projects. The audits DELEGATE pooling to the
 * R-verified shared/ma-core.js, so this spec locks the comparison logic and the
 * mathematical invariants the source atlases enforce, not a second copy of the
 * pooling math.
 *
 *   hksjQFloorAudit  hksj-q-floor-atlas (src/diff_engine.py invariants):
 *                    width ratio (floored/unfloored) >= 1 always; == inf when Q=0;
 *                    the floor binds exactly in the I^2=0 / Q<k-1 regime; a flip
 *                    from significant->non-significant is the only legal direction.
 *   reproFloorAudit  repro-floor-atlas Scenario B (precision_floor.py +
 *                    classifier.py): round forest-plot yi/se to dp, re-pool
 *                    fixed-effect, |Δ| vs machine-precision pool; numpy half-even
 *                    rounding replicated exactly. Reference deltas from numpy.
 *   classifyRobustness / fragilityRobustness
 *                    fragility-atlas (src/classifier.py): the agreement rule +
 *                    robustness % + Robust/Moderate/Fragile/Unstable bins ported
 *                    verbatim and locked on a controlled spec vector; the grid runs
 *                    on the audited ma-core (browser subset), so the end-to-end
 *                    score is checked behaviourally (classification bin), not bit
 *                    against the atlas's larger R grid.
 *
 * Host: review-project/index.html (loads ../shared/ma-core.js + atlas-audits.js
 * → window.AlmMaCore + window.AtlasAudits).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/review-project/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon/;

// I^2=0 regime: near-identical effects so Q << k-1 and the floor binds hard.
const HOM_YI = [0.10, 0.11, 0.09, 0.105, 0.095];
const HOM_VI = [0.20, 0.22, 0.18, 0.25, 0.21].map(s => s * s);
// Heterogeneous: Q > k-1 so raw HKSJ >= Wald and the floor does NOT bind.
const HET_YI = [-0.15, -0.10, -0.20, 0.02, -0.30, -0.05];
const HET_VI = [0.05, 0.06, 0.07, 0.09, 0.08, 0.10].map(s => s * s);
// Q=0 exactly: identical effects -> un-floored HKSJ SE = 0, ratio infinite.
const Q0_YI = [0.2, 0.2, 0.2, 0.2];
const Q0_VI = [0.04, 0.05, 0.06, 0.045];

test('HKSJ Q-floor audit reproduces the atlas regime behaviour + invariants', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.AtlasAudits && window.AlmMaCore), { timeout: 10000 });

  const got = await page.evaluate(({ homYi, homVi, hetYi, hetVi, q0Yi, q0Vi }) => {
    const A = window.AtlasAudits, pool = window.AlmMaCore.pool;
    return {
      hom: A.hksjQFloorAudit(homYi, homVi, pool),
      het: A.hksjQFloorAudit(hetYi, hetVi, pool),
      q0: A.hksjQFloorAudit(q0Yi, q0Vi, pool),
      guard: A.hksjQFloorAudit([0.1], [0.04], pool),   // k<2
    };
  }, { homYi: HOM_YI, homVi: HOM_VI, hetYi: HET_YI, hetVi: HET_VI, q0Yi: Q0_YI, q0Vi: Q0_VI });

  // I^2=0 regime: floor binds, CI widens ~25.9x, raw HKSJ shrank the SE far below
  // the floored (== Wald) SE, and flooring honestly removes the manufactured significance.
  expect(got.hom.i2).toBeCloseTo(0, 6);
  expect(got.hom.floorBinds).toBe(true);
  expect(got.hom.widthRatio).toBeCloseTo(25.90580773, 5);
  expect(got.hom.seFloored).toBeCloseTo(0.09316906, 6);
  expect(got.hom.seUnfloored).toBeCloseTo(0.00359645, 6);
  expect(got.hom.sigUnfloored).toBe(true);
  expect(got.hom.sigFloored).toBe(false);
  expect(got.hom.sigLoss).toBe(true);

  // Heterogeneous: floor does not bind; ratio is exactly 1; no conclusion change.
  expect(got.het.i2).toBeGreaterThan(0);
  expect(got.het.floorBinds).toBe(false);
  expect(got.het.widthRatio).toBeCloseTo(1, 6);
  expect(got.het.sigLoss).toBe(false);

  // Q=0 degeneracy: un-floored width = 0 -> ratio infinite, flagged.
  expect(got.q0.qZero).toBe(true);
  expect(got.q0.widthRatio).toBe(Infinity);
  expect(got.q0.floorBinds).toBe(true);

  // Invariants across all three: ratio >= 1, and sig-gain (un-floored not sig ->
  // floored sig) is mathematically impossible.
  for (const r of [got.hom, got.het, got.q0]) {
    expect(r.widthRatio).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(!r.sigUnfloored && r.sigFloored).toBe(false);
  }

  // k<2 guard
  expect(got.guard).toBeNull();

  expect(errs, 'no console errors on the host page').toEqual([]);
});

test('reproduction-floor audit matches numpy half-even Scenario-B references', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.AtlasAudits, { timeout: 10000 });

  // FAIL fixture: 3-dp effects with tiny SEs, so rounding to 2 dp distorts the pool.
  const FAIL_YI = [0.123, 0.087, 0.151, 0.099];
  const FAIL_SE = [0.004, 0.006, 0.005, 0.007];

  const got = await page.evaluate(({ yi, sei, failYi, failSe }) => {
    const A = window.AtlasAudits;
    return {
      // already-2dp forest values -> rounding is a no-op -> reproduces exactly
      f6: A.reproFloorAudit(yi, sei, 2),
      fail: A.reproFloorAudit(failYi, failSe, 2),
      // half-even tie behaviour must match numpy np.round
      he: [A._roundHalfEven(0.125, 2), A._roundHalfEven(0.135, 2), A._roundHalfEven(-0.125, 2), A._roundHalfEven(2.5, 0)],
      guard: A.reproFloorAudit([0.1], [0.05, 0.06], 2),  // length mismatch
    };
  }, { yi: HET_YI, sei: [0.05, 0.06, 0.07, 0.09, 0.08, 0.10], failYi: FAIL_YI, failSe: FAIL_SE });

  // numpy half-even ties
  expect(got.he).toEqual([0.12, 0.14, -0.12, 2]);

  // F6: inputs already at 2 dp -> delta exactly 0 -> reproducible
  expect(got.f6.truthPooled).toBeCloseTo(-0.14109443, 6);
  expect(got.f6.delta).toBe(0);
  expect(got.f6.reproducible).toBe(true);

  // FAIL: numpy reference truth=0.120545916256, |Δ|=0.014454083744, fails both thresholds
  expect(got.fail.truthPooled).toBeCloseTo(0.12054592, 6);
  expect(got.fail.absDelta).toBeCloseTo(0.01445408, 6);
  expect(got.fail.exceedsFixed).toBe(true);
  expect(got.fail.exceedsAdaptive).toBe(true);
  expect(got.fail.reproducible).toBe(false);

  // length-mismatch guard
  expect(got.guard).toBeNull();

  expect(errs, 'no console errors on the host page').toEqual([]);
});

test('fragility robustness: classifier logic verbatim + end-to-end classification bins', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.AtlasAudits && window.AlmMaCore), { timeout: 10000 });

  // Fragile fixture: DL-Wald reference is significant, but the influential first
  // study + HKSJ widening flip most specs to non-significant -> Unstable.
  const FRAG_YI = [-0.3, -0.05, -0.08, -0.02, -0.06];
  const FRAG_VI = [0.10, 0.12, 0.13, 0.11, 0.14].map(s => s * s);

  const got = await page.evaluate(({ sigYi, sigVi, fragYi, fragVi }) => {
    const A = window.AtlasAudits, pool = window.AlmMaCore.pool;
    // Controlled spec vector, ref=(-1, true): 6 agree, 1 reversed, 7 significant of 10.
    const D = (direction, isSignificant) => ({ direction, isSignificant });
    const specs = [
      D(-1, true), D(-1, true), D(-1, true), D(-1, true), D(-1, true), D(-1, true),
      D(-1, false), D(-1, false), D(1, true), D(1, false),
    ];
    return {
      logic: A.classifyRobustness(specs, -1, true),
      sig: A.fragilityRobustness(sigYi, sigVi, pool),
      frag: A.fragilityRobustness(fragYi, fragVi, pool),
      guard: A.fragilityRobustness([0.1, 0.2], [0.04, 0.05], pool),  // k<3
    };
  }, { sigYi: HOM_YI, sigVi: HOM_VI, fragYi: FRAG_YI, fragVi: FRAG_VI });

  // classifier logic ported verbatim from classifier.py
  expect(got.logic.totalSpecs).toBe(10);
  expect(got.logic.agreeingSpecs).toBe(6);
  expect(got.logic.robustnessScore).toBeCloseTo(60, 9);
  expect(got.logic.classification).toBe('Fragile');
  expect(got.logic.fracReversed).toBeCloseTo(0.1, 9);
  expect(got.logic.fracSignificant).toBeCloseTo(0.7, 9);

  // bins: >=90 Robust, >=70 Moderate, >=50 Fragile, else Unstable
  // (the homogeneous SIG fixture is well-separated -> every spec agrees -> Robust)
  expect(got.sig.robustnessScore).toBeCloseTo(100, 9);
  expect(got.sig.classification).toBe('Robust');
  // the reference spec must always agree with itself
  expect(got.sig.agreeingSpecs).toBeGreaterThan(0);

  // fragile fixture lands in the low-robustness bin (same conclusion as the atlas,
  // even though the exact % differs by engine/grid)
  expect(got.frag.classification).toBe('Unstable');
  expect(got.frag.robustnessScore).toBeLessThan(50);
  expect(got.frag.robustnessScore).toBeGreaterThanOrEqual(0);

  // k<3 guard
  expect(got.guard).toBeNull();

  expect(errs, 'no console errors on the host page').toEqual([]);
});
