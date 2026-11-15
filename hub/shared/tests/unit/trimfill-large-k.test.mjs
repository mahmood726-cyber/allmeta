// Requirement: shared/trimfill.js stays usable at stress scale. With method REML the side rule fits a
// mixed-effects regression whose Fisher step needs tr(PP); computed by a k x k double loop it cost O(k^2) per
// step (k = 4000: 1.7 s; k = 20000: ~40 s with the page frozen). The O(k) identity must give the same result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import MaCore from '../../../../shared/ma-core.js';
import TF from '../../../../shared/trimfill.js';

globalThis.AlmMaCore = globalThis.AlmMaCore || MaCore;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function data(k, seed) {
  const r = rng(seed), yi = [], vi = [];
  for (let i = 0; i < k; i++) { const se = 0.05 + 0.5 * r(); vi.push(se * se); yi.push(0.2 + (r() - 0.5) * 0.6 + (r() < 0.3 ? 0 : se * 1.2)); }
  return { yi, vi };
}
test('REML trim-and-fill with k = 20000 finishes within 5 s', () => {
  const { yi, vi } = data(20000, 20000);
  const t = Date.now();
  const o = TF.trimAndFill(yi, vi, { method: 'REML' });
  const ms = Date.now() - t;
  assert.ok(ms < 5000, `took ${ms} ms`);
  assert.ok(Number.isFinite(o.mu) && o.k0 >= 0);
});
test('REML side-rule slope equals the explicit O(k^2) trace computation (small k)', () => {
  // Independent oracle: the REML regression slope of yi on sqrt(vi) with tr(PP) summed over all (i, j).
  function slopeBrute(yi, vi) {
    const k = yi.length, x = vi.map(Math.sqrt);
    const fit = t2 => {
      let S0 = 0, S1 = 0, S2 = 0, Sy = 0, Sxy = 0, T0 = 0, T1 = 0, T2 = 0; const w = [];
      for (let i = 0; i < k; i++) { const wi = 1 / (vi[i] + t2); w[i] = wi; S0 += wi; S1 += wi * x[i]; S2 += wi * x[i] * x[i]; Sy += wi * yi[i]; Sxy += wi * x[i] * yi[i]; T0 += wi * wi; T1 += wi * wi * x[i]; T2 += wi * wi * x[i] * x[i]; }
      const D = S0 * S2 - S1 * S1, b1 = (S0 * Sxy - S1 * Sy) / D, b0 = (Sy - b1 * S1) / S0; let Q = 0, Q2 = 0;
      for (let i = 0; i < k; i++) { const e = yi[i] - b0 - b1 * x[i]; Q += w[i] * e * e; Q2 += w[i] * w[i] * e * e; }
      let pp = 0;
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const h = (S2 - S1 * (x[i] + x[j]) + S0 * x[i] * x[j]) / D; const p = (i === j ? w[i] : 0) - w[i] * w[j] * h; pp += p * p; }
      return { b1, Q, Q2, trP: S0 - (S2 * T0 - 2 * S1 * T1 + S0 * T2) / D, pp };
    };
    const f = fit(0); let t2 = Math.max(0, (f.Q - (k - 2)) / f.trP);
    for (let i = 0; i < 1000; i++) { const c = fit(t2); const nw = Math.max(0, t2 + (c.Q2 - c.trP) / c.pp); if (Math.abs(nw - t2) < 1e-11) { t2 = nw; break; } t2 = nw; }
    return fit(t2).b1;
  }
  for (let seed = 1; seed <= 50; seed++) {
    const r = rng(seed), k = 3 + Math.floor(r() * 40), { yi, vi } = data(k, seed * 7);
    const a = TF._regSlope(yi, vi, 'REML'), b = slopeBrute(yi, vi);
    assert.ok(Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(b)), `seed ${seed}: ${a} vs ${b}`);
  }
});
