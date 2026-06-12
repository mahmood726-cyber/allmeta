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
