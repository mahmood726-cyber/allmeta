'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const backendPath = process.env.RVE_EIGEN_BACKEND
  ? require('node:path').resolve(process.env.RVE_EIGEN_BACKEND)
  : require.resolve('../../shared/rve-eigen.js');
const eigen = require(backendPath);
const adjustments = require('./fixtures/p15-eigen/adjustments.json');
const complex = require('./fixtures/p15-eigen/complex-leverage.json');

function adjustment(A, solver) {
  const e = solver(A), V = e.vectors, n = A.length;
  const d = e.values.map(x => x < 1e-10 ? 0 : 1 / Math.sqrt(x));
  return Array.from({length:n}, (_, i) => Array.from({length:n}, (_, j) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += V[i][k] * d[k] * V[j][k];
    return s;
  }));
}
function largeGeneralMatrix(n = 150) {
  return Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) =>
    i === j ? 2 : i === j + 1 ? 0.2 : i + 1 === j ? 0.19 : 0));
}
// robumeta_robu.R:212 and :217-220; base_eigen.R:16,19.
test('R adjustment matrices match bit for bit at each recorded block size', () => {
  for (const f of adjustments)
    assert.deepEqual(adjustment(f.matrix, eigen), f.expected, f.source);
});
// base_eigen.R:25 dispatches to La_rg. Its complex storage decision precedes
// robu.R:217's eigenvalue comparison, which must refuse complex values.
test('nonsymmetric leverage blocks reproduce R complex dispatch', () => {
  assert.ok(complex.blocks.some(b => b.complex));
  for (const block of complex.blocks) {
    assert.equal(eigen.isSymmetric(block.matrix), block.symmetric);
    if (block.complex)
      assert.throws(() => eigen(block.matrix), {message: complex.reason});
    else assert.doesNotThrow(() => eigen(block.matrix));
  }
});
test('general real eigenvectors are retained, and complex eigenvalues are refused', () => {
  const e = eigen([[2, 1], [0, 1]]);
  assert.deepEqual(e.values, [2, 1]);
  assert.throws(() => eigen([[1, -1e-13], [1e-13, 1]]),
    {message: 'invalid comparison with complex values'});
});
// R base_eigen.R:25 calls La_rg. DGEEV's large-matrix QR path also needs the
// single-precision logf import; the wrapper must support that runtime path.
test('general eigen handles the large-matrix LAPACK runtime path', () => {
  const n = 150;
  const A = largeGeneralMatrix(n);
  const result = eigen(A);
  // These Toeplitz eigenvalues are analytic, so the control needs no large
  // generated fixture and checks all 150 eigenvalues independently.
  const values = Array.from({length: n}, (_, k) =>
    2 + 2 * Math.sqrt(0.2 * 0.19) * Math.cos((k + 1) * Math.PI / (n + 1)));
  for (let k = 0; k < n; k++)
    assert.ok(Math.abs(result.values[k] - values[k]) <= 1e-9, `eigenvalue ${k}`);
});
test('symmetry dispatch agrees with installed R near its tolerance boundary', () => {
  const cases = require('./fixtures/p15-eigen/symmetry-boundaries.json');
  for (let i = 0; i < cases.length; i++)
    assert.equal(eigen.isSymmetric(cases[i].matrix), cases[i].expected, `R control ${i}`);
});
test('generated browser bundle executes without Node or an R process', () => {
  const window = {};
  const ctx = vm.createContext({window, WebAssembly, atob});
  vm.runInContext(fs.readFileSync(backendPath, 'utf8'), ctx);
  for (const f of adjustments)
    assert.deepEqual(JSON.parse(JSON.stringify(adjustment(f.matrix, window.AlmRVEEigen))),
      f.expected);
  assert.throws(() => window.AlmRVEEigen([[1, -1e-13], [1e-13, 1]]),
    {message: 'invalid comparison with complex values'});
  assert.equal(window.AlmRVEEigen(largeGeneralMatrix()).values.length, 150);
});
