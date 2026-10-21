/**
 * copas-core-refusals.test.mjs — what shared/copas-core.js does with input it
 * cannot actually fit.
 *
 *   node --test copas/tests/copas-core-refusals.test.mjs   (from the repo root)
 *
 * The fixture-driven parity suites check the engine on data it CAN fit. This
 * file covers the other half: inputs that are schema-valid and look ordinary
 * but on which the Copas selection model is not identified. The failure mode
 * these guard against is not a crash -- it is the opposite. A NaN objective,
 * or an empty orthogonal line, used to be converted into a schema-valid,
 * range-plausible number and rendered as an estimate (review-212 MAJOR-11 and
 * MAJOR-14). That is the "substitution-on-missing" pattern, and it is strictly
 * worse than an error because nothing downstream can see it.
 *
 * Every refusal here is a distinct `refused` string, so the page can say which
 * one happened rather than guessing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const CC = require(path.resolve(here, "../../shared/copas-core.js"));

const fit = (TE, seTE, extra) =>
  CC.copas(Object.assign({ TE, seTE, ngrid: 10 }, extra || {}));

test("the pre-existing refusals still refuse, and say which", () => {
  // k < 3.
  let r = fit([0.2, 0.3], [0.1, 0.2]);
  assert.equal(r.refused, "k<3");
  assert.equal(r.k, 2);
  // Non-finite rows are dropped before k is counted, and the count is reported.
  r = fit([0.2, 0.3, NaN, 0.4], [0.1, 0.2, 0.1, Infinity]);
  assert.equal(r.dropped, 2);
  // seTE exactly constant: the selection function has nothing to vary against.
  r = fit([0.2, 0.3, 0.4, 0.25], [0.1, 0.1, 0.1, 0.1]);
  assert.equal(r.refused, "seTE.min==seTE.max");
  // A refusal is a TRUTHY object, not null — the reason MINOR-15's comment was
  // wrong. A caller writing `if (!result)` would read it as a successful fit.
  assert.ok(r, "a refusal must be truthy so `if (!r || r.refused)` is needed");
  assert.equal(r.TE_adjust, undefined, "a refusal must carry no estimate");
});

/* -------------------------------------------------------------- MAJOR-11 ---
 * A near-degenerate seTE spread is refused, not turned into a plausible number.
 *
 * The only identification guard was the strict inequality `seMin < seMax`, so
 * seTE = [0.1, 0.1, 0.1, 0.1, 0.1000001] passed it. Then
 *   gamma1.range[1] = 1.29 / (1/seMin - 1/seMax) = 1.29 / 1.0e-5 ~ 129,000
 *   gamma0.range[0] = -0.25 - 129000/0.1000001  ~ -1.29e6
 * so at the first grid column u = gamma0 + gamma1/seTE ~ -1.29e6, pnorm(u) and
 * dnorm(u) both underflow to 0 and lambda(u) = 0/0 = NaN -- deliberately, to
 * match R. The objective is then NaN, and minimiseBox returns {par: <the start
 * vector>, value: NaN}: bbDescent breaks on the first non-finite gradient, and
 * nelderMead and patternSearch run to their iteration limits with every
 * comparison false, because NaN < x is false. TE.contour[i + j*ngrid] then
 * stored fit0.par[0] -- the DerSimonian-Laird / REML start value for mu, a
 * perfectly plausible-looking treatment effect -- for every failed grid point,
 * and pretty() and contourLines() ran on a surface that was partly a constant.
 *
 * Because the try()-carry-forward is deliberately not reproduced there was no
 * duplicate-value signature to detect it by either.
 *
 * FAILS WITHOUT THE FIX: the fit succeeds and returns a finite TE_adjust built
 * on a surface that is mostly the optimiser's own start value.
 */
test("near-degenerate seTE is refused before the gamma ranges explode", () => {
  const TE = [0.25, 0.18, 0.40, 0.30, 0.12];
  const seTE = [0.1, 0.1, 0.1, 0.1, 0.1000001];
  const r = fit(TE, seTE);
  assert.equal(r.refused, "seTE.near-degenerate",
    `expected a near-degeneracy refusal, got ${JSON.stringify(r.refused)}`);
  assert.ok(!Number.isFinite(r.TE_adjust),
    "a refused fit must not report an adjusted estimate");
  // The reason is reported quantitatively, so the page can explain it and a
  // reviewer can see which bound was hit rather than taking the string on trust.
  assert.ok(Number.isFinite(r.seTE_spread), "the measured spread must be reported");
  assert.ok(r.seTE_spread < 1e-5, `spread ${r.seTE_spread} should be tiny here`);
});

test("an ordinary seTE spread is NOT refused by the new guard", () => {
  // The guard must not catch real data. These are the copas-tiny SEs (spread
  // 0.65) and a deliberately tight-but-real spread (0.0476), both of which
  // must still fit.
  for (const seTE of [
    [0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10],
    [0.100, 0.101, 0.102, 0.103, 0.104, 0.105],
  ]) {
    const TE = seTE.map((s, i) => 0.2 + 0.1 * Math.sin(i));
    const r = fit(TE, seTE);
    assert.ok(!r.refused,
      `spread ${(1 - Math.min(...seTE) / Math.max(...seTE)).toExponential(2)} ` +
      `must still fit, got refused: ${r.refused}`);
    assert.equal(r.k, seTE.length);
  }
});

test("a non-finite objective anywhere on the grid is counted, not hidden", () => {
  // The surface-level half of MAJOR-11: whatever the guard lets through, a
  // grid point whose attained objective is not finite must be reported rather
  // than silently storing the optimiser's start value as a treatment effect.
  const seTE = [0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10];
  const TE = [0.25, 0.18, 0.40, 0.30, 0.12, 0.55, 0.22, 0.32, 0.45, 0.28];
  const r = fit(TE, seTE);
  assert.ok(!r.refused, `clean data must fit, got ${r.refused}`);
  assert.equal(typeof r.contour_nonfinite, "number",
    "copas() must report how many grid points failed to attain a finite objective");
  assert.equal(r.contour_nonfinite, 0, "clean data must have no failed grid points");
});

/* -------------------------------------------------------------- MAJOR-14 ---
 * A collapsed orthogonal line is refused, not reported as a Copas adjustment.
 *
 * If no contour line has adjRSquared > 0, orthogonalLine() sets slope = NaN,
 * every xSlope becomes NaN, the in-range filter drops them all, and
 * gamma0Slope is just the prepended (10, 0) no-selection anchor. Then ng = 1,
 * publprob = [pnorm(10)] = [1], and the single "sensitivity" point is the
 * profile MLE at u = 10, i.e. NO SELECTION AT ALL. If its pval.rsb exceeds
 * sign.rsb, adjustSelection returns 1 and the page printed that value in bold
 * as the "Copas-adjusted effect", with a CI, a p-value and an implied number
 * of unpublished studies -- while drawSens() blanked the curve because
 * results.length < 2 and nothing said the orthogonal line was empty. The user
 * saw the UNADJUSTED MLE labelled as the adjusted one.
 *
 * FAILS WITHOUT THE FIX: TE_adjust is finite and equals the no-selection MLE.
 */
test("a collapsed orthogonal line is refused with its own reason", () => {
  // Driven through the documented `slope` override rather than hunting for a
  // dataset with a degenerate contour surface: slope = NaN is exactly the
  // state orthogonalLine() reaches when no contour line has adjRSquared > 0.
  // (The other route to the same state -- a finite slope whose intersections
  // all rescale outside the gamma ranges -- is what 5 of the validation
  // archive's 138 configurations hit, and `ng < 2` catches both.)
  const TE = [0.25, 0.18, 0.40, 0.30, 0.12, 0.55, 0.22, 0.32, 0.45, 0.28];
  const seTE = [0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10];
  const r = fit(TE, seTE, { slope: NaN });
  assert.equal(r.refused, "orthogonal-line.empty",
    `expected an empty-orthogonal-line refusal, got ${JSON.stringify(r.refused)}`);
  assert.equal(r.n_orthogonal_points, 1,
    "the refusal should report how many points the line collapsed to " +
    "(1 = the no-selection anchor alone)");
  assert.ok(Math.abs(r.publprob[0] - 1) < 1e-12,
    "the single point is the (10, 0) anchor, i.e. publprob 1 — no selection");
  // THIS is the fix: a renderer must refuse. The page tests `fit.refused`
  // before it displays anything, so neither of the two things the review
  // describes can reach the user any more.
  //
  // But the estimates are deliberately STILL PRESENT, because metasens does
  // not refuse in this state and 5 of the archive's 138 configurations are in
  // it: returning early would make the port disagree with metasens there and
  // move the archive's comparison counts. A parity harness reads straight
  // through `refused`; a renderer must not.
  assert.equal(typeof r.n_contour_lines, "number");
  assert.ok(Array.isArray(r.contour_lines),
    "`contour_lines` is the array of lines on this path too, and " +
    "`n_contour_lines` is the count — one name, one meaning");
  assert.equal(r.TE_slope.length, 1, "one estimate, at the anchor");
  assert.ok(Math.abs(r.N_unpubl[0]) < 1e-9,
    "no selection implies no unpublished studies");

  // Both downstream outcomes exist, and the page used to present each of them
  // misleadingly. metasens's own rule decides which, so neither is changed
  // here — only whether the page shows it.
  //
  //   (a) pval.rsb <= sign.rsb: adjustSelection withholds, TE.adjust is NaN,
  //       and the page printed "not reported — every point of the orthogonal
  //       line shows residual selection bias", blaming the data for what is
  //       really an empty line.
  assert.ok(r.pval_rsb[0] <= 0.1);
  assert.equal(r.sel_adj, null);
  assert.ok(Number.isNaN(r.TE_adjust));

  //   (b) pval.rsb > sign.rsb: adjustSelection returns 1 and the page printed
  //       the NO-SELECTION MLE in bold as the "Copas-adjusted effect".
  const r2 = fit(TE, seTE, { slope: NaN, sign_rsb: 1e-6 });
  assert.equal(r2.refused, "orthogonal-line.empty");
  assert.equal(r2.sel_adj, 1);
  assert.ok(Number.isFinite(r2.TE_adjust),
    "estimates must remain readable for parity work — only the page refuses");
  assert.ok(Math.abs(r2.TE_adjust - r2.TE_slope[0]) < 1e-15,
    "the 'adjusted' value IS the single anchor estimate");
  assert.ok(Math.abs(r2.N_unpubl_adj) < 1e-9,
    "...and it implies zero unpublished studies, which is the tell");
});

test("a successful fit reports refused === null, so `r.refused` is a safe test", () => {
  const TE = [0.25, 0.18, 0.40, 0.30, 0.12, 0.55, 0.22, 0.32, 0.45, 0.28];
  const seTE = [0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10];
  const r = fit(TE, seTE);
  assert.equal(r.refused, null,
    "a successful fit must set refused to null, not leave it undefined, so " +
    "the field is always present and always means the same thing");
  assert.ok(r.n_orthogonal_points >= 2);
  assert.ok(Number.isFinite(r.TE_adjust));
});

test("orthogonalLine still reports the collapse rather than throwing", () => {
  // The stage-3 primitive itself: NaN slope in, anchor-only line out. copas()
  // turns that into a refusal; a direct caller gets to see the shape.
  const ol = CC.orthogonalLine({
    regr: { levels: [1, 2], nobs: [5, 5], adj_r_squareds: [-100, -100],
            slopes: [NaN, NaN], se_slopes: [NaN, NaN], intercepts: [0, 0] },
    gamma0: [-2, 0, 2], gamma1: [0, 0.5, 1],
    gamma0Range: [-2, 2], gamma1Range: [0, 1], seTEmax: 0.2,
  });
  assert.ok(Number.isNaN(ol.slope), "no usable contour line => slope is NaN");
  assert.deepEqual(ol.gamma0Slope, [10], "only the no-selection anchor survives");
  assert.deepEqual(ol.gamma1Slope, [0]);
  assert.equal(ol.publprob.length, 1);
  assert.ok(Math.abs(ol.publprob[0] - 1) < 1e-12,
    "the anchor is pnorm(10) = 1, i.e. no selection");
});
