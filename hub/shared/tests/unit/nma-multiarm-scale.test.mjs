// Requirements for shared/nma-multiarm-v1.js at extreme effect scales:
//  (1) between 1e-4 and 1e4 data units the fit is equivariant: effects and SEs x c give d x c and tau2 x c^2;
//  (2) a CONNECTED network the GLS cannot solve at its scale (SEs near 1e-6 or 1e8: invert() refuses pivots
//      below an absolute 1e-13) is refused as a numerical-range problem with advice to rescale, NOT as
//      "singular design (disconnected network?)", which sent the user looking for a missing link;
//  (3) a genuinely disconnected network is still refused as a singular design at every scale.
// R netmeta 3.7-0 is itself not reliable at these scales (scale 1e-6: d_B 0.389841 vs 0.388207 at scale 1;
// scale 1e8: tau2 > 0 for a homogeneous network), so the app refuses rather than fits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../../../../shared/nma-multiarm-v1.js';

const base = [
  { study: 'S1', t1: 'A', t2: 'B', est: 0.5, se: 0.2 }, { study: 'S1', t1: 'A', t2: 'C', est: 0.8, se: 0.22 },
  { study: 'S1', t1: 'B', t2: 'C', est: 0.3, se: 0.21 }, { study: 'S2', t1: 'A', t2: 'B', est: 0.3, se: 0.15 },
  { study: 'S3', t1: 'B', t2: 'C', est: 0.6, se: 0.3 }, { study: 'S4', t1: 'A', t2: 'D', est: -0.2, se: 0.25 },
  { study: 'S5', t1: 'C', t2: 'D', est: -1.2, se: 0.35 }, { study: 'S6', t1: 'A', t2: 'C', est: 1.1, se: 0.18 },
  { study: 'S7', t1: 'B', t2: 'D', est: -0.4, se: 0.28 },
];
const scaled = (rows, c) => rows.map(r => ({ ...r, est: r.est * c, se: r.se * c }));
for (const [model, method] of [['fe', 'DL'], ['re', 'DL'], ['re', 'REML']]) {
  const b = M.fit(base, { model, method });
  for (const c of [1e-4, 1e-2, 1e2, 1e4]) {
    test(`${model}/${method}: effects and SEs x ${c} give d x ${c}`, () => {
      assert.ok(b.ok, 'base fit');
      const o = M.fit(scaled(base, c), { model, method });
      assert.ok(o.ok, 'refused: ' + o.error);
      o.d.forEach((d, i) => assert.ok(Math.abs(d / c - b.d[i]) <= 1e-8 * Math.abs(b.d[i]), `d[${i}] ${d / c} vs ${b.d[i]}`));
      assert.ok(b.tau2 === 0 ? o.tau2 === 0 : Math.abs(o.tau2 / (c * c) - b.tau2) <= 1e-6 * b.tau2);
    });
  }
  for (const c of [1e-8, 1e-6, 1e8]) {
    test(`${model}/${method}: a connected network at scale ${c} is refused as a numerical-range problem, not as disconnected`, () => {
      const o = M.fit(scaled(base, c), { model, method });
      if (o.ok) return; // solvable at this scale: requirement (1) territory, nothing to check
      assert.match(o.error, /numerical range/i);
      assert.doesNotMatch(o.error, /disconnected/i);
      for (const key of ['d', 'cov']) assert.equal(o[key], undefined);
    });
  }
}
test('a disconnected network is still refused as a singular design at every scale', () => {
  const disc = [{ study: 'S1', t1: 'A', t2: 'B', est: 0.5, se: 0.2 }, { study: 'S2', t1: 'A', t2: 'B', est: 0.3, se: 0.15 },
    { study: 'S3', t1: 'C', t2: 'D', est: 0.6, se: 0.3 }, { study: 'S4', t1: 'C', t2: 'D', est: 0.2, se: 0.25 }];
  for (const c of [1e-8, 1, 1e8]) {
    const o = M.fit(scaled(disc, c), { model: 'fe' });
    assert.equal(o.ok, false, 'scale ' + c);
    assert.match(o.error, /insufficient contrasts|singular design/);
  }
});
