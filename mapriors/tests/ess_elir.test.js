// node mapriors/tests/ess_elir.test.js [page]   (fast: loads only the MAPEngine block)
// Requirement: beta ELIR ESS = RBesT 1.12-0 ess.betaMix(method = "elir"):
//   * refused (error) when any component has a < 1 or b < 1 ("the defining integral diverges");
//   * otherwise integral of dmix(p) * (-d2 log dmix / dp2) * p(1-p) dp.
// For ONE Beta(a, b) component that integral is exact: E[(a-1)(1-p)/p] + E[(b-1)p/(1-p)]
//   = (a > 1 ? b : 0) + (b > 1 ? a : 0)   -- a + b only when both a, b > 1; Beta(1,1) has zero curvature -> 0.
// R values below: RBesT 1.12.0, R 4.6.0, node2 2026-11-12 (p36val-work/elir.R). RBesT integrates numerically,
// so its value carries ~1e-5 integration error (Beta(2,3): 4.99997038463506 vs exact 5).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const page = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const h = fs.readFileSync(page, 'utf8');
const s = h.slice(h.indexOf('/* ==== RBesT-model engine (MAPEngine) ==== */'), h.indexOf('/* ==== End RBesT-model engine ==== */'));
const ctx = vm.createContext({ console, Math }); vm.runInContext('var normalCDF,normalQuantile;' + s, ctx); const E = ctx.MAPEngine;
let passed = 0, total = 0;
function test(name, f) { total++; try { f(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } }
const beta1 = (a, b) => ({ family: 'beta', comps: [{ w: 1, a, b }] });
const elir = m => E.ess(m, 'elir');
const near = (x, y, tol, what) => assert.ok(Number.isFinite(x) && Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${what}: page ${x} vs ${y} (tol ${tol})`);
// [a, b, RBesT 1.12.0 value]
const R1 = [[1, 1, 0], [1, 2, 0.999999941580518], [2, 1, 0.99999994150765], [1, 30, 1.00000000000268],
  [2, 3, 4.99997038463506], [10, 30, 40.0000000000925]];
test('E1 single beta ELIR = RBesT 1.12-0 (a or b = 1 contributes 0, not a + b)', () => {
  for (const [a, b, r] of R1) near(elir(beta1(a, b)), r, 1e-5, `Beta(${a},${b})`);
});
test('E2 single beta ELIR equals the exact closed form (a>1?b:0)+(b>1?a:0)', () => {
  for (const [a, b] of [[1, 1], [1, 2], [2, 1], [1, 30], [2, 3], [10, 30], [1.0001, 1]]) near(elir(beta1(a, b)), (a > 1 ? b : 0) + (b > 1 ? a : 0), 1e-12, `Beta(${a},${b})`);
});
test('E3 ELIR refused when any beta parameter < 1 (RBesT stops: integral diverges), single and mixture', () => {
  for (const m of [beta1(0.5, 0.5), beta1(0.9, 3), { family: 'beta', comps: [{ w: .8, a: .5, b: .5 }, { w: .2, a: 10, b: 30 }] }])
    assert.throws(() => elir(m), /less than 1/, 'no refusal for ' + JSON.stringify(m.comps));
});
// E4 tolerance 1e-6: RBesT integrates numerically (see E1 note); page and R differ by 1.4e-8 relative on Beta(1,2) mix.
test('E4 mixtures with a component at exactly 1 unchanged (RBesT 2.70260817476575, 3.23673865899133)', () => {
  near(elir({ family: 'beta', comps: [{ w: .8, a: 1, b: 1 }, { w: .2, a: 10, b: 30 }] }), 2.70260817476575, 1e-6, '0.8 Beta(1,1) + 0.2 Beta(10,30)');
  near(elir({ family: 'beta', comps: [{ w: .8, a: 1, b: 2 }, { w: .2, a: 10, b: 30 }] }), 3.23673865899133, 1e-6, '0.8 Beta(1,2) + 0.2 Beta(10,30)');
});
test('E5 normal single component unchanged: sigma^2 / s^2', () => {
  near(E.ess({ family: 'normal', sigma: 2, comps: [{ w: 1, m: 0, s: .5 }] }, 'elir'), 16, 1e-12, 'N(0, .5), sigma 2');
});
console.log(`${passed}/${total} PASS`); process.exitCode = passed === total ? 0 : 1;
