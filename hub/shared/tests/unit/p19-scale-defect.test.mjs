import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Execute the page's parser and estimator, without a browser or a copied engine.
const html = readFileSync(new URL('../../../../component-nma/index.html', import.meta.url), 'utf8');
const start = html.indexOf('    // Parse:');
const end = html.indexOf('    // Floating-point roundoff');
assert.ok(start >= 0 && end > start, 'page estimator extraction markers');
const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const parse = text => context.parse(text);
const fit = rows => context.fit(rows);
const scales = [0.001, 1, 100000, 1000000, 2000000];
const tolerance = 1e-10;
const frozen = JSON.parse(readFileSync(new URL('../../../../component-nma/tests/fixtures/cnma-validation-oracle.json', import.meta.url), 'utf8'));
let recorded;
function reference() {
  return recorded ??= JSON.parse(readFileSync(new URL('./p19-scale-reference.json', import.meta.url), 'utf8'));
}
function near(actual, expected, label, tol = tolerance) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
  `${label}: actual=${actual}, expected=${expected}`);
}
function scaled(rows, scale) {
  return rows.map(row => ({ ...row, te: row.te * scale, se: row.se * scale }));
}
function pairwiseValues(f) {
  return { tau2: f.tau2, beta: f.beta[0], variance: f.cov[0][0],
    se: Math.sqrt(f.cov[0][0]), Q: f.Q, df: f.df };
}
function comparePairwise(actual, expected, actualScale, expectedScale = actualScale) {
  // Compare in original units so large effects cannot inflate absolute tolerance.
  const powers = { tau2: 2, beta: 1, variance: 2, se: 1, Q: 0, df: 0 };
  const differences = [];
  for (const [key, power] of Object.entries(powers)) {
    const a = actual[key] / actualScale ** power;
    const e = expected[key] / expectedScale ** power;
    if (!Number.isFinite(a) || !Number.isFinite(e) ||
        Math.abs(a - e) > tolerance * Math.max(1, Math.abs(e))) {
      differences.push(`${key}: actual=${actual[key]}, expected=${expected[key]}`);
    }
  }
  assert.deepEqual(differences, [], 'DL estimates, uncertainty and heterogeneity must agree');
}
function pairwiseCase(kind, scale) {
  const ref = reference().fits.find(f => f.kind === kind && f.scale === scale);
  assert.ok(ref, `${kind} reference at ${scale}`);
  const text = ref.effects.map((y, i) => `a | control | ${y} | ${ref.se[i]}`).join('\n');
  return { ref, actual: pairwiseValues(fit(parse(text))) };
}

test('P19-R1 control: native R fixture records exact inputs, method and versions', () => {
  const ref = reference();
  assert.deepEqual(ref.input, { scales, se: [2, 4], heterogeneous: [0, 8], homogeneous: [1, 1] });
  assert.equal(ref.provenance.script, 'p19-scale-reference.R');
  assert.equal(ref.provenance.script_md5, createHash('md5').update(readFileSync(new URL('./p19-scale-reference.R', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'));
  assert.match(ref.provenance.R, /^R version /);
  assert.equal(ref.provenance.method, 'metafor::rma.uni(yi = effects, sei = se, method = "DL", test = "z")');
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
  assert.deepEqual(ref.provenance.packages.map(p => p.package), ['metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv']);
  for (const p of ref.provenance.packages) assert.ok(p.version, p.package);
  assert.equal(ref.fits.length, 10);
  for (const kind of ['heterogeneous', 'homogeneous']) {
    assert.deepEqual(ref.fits.filter(f => f.kind === kind).map(f => f.scale), scales);
  }
  for (const f of ref.fits) {
    assert.deepEqual(f.effects, ref.input[f.kind].map(y => y * f.scale));
    assert.deepEqual(f.se, ref.input.se.map(se => se * f.scale));
  }
});

test('P19-R1 control: native metafor reference obeys effect-unit scaling', () => {
  for (const kind of ['heterogeneous', 'homogeneous']) {
    const base = reference().fits.find(f => f.kind === kind && f.scale === 1);
    for (const f of reference().fits.filter(f => f.kind === kind)) {
      comparePairwise(f.values, base.values, f.scale, 1);
    }
  }
});

test('P19-R1 control: ordinary, small and pre-cutoff pairwise units match metafor', () => {
  for (const scale of [0.001, 1, 100000]) {
    const { actual, ref } = pairwiseCase('heterogeneous', scale);
    assert.ok(ref.values.tau2 > 0);
    comparePairwise(actual, ref.values, scale);
  }
});

for (const scale of [1000000, 2000000]) {
  test(`P19-R1 plant: pairwise scale ${scale} retains DL heterogeneity and matches metafor`, () => {
    const { actual, ref } = pairwiseCase('heterogeneous', scale);
    assert.ok(ref.values.tau2 > 0);
    comparePairwise(actual, ref.values, scale);
  });
}

test('P19-R1 plant: multicomponent effects and full covariance obey effect-unit scaling', () => {
  // A metamorphic check, not a metafor oracle for a design without an intercept.
  const rows = parse('a | control | -2 | 1\nb | control | 1 | 2\na+b | control | 3 | 3\na | b | 2 | 1.5\nb | control | -0.5 | 2.5');
  const base = fit(rows);
  assert.ok(base.tau2 > 0);
  for (const scale of scales) {
    const f = fit(scaled(rows, scale));
    assert.deepEqual(Array.from(f.comps), Array.from(base.comps));
    assert.equal(f.df, base.df);
    near(f.Q, base.Q, `Q at ${scale}`);
    near(f.tau2 / scale ** 2, base.tau2, `tau2 at ${scale}`);
    for (let i = 0; i < base.beta.length; i++) {
      near(f.beta[i] / scale, base.beta[i], `beta[${i}] at ${scale}`);
      for (let j = 0; j < base.beta.length; j++) {
        near(f.cov[i][j] / scale ** 2, base.cov[i][j], `cov[${i}][${j}] at ${scale}`);
      }
    }
  }
});

test('P19-R1 control: homogeneous effects retain zero heterogeneity at all five scales', () => {
  for (const scale of scales) {
    const { actual, ref } = pairwiseCase('homogeneous', scale);
    assert.equal(actual.tau2, 0);
    assert.equal(ref.values.tau2, 0);
    comparePairwise(actual, ref.values, scale);
  }
});

for (const [name, ref] of Object.entries(frozen.cases)) {
  test(`P19-R1 control: frozen P19 reference ${name}`, () => {
    if (ref.status === 'refused') {
      assert.throws(() => fit(parse(ref.text)), error => error.message === ref.reason);
      return;
    }
    const rows = parse(ref.text);
    const f = fit(rows);
    assert.equal(rows.length, ref.k);
    assert.equal(f.df, ref.df);
    near(f.Q, ref.Q, 'Q');
    if (ref.tau2 === null) assert.equal(f.tau2, null);
    else near(f.tau2, ref.tau2, 'tau2');
    assert.deepEqual(Array.from(f.comps), Object.keys(ref.components).sort());
    for (const [component, values] of Object.entries(ref.components)) {
      const i = f.comps.indexOf(component);
      near(f.beta[i], values.est, `${component} effect`);
      near(Math.sqrt(f.cov[i][i]), values.se, `${component} SE`);
    }
    for (const [name, values] of Object.entries(ref.combinations)) {
      const indices = name.split('+').map(c => f.comps.indexOf(c));
      const est = indices.reduce((sum, i) => sum + f.beta[i], 0);
      const variance = indices.reduce((sum, i) => sum + indices.reduce((s, j) => s + f.cov[i][j], 0), 0);
      near(est, values.est, `${name} combined effect`);
      near(Math.sqrt(variance), values.se, `${name} combined SE`);
    }
  });
}

test('P19-R1 control: independent netmeta cnma-tiny oracle retains existing tolerance', () => {
  const root = new URL('../../../../component-nma/tests/fixtures/', import.meta.url);
  const ref = JSON.parse(readFileSync(new URL('cnma-oracle.json', root), 'utf8'));
  const text = readFileSync(new URL('cnma-tiny.csv', root), 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
    const [, a, b, effect, se] = line.split(',');
    return `${a} | ${b} | ${effect} | ${se}`;
  }).join('\n');
  const f = fit(parse(text));
  // The existing browser parity test compares these eight-decimal references at 1e-4.
  near(f.Q, ref.Q_additive, 'Q', 1e-4);
  near(f.tau2, ref.tau2, 'tau2', 1e-4);
  assert.equal(f.df, ref.df_additive);
  for (const [name, values] of Object.entries(ref.components)) {
    const i = f.comps.indexOf(name);
    assert.ok(i >= 0, name);
    near(f.beta[i], values.est, `${name} effect`, 1e-4);
    near(Math.sqrt(f.cov[i][i]), values.se, `${name} SE`, 1e-4);
  }
});
