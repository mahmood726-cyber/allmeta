/**
 * copas-core-start.test.mjs -- the optimiser's START VALUES must be metasens's,
 * bit for bit.
 *
 *   node --test copas/tests/copas-core-start.test.mjs      (from the repo root)
 *
 * metasens::copas() starts every profile fit at c(TE.random, rho0, tau) of the
 * meta::metagen() object. The port's L-BFGS-B is R's, so from the same start it
 * takes the same steps; from a start a few ulps away it takes a different path
 * and stops (factr = 1e7) at a different point. That was the whole of the 12
 * Tier-O failures in the validation archive (page objective above metasens's
 * by up to 1.5e-6 at dat.raudenbush1985 C1 [370]): with R's own start every one
 * of the 12 is no worse than metasens. Reference: fixtures/metagen-start-fixture.json
 * (gen-metagen-start-fixture.R; R 4.6.0, meta 8.5.0, metafor 5.0.1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const CC = require(path.join(here, "..", "..", "shared", "copas-core.js"));
const FX = JSON.parse(readFileSync(path.join(here, "fixtures", "metagen-start-fixture.json"), "utf8"));

// C99 hex float ("%a") -> double, exactly.
function hex(s) {
  if (Array.isArray(s)) return s.map(hex);
  let neg = false; if (s[0] === "-") { neg = true; s = s.slice(1); }
  if (s === "0x0p+0") return neg ? -0 : 0;
  const m = /^0x([01])(?:\.([0-9a-f]+))?p([+-]\d+)$/i.exec(s);
  if (!m) throw new Error("bad hex float " + s);
  let mant = BigInt(m[1]); const frac = m[2] || "";
  for (const c of frac) mant = mant * 16n + BigInt(parseInt(c, 16));
  const v = Number(mant) * Math.pow(2, parseInt(m[3], 10) - 4 * frac.length);
  return neg ? -v : v;
}
const arr = (x) => hex([].concat(x));

// The page's start-value rule (copas/index.html startValues()).
function pageStart(TE, seTE, method) {
  return method === "DL" ? CC.metaforDL(TE, seTE) : CC.metaforREML(TE, seTE);
}

test("the 80-bit long-double sum is R's sum(), not an approximation of it", () => {
  // R 4.6.0 on Windows x86-64: sum() accumulates in x87 extended precision.
  assert.equal(CC.ldsum([1, 2 ** -60, -1]), 2 ** -60);       // 64-bit significand keeps it
  assert.equal(CC.ldsum([1, 2 ** -64, -1]), 0);              // ... and rounds this away (tie, even)
  assert.equal(CC.ldsum([1, 2 ** -63 + 2 ** -70, -1]), 2 ** -63);
  assert.equal(CC.ldsum([]), 0);
  assert.ok(Number.isNaN(CC.ldsum([1, NaN])));
  // colMeans' long-double mean keeps its significand at any magnitude
  // (a shift-then-round version truncated means below ~2^-820).
  for (const sc of [1, 2 ** -900, 2 ** -1000, 2 ** 900]) {
    assert.equal(CC.ldmean([3 * sc, 4 * sc]), 3.5 * sc);
    assert.equal(CC.ldmean([sc, sc, sc]), sc);
  }
  assert.equal(CC.ldmean([1, 2, 4]), 7 / 3);
  assert.ok(Number.isNaN(CC.ldmean([])));
  // review (Codex, read-only): a long-double mean that lands in the double
  // SUBNORMAL range is rounded once, to the subnormal grid -- not to 53 bits
  // first. x87 has the exponent range to hold it normal until the store.
  const u = Number.MIN_VALUE;
  assert.equal(CC.ldmean([(3 * 2 ** 51 + 2) * u, 0, 0]), (2 ** 51 + 1) * u);
  assert.equal(CC.ldmean([-(3 * 2 ** 51 + 2) * u, 0, 0]), -(2 ** 51 + 1) * u);
  // review: infinities propagate as in the 80-bit accumulator, which does
  // not overflow on MAX + MAX.
  assert.equal(CC.ldsum([Number.MAX_VALUE, Number.MAX_VALUE, -Infinity]), -Infinity);
  assert.ok(Number.isNaN(CC.ldsum([Infinity, -Infinity])));
  assert.equal(CC.ldmean([Number.MAX_VALUE, Number.MAX_VALUE, -Infinity]), -Infinity);
  assert.equal(CC.ldsum([1, Infinity]), Infinity);
});

test("metaforDL with one study is tau2 = 0, as rma.uni sets it for k = 1 (review)", () => {
  const r = CC.metaforDL([1], [1]);
  assert.equal(r.tau2, 0);
  assert.equal(r.TE_random, 1);
  assert.equal(r.seTE_random, 1);
});

test(`metagen() start values reproduced bit-exactly (${FX.starts.length} cases, REML and DL)`, () => {
  const bad = [];
  for (const c of FX.starts) {
    const TE = arr(c.TE), seTE = arr(c.seTE), r = pageStart(TE, seTE, c.method);
    for (const [k, want] of [["tau2", c.tau2], ["tau", c.tau], ["TE_random", c.TE_random], ["seTE_random", c.seTE_random]])
      if (!Object.is(r[k], hex(want))) bad.push(`${c.method} ${c.id} ${k}: ${r[k]} vs R ${hex(want)}`);
  }
  assert.deepEqual(bad, [], bad.slice(0, 10).join("\n"));
});

for (const p of FX.points) {
  test(`Tier O point ${p.id} ${p.config} [${p.index}]: objective no worse than metasens's`, () => {
    const c = FX.starts.find((s) => s.id === p.id && s.method === p.method);
    const TE = arr(c.TE), seTE = arr(c.seTE), sv = pageStart(TE, seTE, p.method);
    const rho0 = Math.sign(CC.eggerEstimate(TE, seTE)) === 1 ? 0.9999 / 2 : -0.9999 / 2;
    const start = [sv.TE_random, rho0, sv.tau];
    assert.deepEqual(start, arr(p.start), "start must be metasens's own start");
    const fit = CC.profileMLE(TE, seTE, arr(p.gamma), start, 0.9999);
    const R = hex(p.value);
    // PREREG Tier O: app <= ref + 1e-12 * max(1, |ref|)   (not loosened)
    assert.ok(fit.value - R <= 1e-12 * Math.max(1, Math.abs(R)),
      `page ${fit.value} vs metasens ${R} (worse by ${fit.value - R})`);
  });
}
