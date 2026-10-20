// node:test — shared/alm-verify-r.js row evaluation (review of PR #177):
//   * verify.optional (opts.notApplicable): "not applicable" only when BOTH sides are missing (FU10);
//   * quantities missing on either side (null / undefined / NaN) are NOT matches -> "not computed", never PASS,
//     and make the run fail unless the adapter declares the key optional (compare.optional) -> listed, excluded from N;
//   * the test hook window.__almVerifyPerturb can only ever make a row FAIL, is inert without ?almtest=1,
//     and stamps testHook:true + "TEST MODE" on any run where it was active.
// AlmValidate.compare is the real one from shared/alm-validate.js (unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const V = require('../../../../shared/alm-verify-r.js');
// alm-validate.js sets globalThis.AlmValidate when there is no window; compare() is pure.
require('../../../../shared/alm-validate.js');
const compare = globalThis.AlmValidate.compare;
let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };

const CMP = { tolerance: { default: 1e-9, tau2: 1e-6 }, kind: { tau2: 'rel', Q: 'rel' } };
const vals = o => Object.keys(o).map(k => ({ key: k, label: k, value: o[k] }));
const evaluate = (app, ref, cmp = CMP, hook = null) => V.evaluate(vals(app), ref, cmp, { compare, hook });

test('all quantities computed and matching -> PASS with "n of N computed quantities match R; 0 not computed"', () => {
  const r = evaluate({ mu: 0.5, tau2: 0.1, Q: 40 }, { mu: 0.5, tau2: 0.1, Q: 40 });
  eq([r.n, r.nPassed, r.nNotComputed, r.passed, r.testHook], [3, 3, 0, true, false]);
  eq(V.summaryText(r), '3 of 3 computed quantities match R; 0 not computed — PASS');
  eq(r.rows.map(x => x.status), ['pass', 'pass', 'pass']);
});

test('null / undefined / NaN on either side is "not computed", never a match, and fails the run', () => {
  // two-study proportion MA: prediction interval is null app-side and NA -> null in R
  const r = evaluate({ mu: 0.5, piLo: null, piHi: null, x: undefined, y: NaN, z: 1 },
    { mu: 0.5, piLo: null, piHi: null, x: 1, y: 2, z: NaN });
  eq(r.rows.map(x => x.status), ['pass', 'notcomputed', 'notcomputed', 'notcomputed', 'notcomputed', 'notcomputed']);
  eq(r.rows.filter(x => x.pass).map(x => x.key), ['mu'], 'only computed matches count as pass');
  eq([r.n, r.nPassed, r.nNotComputed, r.passed], [1, 1, 5, false]);
  eq(V.summaryText(r), '1 of 1 computed quantities match R; 5 not computed — FAIL: 5 not computed');
  // the R side missing a key entirely (undefined) is also not computed
  const r2 = evaluate({ mu: 0.5, tau2: 0.1 }, { mu: 0.5 });
  eq([r2.n, r2.nNotComputed, r2.passed], [1, 1, false]);
  // nothing computed at all is never a pass
  const r3 = evaluate({ a: null }, { a: null });
  eq([r3.n, r3.nPassed, r3.passed], [0, 0, false]);
  eq(V.summaryText(r3), '0 of 0 computed quantities match R; 1 not computed — FAIL: 1 not computed; nothing computed');
});

test('compare.optional: declared-optional keys missing on a side are listed but excluded from N and do not fail', () => {
  const cmp = { ...CMP, optional: ['piLo', 'piHi'] };
  const r = evaluate({ mu: 0.5, piLo: null, piHi: null, tau2: 0.1 }, { mu: 0.5, piLo: null, piHi: null, tau2: 0.1 }, cmp);
  eq(r.rows.map(x => x.status), ['pass', 'optional', 'optional', 'pass']);
  eq([r.n, r.nPassed, r.nNotComputed, r.nOptional, r.passed], [2, 2, 0, 2, true]);
  eq(V.summaryText(r), '2 of 2 computed quantities match R; 0 not computed (2 optional not computed) — PASS');
  // optional but computed on both sides -> compared normally (and can fail)
  const r2 = evaluate({ mu: 0.5, piLo: 0.2 }, { mu: 0.5, piLo: 0.3 }, cmp);
  eq([r2.n, r2.nPassed, r2.passed], [2, 1, false]);
  // a non-optional key is still required
  eq(evaluate({ mu: null }, { mu: null }, cmp).passed, false);
});

// verify.optional (FU10): keys declared not applicable for this data, passed as opts.notApplicable.
const evalNA = (app, ref, na, cmp = CMP) => V.evaluate(vals(app), ref, cmp, { compare, notApplicable: na });
test('verify.optional: both sides missing -> "not applicable", never PASS, not in N, does not fail', () => {
  const na = ['piLo', 'piHi', 'poolPiLo', 'poolPiHi'];
  const r = evalNA({ mu: 0.5, piLo: null, piHi: NaN, poolPiLo: null, poolPiHi: undefined, tau2: 0.1 },
    { mu: 0.5, piLo: null, piHi: null, poolPiLo: NaN, poolPiHi: null, tau2: 0.1 }, na);
  eq(r.rows.map(x => x.status), ['pass', 'notapplicable', 'notapplicable', 'notapplicable', 'notapplicable', 'pass']);
  eq([r.n, r.nPassed, r.nNotComputed, r.nNotApplicable, r.passed], [2, 2, 0, 4, true]);
  ok(r.rows.filter(x => x.status === 'notapplicable').every(x => x.pass === false), 'never a PASS row');
  eq(V.summaryText(r), '2 of 2 computed quantities match R; 0 not computed; 4 not applicable — PASS');
  eq(V.comparisonCsv(r.rows).trim().split('
')[2].endsWith(',NOT APPLICABLE for this analysis'), true);
});

test('PLANTED: a key declared not applicable but with an R value and a different app value still FAILS', () => {
  const r = evalNA({ mu: 0.5, piLo: 0.2 }, { mu: 0.5, piLo: 0.3 }, ['piLo']);
  eq(r.rows[1].status, 'fail');
  eq([r.n, r.nPassed, r.nNotApplicable, r.passed], [2, 1, 0, false]);
  // only one side missing -> NOT COMPUTED and the run fails (either direction)
  const r2 = evalNA({ mu: 0.5, piLo: null }, { mu: 0.5, piLo: 0.3 }, ['piLo']);
  eq([r2.rows[1].status, r2.nNotComputed, r2.nNotApplicable, r2.passed], ['notcomputed', 1, 0, false]);
  const r3 = evalNA({ mu: 0.5, piLo: 0.3 }, { mu: 0.5, piLo: null }, ['piLo']);
  eq([r3.rows[1].status, r3.passed], ['notcomputed', false]);
  // a key not declared stays required; nothing but not-applicable rows is not a pass
  eq(evalNA({ mu: null }, { mu: null }, ['piLo']).passed, false);
  eq(evalNA({ piLo: null }, { piLo: null }, ['piLo']).passed, false);
  // compare.optional keeps working alongside
  const r4 = evalNA({ mu: 0.5, piLo: null, x: null }, { mu: 0.5, piLo: null, x: null }, ['piLo'], { ...CMP, optional: ['x'] });
  eq(r4.rows.map(x => x.status), ['pass', 'notapplicable', 'optional']);
  eq(V.summaryText(r4), '1 of 1 computed quantities match R; 0 not computed (1 optional not computed); 1 not applicable — PASS');
});

test('outside tolerance -> FAIL with the count', () => {
  const r = evaluate({ mu: 0.5, tau2: 0.2 }, { mu: 0.5, tau2: 0.1 });
  eq([r.n, r.nPassed, r.passed], [2, 1, false]);
  eq(V.summaryText(r), '1 of 2 computed quantities match R; 0 not computed — FAIL: 1 not matching R');
});

test('test hook is inert unless the page URL has ?almtest=1', () => {
  const hook = { key: 'tau2', delta: 1e-3 };
  eq(V.testHookActive(hook, '?almtest=1'), true);
  eq(V.testHookActive(hook, '?x=2&almtest=1'), true);
  eq(V.testHookActive(hook, ''), false);
  eq(V.testHookActive(hook, '?almtest=0'), false);
  eq(V.testHookActive(hook, '?almtest=true'), false);
  eq(V.testHookActive(null, '?almtest=1'), false);
  eq(V.testHookActive(undefined, '?almtest=1'), false);
  // In node there is no location: the global hook is never active.
  globalThis.__almVerifyPerturb = hook;
  try { eq(V.testHookActive(), false, 'no ?almtest=1 -> inert'); } finally { delete globalThis.__almVerifyPerturb; }
});

test('active test hook: the perturbed row FAILS, the run is stamped testHook and shows TEST MODE', () => {
  const r = evaluate({ mu: 0.5, tau2: 0.1 }, { mu: 0.5, tau2: 0.1 }, CMP, { key: 'tau2', delta: 1e-3 });
  eq(r.rows.map(x => x.status), ['pass', 'fail']);
  eq(r.rows[1].app, 0.1 + 1e-3, 'perturbed value shown');
  eq(r.rows[1].reason, 'test perturbation');
  eq([r.passed, r.testHook], [false, true]);
  eq(r.perturbed, { key: 'tau2', delta: 1e-3 });
  ok(V.summaryText(r).startsWith('TEST MODE'), V.summaryText(r));
  eq(V.summaryText(r), 'TEST MODE (test hook active; not a verification) — 1 of 2 computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active');
});

test('PLANTED: a perturbation that would bring a FAILING row within tolerance still yields FAIL', () => {
  const app = { mu: 0.5, tau2: 0.1042 }, ref = { mu: 0.5, tau2: 0.1037 };
  eq(evaluate(app, ref).passed, false, 'control: genuinely failing');
  const r = evaluate(app, ref, CMP, { key: 'tau2', delta: -5e-4 });
  ok(compare(r.rows[1].app, ref.tau2, 'rel', 1e-6).pass, 'the perturbation does bring the value within tolerance');
  eq(r.rows[1].status, 'fail', 'row still FAILS');
  eq(r.rows[1].pass, false);
  eq([r.passed, r.testHook], [false, true]);
  // even a hook on a key that is not compared (or a zero delta) never yields a PASS run
  eq(evaluate({ mu: 0.5 }, { mu: 0.5 }, CMP, { key: 'nope', delta: 0 }).passed, false);
  eq(evaluate({ mu: 0.5 }, { mu: 0.5 }, CMP, { key: 'mu', delta: 0 }).rows[0].status, 'fail');
});

test('comparison CSV: diff (verdict scale) and abs_diff; not-computed rows say so', () => {
  const r = evaluate({ Q: 40.000000004, piLo: null }, { Q: 40, piLo: null });
  const csv = V.comparisonCsv(r.rows).trim().split('\n');
  eq(csv[0], 'quantity,key,app,R,diff,abs_diff,tolerance,kind,result');
  ok(/^Q,Q,40\.000000004,40,1(\.\d+)?e-10,4(\.\d+)?e-9,1e-9,rel,PASS$/.test(csv[1]), csv[1]);
  ok(csv[2].endsWith(',NOT COMPUTED (app and R)'), csv[2]);
  console.log('ALMVERIFYR checks ' + checks);
});
