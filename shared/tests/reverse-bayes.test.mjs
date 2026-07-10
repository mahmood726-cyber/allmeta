// Node self-test for shared/reverse-bayes.js — run: node shared/tests/reverse-bayes.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const RB = require("../reverse-bayes.js");

const za = 1.959963984540054;
const close = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// --- normal helpers accurate enough for reporting ---
assert.ok(close(RB._Phi(za), 0.975, 1e-6), "Phi(za)=0.975");
assert.ok(close(RB._twoSidedP(za), 0.05, 1e-6), "two-sided p at za = 0.05");
assert.ok(close(RB._qnorm(0.975), za, 1e-6), "qnorm(0.975)=za");
assert.ok(close(RB._qnorm(0.995), 2.5758293035489, 1e-5), "qnorm(0.995)");

// --- Matthews sceptical prior closed form ---
{
  const s = 0.2, th = 0.8; // z = 4
  const a = RB.analyze(th, s, { alpha: 0.05 });
  assert.equal(a.significant, true);
  const tau2 = (za * za * Math.pow(s, 4)) / (th * th - za * za * s * s);
  assert.ok(close(a.sceptical.priorVar, tau2, 1e-12), "tauS^2 closed form");
  assert.ok(close(a.sceptical.priorInterval95[1], 1.959963984540054 * Math.sqrt(tau2), 1e-9), "prior 95% interval");
}

// --- intrinsic-credibility reduction: scepticalP == alpha exactly at |z| = zI ---
{
  const zI = Math.SQRT2 * za;
  const a = RB.analyze(zI, 1.0, { alpha: 0.05 });
  assert.ok(close(a.intrinsic.scepticalP, 0.05, 1e-6), "scepticalP = alpha at |z|=zI");
  assert.ok(close(a.intrinsic.zLimit, zI, 1e-9), "zLimit = sqrt(2)*za");
  assert.equal(a.intrinsic.credible, true, "credible at the limit");
  // Held intrinsic-credibility limit ~ two-sided p 0.0056 (|z| ~ 2.772)
  assert.ok(close(a.intrinsic.pLimit, 0.005575, 5e-5), "intrinsic pLimit ~ 0.0056");
}

// --- predictive z identity zpp = sqrt(z^2 - za^2) ---
{
  const a = RB.analyze(0.8, 0.2); // z=4
  assert.ok(close(a.intrinsic.predictiveZ, Math.sqrt(16 - za * za), 1e-9), "predictive z identity");
}

// --- monotone decreasing sceptical p-value in |z| ---
{
  const ps = [2, 2.5, 3, 4].map((z) => RB.analyze(z, 1).intrinsic.scepticalP);
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] < ps[i - 1], "scepticalP decreasing");
}

// --- guards: not significant -> no sceptical prior; borderline -> huge prior SD ---
assert.equal(RB.analyze(1.0, 1.0).sceptical.exists, false, "no sceptical prior when not significant");
assert.equal(RB.analyze(1.96, 1.0).sceptical.exists, true, "borderline is (just) significant");
// near the significance boundary the critical sceptical prior becomes diffuse:
// its SD dwarfs the effect, and grows without bound as |z| -> za+.
assert.ok(RB.analyze(1.9601, 1.0).sceptical.priorSDoverEffect > 10, "priorSD >> effect near boundary");
assert.ok(RB.analyze(1.96001, 1.0).sceptical.priorSD > RB.analyze(1.9601, 1.0).sceptical.priorSD, "priorSD grows toward the boundary");

console.log("reverse-bayes.test.mjs: all assertions passed");
