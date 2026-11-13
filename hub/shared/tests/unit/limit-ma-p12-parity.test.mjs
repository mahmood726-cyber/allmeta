import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadLimit } from './limit-ma-p12-harness.mjs';

const inputBytes = readFileSync(new URL('../r/limit-ma-p12-input.json', import.meta.url));
const inputs = JSON.parse(inputBytes);
const oracle = JSON.parse(readFileSync(new URL('../r/limit-ma-p12-reference.json', import.meta.url), 'utf8'));
const app = loadLimit();
const TOL = 1e-6; // Absolute, including iterative selection estimates/uncertainty.

function near(actual, expected, label) {
  if (expected === null) return assert.equal(actual, null, label);
  assert.equal(typeof expected, 'number', `${label}: invalid R number`);
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= TOL,
    `${label}: app=${actual} R=${expected} absolute difference=${Math.abs(actual - expected)} tolerance=${TOL}`);
}
function values(actual, expected, label) {
  assert.ok(actual && expected, `${label}: values missing`);
  for (const [key, value] of Object.entries(expected)) {
    const path = `${label}.${key}`;
    assert.ok(Object.hasOwn(actual, key), `${path}: missing output`);
    if (Array.isArray(value)) {
      assert.equal(actual[key].length, value.length, `${path}: length`);
      value.forEach((v, i) => near(actual[key][i], v, `${path}[${i}]`));
    } else if (typeof value === 'string') assert.equal(actual[key], value, path);
    else near(actual[key], value, path);
  }
}
function method(actual, expected, label) {
  assert.equal(actual.status, expected.status, `${label}: app=${JSON.stringify(actual)} R=${JSON.stringify(expected)}`);
  if (expected.status === 'ok') values(actual.values, expected.values, label);
  else assert.equal(actual.reason, expected.reason, `${label}: refusal reason`);
}
const cache = new Map();
function actual(c) {
  if (!cache.has(c.id)) {
    const primary = app.run(c);
    cache.set(c.id, { ...primary, methods: c.te.length >= 3 ? app.plus(c, primary.result) : null });
  }
  return cache.get(c.id);
}

test('P12 provenance: fresh R/package versions and exact input identity', () => {
  assert.match(oracle.provenance.R, /^R version /);
  for (const pkg of ['meta','metasens','metafor','jsonlite','metadat','stats']) {
    assert.match(oracle.provenance.packages[pkg], /^\d+\./, pkg);
  }
  assert.equal(oracle.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.deepEqual(oracle.cases.map(({ id, te, se }) => ({ id, te, se })), inputs.cases);
  assert.deepEqual(oracle.chi_square.map(({ x, df }) => [x, df]), inputs.chi_square);
  assert.deepEqual(oracle.student_t.map(({ t, df }) => [t, df]), inputs.student_t);
});

for (const id of ['k1', 'k2', 'k3_equal_se']) {
  test(`P12 domain control: ${id} is explicitly refused by the page and public engine`, () => {
    const c = oracle.cases.find(c => c.id === id);
    const reason = id === 'k3_equal_se' ? /variation in study SEs/ : /At least three/;
    const got = app.run(c);
    assert.equal(got.result, null);
    assert.match(got.error, reason);
    assert.throws(() => app.window.AlmLimitEngine.fit(c.te.map((te, i) => ({ te, se: c.se[i] }))), reason);
    // R's raw attempt is retained even if it can produce a degenerate result.
    // App k>=3 and varying-SE restrictions are intentional, not numeric parity.
    assert.ok(['ok', 'refused'].includes(c.primary.status));
    assert.ok(app.run(oracle.cases[0]).result, 'valid control recovers after refusal');
  });
}

const eligible = oracle.cases.filter(c => c.te.length >= 3 && c.id !== 'k3_equal_se');
for (const c of eligible) {
  test(`P12 primary ${c.id}: FE/DL/beta0 estimates, SEs, CIs, tau, Q, G2 and shrunken studies`, () => {
    assert.equal(c.primary.status, 'ok', `R primary failed: ${JSON.stringify(c.primary)}`);
    assert.ok(actual(c).result, actual(c).error);
    values(actual(c).result, c.primary.values, c.id);
    const pure = app.window.AlmLimitEngine.fit(c.te.map((te, i) => ({ te, se: c.se[i] })));
    values(pure, {limit_est:c.primary.values.limit_est,limit_se:c.primary.values.limit_se,
      re_est:c.primary.values.re_est,tau2:c.primary.values.tau2_dl,te_limit:c.primary.values.te_limit}, `${c.id}.public`);
  });
  for (const name of ['RE','trimfill','PET','PEESE','Egger','Qsmall','Qresid']) {
    test(`P12 ${name} ${c.id}: native R values and inference at absolute 1e-6`, () => {
      assert.ok(c.methods[name], `${name}: R reference missing`);
      method(actual(c).methods[name], c.methods[name], `${c.id}.${name}`);
    });
  }
  test(`P12 conditional ${c.id}: R PET/PEESE decision at three alpha levels`, () => {
    assert.deepEqual(c.conditional.map(x => x.alpha), inputs.alphas);
    const got = actual(c).methods;
    for (const {alpha, result} of c.conditional) {
      const decision = app.window.AlmLimitPlus.conditional(got.PET, got.PEESE, alpha);
      method(decision, result, `${c.id}.conditional(${alpha})`);
      if (result.status === 'ok') assert.equal(decision.branch, result.branch);
    }
  });
  // Separate uncertainty assertions keep an optimizer discrepancy from hiding
  // passing point estimates, or vice versa. No iterative tolerance relaxation.
  const selection = c.methods.selection;
  if (selection.status === 'ok') {
    for (const key of ['mu','tau2','delta','logLik','se','ciLo','ciHi']) {
      test(`P12 selection ${c.id}.${key}: metafor at absolute 1e-6`, () => {
        const got = actual(c).methods.selection;
        assert.equal(got.status, 'ok', JSON.stringify(got));
        near(got.values[key], selection.values[key], `${c.id}.selection.${key}`);
      });
    }
  } else {
    test(`P12 selection ${c.id}: R refusal control`, () => {
      method(actual(c).methods.selection, selection, `${c.id}.selection`);
    });
  }
}

test('P12 edge controls: tau2=0, undefined G2, both conditional branches and low-df coverage', () => {
  for (const id of ['k3_tau0','k3_zero']) {
    const c = oracle.cases.find(c => c.id === id);
    assert.equal(c.primary.values.tau2_dl, 0);
    assert.equal(actual(c).result.tau2_dl, 0);
  }
  const zero = oracle.cases.find(c => c.id === 'k3_zero');
  assert.equal(zero.primary.values.G_squared, null);
  assert.equal(actual(zero).result.G_squared, null);
  assert.deepEqual([...new Set(eligible.flatMap(c => c.conditional.map(x => x.result.branch)).filter(Boolean))].sort(), ['PEESE','PET']);
  assert.equal(oracle.cases.find(c => c.id === 'k3_tau0').methods.PET.values.df, 1);
  assert.equal(oracle.cases.find(c => c.id === 'k4_mixed').methods.PET.values.df, 2);
});

for (const c of oracle.binary) {
  test(`P12 Peters ${c.id}: native meta statistic/df/p or documented input refusal`, () => {
    const got = app.window.AlmLimitPlus.peters(c.input);
    if (c.kind === 'zero_cell') {
      assert.equal(got.status, 'refused');
      assert.equal(got.reason, 'positive-arm-cells-required');
      assert.equal(c.reference.status, 'ok', 'R corrected-cell contrast is retained');
      assert.ok(Number.isFinite(c.reference.values.p));
    } else method(got, c.reference, c.id);
  });
}

test('P12 distribution control: chi-square upper tails and two-sided t tails/quantiles versus stats', () => {
  for (const row of oracle.chi_square) near(app.window.AlmLimitPlus.chisqSF(row.x, row.df), row.p, `chi(${row.x},${row.df})`);
  for (const row of oracle.student_t) {
    near(app.window.AlmLimitPlus.tp(row.t, row.df), row.p, `t-tail(${row.t},${row.df})`);
    near(app.window.AlmLimitPlus.tq(.975, row.df), row.critical, `qt(.975,${row.df})`);
  }
});

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `mutation anchor must occur once: ${before}`);
  return source.replace(before, after);
}
test('P12 planted defect: using FE tau in the heterogeneous beta0 limit fails the R oracle', () => {
  const c = oracle.cases.find(c => c.id === 'k3_heterogeneous');
  const mutant = loadLimit({pageTransform: s => replaceOnce(s, 'var tau2 = d.tau2, tau = Math.sqrt(tau2);', 'var tau2 = 0, tau = 0;')});
  near(app.run(c).result.limit_est, c.primary.values.limit_est, 'clean control');
  assert.throws(() => near(mutant.run(c).result.limit_est, c.primary.values.limit_est, 'planted FE tau'), /planted FE tau/);
});
test('P12 planted defect: normal PET CI in place of t(k-2) fails the low-df R oracle', () => {
  const c = oracle.cases.find(c => c.id === 'k3_tau0');
  const mutant = loadLimit({plusTransform: s => replaceOnce(s, 'crit=tq(.975,df)', 'crit=Z')});
  method(actual(c).methods.PET, c.methods.PET, 'clean control');
  const got = mutant.window.AlmLimitPlus.reg(c.te,c.se,1);
  assert.throws(() => values(got.values,c.methods.PET.values,'planted normal CI'), /planted normal CI/);
});
test('P12 planted defect: one-sided PET p fails the R two-sided oracle', () => {
  const c = oracle.cases.find(c => c.id === 'k4_mixed');
  const mutant = loadLimit({plusTransform: s => replaceOnce(s, 'p:tp(t,df),df', 'p:tp(t,df)/2,df')});
  near(actual(c).methods.PET.values.p,c.methods.PET.values.p,'clean control');
  assert.throws(() => near(mutant.window.AlmLimitPlus.reg(c.te,c.se,1).values.p,c.methods.PET.values.p,'planted one-sided p'), /planted one-sided p/);
});
test('P12 planted defect: wrong Peters residual df fails the R oracle', () => {
  const c = oracle.binary.find(c => c.id === 'OR_positive10');
  const mutant = loadLimit({plusTransform: s => replaceOnce(s, 'df:k-2,p:tp(statistic,k-2)', 'df:k-1,p:tp(statistic,k-1)')});
  method(app.window.AlmLimitPlus.peters(c.input),c.reference,'clean control');
  assert.throws(() => method(mutant.window.AlmLimitPlus.peters(c.input),c.reference,'planted Peters df'), /planted Peters df/);
});
test('P12 planted defect: selection SE error below the legacy 1e-4 threshold fails at 1e-6', () => {
  const c = oracle.cases.find(c => c.id === 'k3_heterogeneous');
  const mutant = loadLimit({plusTransform: s => replaceOnce(s, 'delta:f.delta[1],se:f.se', 'delta:f.delta[1],se:f.se+3e-6')});
  near(actual(c).methods.selection.values.se,c.methods.selection.values.se,'clean control');
  const got = mutant.plus(c,mutant.run(c).result).selection;
  assert.equal(got.status, 'ok', JSON.stringify(got));
  assert.throws(() => near(got.values.se,c.methods.selection.values.se,'planted selection SE'), /planted selection SE/);
});
test('P12 comparator controls: missing, null, NaN, truncated arrays and >1e-6 errors fail closed', () => {
  values({x:0,y:[1]}, {x:0,y:[1]}, 'clean');
  for (const bad of [{},{x:null,y:[1]},{x:NaN,y:[1]},{x:0,y:[]},{x:2e-6,y:[1]}]) {
    assert.throws(() => values(bad,{x:0,y:[1]},'planted malformed evidence'), /planted malformed evidence/);
  }
});
