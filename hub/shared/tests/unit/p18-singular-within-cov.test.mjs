import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Regression (lane p18ws): a within-study covariance with |r| = 1 is singular. For
// dat.fine1993 months 18+24, study 14 has v1 = v2 = cov. With the archived 17-digit
// value the Cholesky pivot rounds to 0 and fit() refuses; with the same data rounded to
// 15 significant digits the pivot rounds to +4.4e-16, the check passed, and the zero-G
// boundary step dereferenced a null profile: "Cannot read properties of null (reading 'Ws')".
// The requirement: a singular S_i is refused with the positive-definite message,
// independent of the last-digit rounding of the input.
const context = vm.createContext({});
for (const file of ['shared/multivariate-ma.js', 'multivariate-ma/plus.js']) {
  vm.runInContext(readFileSync(new URL('../../../../' + file, import.meta.url), 'utf8'), context);
}
const M = context.AlmMultivariate, plus = context.AlmMvPlus;
// dat.fine1993 months 18+24, rows 1-16 (row 17 has a missing month-18 value).
const ROUNDED = [
  [-0.762140052046897, 0.513095238095238, 0.524070850516011, 0.702631578947368, 0.46140350877193],
  [0.980006546260263, 0.281335282651072, 1.33914758269419, 0.320447670901391, 0.270160314579552],
  [1.25122568917648, 0.464846980976013, 1.93141714175275, 2.3147013150689, 0.43768115942029],
  [0.162518929497775, 0.571323529411765, -0.567984037605939, 0.942156862745098, 0.514117647058824],
  [0.940243972896648, 0.266317016317016, 0.387115969439968, 0.321885521885522, 0.24648191314858],
  [0.68046202103263, 0.112558108349723, 0.391704795267947, 0.142826564725927, 0.106343485869098],
  [-0.0487901641694319, 0.372619047619048, -0.520534437892951, 0.512312949216449, 0.348038176033934],
  [-0.154150679827258, 0.156850459482038, -0.533298479618049, 0.202575757575758, 0.136578947368421],
  [1.08768321813592, 0.41802038541169, 0.702716631576096, 0.436080586080586, 0.404127923358693],
  [0.516216472400867, 0.434285091543156, 2.45818138203583, 2.20733162362686, 0.394230769230769],
  [0.391624983623386, 0.0503455855081653, 0.256769607168944, 0.0590878236576978, 0.0474554117552996],
  [0.651253595449574, 0.0697218669153532, 1.35516383715016, 0.149412315308381, 0.0631970299678155],
  [0.345205916589967, 0.228524209073408, 0.605136303237232, 0.258498168498168, 0.214261294261294],
  [1.25276296849537, 1.21031746031746, 1.25276296849537, 1.21031746031746, 1.21031746031746],
  [0.836248024200618, 0.86025641025641, -0.105360515657826, 0.561111111111111, 0.464102564102564],
  [0.117783035656384, 0.533333333333333, 1.45528723260684, 1.3031746031746, 0.470238095238095]
];
const studies = rows => rows.map(r => ({ y: [r[0], r[2]], S: [[r[1], r[4]], [r[4], r[3]]] }));
const PD = /Within-study covariance must be positive definite\./;

test('singular S_i (|r| = 1) is refused for the archived 17-digit value', () => {
  const rows = ROUNDED.map(r => r.slice()); const a = 1.2103174603174602;
  rows[13] = [1.2527629684953683, a, 1.2527629684953683, a, a];
  assert.throws(() => M.fit(studies(rows)), PD);
});
test('singular S_i (|r| = 1) is refused for the same value rounded to 15 significant digits', () => {
  assert.throws(() => M.fit(studies(ROUNDED)), PD);
});
test('every |r| = 1 value of the form v = cov, on a grid of magnitudes, is refused with the PD message', () => {
  const fails = [];
  for (let e = -6; e <= 6; e++) for (const base of [1, 1.21031746031746, 1.2103174603174602, 3.3333333333333335, 7.1]) {
    const a = base * Math.pow(10, e), rows = ROUNDED.map(r => r.slice()); rows[13] = [0.5, a, 0.5, a, a];
    try { M.fit(studies(rows)); fails.push([a, 'fitted']); } catch (err) { if (!PD.test(err.message)) fails.push([a, err.message]); }
  }
  assert.deepEqual(fails, []);
});
test('a positive-definite near-singular S_i (r = 0.999) still fits', () => {
  const rows = ROUNDED.map(r => r.slice()); const a = 1.21031746031746; rows[13] = [1.25, a, 1.25, a, 0.999 * a];
  const f = M.fit(studies(rows)); assert.ok(f.mu.every(Number.isFinite));
});
test('page path (AlmMvPlus.compute, source of the page Refused text) gives the PD reason, not a TypeError', () => {
  const parsed = { mode: 'cov', outcomes: ['A', 'B'], omitted: [], rows: ROUNDED.map((r, i) => ({
    line: i + 2, label: String(i + 1), y: [r[0], r[2]], v: [r[1], r[3]], cov: r[4], r: r[4] / Math.sqrt(r[1] * r[3]) })) };
  const res = plus.compute(parsed);
  assert.equal(res.status, 'refused');
  assert.match(res.reason, PD);
});
