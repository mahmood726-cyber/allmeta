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
test('generated browser bundle executes without Node or an R process', async () => {
  const window = {};
  const ctx = vm.createContext({window, WebAssembly, atob});
  vm.runInContext(fs.readFileSync(backendPath, 'utf8'), ctx);
  await window.AlmRVEEigen.ready;
  for (const f of adjustments)
    assert.deepEqual(JSON.parse(JSON.stringify(adjustment(f.matrix, window.AlmRVEEigen))),
      f.expected);
  assert.throws(() => window.AlmRVEEigen([[1, -1e-13], [1e-13, 1]]),
    {message: 'invalid comparison with complex values'});
  assert.equal(window.AlmRVEEigen(largeGeneralMatrix()).values.length, 150);
});

// m1: a browser without WebAssembly, or one whose CSP refuses compilation,
// gets one clear RVE error; the failure is cached, not retried per fit.
const UNAVAILABLE = 'RVE: CR2 requires WebAssembly (blocked or unavailable)';
async function failedBundle(webAssembly) {
  const window = {};
  vm.runInContext(fs.readFileSync(backendPath, 'utf8'),
    vm.createContext({window, WebAssembly: webAssembly, atob}));
  await assert.rejects(window.AlmRVEEigen.ready, {message: UNAVAILABLE});
  assert.equal(window.AlmRVEEigen.status(), 'failed');
  const errors = [0, 1].map(() => {
    try { window.AlmRVEEigen([[2, 1], [1, 2]]); } catch (e) { return e; }
    assert.fail('a CR2 eigen call must not return without the backend');
  });
  assert.equal(errors[0].message, UNAVAILABLE);
  assert.equal(errors[0], errors[1], 'the cached failure is rethrown');
  return errors[0];
}
test('absent WebAssembly fails with the RVE message, once', async () => {
  const e = await failedBundle(undefined);
  assert.match(String(e.cause), /WebAssembly is not defined/);
});
test('a refused compilation (CSP CompileError) fails with the RVE message, once', async () => {
  let compiles = 0;
  const blocked = Object.assign(Object.create(WebAssembly), {
    compile() { compiles++; return Promise.reject(new WebAssembly.CompileError('refused by CSP')); }
  });
  const e = await failedBundle(blocked);
  assert.equal(e.cause.message, 'refused by CSP');
  assert.equal(compiles, 1);
});

// m2: C semantics of the runtime imports.
test('lround and lroundf round halfway cases away from zero', () => {
  const {lround, lroundf} = eigen._runtime;
  for (const [x, y] of [[2.5, 3], [-2.5, -3], [0.5, 1], [-0.5, -1], [1.5, 2], [-1.5, -2],
    [2.4999999999999996, 2], [0.49999999999999994, 0], [-0.49999999999999994, -0], [7, 7]])
    assert.equal(lround(x), y, `lround(${x})`);
  assert.equal(lroundf(0.49999997), 0);
  assert.equal(lroundf(-2.5), -3);
});
test('__powidf2 follows compiler-rt repeated squaring, not Math.pow', () => {
  const p = eigen._runtime.__powidf2, x = 1.3;
  assert.equal(p(x, 0), 1);
  assert.equal(p(x, 5), x * ((x * x) * (x * x)));
  assert.equal(p(x, 7), (x * (x * x)) * ((x * x) * (x * x)));
  assert.equal(p(x, -2), 1 / (x * x));
  assert.equal(p(x, -5), 1 / (x * ((x * x) * (x * x))));
  assert.notEqual(p(x, 5), Math.pow(x, 5));
});

// Minimal side modules for the loader checks.
const leb = n => { const out = []; do { let b = n & 127; n >>>= 7; if (n) b |= 128; out.push(b); } while (n); return out; };
const name = s => [...leb(s.length), ...Buffer.from(s)];
const section = (id, bytes) => [id, ...leb(bytes.length), ...bytes];
const vec = items => [...leb(items.length), ...items.flat()];
function sideModule({memInfo = [0, 0, 0, 0], dylink = true, functions = [], globals = [], body = null} = {}) {
  const imports = [[...name('env'), ...name('memory'), 2, 0, 1],
    ...functions.map(([mod, f]) => [...name(mod), ...name(f), 0, 0]),
    ...globals.map(g => [...name('GOT.mem'), ...name(g), 3, 0x7f, 1])];
  const bytes = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
  if (dylink) bytes.push(...section(0, [...name('dylink.0'), 1, ...leb(memInfo.flatMap(leb).length), ...memInfo.flatMap(leb)]));
  bytes.push(...section(1, vec([[0x60, 0, 0]])), ...section(2, vec(imports)));
  if (body) {
    const code = [0, ...body, 0x0b];
    bytes.push(...section(3, vec([[0]])), ...section(7, vec([[...name('dsyevr_'), 0, functions.length]])),
      ...section(10, vec([[...leb(code.length), ...code]])));
  }
  return new WebAssembly.Module(new Uint8Array(bytes));
}
function link(module) {
  const linker = eigen._runtime.createLinker();
  linker.record(new WebAssembly.Instance(module, linker.imports(module)));
  return linker.finish();
}
test('unknown imports are refused when the module is linked', () => {
  assert.throws(() => link(sideModule({functions: [['env', 'round']]})), {message: 'RVE: unknown LAPACK import round'});
  assert.throws(() => link(sideModule({functions: [['wasi', 'fd_write']]})), {message: 'RVE: unknown LAPACK import wasi.fd_write'});
  // Allowlisted but outside the eigensolver paths: refused when called.
  const solve = link(sideModule({functions: [['env', 'xerbla_']], body: [0x10, 0]}));
  assert.throws(() => solve([[2, 1], [1, 2]], true), {message: 'RVE: unsupported LAPACK runtime call xerbla_'});
});
// m3: dylink.0 bounds and the undefined data symbols.
test('dylink.0 memory and table sizes must fit the loader slots', () => {
  assert.doesNotThrow(() => link(sideModule({memInfo: [16384, 4, 3, 0]})));
  for (const memInfo of [[16385, 0, 0, 0], [0, 5, 0, 0], [0, 0, 4, 0]])
    assert.throws(() => link(sideModule({memInfo})), {message: 'RVE: LAPACK side module exceeds its loader slot'});
  assert.throws(() => link(sideModule({dylink: false})), {message: 'RVE: LAPACK side module lacks dylink.0'});
});
test('undefined C++/stdio data symbols trap or are detected on use', () => {
  // dsyevr_ stores 0 at the address of stderr: detected after the call.
  const write = link(sideModule({globals: ['stderr'], body: [0x23, 0, 0x41, 0, 0x36, 2, 0]}));
  assert.throws(() => write([[2, 1], [1, 2]], true), {message: 'RVE: LAPACK wrote to an unsupported runtime symbol'});
  // dsyevr_ dereferences the pointer stored at stderr: the 0xFF guard traps.
  const read = link(sideModule({globals: ['_ZTVSt9exception'], body: [0x23, 0, 0x28, 2, 0, 0x28, 2, 0, 0x1a]}));
  assert.throws(() => read([[2, 1], [1, 2]], true), WebAssembly.RuntimeError);
  assert.throws(() => link(sideModule({globals: ['errno']})), {message: 'RVE: missing LAPACK data symbol errno'});
});
