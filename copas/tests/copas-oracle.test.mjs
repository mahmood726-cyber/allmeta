/**
 * copas-oracle.test.mjs — shared/copas-core.js against copas-oracle.json.
 *
 *   node --test copas/tests/copas-oracle.test.mjs      (from the repo root)
 *
 * Why this file exists. `copas/tests/fixtures/copas-oracle.json` is the R
 * oracle of `hub/shared/tests/copas-parity.spec.mjs`, which drives the real
 * page in a browser. That spec is the only consumer that existed, so the
 * oracle's parity was invisible to anything but a Playwright run — and the
 * engine it checks has since moved out of `copas/index.html` and into
 * `shared/copas-core.js`, which Node can load directly. This file checks the
 * same oracle, in Node, with no browser and no network, and is strictly
 * stronger than the browser spec on three counts:
 *
 *   - it pins the oracle's provenance (R/metasens versions, k, and the exact
 *     TE/seTE vectors) instead of trusting whatever JSON it is handed;
 *   - it asserts the attained objective is never worse than R's (Tier O), not
 *     only that the parameters are close;
 *   - it adds the deterministic `N_unpubl` at 1e-9.
 *
 * The browser spec is still the one that proves the PAGE is wired to the
 * engine; this one proves the engine is right. Both read the same oracle, so
 * regenerating it (`Rscript copas/tests/fixtures/copas-oracle.R`) updates both.
 *
 * Tolerance tiers match the browser spec and PREREG.md: 1e-4 on the iterative
 * (TE, rho, tau), 1e-3 on the Hessian-based seTE, 1e-9 on the deterministic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CC = require(path.join(root, "shared/copas-core.js"));
const MC = require(path.join(root, "shared/ma-core.js"));
const O = JSON.parse(
  readFileSync(path.join(here, "fixtures/copas-oracle.json"), "utf8"));

const TOL = 1e-4;        // TE / rho / tau, as in the browser spec
const SE_TOL = 1e-3;     // seTE via the numeric Hessian
const TOL_DET = 1e-9;    // closed-form functions of R's own values
const SLACK = 1e-12;     // Tier O: relative slack on "never worse"

const TE = O.TE.slice(), seTE = O.seTE.slice();

// The oracle's own input, read back from the CSV it was generated from, so a
// silently edited fixture is a failure rather than a new baseline.
function readTinyCsv() {
  const lines = readFileSync(path.join(here, "fixtures/copas-tiny.csv"), "utf8")
    .replace(/\r\n/g, "\n").trim().split("\n");
  assert.equal(lines[0].trim(), "study,yi,sei");
  return lines.slice(1).map((l) => {
    const f = l.split(",");
    return { study: f[0], yi: Number(f[1]), sei: Number(f[2]) };
  });
}

test("oracle provenance is the pinned reference, not whatever JSON is present", () => {
  assert.equal(O.versions.R, "4.6.0");
  assert.equal(O.versions.metasens, "1.5.3");
  assert.equal(O.versions.meta, "8.5.0");
  assert.equal(O.fixture, "copas-tiny");
  assert.equal(O.k, 10);
  assert.equal(TE.length, 10);
  assert.equal(seTE.length, 10);
  assert.equal(O.points.length, 8);
  assert.equal(O.rho_bound, 0.9999);
  // The data itself, not just its length — a truncated or substituted oracle
  // with the right k would otherwise pass (MINOR-19).
  const csv = readTinyCsv();
  assert.equal(csv.length, O.k);
  for (let i = 0; i < csv.length; i++) {
    assert.equal(csv[i].yi, TE[i], `TE[${i}] disagrees with copas-tiny.csv`);
    assert.equal(csv[i].sei, seTE[i], `seTE[${i}] disagrees with copas-tiny.csv`);
  }
  assert.equal(Math.min(...seTE), O.seTE_min);
  assert.equal(Math.max(...seTE), O.seTE_max);
});

test("the browser parity spec drives the same data as the oracle", () => {
  // hub/shared/tests/copas-parity.spec.mjs inlines the rows it feeds the page.
  // If that inline copy drifts from copas-tiny.csv, the browser spec silently
  // compares a different dataset against this oracle and the agreement it
  // reports means nothing.
  const spec = readFileSync(
    path.join(root, "hub/shared/tests/copas-parity.spec.mjs"), "utf8");
  const rows = [...spec.matchAll(/yi:\s*(-?[\d.eE+-]+),\s*sei:\s*(-?[\d.eE+-]+)/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(rows.length, O.k, "spec's inline fixture has the wrong k");
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i][0], TE[i], `spec yi[${i}] != oracle TE[${i}]`);
    assert.equal(rows[i][1], seTE[i], `spec sei[${i}] != oracle seTE[${i}]`);
  }
  assert.ok(spec.includes("copas-oracle.json"));
});

// The two starts the page can hand the optimiser: the oracle was built from
// metagen(method.tau = "DL"), and the page's shipped default is REML. Both are
// checked, so the agreement below is a property of the likelihood and the
// optimiser rather than of one lucky starting vector. (The pre-PR page searched
// three starts across the rho basin; the single metasens start reproduces the
// oracle to 1.8e-5 on TE and 5e-7 on rho, so that search was not load-bearing.)
const vi = seTE.map((s) => s * s);
const STARTS = {
  DL: (() => { const f = MC.pool(TE, vi, { method: "DL" });
               return [f.mu, O.rho0, Math.sqrt(f.tau2)]; })(),
  REML: (() => { const f = MC.pool(TE, vi, { method: "REML" });
                 return [f.mu, O.rho0, Math.sqrt(f.tau2)]; })(),
};

test("the oracle's own start reproduces metagen(method.tau = 'DL')", () => {
  assert.ok(Math.abs(STARTS.DL[0] - O.TE_random) <= 1e-9 * Math.max(1, Math.abs(O.TE_random)),
    `DL pool ${STARTS.DL[0]} vs metagen's ${O.TE_random}`);
  assert.ok(Math.abs(STARTS.DL[2] - O.tau_dl) <= 1e-9 * Math.max(1, Math.abs(O.tau_dl)),
    `DL tau ${STARTS.DL[2]} vs metagen's ${O.tau_dl}`);
  // `left`, and therefore the sign of the rho basin the start sits in, is
  // metasens's Egger-sign determination.
  assert.equal(Math.sign(CC.eggerEstimate(TE, seTE)) === 1, O.left);
  assert.equal(O.rho0, O.left ? O.rho_bound / 2 : -O.rho_bound / 2);
});

for (const [label, start] of Object.entries(STARTS)) {
  test(`profile MLE matches metasens at the oracle's gamma path (${label} start)`, () => {
    let compared = 0;
    for (const pt of O.points) {
      const g = [pt.gamma0, pt.gamma1];
      const fit = CC.profileMLE(TE, seTE, g, start, O.rho_bound);
      const where = `publprob=${pt.publprob}`;
      const near = (name, a, r, tol) => {
        assert.ok(Math.abs(a - r) <= tol * Math.max(1, Math.abs(r)),
          `${where} ${name}: port ${a}, metasens ${r} (tol ${tol})`);
        compared++;
      };
      near("TE", fit.par[0], pt.TE, TOL);
      // rho is identified only under differential selection (gamma1 > 0). At
      // gamma1 = 0 the effect/selection correlation has no Fisher information
      // and metasens reports its own rho0 start, so comparing it would test the
      // optimiser rather than the estimator. Same carve-out as the browser spec.
      if (Math.abs(pt.gamma1) > 1e-12) near("rho", fit.par[1], pt.rho, SE_TOL);
      near("tau", fit.par[2], pt.tau, TOL);

      // Tier O — the attained objective must never be worse than metasens's.
      assert.ok(fit.value <= pt.negloglik + SLACK * Math.max(1, Math.abs(pt.negloglik)),
        `${where} negloglik: port attained ${fit.value} but metasens reports ` +
        `${pt.negloglik} (the port must not be worse at the same gamma)`);
      compared++;

      // seTE off optimhess of the analytic gradient, with metasens's
      // element-wise +1e-8 Hessian regularisation. R reports NA at the points
      // where the +ndeps probe leaves the box and the gradient goes NaN; where
      // R has a value the port must match it.
      const H = CC.optimHess((p) => CC.gradientWithoutBeta(p, g, TE, seTE), fit.par);
      const inv00 = CC.solveFirstDiag(H.map((row) => row.map((v) => v + 1e-8)));
      const se = inv00 > 0 ? Math.sqrt(inv00) : NaN;
      const rse = pt.seTE_hessian === null ? NaN : Number(pt.seTE_hessian);
      if (Number.isFinite(rse)) near("seTE", se, rse, SE_TOL);

      // Deterministic: the implied number of unpublished studies is a closed
      // form in (gamma0, gamma1) and seTE, so it is held to 1e-9.
      let n = 0;
      for (const s of seTE) { const p = CC.pnorm(pt.gamma0 + pt.gamma1 / s); n += (1 - p) / p; }
      near("N_unpubl", n, pt.N_unpubl, TOL_DET);
    }
    // An assertion loop that compared nothing would otherwise pass (MINOR-20).
    assert.ok(compared >= 5 * O.points.length,
      `only ${compared} comparisons ran across ${O.points.length} oracle points`);
  });
}
