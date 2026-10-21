// node --test rve-meta/tests/r-reductions.node.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
require('../../shared/stats-qt.js');
const enginePath = process.env.RVE_ENGINE || path.resolve(__dirname, '../../shared/rve.js');
const RVE = require(enginePath);

function close(a, b, absolute, label) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a - b) <= 1e-9 * (absolute ? 1 : Math.max(1, Math.abs(b))),
  `${label}: app=${a}, R=${b}`);
}

// Inspect private arithmetic helpers without adding a production API.
const ctx = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(enginePath, 'utf8')
  .replace('function fitCORR(rows, opts) {',
    'if (typeof rSum === "function") global.reductions = { rSum, rMean, rFactorKey }; function fitCORR(rows, opts) {'), ctx);

test('R 4.6 sum/mean controls: cancellation, double rounding, subnormals and overflow',
  { skip: !ctx.reductions && 'Reduction helpers are in the rejected candidate, not the unchanged engine' }, () => {
  const controls = require('./fixtures/p15/reduction-controls.json');
  for (const [i, ref] of controls.entries()) {
    for (const [name, fn] of [['sum', ctx.reductions.rSum], ['mean', ctx.reductions.rMean]]) {
      const actual = fn(ref.input);
      assert.equal(Number.isFinite(actual) ? actual : null, ref[name], `${name} control ${i}`);
    }
  }
});

test('C-locale factor ordering uses native Unicode escapes',
  { skip: !ctx.reductions && 'Factor helper is in the rejected candidate, not the unchanged engine' }, () => {
  const labels = ['Kessler', 'King', 'Kyle', 'K\uFFFDnig'];
  const keys = labels.map(ctx.reductions.rFactorKey);
  assert.deepEqual(keys, ['Kessler', 'King', 'Kyle', 'K<U+FFFD>nig']);
  assert.deepEqual(labels.slice().sort((a, b) =>
    ctx.reductions.rFactorKey(a) < ctx.reductions.rFactorKey(b) ? -1 : 1),
  ['K\uFFFDnig', 'Kessler', 'King', 'Kyle']);
});

test('sorting is internal: input is untouched and weights retain input-row alignment', () => {
  const rows = require('./fixtures/p15/order.json').input.rows;
  const snapshot = JSON.stringify(rows);
  const fit = RVE.fitCORR(rows, { rho: 0 });
  const reverse = RVE.fitCORR(rows.slice().reverse(), { rho: 0 });
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(fit.weights, reverse.weights.slice().reverse());
  assert.deepEqual(fit.beta, reverse.beta);
  rows.forEach((r, i) => assert.equal(fit.weights[i], 1 / (r.vi + fit.tau2)));
});

// Source: p15diag/r_source/robumeta_robu.R (robumeta 2.1).
// 37: dframe$study <- as.factor(dframe$studynum)
// 39: dframe <- dframe[order(dframe$study), ]
// 134: sumW <- sum(data.full$weights)
// 42: dframe$avg.var.eff.size <- stats::ave(dframe$var.eff.size,
// 43:     dframe$study)
for (const cause of ['order', 'sumw', 'mean']) {
  test(`${cause}: smallest archived reproducer agrees with both R references at 1e-9`, () => {
    const f = require(`./fixtures/p15/${cause}.json`);
    const fit = RVE.fitCORR(f.input.rows, { rho: f.input.rho });
    const summary = RVE.summary(fit);
    close(fit.tau2, f.R.tau2, false, 'tau2');
    summary.forEach((s, j) => {
      for (const [a, r] of Object.entries({
        estimate: 'b.r', se: 'SE', t: 't', df: 'dfs', p: 'prob',
        ci_lo: 'CI.L', ci_hi: 'CI.U'
      })) close(s[a], f.R.table[j][r], ['p', 'ci_lo', 'ci_hi'].includes(a), `${a}[${j}]`);
      for (const [a, r] of Object.entries({
        estimate: 'beta', se: 'SE', t: 'tstat', df: 'df_Satt', p: 'p_Satt'
      })) close(s[a], f.R.club[r][j], a === 'p', `club_${a}[${j}]`);
    });
  });
}
