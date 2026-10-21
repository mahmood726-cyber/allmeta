const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

test('page loads the eigen backend and permits its WebAssembly compilation', () => {
  const html = fs.readFileSync(path.join(root, 'rve-meta/index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  const window = {};
  const context = vm.createContext({window, WebAssembly, atob});
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  for (const src of scripts.filter(s => /\/(stats-qt|rve-eigen|rve)\.js$/.test(s)))
    vm.runInContext(fs.readFileSync(path.resolve(root, 'rve-meta', src), 'utf8'), context);
  const f = require('./fixtures/p15-eigen/eigen.json');
  const result = window.AlmRVE.summary(window.AlmRVE.fitCORR(f.input.rows, {rho:f.input.rho}));
  assert.ok(Math.abs(result[0].ci_lo - f.R.table[0]['CI.L']) <= 1e-9);
});
