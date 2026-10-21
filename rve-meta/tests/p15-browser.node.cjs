const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// Browser-global VM: the page's scripts without Node's module system. This is
// not a rendered-browser test; see hub/shared/tests/rve-meta-wasm-render.spec.mjs.
function pageContext() {
  const html = fs.readFileSync(path.join(root, 'rve-meta/index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  const window = {};
  const context = vm.createContext({window, WebAssembly, atob});
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
    .filter(s => /\/(stats-qt|rve-eigen|rve)\.js$/.test(s));
  assert.deepEqual(scripts, ['../shared/stats-qt.js', '../shared/rve-eigen.js', '../shared/rve.js']);
  for (const src of scripts)
    vm.runInContext(fs.readFileSync(path.resolve(root, 'rve-meta', src), 'utf8'), context);
  return window;
}

test('page loads the eigen backend and permits its WebAssembly compilation', async () => {
  const window = pageContext();
  const f = require('./fixtures/p15-eigen/eigen.json');
  assert.ok(new Set(f.input.rows.map(r => r.cluster)).size < f.input.rows.length, 'multi-row clusters');
  // A CR2 fit requested before the asynchronous compile settles must refuse.
  assert.equal(window.AlmRVEEigen.status(), 'loading');
  assert.throws(() => window.AlmRVE.fitCORR(f.input.rows, {rho: f.input.rho}),
    {message: /^RVE: CR2 eigen backend is still loading/});
  await window.AlmRVEEigen.ready;
  assert.equal(window.AlmRVEEigen.status(), 'ready');
  const result = window.AlmRVE.summary(window.AlmRVE.fitCORR(f.input.rows, {rho: f.input.rho}));
  assert.equal(result.length, f.R.table.length);
  result.forEach((s, j) => {
    for (const [a, r] of Object.entries({estimate: 'b.r', se: 'SE', t: 't', df: 'dfs',
      p: 'prob', ci_lo: 'CI.L', ci_hi: 'CI.U'})) {
      const y = f.R.table[j][r], scale = ['p', 'ci_lo', 'ci_hi'].includes(a) ? 1 : Math.max(1, Math.abs(y));
      assert.ok(Math.abs(s[a] - y) <= 1e-9 * scale, `${a}[${j}]: app=${s[a]}, R=${y}`);
    }
  });
});
