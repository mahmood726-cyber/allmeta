import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { input, inputBytes, scriptURL, fixtureURL, reference, originalReference,
  supplement, supplementScriptURL, resolveReference, app, load, source, plusSource,
  parsed, multivariate, univariate, compare, differences, groups, refFor, replaceOnce } from './p18-parity-support.mjs';

// Only comparisons observed failing in the pass-2 TAP are TODO. Their bodies,
// oracle values and absolute 1e-6 tolerance stay intact, per CXTASK item 3.
// Findings and every observed scalar difference are recorded in findings.json.
// This list is deliberately static: new failures must fail the gate.
const observedDiscrepancies = {
  'two-positive': { finding: 'P18-05', groups: ['covariance'] },
  'two-negative': { finding: 'P18-05', groups: ['estimates', 'covariance', 'intervals', 'variance ratios'] },
  berkey: { finding: 'P18-06', groups: ['estimates', 'covariance', 'statistics', 'intervals', 'correlation', 'variance ratios'] },
  'berkey-reflected': { finding: 'P18-06', groups: ['estimates', 'covariance', 'statistics', 'intervals', 'correlation', 'variance ratios'] },
  'craft-boundary': { finding: 'P18-07', groups: ['estimates', 'covariance', 'likelihood', 'statistics', 'intervals', 'correlation', 'variance ratios'] },
  'sweep -0.99': { finding: 'P18-08', groups: ['estimates', 'covariance', 'statistics', 'intervals'] },
  'sweep -0.95': { finding: 'P18-08', groups: ['estimates', 'covariance', 'statistics', 'intervals'] },
  'sweep 0': { finding: 'P18-08', groups: ['estimates', 'covariance', 'statistics', 'intervals', 'correlation'] },
  'sweep 0.99': { finding: 'P18-08', groups: ['estimates', 'covariance', 'statistics', 'intervals', 'correlation'] },
  'craft-rho-minus03': { finding: 'P18-07', groups: ['estimates', 'covariance', 'likelihood', 'statistics', 'intervals', 'correlation'] }
};
function parityOptions(id, group) {
  const observed = observedDiscrepancies[id];
  return observed?.groups.includes(group)
    ? { todo: `${observed.finding}: observed ${id} ${group} difference exceeds absolute 1e-6; original assertion retained` } : {};
}

test('P18 provenance: native R versions, exact inputs and generator hashes', () => {
  assert.equal(reference.schema, 'p18-rpar-reference-v1');
  assert.equal(reference.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.equal(reference.provenance.script_md5, createHash('md5').update(readFileSync(scriptURL)).digest('hex'));
  assert.deepEqual(reference.input, input);
  assert.deepEqual(reference.cases.map(c => c.id), input.cases.map(c => c.id));
  assert.deepEqual(reference.sweep.map(s => s.rhoW), input.sweep.grid);
  assert.ok(reference.provenance.R.startsWith('R version'));
  assert.ok(reference.provenance.metafor);
  for (const pkg of reference.provenance.packages) assert.ok(pkg.version, pkg.package);
  assert.equal(reference.provenance.adjudication, 'none');
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
});

test('P18 supplementary R provenance: original successful values are never replaced', () => {
  assert.equal(supplement.schema, 'p18-rpar-bfgs-v1');
  const md5 = bytes => createHash('md5').update(bytes).digest('hex');
  assert.equal(supplement.provenance.input_md5, md5(inputBytes));
  assert.equal(supplement.provenance.script_md5, md5(readFileSync(supplementScriptURL)));
  assert.equal(supplement.provenance.original_md5, md5(readFileSync(fixtureURL)));
  assert.ok(supplement.provenance.R.startsWith('R version'));
  assert.ok(supplement.provenance.metafor);
  assert.equal(supplement.provenance.adjudication, 'none');
  assert.deepEqual(supplement.cases.map(c => c.id), input.cases.map(c => c.id));
  assert.deepEqual(supplement.sweep.map(s => s.rhoW), input.sweep.grid);
  for (const c of originalReference.cases) if (c.multivariate.status === 'ok')
    assert.strictEqual(refFor(c.id).multivariate, c.multivariate);
  for (let i = 0; i < originalReference.sweep.length; i++) if (originalReference.sweep[i].multivariate.status === 'ok')
    assert.strictEqual(reference.sweep[i].multivariate, originalReference.sweep[i].multivariate);
  // Planted reference replacement cannot change the chosen successful baseline.
  const original = { status: 'ok', mu: [1, 2] }, other = { status: 'ok', mu: [3, 4] };
  assert.strictEqual(resolveReference(original, other), original);
  assert.strictEqual(resolveReference({ status: 'error' }, other), other);
});

for (const c of input.cases) {
  const ref = refFor(c.id);
  if (c.id === 'one-study') {
    test('P18 k1: app and metafor refuse an unidentified bivariate REML fit',
      { todo: 'P18-02: first R run instead returns a warned fit with G=0; retain failed assumption' }, () => {
      assert.equal(ref.multivariate.status, 'error');
      assert.match(ref.multivariate.message, /parameters|observations|degrees of freedom|k = 1/i);
      assert.throws(() => app.engine.fit(c.studies), /k>=2/);
      assert.equal(app.plus.compute(parsed(c.studies)).status, 'refused');
    });
    test('P18 k1 control: app refuses; R explicitly fixes unidentified variances to zero', () => {
      assert.equal(ref.multivariate.status, 'ok');
      assert.deepEqual(ref.multivariate.G, [[0, 0], [0, 0]]);
      assert.match(ref.multivariate.warnings.join('\n'), /k=1.*fixed to 0/);
      assert.throws(() => app.engine.fit(c.studies), /k>=2/);
      assert.equal(app.plus.compute(parsed(c.studies)).status, 'refused');
    });
    continue;
  }
  // Run the public computation path, including its separate univariate REML fits.
  const result = app.plus.compute(parsed(c.studies));
  const fit = result.status === 'ok' ? multivariate(result.fit) : result;
  test(`P18 ${c.id}: fit and sample-size control`, () => {
    assert.equal(ref.multivariate.status, 'ok', ref.multivariate.message);
    assert.equal(result.status, 'ok', result.reason);
    assert.equal(fit.k, c.studies.length);
    assert.equal(fit.m, 2);
  });
  for (const [name, keys] of Object.entries(groups)) {
    test(`P18 ${c.id}: R ${name} at 1e-6`, parityOptions(c.id, name), () => compare(fit, ref.multivariate, keys, c.id));
  }
  // At a zero variance, R's raw rho is an arbitrary optimizer coordinate, not an
  // identified correlation. Keep it in the fixture but do not claim rho parity there.
  if (c.compareRho) test(`P18 ${c.id}: R correlation at 1e-6`, parityOptions(c.id, 'correlation'), () => compare(fit, ref.multivariate, ['rho'], c.id));
  for (let j = 0; j < 2; j++) {
    test(`P18 ${c.id}: univariate outcome ${j} and Wald CI at 1e-6`, () => {
      const u = result.univariate[j], r = ref.univariate[j];
      assert.equal(r.status, 'ok', r.message);
      assert.equal(u.status, 'ok', u.reason);
      assert.equal(u.k, c.studies.length);
      compare(univariate(u), r, ['mu', 'se', 'tau2', 'logLik', 'z', 'p', 'ciLo', 'ciHi'], `${c.id}.univariate${j}`);
    });
  }
  test(`P18 ${c.id}: variance ratios use the same R study rows`, parityOptions(c.id, 'variance ratios'), () => {
    const expected = ref.univariate.map((u, j) => ref.multivariate.muSE[j] ** 2 / u.se ** 2);
    assert.deepEqual(differences(result.varRatio, expected, 'varRatio'), []);
  });
}

test('P18 zero-input control: zero effects/covariances remain valid, both tau2 are zero and rho is undefined', () => {
  for (const id of ['two-zero', 'zero-heterogeneity']) {
    const c = input.cases.find(c => c.id === id), f = app.engine.fit(c.studies);
    assert.deepEqual(JSON.parse(JSON.stringify(f.G)), [[0, 0], [0, 0]]);
    assert.equal(f.rho, null);
    for (let j = 0; j < 2; j++) assert.equal(app.engine.zTest(f.mu[j], f.muSE[j]).p, 1);
  }
});

const sweepCase = input.cases.find(c => c.id === input.sweep.caseId);
const sweep = app.plus.sweep(parsed(sweepCase.studies), input.sweep.grid);
for (let i = 0; i < input.sweep.grid.length; i++) {
  const rw = input.sweep.grid[i], ref = reference.sweep[i].multivariate;
  for (const [name, keys] of Object.entries({ ...groups, correlation: ['rho'] })) {
    const options = rw === 0.95 && name === 'statistics'
      ? { todo: 'P18-03: observed z differences 2.3819128109892063e-6 and 1.6040802766070783e-6; original oracle retained' }
      : parityOptions(`sweep ${rw}`, name);
    test(`P18 sweep ${rw}: R ${name} at 1e-6`, options, () => {
      assert.equal(ref.status, 'ok', ref.message);
      assert.equal(sweep[i].status, 'ok', sweep[i].reason);
      compare(multivariate(sweep[i].fit), ref, keys, `rhoW=${rw}`);
    });
  }
}
test('P18 sweep control: singular correlations are refused and zero remains valid', () => {
  const results = app.plus.sweep(parsed(sweepCase.studies), [-1, 0, 1]);
  assert.deepEqual(Array.from(results, r => r.status), ['refused', 'ok', 'refused']);
});

test('P18 Wald CI control: panel multiplier and formatted endpoints agree with R', () => {
  assert.deepEqual(differences(app.plus.Z, reference.normal975, 'qnorm(.975)'), []);
  const c = input.cases.find(c => c.id === 'berkey'), f = app.engine.fit(c.studies), r = refFor(c.id).multivariate;
  for (let j = 0; j < 2; j++) {
    assert.equal(app.plus.fmt.ci(f.mu[j], f.muSE[j]), `${r.mu[j].toFixed(3)} [${r.ciLo[j].toFixed(3)}, ${r.ciHi[j].toFixed(3)}]`);
  }
});

for (const extra of supplement.additional) {
  const c = extra.input, result = app.plus.compute(parsed(c.studies));
  test(`P18 ${c.id}: direct R reference and input control`, () => {
    const sourceCase = input.cases.find(x => x.id === 'craft-boundary');
    assert.equal(c.rhoW, -0.3);
    assert.equal(c.studies.length, sourceCase.studies.length);
    for (let i = 0; i < c.studies.length; i++) {
      assert.deepEqual(c.studies[i].y, sourceCase.studies[i].y);
      for (let j = 0; j < 2; j++) assert.equal(c.studies[i].S[j][j], sourceCase.studies[i].S[j][j]);
      const cov = c.rhoW * Math.sqrt(c.studies[i].S[0][0] * c.studies[i].S[1][1]);
      assert.deepEqual(differences([c.studies[i].S[0][1], c.studies[i].S[1][0]], [cov, cov]), []);
    }
    assert.equal(extra.multivariate.status, 'ok', extra.multivariate.message);
    assert.equal(result.status, 'ok', result.reason);
  });
  for (const [name, keys] of Object.entries({ ...groups, correlation: ['rho'] })) {
    test(`P18 ${c.id}: R ${name} at 1e-6`, parityOptions(c.id, name), () => {
      assert.equal(extra.multivariate.status, 'ok', extra.multivariate.message);
      assert.equal(result.status, 'ok', result.reason);
      compare(multivariate(result.fit), extra.multivariate, keys, c.id);
    });
  }
}

// Planted source defects run only in isolated VM contexts; the production files
// and reference bytes stay untouched. Each uses the same oracle check as its control.
test('P18 planted defect: rounded 1.96 CI multiplier is caught; original passes', () => {
  const c = input.cases.find(c => c.id === 'two-positive'), ref = refFor(c.id).multivariate;
  const check = api => compare(multivariate(api.engine.fit(c.studies), api), ref, ['ciLo', 'ciHi'], 'CI mutation');
  check(app);
  const mutant = load(source, replaceOnce(plusSource, 'var Z = 1.959963984540054;', 'var Z = 1.96;'));
  assert.throws(() => check(mutant), assert.AssertionError);
});
test('P18 planted defect: one-sided p values are caught; original passes', () => {
  const c = input.cases.find(c => c.id === 'two-positive'), ref = refFor(c.id).multivariate;
  const check = api => compare(multivariate(api.engine.fit(c.studies), api), ref, ['p'], 'p mutation');
  check(app);
  const mutant = load(replaceOnce(source, 'p: chisqSF(z * z, 1)', 'p: chisqSF(z * z, 1) / 2'));
  assert.throws(() => check(mutant), assert.AssertionError);
});
test('P18 planted defect: omitted REML normalization is caught; original passes', () => {
  const c = input.cases.find(c => c.id === 'berkey'), ref = refFor(c.id).multivariate;
  const check = api => compare(api.engine.fit(c.studies), ref, ['logLik'], 'logLik mutation');
  check(app);
  const mutant = load(replaceOnce(source, '+ 0.5 * m * Math.log(k);', '+ 0;'));
  assert.throws(() => check(mutant), assert.AssertionError);
});
test('P18 planted defect: ignored within-study correlation is caught; original passes',
  { todo: 'P18-09: original control already fails on rhoW=0.99 muSE and G; assertion retained' }, () => {
  const ref = reference.sweep.find(s => s.rhoW === 0.99).multivariate;
  const check = api => {
    const s = api.plus.sweep(parsed(sweepCase.studies), [0.99])[0];
    assert.equal(s.status, 'ok');
    compare(s.fit, ref, ['mu', 'muSE', 'G'], 'covariance mutation');
  };
  check(app);
  const mutant = load(replaceOnce(source, 'return r * Math.sqrt(v1 * v2);', 'return 0;'));
  assert.throws(() => check(mutant), assert.AssertionError);
});

// The original parameter-based mutation test above is retained as TODO. This
// additional check uses a distinct output whose unmodified control passed in
// pass 2; it does not replace or relax the parameter comparisons.
test('P18 planted defect control: ignored within-study correlation changes R likelihood', () => {
  const ref = reference.sweep.find(s => s.rhoW === 0.99).multivariate;
  const check = api => {
    const s = api.plus.sweep(parsed(sweepCase.studies), [0.99])[0];
    assert.equal(s.status, 'ok');
    compare(s.fit, ref, ['logLik'], 'covariance likelihood mutation');
  };
  check(app);
  const mutant = load(replaceOnce(source, 'return r * Math.sqrt(v1 * v2);', 'return 0;'));
  assert.throws(() => check(mutant), assert.AssertionError);
});
