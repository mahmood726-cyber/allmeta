// node --test gosh/tests/exact-enum.test.cjs
// The streaming exact engine against a brute-force oracle that refits every subset with the page's own pool()
// formulae (copied verbatim from gosh/index.html) and keeps every subset in memory. Tolerance 1e-9 normalised
// (|a-b|/max(1,|b|)); counts and grid cells exact. Planted negative controls show the comparisons can fail.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const E = require(path.join(__dirname, '..', 'exact-enum.js'));

// --- verbatim copy of pool() from gosh/index.html (engine section) ---
function pool(rows, model) {
  var w = rows.map(function (r) { return 1 / (r.se * r.se); });
  var sw = w.reduce(function (a, b) { return a + b; }, 0);
  var muFE = rows.reduce(function (a, r, i) { return a + w[i] * r.te; }, 0) / sw;
  var Q = rows.reduce(function (a, r, i) { return a + w[i] * (r.te - muFE) * (r.te - muFE); }, 0);
  var df = rows.length - 1;
  var I2 = (df > 0 && Q > df) ? 100 * (Q - df) / Q : 0;
  if (model === 'FE' || rows.length < 2) {
    return { mu: muFE, se: Math.sqrt(1 / sw), Q: Q, I2: I2, k: rows.length };
  }
  var swSq = w.reduce(function (a, b) { return a + b * b; }, 0);
  var tau2 = df > 0 ? Math.max(0, (Q - df) / (sw - swSq / sw)) : 0;
  var wRE = rows.map(function (r) { return 1 / (r.se * r.se + tau2); });
  var swRE = wRE.reduce(function (a, b) { return a + b; }, 0);
  var mu = rows.reduce(function (a, r, i) { return a + wRE[i] * r.te; }, 0) / swRE;
  return { mu: mu, se: Math.sqrt(1 / swRE), Q: Q, I2: I2, tau2: tau2, k: rows.length };
}

function q7(sorted, p) { const n = sorted.length; if (n === 1) return sorted[0]; const h = (n - 1) * p, lo = Math.floor(h), f = h - lo; return lo + 1 >= n ? sorted[n - 1] : sorted[lo] + f * (sorted[lo + 1] - sorted[lo]); }
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// Brute force: every subset refitted from scratch and kept in memory.
function brute(te, se, model, GX = 100, GY = 100) {
  const k = te.length, rows = te.map((t, i) => ({ te: t, se: se[i] })), pts = [];
  for (let mask = 1; mask < 2 ** k; mask++) {
    const sub = [], members = [];
    for (let i = 0; i < k; i++) if (mask & (1 << i)) { sub.push(rows[i]); members.push(i); }
    const p = pool(sub, model); pts.push({ mu: p.mu, I2: p.I2, Q: p.Q, tau2: p.tau2 || 0, members });
  }
  let x0 = Math.min(...te), x1 = Math.max(...te); if (!(x1 > x0)) { x0 -= 0.5; x1 += 0.5; }
  const gx = GX / (x1 - x0), gy = GY / 100, grid = new Array(GX * GY).fill(0);
  let edge = 0;
  for (const p of pts) {
    const fx = (p.mu - x0) * gx, fy = p.I2 * gy;
    if (Math.abs(fx - Math.round(fx)) < 1e-9 || (p.I2 !== 0 && Math.abs(fy - Math.round(fy)) < 1e-9)) edge++;
    const ix = Math.max(0, Math.min(GX - 1, Math.floor(fx))), iy = Math.max(0, Math.min(GY - 1, Math.floor(fy)));
    grid[iy * GX + ix]++;
  }
  const mus = pts.map(p => p.mu).sort((a, b) => a - b), i2s = pts.map(p => p.I2).sort((a, b) => a - b);
  const per = te.map((_, i) => {
    const w = pts.filter(p => p.members.includes(i)), o = pts.filter(p => !p.members.includes(i));
    return { with_n: w.length, without_n: o.length, with_mean: mean(w.map(p => p.mu)), without_mean: mean(o.map(p => p.mu)), with_i2: mean(w.map(p => p.I2)), without_i2: mean(o.map(p => p.I2)) };
  });
  return {
    n_subsets: pts.length, mean_est: mean(mus), min_est: mus[0], max_est: mus[mus.length - 1],
    mean_i2: mean(i2s), min_i2: i2s[0], max_i2: i2s[i2s.length - 1], mean_q: mean(pts.map(p => p.Q)),
    zero_i2: pts.filter(p => p.I2 === 0).length,
    q25_est: q7(mus, .25), median_est: q7(mus, .5), q75_est: q7(mus, .75), q25_i2: q7(i2s, .25), median_i2: q7(i2s, .5), q75_i2: q7(i2s, .75),
    mean_tau2: model === 'DL' ? mean(pts.map(p => p.tau2)) : undefined,
    grid, edge, per_study: per
  };
}

const norm = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const SCALARS = ['mean_est', 'min_est', 'max_est', 'mean_i2', 'min_i2', 'max_i2', 'mean_q', 'q25_est', 'median_est', 'q75_est', 'q25_i2', 'median_i2', 'q75_i2'];
const PER = ['with_mean', 'without_mean', 'with_i2', 'without_i2'];

// Compare an engine result with a brute-force reference; returns the list of failures (empty = pass).
function compare(got, ref, model) {
  const f = [];
  if (got.n_subsets !== ref.n_subsets) f.push('n_subsets ' + got.n_subsets + ' vs ' + ref.n_subsets);
  if (got.zero_i2 !== ref.zero_i2) f.push('zero_i2 ' + got.zero_i2 + ' vs ' + ref.zero_i2);
  for (const q of SCALARS.concat(model === 'DL' ? ['mean_tau2'] : [])) if (!(norm(got[q], ref[q]) <= 1e-9)) f.push(q + ' ' + got[q] + ' vs ' + ref[q]);
  ref.per_study.forEach((r, i) => {
    const g = got.per_study[i];
    if (g.with_n !== r.with_n || g.without_n !== r.without_n) f.push('per_study counts ' + i);
    for (const q of PER) if (!(norm(g[q], r[q]) <= 1e-9)) f.push('per_study ' + i + ' ' + q + ' ' + g[q] + ' vs ' + r[q]);
  });
  const diff = got.grid.counts.reduce((s, x, i) => s + Math.abs(x - ref.grid[i]), 0);
  if (diff !== 0) f.push('grid cells differ by ' + diff + ' (near-edge points in reference: ' + ref.edge + ')');
  return f;
}

// Deterministic fixtures: BCG (metadat dat.bcg, log RR, k=13, rounded to 4 dp) and synthetic heterogeneous sets.
const BCG = {
  te: [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120, -0.4694, -1.3713, -0.3394, 0.4459, -0.0173],
  se: [0.5706, 0.4411, 0.4149, 0.1408, 0.2276, 0.0830, 0.4718, 0.0638, 0.2364, 0.2711, 0.1112, 0.7303, 0.2672]
};
function synth(k, seed) { let s = seed >>> 0; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); const te = [], se = []; for (let i = 0; i < k; i++) { te.push((r() * 2 - 1) + (i % 4 === 0 ? 1.2 : 0)); se.push(0.04 + r() * 0.5); } return { te, se }; }
const CASES = [['bcg13', BCG.te, BCG.se], ...[3, 5, 8, 12, 14, 15, 16].map(k => { const d = synth(k, 1000 + k); return ['synth' + k, d.te, d.se]; })];

for (const [name, te, se] of CASES) for (const model of ['FE', 'DL']) {
  test(`exact engine equals brute force: ${name} k=${te.length} ${model}`, () => {
    const got = E.run(te, se, model), ref = brute(te, se, model);
    assert.deepStrictEqual(compare(got, ref, model), []);
    assert.strictEqual(got.n_subsets, 2 ** te.length - 1);
    assert.strictEqual(got.grid.counts.reduce((a, b) => a + b, 0), got.n_subsets);
  });
}

test('planted negative control: a dropped subset or a moved grid count is detected', () => {
  const { te, se } = synth(12, 7);
  const got = E.run(te, se, 'DL'), ref = brute(te, se, 'DL');
  assert.deepStrictEqual(compare(got, ref, 'DL'), []);
  // Drop the last subset from the engine's own stream: run the main pass on all but the last high block
  // plus a partial last block is not exposed, so instead drop the final subset's high mask entirely.
  const e = E.createEngine(te, se, 'DL'); e.mainPass(0, e.highCount - 0); // full pass (k=12: one high block)
  const full = e.summary(null);
  assert.strictEqual(full.n_subsets, 4095);
  const bad = JSON.parse(JSON.stringify(got)); bad.n_subsets -= 1;
  const cell = bad.grid.counts.findIndex(x => x > 0); bad.grid.counts[cell] -= 1;
  const f = compare(bad, ref, 'DL');
  assert.ok(f.some(x => x.startsWith('n_subsets')) && f.some(x => x.startsWith('grid')), f.join('; '));
});

test('planted negative control: perturbing one weight by 1e-6 relative is detected', () => {
  const { te, se } = synth(12, 9);
  const ref = brute(te, se, 'FE');
  const se2 = se.slice(); se2[5] *= 1 + 1e-6;
  const f = compare(E.run(te, se2, 'FE'), ref, 'FE');
  assert.ok(f.length > 0, 'perturbed weight must fail');
});

test('engine refuses invalid input and reports exact coverage', () => {
  assert.throws(() => E.run([0.1, 0.2], [0.1, 0], 'FE'));
  assert.throws(() => E.run([0.1, NaN], [0.1, 0.1], 'FE'));
  assert.throws(() => E.run([0.1], [0.1], 'REML'));
  const r = E.run([0.1, 0.3, 0.2], [0.1, 0.2, 0.15], 'FE');
  assert.strictEqual(r.n_subsets, 7); assert.strictEqual(r.grid.counts.reduce((a, b) => a + b, 0), 7);
});

module.exports = { brute, compare, pool };
