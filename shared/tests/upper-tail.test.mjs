// Node self-test for shared/upper-tail.js -- run: node shared/tests/upper-tail.test.mjs
// Reference: shared/tests/fixtures/upper-tail-grid.csv, written by upper-tail-grid.R (R 4.6.0,
// pnorm/pchisq/pt/pf/pgamma with lower.tail = FALSE) on tails 0.3 .. 1e-300.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../upper-tail.js");

const grid = readFileSync(new URL("./fixtures/upper-tail-grid.csv", import.meta.url), "utf8")
  .trim().split(/\r?\n/).map(l => { const [d, x, p, par] = l.split(";"); return { d, x: +x, p: +p, par: par ? par.split(",").map(Number) : [] }; });
assert.equal(grid.length, 396, "grid rows");

const call = { normal: (x) => T.pnormUpper(x), chisq: (x, a) => T.pchisqUpper(x, a[0]), t: (x, a) => T.ptUpper(x, a[0]),
  F: (x, a) => T.pfUpper(x, a[0], a[1]), gamma: (x, a) => T.pgammaUpper(x, a[0]) };
let n = 0, worst = 0;
for (const g of grid) {
  const v = call[g.d](g.x, g.par);
  assert.ok(v > 0, `${g.d}(${g.par}) at p=${g.p}: upper tail must not underflow to ${v}`);
  const rel = Math.abs(v - g.p) / g.p;
  worst = Math.max(worst, rel);
  assert.ok(rel < 1e-12, `${g.d}(${g.par}) x=${g.x}: got ${v}, R ${g.p}, rel ${rel}`);
  n++;
}

// symmetric / boundary behaviour
assert.equal(T.pnormUpper(0), 0.5);
assert.ok(Math.abs(T.pnormUpper(-1.959963984540054) - 0.975) < 1e-15);
assert.equal(T.ptUpper(0, 7), 0.5);
assert.ok(Math.abs(T.ptUpper(-2.5, 10) - (1 - T.ptUpper(2.5, 10))) < 1e-15);
assert.equal(T.pchisqUpper(0, 3), 1);
assert.equal(T.pchisqUpper(Infinity, 3), 0);
assert.equal(T.pfUpper(0, 2, 5), 1);
// df = 0 is valid in R (point mass at 0): pchisq(1, 0, lower = FALSE) = 0, pchisq(0, 0, lower = FALSE) = 1
assert.equal(T.pchisqUpper(1, 0), 0);
assert.equal(T.pchisqUpper(0, 0), 1);
assert.equal(T.pgammaUpper(1, 0), 0);
assert.ok(Number.isNaN(T.pchisqUpper(1, -1)));
assert.ok(Number.isNaN(T.ptUpper(NaN, 3)));
assert.ok(Math.abs(T.p2norm(-1.959963984540054) - 0.05) < 1e-15);
assert.ok(Math.abs(T.p2t(-2.5, 10) - 2 * T.ptUpper(2.5, 10)) < 1e-15);
assert.ok(Math.abs(T.ptUpper(1, Infinity) - 0.15865525393145705) < 1e-14, 'df = Infinity is the normal');
// large df: R pchisq(1e5, 1e5, lower = FALSE) = 0.49940529189520672
assert.ok(Math.abs(T.pchisqUpper(1e5, 1e5) - 0.49940529189520672) / 0.4994 < 1e-9);
// fixrev2 (Codex review of #512), R 4.6.0 oracles:
// very large shape -- the series/CF must run to convergence, never stop at a fixed cap
// R pchisq(1e7, 1e7, lower = FALSE) = 0.49994052919606219
assert.ok(Math.abs(T.pchisqUpper(1e7, 1e7) - 0.49994052919606219) / 0.5 < 1e-9, 'pchisqUpper(1e7,1e7) ' + T.pchisqUpper(1e7, 1e7));
// R pgamma(1e9, 1e9 + 1e5, lower = FALSE) = 0.99921712885374958
assert.ok(Math.abs(T.pgammaUpper(1e9, 1e9 + 1e5) - 0.99921712885374958) < 1e-8, 'pgammaUpper(1e9,1e9+1e5) ' + T.pgammaUpper(1e9, 1e9 + 1e5));
// tiny shape -- the upper tail is tiny on the series side, so 1 - P is wrong
// R pgamma(0.5, shape = 1e-20, lower = FALSE) = 5.5977359477616082e-21
assert.ok(Math.abs(T.pgammaUpper(0.5, 1e-20) - 5.5977359477616082e-21) / 5.6e-21 < 1e-12, 'pgammaUpper(0.5,1e-20) ' + T.pgammaUpper(0.5, 1e-20));
// infinite F degrees of freedom: R pf(1, Inf, 10, lower = FALSE) = 0.55950671493478754,
// pf(1, 10, Inf, lower = FALSE) = 0.44049328506521246, pf(1, Inf, Inf) upper = 0.5, pf(2, Inf, Inf) upper = 0
assert.ok(Math.abs(T.pfUpper(1, Infinity, 10) - 0.55950671493478754) < 1e-14, 'pfUpper(1,Inf,10) ' + T.pfUpper(1, Infinity, 10));
assert.ok(Math.abs(T.pfUpper(1, 10, Infinity) - 0.44049328506521246) < 1e-14, 'pfUpper(1,10,Inf) ' + T.pfUpper(1, 10, Infinity));
assert.equal(T.pfUpper(1, Infinity, Infinity), 0.5);
assert.equal(T.pfUpper(2, Infinity, Infinity), 0);
assert.equal(T.pfUpper(0.5, Infinity, Infinity), 1);
// the motivating case: dat.bcg Q = 152.2330 on 12 df (R: 1.9967645908458142e-26 at the exact Q)
assert.ok(T.pchisqUpper(152.233, 12) > 1e-27 && T.pchisqUpper(152.233, 12) < 1e-25);

console.log(`upper-tail: ${n} grid points, max relative error ${worst.toExponential(2)}; boundary checks OK`);
