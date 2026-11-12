/**
 * copas-core-lbfgsb.test.mjs — the L-BFGS-B port against R's own optim().
 *
 * fixtures/optim-lbfgsb-fixture.json was written by
 * fixtures/gen-optim-lbfgsb-fixture.R (R 4.6.0): optim(method = "L-BFGS-B") with
 * default control on objectives whose arithmetic is identical in R and JS
 * (Rosenbrock with and without analytic gradient, bounded and unbounded, a start
 * outside the box, and a 25-dimensional bounded problem with optim()'s own
 * finite differences). The port must take the same path: same function-count,
 * same convergence code and message, same iterate to rounding.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CC = require("../../shared/copas-core.js");
const cases = JSON.parse(readFileSync(new URL("./fixtures/optim-lbfgsb-fixture.json", import.meta.url), "utf8"));

const fr = (x) => { const a = x[0], b = x[1]; return 100 * Math.pow(b - a * a, 2) + Math.pow(1 - a, 2); };
const grr = (x) => { const a = x[0], b = x[1]; return [-400 * a * (b - a * a) - 2 * (1 - a), 200 * (b - a * a)]; };
const flb = (x) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) { const c = i === 0 ? 1 : 4, p = i === 0 ? 1 : x[i - 1], t = x[i] - p * p; s = s + c * (t * t); }
  return s;
};
const num = (v) => (v === "Inf" ? Infinity : v === "-Inf" ? -Infinity : v);

test("fixture covers the bounded, unbounded, numerical-gradient and infeasible-start cases", () => {
  assert.ok(cases.length >= 8);
  assert.ok(cases.some((c) => !c.gr) && cases.some((c) => c.gr));
});

for (const c of cases) {
  test(`L-BFGS-B follows R's path: ${c.name}`, () => {
    const fn = c.name.startsWith("flb") ? flb : fr;
    const r = CC.optimLBFGSB(fn, c.gr ? grr : null, [].concat(c.par0),
      [].concat(c.lower).map(num), [].concat(c.upper).map(num));
    assert.equal(r.counts[0], [].concat(c.counts)[0], "function count must equal R's");
    assert.equal(r.convergence, c.conv);
    assert.equal(r.message, c.msg);
    const want = [].concat(c.par);
    for (let i = 0; i < want.length; i++)
      assert.ok(Math.abs(r.par[i] - want[i]) <= 1e-13 * Math.max(1, Math.abs(want[i])),
        `par[${i}] ${r.par[i]} vs R ${want[i]}`);
    assert.ok(Math.abs(r.value - c.value) <= 1e-12 * Math.max(1, Math.abs(c.value)));
  });
}

test("metaforREML does not cancel when one weight dominates (review finding)", () => {
  // metafor 5.2-1: rma(c(0,1,2), sei = c(2^-17, 1, 2), method = "REML")
  const r = CC.metaforREML([0, 1, 2], [2 ** -17, 1, 2]);
  assert.ok(Math.abs(r.tau2 - 0.178864196806639) < 1e-12, `tau2 ${r.tau2}`);
  assert.ok(Math.abs(r.TE_random - 0.198681061582506) < 1e-12);
  assert.equal(r.converged, true);
  const r2 = CC.metaforREML([0, 0.1, 0.2], [2 ** -17, 1, 2]);   // used to loop forever
  assert.equal(r2.tau2, 0);
});
