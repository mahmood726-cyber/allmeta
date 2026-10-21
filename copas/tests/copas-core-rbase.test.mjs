/**
 * copas-core-rbase.test.mjs — the R base-stats routines shared/copas-core.js
 * ports, pinned directly against R rather than only through copas().
 *
 *   node --test copas/tests/copas-core-rbase.test.mjs      (from the repo root)
 *
 * Why this file exists. Three defects in the port were found and fixed by
 * commit 43ae0db -- the pnorm far-tail cutoff (37 -> 40), West's four-term
 * Mills truncation -> a 24-term continued fraction, and summary.lm's
 * rank-deficient branch for a constant predictor. All three fixes are correct,
 * but the parity suite reported 30/30 BEFORE and AFTER them: not one test in
 * the repository failed without any of the three. The coverage existed only in
 * the validation archive, which needs R 4.6.0 + metasens 1.5.3 and takes about
 * two hours, so CI could not detect a regression of any of them.
 *
 * Each test below fails without its fix, and the failure is recorded next to
 * it. The reference values come from R 4.6.0 itself, captured in
 * lanes/rev212/logs/r-unit-pins.log -- not from a commit message.
 *
 * These are unit tests of R's OWN functions as ported, so the tolerance is the
 * one appropriate to a double-precision reimplementation (1e-15 relative,
 * i.e. a handful of ULPs), not copas()'s iterative tiers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const CC = require(path.resolve(here, "../../shared/copas-core.js"));

const REL = 1e-15;

function rel(name, got, want, tol) {
  tol = tol === undefined ? REL : tol;
  if (want === 0) {
    assert.equal(got, 0, `${name}: ${got} != 0`);
    return;
  }
  const d = Math.abs(got - want) / Math.abs(want);
  assert.ok(d <= tol,
    `${name}: ${got} vs R's ${want} — relative ${d.toExponential(3)} > ${tol.toExponential(0)}`);
}

/* ---------------------------------------------------------------- fix 1 ---
 * pnorm's far-tail cutoff is 40, not 37.
 *
 * R's pnorm returns a positive (subnormal) value out to about z = -37.52, and
 * lambda(u) = dnorm(u)/pnorm(u) is the Copas model's inverse Mills ratio. With
 * the cutoff at 37, pnorm(-37.6) is forced to 0 while dnorm(-37.6) is still
 * about 4e-308, so lambda(-37.6) becomes Inf instead of about 37.63 — and the
 * port deliberately carries no tail guard in lambda(), to match R.
 *
 * FAILS WITHOUT THE FIX: with `if (z > 37) p = 0`, lambda(-37.6) is Infinity.
 * The pre-existing lambda(-40) assertion cannot see this: dnorm(-40) underflows
 * to exactly 0, so lambda(-40) is 0/0 = NaN under both cutoffs.
 */
test("pnorm's far tail is cut off at 40, so lambda stays finite to R's limit", () => {
  // The discriminating value. Inf before the fix, this after it.
  rel("lambda(-37.6)", CC.lambda(-37.6), 37.626558252923594);
  rel("pnorm(-37.6)", CC.pnorm(-37.6), 1.0748112495870443e-309, 1e-13);
  assert.ok(Number.isFinite(CC.lambda(-37.6)), "lambda(-37.6) must be finite");
  // Just inside the old cutoff, where the old code was already right.
  rel("lambda(-37)", CC.lambda(-37), 37.026987686126986);
  rel("pnorm(-37)", CC.pnorm(-37), 5.7255712225245771e-300);
  // Just below R's own subnormal limit: R returns 0 here and so must the port,
  // which is what makes lambda NaN rather than Inf.
  assert.equal(CC.pnorm(-40), 0, "pnorm(-40) must be 0, as in R");
  assert.ok(Number.isNaN(CC.lambda(-40)), "lambda(-40) must be NaN, as in R");
  // pnorm(-37.5) is the last normal double R reports; both branches of the
  // cutoff must agree with R there.
  rel("pnorm(-37.5)", CC.pnorm(-37.5), 4.6053530095819552e-308);
  rel("lambda(-37.5)", CC.lambda(-37.5), 37.526628874883656);
});

/* ---------------------------------------------------------------- fix 2 ---
 * The Mills-ratio continued fraction needs 24 terms, not West's 4.
 *
 * loglikWithoutBeta clamps v at -37 before log(pnorm(v)), so the z >= 7.07
 * branch IS reachable from the likelihood, and a 3e-9 relative error in pnorm
 * propagates into the objective.
 *
 * FAILS WITHOUT THE FIX: West's four-term truncation is about 3e-9 relative at
 * z = 10, i.e. about six orders of magnitude outside the 1e-15 asserted here.
 *
 * Writing this test turned up a separate, pre-existing accuracy step at the
 * branch boundary itself; it is measured, pinned and explained in the third
 * test below rather than silently fixed.
 */
test("pnorm's continued-fraction branch matches R to machine precision", () => {
  // Every one of these is on the z >= sqrt(50) branch fix 2 rewrote, and every
  // one is held to 1e-15 — which is the claim the fix made and which the
  // four-term truncation misses by about six orders of magnitude at z = 10.
  rel("pnorm(-7.07106781186547)", CC.pnorm(-7.07106781186547), 7.6872989721404544e-13);
  rel("pnorm(-7.5)", CC.pnorm(-7.5), 3.1908916729108963e-14);
  rel("pnorm(-8)", CC.pnorm(-8), 6.2209605742717849e-16);
  // The value quoted in 43ae0db, now actually asserted.
  rel("pnorm(-10)", CC.pnorm(-10), 7.6198530241605269e-24);
  rel("pnorm(-15)", CC.pnorm(-15), 3.6709661993127514e-51);
  rel("pnorm(-20)", CC.pnorm(-20), 2.7536241186062337e-89);
  rel("pnorm(-30)", CC.pnorm(-30), 4.9067139271481872e-198);
});

test("pnorm's rational branch matches R, to the accuracy it actually has", () => {
  // The ordinary range, so a change to the tail cannot break the body.
  assert.equal(CC.pnorm(0), 0.5, "pnorm(0) must be exactly 0.5");
  rel("pnorm(-0.5)", CC.pnorm(-0.5), 3.08537538725986937e-1);
  rel("pnorm(-1)", CC.pnorm(-1), 0.15865525393145705);
  rel("pnorm(-2)", CC.pnorm(-2), 2.27501319481792121e-2);
  rel("pnorm(-3)", CC.pnorm(-3), 1.34989803163009458e-3, 1e-13);
  // From here the Hart/West rational approximation degrades monotonically. The
  // bounds below are MEASURED against R 4.6.0, not aspirational:
  // lanes/rev212/logs/pnorm-branch-accuracy.log. They are pinned rather than
  // rounded up to something comfortable, so the degradation is visible and a
  // regression is caught.
  rel("pnorm(-4)", CC.pnorm(-4), 3.16712418331199243e-5, 2e-13);
  rel("pnorm(-5)", CC.pnorm(-5), 2.8665157187919391e-07, 5e-11);
  rel("pnorm(-6)", CC.pnorm(-6), 9.86587645037698091e-10, 6e-10);
  rel("pnorm(-7.07)", CC.pnorm(-7.07), 7.7466848656364781e-13, 3e-9);
  // Symmetry: pnorm(-z) = 1 - pnorm(z) is how the port derives the upper tail.
  for (const z of [0.25, 1, 2.5]) {
    rel(`1-pnorm(${z})`, 1 - CC.pnorm(z), CC.pnorm(-z), 1e-14);
  }
  // The identity pchisq1Upper relies on: 1 - pchisq(q, 1) = 2*pnorm(-sqrt(q)).
  rel("pchisq1Upper(0)", CC.pchisq1Upper(0), 1);
  rel("pchisq1Upper(3.841458820694124)", CC.pchisq1Upper(3.841458820694124), 0.05, 1e-12);
  assert.equal(CC.pchisq1Upper(-1), 1, "negative q must give 1, as 1-pchisq does");
});

/* A finding of this test file, recorded rather than quietly fixed.
 *
 * The 24-term continued fraction reaches machine precision from about z = 4.5,
 * while the rational branch is still only ~5e-11 there and ~2.6e-9 by z = 7.
 * The branch boundary at z = sqrt(50) therefore sits about 2.5 units ABOVE the
 * crossover, and pnorm is roughly four orders of magnitude less accurate just
 * below the boundary than just above it. Measured against R 4.6.0:
 *
 *   z     rational    cf(24 terms)
 *   4.0   1.24e-13    3.19e-14
 *   4.5   6.27e-12    1.50e-15
 *   5.0   4.58e-11    1.85e-16
 *   6.0   5.35e-10    2.10e-16
 *   7.0   2.63e-09    0
 *
 * Lowering the boundary to about 4.5 would make pnorm agree with R to ~1e-15
 * across the whole range. It is NOT done here: changing pnorm perturbs every
 * likelihood evaluation, and the validation archive's counts (245,259 /
 * 240,813 trace assertions, 2,541 probes, and the 84-of-42,498 shortfall) are
 * reported in the paper and cannot be re-derived from this lane -- a two-hour
 * archive run under R 4.6.0 + metasens 1.5.3 would have to re-establish them
 * first. The step is pinned below so that it is a known, bounded quantity
 * rather than a surprise, and so the eventual fix has a before/after number.
 * loglikWithoutBeta clamps v at -37 and the fixture's converged v values are
 * small, which is why the 1e-9 deterministic tier still holds today.
 */
test("the pnorm branch boundary is a known accuracy step, not a smooth join", () => {
  const RJUST_BELOW = 7.7466848656364781e-13;   // R's pnorm(-7.07)
  const RJUST_ABOVE = 7.6872989721404544e-13;   // R's pnorm(-7.07106781186547)
  const below = Math.abs(CC.pnorm(-7.07) - RJUST_BELOW) / RJUST_BELOW;
  const above = Math.abs(CC.pnorm(-7.07106781186547) - RJUST_ABOVE) / RJUST_ABOVE;
  assert.ok(above <= 1e-15,
    `above the boundary the continued fraction must be at machine precision, got ${above.toExponential(2)}`);
  assert.ok(below <= 3e-9,
    `below the boundary the rational branch has regressed past its measured ` +
    `2.9e-9: got ${below.toExponential(2)}`);
  assert.ok(below > 1e-11,
    "the rational branch below the boundary is now MORE accurate than its " +
    `measured 2.9e-9 (got ${below.toExponential(2)}) — if the boundary was ` +
    "moved or the approximation replaced, that is an improvement, but it " +
    "changes every likelihood evaluation: re-run the validation archive and " +
    "update the counts the paper reports before relaxing this test.");
});

/* ---------------------------------------------------------------- fix 3 ---
 * summary.lm's rank-deficient branch: a constant predictor gives
 * adj.r.squared = 0, not NaN.
 *
 * R's lm pivots the slope out of the QR, so rank == 1 == the intercept term and
 * summary.lm takes `r.squared <- adj.r.squared <- 0` instead of the
 * 1 - (1 - r2)(n - 1)/rdf formula. copas() maps a NaN adj.r.squared to the -100
 * sentinel and a 0 to "excluded from the orthogonal-line pool", so the two are
 * NOT interchangeable downstream.
 *
 * FAILS WITHOUT THE FIX: without the `if (!(Sxx > 0))` branch, slope is 0/0 so
 * mss and rss are NaN and adjRSquared comes out NaN (the review notes the
 * stated "-Inf at n = 2" was itself inconsistent). A contour line with exactly
 * constant x does not arise on a smooth 20x20 surface, which is why the
 * fixture-driven comparison cannot reach this; a direct unit test can.
 */
test("lmYX reproduces summary.lm's rank-deficient branch on a constant x", () => {
  for (const [n, xs, ys, intercept] of [
    [3, [1, 1, 1], [0, 1, 2], 1],
    [2, [1, 1], [0, 1], 0.5],
    [4, [2, 2, 2, 2], [0, 1, 2, 5], 2],
  ]) {
    const f = CC.lmYX(xs, ys);
    assert.equal(f.nobs, n, `nobs for the n=${n} constant-x case`);
    // The discriminating assertion: R reports 0 here, not NaN.
    assert.equal(f.adjRSquared, 0,
      `n=${n} constant x: adj.r.squared must be exactly 0 (R's rank-deficient ` +
      `branch), got ${f.adjRSquared}`);
    assert.ok(Number.isNaN(f.slope), `n=${n}: slope must be NA, as R pivots it out`);
    assert.ok(Number.isNaN(f.seSlope), `n=${n}: se.slope must be NA`);
    rel(`n=${n} intercept`, f.intercept, intercept, 1e-14);
  }
});

test("lmYX reproduces summary.lm on the non-degenerate cases either side", () => {
  // n = 2 with distinct x: exactly determined, so rdf = 0. R gives a finite
  // slope, NaN se.slope and NaN adj.r.squared — all three differ from the
  // constant-x case above, which is the distinction fix 3 turns on.
  const f2 = CC.lmYX([1, 2], [0, 1]);
  assert.equal(f2.nobs, 2);
  rel("n=2 slope", f2.slope, 0.99999999999999989, 1e-14);
  rel("n=2 intercept", f2.intercept, -0.99999999999999956, 1e-14);
  assert.ok(Number.isNaN(f2.seSlope), "n=2 se.slope must be NaN (rdf = 0)");
  assert.ok(Number.isNaN(f2.adjRSquared), "n=2 adj.r.squared must be NaN, NOT 0");
  // n = 3, ordinary: every quantity finite and equal to R's.
  const f3 = CC.lmYX([1, 2, 3], [0, 1, 2.5]);
  assert.equal(f3.nobs, 3);
  rel("n=3 slope", f3.slope, 1.2500000000000002, 1e-14);
  rel("n=3 intercept", f3.intercept, -1.3333333333333341, 1e-14);
  rel("n=3 se.slope", f3.seSlope, 0.14433756729740638, 1e-14);
  rel("n=3 adj.r.squared", f3.adjRSquared, 0.97368421052631593, 1e-14);
});
