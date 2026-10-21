'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../../shared/stats-qt.js');
// The audit can run these same assertions against an isolated candidate.
const RVE = require(process.env.RVE_ENGINE
  ? path.resolve(process.env.RVE_ENGINE) : '../../shared/rve.js');
const fixture = name => require('./fixtures/p15-eigen/' + name + '.json');

function atGate(x, y, quantity, absolute = false) {
  const divisor = absolute ? 1 : Math.max(1, Math.abs(y));
  assert.ok(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) / divisor <= 1e-9,
    `${quantity}: app=${x}, R=${y}`);
}

// R 4.6.0 base_eigen.R:16,19:
// symmetric <- isSymmetric.matrix(x)
// .Internal(La_rs(x, only.values))
// robumeta 2.1 robu.R:212,217-220:
// eigenres_list <- lapply(ImHii, function(x) eigen(x))
// eigenval_InvSqrt <- ifelse(eigenval < 10^-10, 0, 1/sqrt(eigenval))
// eigenvec %*% diag(eigenval_InvSqrt, k, k) %*% t(eigenvec)
test('smallest CR2 eigen fixture agrees with R at the unchanged 1e-9 gate', () => {
  const f = fixture('eigen');
  const fit = RVE.fitCORR(f.input.rows, {rho: f.input.rho});
  const summary = RVE.summary(fit);
  atGate(fit.tau2, f.R.tau2, 'tau2');
  assert.equal(fit.method, 'CR2');
  assert.equal(summary.length, f.R.table.length);
  for (let j = 0; j < summary.length; j++) {
    for (const [actual, expected] of [
      ['estimate', 'b.r'], ['se', 'SE'], ['t', 't'],
      ['df', 'dfs'], ['p', 'prob'], ['ci_lo', 'CI.L'], ['ci_hi', 'CI.U']
    ]) {
      const x = summary[j][actual], y = f.R.table[j][expected];
      atGate(x, y, `${actual}[${j}]`, ['p', 'ci_lo', 'ci_hi'].includes(actual));
    }
    assert.ok(!('error' in f.R.club), 'clubSandwich reference succeeded');
    for (const [actual, expected] of [
      ['estimate', 'beta'], ['se', 'SE'], ['t', 'tstat'],
      ['df', 'df_Satt'], ['p', 'p_Satt']
    ]) {
      const value = f.R.club[expected];
      atGate(summary[j][actual], Array.isArray(value) ? value[j] : value,
        `club_${actual}[${j}]`, actual === 'p');
    }
  }
});

// R dispatches nonsymmetric matrices to La_rg (base_eigen.R:25), and
// robu's eigenval < 10^-10 errors before the reference writer's m<=p guard.
for (const name of ['minimal-complex', 'complex']) {
  test(`${name}: R complex-eigen refusal takes precedence over m<=p`, () => {
    const f = fixture(name);
    assert.throws(() => RVE.fitCORR(f.input.rows, {rho: f.input.rho}),
      {message: f.R.reason});
  });
}
