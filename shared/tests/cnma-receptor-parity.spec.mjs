/*
 * cnma-receptor-parity.spec.mjs
 * ----------------------------------------------------------------------------
 * Oracle-gated parity for shared/cnma-receptor.js — the additive component-NMA
 * + incretin-receptor decomposition ported from
 * glp1-doseresp-nma/glp1-obesity-mbnma/cnma_incretin.py (R-validated vs
 * netmeta::discomb to 1e-6 with a fail-closed assert).
 *
 * Gate: re-fit the cnma-tiny corpus with the JS WLS and assert it reproduces
 * allmeta's existing validated oracle (component-nma/tests/fixtures/cnma-oracle.json)
 * to 1e-6 — the SAME oracle the Python source asserts against. The fail-closed
 * behaviour (throw, not silently pass) is preserved and tested below.
 *
 * Run: node --test shared/tests/cnma-receptor-parity.spec.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CNMA = require('../cnma-receptor.js');

// Use allmeta's OWN validated oracle (same path the Python source gates on).
const ORACLE = JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'component-nma', 'tests', 'fixtures', 'cnma-oracle.json'), 'utf8'));

const TOL = 1e-6;

test('cnmaWls reproduces the netmeta::discomb oracle (cnma-tiny) to 1e-6', () => {
  const { comps, X, TE, se } = CNMA._.buildTiny();
  const { beta, se: sb, Q, df } = CNMA.cnmaWls(X, TE, se);

  let maxDiff = 0;
  comps.forEach((c, i) => {
    const o = ORACLE.components[c];
    const de = Math.abs(beta[i] - o.est), ds = Math.abs(sb[i] - o.se);
    maxDiff = Math.max(maxDiff, de, ds);
    assert.ok(de < TOL, `${c} est js=${beta[i]} R=${o.est} d=${de}`);
    assert.ok(ds < TOL, `${c} se js=${sb[i]} R=${o.se} d=${ds}`);
  });
  assert.ok(Math.abs(Q - ORACLE.Q_additive) < TOL, `Q js=${Q} R=${ORACLE.Q_additive}`);
  assert.strictEqual(df, ORACLE.df_additive, 'df.additive');

  // additive combination a+b+c == sum of components == discomb -0.8297864
  const sum = comps.reduce((s, c) => s + ORACLE.components[c].est, 0);
  const combo = CNMA.predict(['a', 'b', 'c'], comps, beta, CNMA.cnmaWls(X, TE, se).cov);
  assert.ok(Math.abs(combo.est - sum) < TOL, 'a+b+c == additive sum');
  assert.ok(Math.abs(combo.est - (-0.8297864)) < 1e-6, `a+b+c vs discomb ${combo.est}`);
});

test('validateAgainstOracle passes the real oracle and is FAIL-CLOSED on drift', () => {
  // passes on the genuine oracle
  const res = CNMA.validateAgainstOracle(ORACLE, TOL);
  assert.strictEqual(res.ok, true);
  assert.ok(res.maxDiff < TOL, `maxDiff ${res.maxDiff}`);

  // tampered oracle => MUST throw (never silently return / pass)
  const bad = JSON.parse(JSON.stringify(ORACLE));
  bad.components.a.est += 0.01;
  assert.throws(() => CNMA.validateAgainstOracle(bad, TOL), /does not match validated discomb oracle/,
    'fail-closed assert preserved');
});

test('receptor decomposition reproduces the glp1 cnma_incretin baseline', () => {
  // First: the extension must not ship unless the oracle gate passes.
  CNMA.validateAgainstOracle(ORACLE, TOL);

  const r = CNMA.receptorDecompose();
  assert.deepStrictEqual(r.comps, ['GLP1', 'GIP', 'GCG']);
  assert.strictEqual(r.df, 4, 'df = nStudies(7) - nComponents(3)');

  // Baselines from glp1-obesity-mbnma/cnma_incretin.json (rounded reporting there;
  // here we pin to the same rounded values the source emits).
  assert.ok(Math.abs(Math.round(r.components.GLP1.est * 10) / 10 - 13.1) < 1e-9, `GLP1 ${r.components.GLP1.est}`);
  assert.ok(Math.abs(Math.round(r.components.GIP.est * 10) / 10 - 4.8) < 1e-9, `GIP ${r.components.GIP.est}`);
  assert.ok(Math.abs(Math.round(r.components.GCG.est * 10) / 10 - 5.6) < 1e-9, `GCG ${r.components.GCG.est}`);

  // additive triple-agonism prediction & the un-trialled GIP+glucagon read
  assert.ok(Math.abs(Math.round(r.triplePredicted.est * 10) / 10 - 23.5) < 1e-9,
    `triple predicted ${r.triplePredicted.est}`);
  assert.ok(Math.abs(Math.round(r.tripleObserved.est * 10) / 10 - 21.4) < 1e-9,
    `triple observed ${r.tripleObserved.est}`);
  assert.ok(Math.abs(Math.round(r.gipGcgNoGlp1.est * 10) / 10 - 10.4) < 1e-9,
    `GIP+GCG no-GLP1 ${r.gipGcgNoGlp1.est}`);

  // honest-caveat invariants: components positive, additive Q exceeds df (heterogeneity)
  assert.ok(r.components.GLP1.est > 0 && r.components.GIP.est > 0 && r.components.GCG.est > 0);
  assert.ok(r.Q > r.df, `Q ${r.Q} should exceed df ${r.df} (molecule heterogeneity)`);
});
