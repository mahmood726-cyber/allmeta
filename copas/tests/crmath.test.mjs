/**
 * crmath.test.mjs -- the likelihood's exp, log and pow are CORRECTLY ROUNDED.
 *
 *   node --test copas/tests/crmath.test.mjs      (from the repo root)
 *
 * metasens runs on R, and R's L-BFGS-B path depends on the last bit of the
 * objective and gradient. V8's Math.exp/Math.log are faithful but not correctly
 * rounded (on the arguments below they differ from the correctly rounded value
 * in ~7% and ~4% of calls), so the port's optimiser split from R's. crmath
 * (shared/copas-core.js) returns the correctly rounded double. What is checked:
 *   1. against an exact BigInt evaluation (rigorous error bounds, precision
 *      raised until it can decide) on every argument of an R fixture, on
 *      seeded random arguments over the likelihood's ranges, and at edges;
 *   2. the fast path's MEASURED error against the bound its rounding test
 *      assumes (a bound that is too small would make the test unsound);
 *   3. against R 4.6.0's own exp/log/^ (fixtures/crmath-r-fixture.json, from
 *      gen-crmath-fixture.R): R is not correctly rounded either, and the
 *      counts where it is not are pinned here.
 * Out of band (recorded in the lane report, too slow for a unit test): 0
 * misrounds on 3,550,000 arguments against the BigInt reference, and 0 on
 * 887,500 against Python's decimal module (an independent implementation).
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
const M = CC.crmath;
const FX = JSON.parse(readFileSync(path.join(here, "fixtures", "crmath-r-fixture.json"), "utf8"));

// C99 hex float ("%a", as R prints it) -> double, exactly (subnormals too).
function hex(s) {
  if (s === "Inf") return Infinity; if (s === "-Inf") return -Infinity; if (s === "NaN") return NaN;
  let neg = false; if (s[0] === "-") { neg = true; s = s.slice(1); }
  const m = /^0x([0-9a-f])(?:\.([0-9a-f]*))?p([+-]\d+)$/i.exec(s);
  if (!m) throw new Error("bad hex float " + s);
  const frac = m[2] || "", mant = BigInt("0x" + m[1] + frac);
  const v = mant === 0n ? 0 : M._bigRound(mant, parseInt(m[3], 10) - 4 * frac.length);
  return neg ? -v : v;
}
const same = (a, b) => Object.is(a, b) || (a !== a && b !== b);
// The exact reference, called directly (bypassing the fast path).
const ref = {
  exp: (x) => (x !== x ? x : x > 709.79 ? Infinity : x < -746 ? 0 : M._bigExp(x)),
  log: (x) => (x === 1 ? 0 : M._bigLog(x)),
  pow: (x, y) => (y === 2 ? x * x : M._bigPow(x, y)),
};
function countMisrounds(xs, f, r) { let n = 0; for (let i = 0; i < xs.length; i++) if (!same(f(i), r(i))) n++; return n; }

// xoshiro128**, fixed seed; 53-bit uniforms.
function rng(seed) {
  const s = [seed >>> 0, 0x243f6a88, 0xb7e15162, 0x12345678];
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  const next = () => { const r = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0; const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11); return r; };
  const u = () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
  return { u, unif: (a, b) => a + (b - a) * u(), logu: (a, b) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u()) };
}

test("crmath equals the exact BigInt evaluation at every argument of the R fixture", () => {
  const e = FX.exp.x.map(hex), l = FX.log.x.map(hex), p = FX.pow15.x.map(hex);
  const px = FX.powxy.x.map(hex), py = FX.powxy.y.map(hex);
  assert.equal(countMisrounds(e, (i) => M.exp(e[i]), (i) => ref.exp(e[i])), 0);
  assert.equal(countMisrounds(l, (i) => M.log(l[i]), (i) => ref.log(l[i])), 0);
  assert.equal(countMisrounds(p, (i) => M.pow(p[i], -1.5), (i) => ref.pow(p[i], -1.5)), 0);
  assert.equal(countMisrounds(px, (i) => M.pow(px[i], py[i]), (i) => ref.pow(px[i], py[i])), 0);
});

test("R 4.6.0's own exp/log/^ are NOT correctly rounded -- pinned counts", (t) => {
  // crmath reproduces R wherever R is correctly rounded; these are the
  // arguments where R itself is not. The counts are a fact about R's libm
  // (mingw-w64, x87), recorded so that a change in either side is noticed.
  const e = FX.exp.x.map(hex), l = FX.log.x.map(hex), p = FX.pow15.x.map(hex);
  const px = FX.powxy.x.map(hex), py = FX.powxy.y.map(hex);
  const n = {
    exp: countMisrounds(e, (i) => hex(FX.exp.r[i]), (i) => M.exp(e[i])),
    log: countMisrounds(l, (i) => hex(FX.log.r[i]), (i) => M.log(l[i])),
    pow15: countMisrounds(p, (i) => hex(FX.pow15.r[i]), (i) => M.pow(p[i], -1.5)),
    powxy: countMisrounds(px, (i) => hex(FX.powxy.r[i]), (i) => M.pow(px[i], py[i])),
  };
  const v8 = {
    exp: countMisrounds(e, (i) => Math.exp(e[i]), (i) => M.exp(e[i])),
    log: countMisrounds(l, (i) => Math.log(l[i]), (i) => M.log(l[i])),
  };
  t.diagnostic(`R != correctly rounded: ${JSON.stringify(n)} of ${e.length}/${l.length}/${p.length}/${px.length}; V8 Math: ${JSON.stringify(v8)}`);
  assert.deepEqual(n, PINNED_R_NOT_CR);
  assert.ok(v8.exp > n.exp && v8.log > n.log, "crmath is closer to R than V8's Math is");
});
const PINNED_R_NOT_CR = { exp: 3, log: 0, pow15: 8, powxy: 0 }; // R 4.6.0, Windows x86-64 (pc2), 2026-11-12

test("seeded random arguments over the likelihood's ranges: 0 misrounds", () => {
  const R = rng(0x9e3779b9), N = 6000;
  const e = [], l = [], p = [], px = [], py = [];
  for (let i = 0; i < N; i++) {
    e.push(R.unif(-745.2, 0), R.unif(-40, 0), R.unif(-745.2, -708.3), (R.u() < 0.5 ? -1 : 1) * R.logu(2 ** -60, 709.7));
    l.push(R.u() || 0.5, R.logu(1e-6, 10), R.unif(0.5, 2), R.logu(2 ** -1074, 1.7e308));
    p.push(R.u() || 0.5, 1 - R.logu(2 ** -50, 0.999), R.logu(2 ** -60, 1));
    px.push(R.logu(1e-5, 1e5)); py.push(R.unif(-20, 20));
  }
  assert.equal(countMisrounds(e, (i) => M.exp(e[i]), (i) => ref.exp(e[i])), 0);
  assert.equal(countMisrounds(l, (i) => M.log(l[i]), (i) => ref.log(l[i])), 0);
  assert.equal(countMisrounds(p, (i) => M.pow(p[i], -1.5), (i) => ref.pow(p[i], -1.5)), 0);
  assert.equal(countMisrounds(px, (i) => M.pow(px[i], py[i]), (i) => ref.pow(px[i], py[i])), 0);
});

test("edges: special values, exact cases, subnormals, overflow and underflow", () => {
  // exp
  assert.ok(Number.isNaN(M.exp(NaN)));
  assert.equal(M.exp(Infinity), Infinity); assert.equal(M.exp(-Infinity), 0);
  assert.equal(M.exp(0), 1); assert.equal(M.exp(-0), 1);
  assert.equal(M.exp(5e-324), 1); assert.equal(M.exp(-5e-324), 1);
  assert.equal(M.exp(709.782712893384), 1.7976931348622732e308);
  assert.equal(M.exp(709.7827128933841), Infinity);
  assert.equal(M.exp(-745.1332191019411), 5e-324);       // just above 2^-1075: rounds up
  assert.equal(M.exp(-745.1332191019412), 0);            // just below: rounds to 0
  for (const x of [-708.3964185322641, -708.39641853226, -720.5, -744.44, -745, -708.3, -709])
    assert.equal(M.exp(x), ref.exp(x), "subnormal-range exp(" + x + ")");
  // log
  assert.ok(Number.isNaN(M.log(NaN))); assert.ok(Number.isNaN(M.log(-1)));
  assert.equal(M.log(0), -Infinity); assert.equal(M.log(-0), -Infinity);
  assert.equal(M.log(Infinity), Infinity); assert.equal(M.log(1), 0);
  for (let k = -1074; k <= 1023; k += 37) assert.equal(M.log(2 ** k), ref.log(2 ** k), "log(2^" + k + ")");
  for (const x of [5e-324, 1e-310, 2.2250738585072014e-308, 1.7976931348623157e308,
                   1 + 2 ** -52, 1 - 2 ** -53, 1 - 2 ** -52, 1.4142135623730951, 0.7071067811865476])
    assert.equal(M.log(x), ref.log(x), "log(" + x + ")");
  // pow: R_pow() semantics (src/main/arithmetic.c), not JavaScript's
  assert.equal(M.pow(1, NaN), 1); assert.equal(M.pow(NaN, 0), 1); assert.equal(M.pow(1, Infinity), 1);
  assert.equal(M.pow(0, 2), 0); assert.equal(M.pow(0, -1.5), Infinity); assert.equal(M.pow(-0, -3), Infinity);
  assert.ok(Number.isNaN(M.pow(0, NaN))); assert.ok(Number.isNaN(M.pow(-8, 1 / 3)));
  assert.equal(M.pow(Infinity, -1), 0); assert.equal(M.pow(-Infinity, 3), -Infinity); assert.equal(M.pow(-Infinity, 2), Infinity);
  assert.equal(M.pow(0.5, Infinity), 0); assert.equal(M.pow(2, -Infinity), 0); assert.equal(M.pow(0.5, -Infinity), Infinity);
  assert.ok(Number.isNaN(M.pow(-2, Infinity)));
  assert.equal(M.pow(4, -1.5), 0.125); assert.equal(M.pow(0.25, -1.5), 8); assert.equal(M.pow(2 ** -1000, -1.5), Infinity);
  assert.equal(M.pow(2 ** -60, -1.5), 2 ** 90); assert.equal(M.pow(9, 0.5), 3); assert.equal(M.pow(2, 10), 1024);
  assert.equal(M.pow(-2, 3), -8); assert.equal(M.pow(-2, -2), 0.25); assert.equal(M.pow(-1, 3), -1);
  assert.equal(M.pow(2, -1074), 5e-324); assert.equal(M.pow(2, -1075), 0); assert.equal(M.pow(2, 1024), Infinity);
  const x2 = 2 ** 26 + 1; assert.equal(M.pow(x2 * 1.0, 2), x2 * x2);   // y = 2 is x * x (R_POW)
  assert.equal(M.pow(Number.EPSILON, 0.25), 2 ** -13);
});

test("fast-path measured error is well inside the bound its rounding test assumes", () => {
  const Q = 320, R = rng(12345);
  const toBig = (h, l) => M._toFixed(h, Q) + M._toFixed(l, Q);
  const rel = (A, S, shift) => { // |A - S 2^shift| / (S 2^shift), A and S at 2^-Q
    const s = shift >= 0 ? S << BigInt(shift) : S >> BigInt(-shift); return Math.abs(Number(A - s) / Number(s)); };
  let we = 0, wl = 0, wa = 0;
  for (let i = 0; i < 1500; i++) {
    for (const x of [R.unif(-745.2, 0), R.unif(-40, 0), (R.u() < 0.5 ? -1 : 1) * R.logu(2 ** -30, 709)]) {
      const [h, l, k] = M._expDD(x, 0), [S, , kk] = M._bigExpZ(M._toFixed(x, Q), Q, 1n);
      we = Math.max(we, rel(toBig(h, l), S, kk - k));
    }
    for (const x of [R.u() || 0.5, R.unif(0.99, 1.01), R.logu(2 ** -1074, 1.7e308), 1 + (R.u() - 0.5) * 2 ** -8]) {
      if (x === 1) continue;
      const [S] = M._bigLogFixed(x, Q);
      const [h, l] = M._logDD(x, false); wl = Math.max(wl, rel(toBig(h, l), S, 0));
      const [ha, la] = M._logDD(x, true); wa = Math.max(wa, rel(toBig(ha, la), S, 0));
    }
  }
  // bounds used: exp 2^-80, log 2^-70, log for pow 2^-79 (tested at twice that)
  assert.ok(we < 2 ** -84, "exp fast-path error 2^" + Math.log2(we).toFixed(1));
  assert.ok(wl < 2 ** -71.5, "log fast-path error 2^" + Math.log2(wl).toFixed(1));
  assert.ok(wa < 2 ** -80.5, "pow's log error 2^" + Math.log2(wa).toFixed(1));
});

test("planted misround: the comparison above can fail", () => {
  // A comparator that never reports a difference proves nothing. Perturb one
  // result by one ulp and the count must say 1.
  const xs = [0.1, 0.2, 0.3], bump = (v) => v + v * 2 ** -52;
  assert.equal(countMisrounds(xs, (i) => (i === 1 ? bump(M.exp(xs[i])) : M.exp(xs[i])), (i) => ref.exp(xs[i])), 1);
});

test("lambda(u) memo returns lambda(u)'s bits, keyed on values not array identity", () => {
  const TE = [0.1, 0.3, -0.2, 0.5], se = [0.1, 0.2, 0.15, 0.3], par = [0.1, 0.4, 0.05];
  const direct = (g, s) => { // the loglik with lambda evaluated in place, no memo
    let ell = []; for (let i = 0; i < TE.length; i++) {
      const u = g[0] + g[1] / s[i], lam = CC.lambda(u);
      const sigma = Math.sqrt(s[i] * s[i] / (1 - par[1] * par[1] * lam * (u + lam)));
      const s2t2 = sigma * sigma + par[2] * par[2], rhoT = par[1] * sigma / Math.sqrt(s2t2);
      let v = (u + rhoT * (TE[i] - par[0]) / Math.sqrt(s2t2)) / Math.sqrt(1 - rhoT * rhoT); if (v < -37) v = -37;
      const d = TE[i] - par[0]; ell.push(-(-0.5 * M.log(s2t2) - d * d / (2 * s2t2) + M.log(CC.pnorm(v))));
    } return CC.rsum(ell); };
  const g1 = [-0.5, 0.2], g2 = [0.3, 0.05];
  assert.equal(CC.loglikWithoutBeta(par, g1, TE, se), direct(g1, se));
  assert.equal(CC.loglikWithoutBeta(par, g2, TE, se), direct(g2, se));
  const se2 = se.slice(); se2[2] = 0.17;                       // same length, one value changed
  assert.equal(CC.loglikWithoutBeta(par, g2, TE, se2), direct(g2, se2));
  se2[2] = 0.15; se2[0] = 0.11; assert.equal(CC.loglikWithoutBeta(par, g2, TE, se2), direct(g2, se2)); // mutated in place
});
