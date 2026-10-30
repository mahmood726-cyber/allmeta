import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { read, loadInfluence, compare, replaceOnce } from './influence-p11-harness.mjs';

const input = JSON.parse(read('hub/shared/tests/r/influence-p11-input.json'));
const reference = JSON.parse(read('hub/shared/tests/r/influence-p11-reference.json'));
const fullKeys = ['k', 'mu', 'seMu', 'tau2', 'ciLo', 'ciHi', 'z', 'p', 'Q', 'df', 'Qp', 'I2', 'H2'];
const looKeys = ['loo_mu', 'loo_seMu', 'loo_ciLo', 'loo_ciHi', 'loo_z', 'loo_p',
  'loo_tau2', 'loo_Q', 'loo_Qp', 'loo_I2', 'loo_H2'];
const diagnosticKeys = ['dfbetas', 'resid', 'dffits', 'cooksD', 'covRatio', 'hat', 'weight', 'influential'];
const refs = new Map(reference.cases.map(c => [c.id, c]));

test('P11 fixture provenance, configuration membership and finite reference schema', () => {
  assert.equal(input.schema, 'influence-p11-input-v1');
  assert.equal(reference.schema, 'influence-p11-reference-v1');
  assert.equal(reference.provenance.method, 'REML');
  assert.equal(reference.provenance.test, 'z');
  assert.equal(reference.provenance.level, 95);
  assert.match(reference.provenance.R, /^R version \d/);
  for (const name of ['metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv']) assert.match(reference.provenance.packages[name], /^\d/);
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits; no jsonlite dependency');
  assert.deepEqual(reference.input, input, 'R used exactly the recorded inputs and exclusions');
  for (const name of ['generator', 'input']) {
    // Hash the exact source/input bytes recorded by the R run.
    const bytes = read(reference.provenance[name]);
    assert.equal(createHash('md5').update(bytes).digest('hex'), reference.provenance[`${name}_md5`]);
  }
  assert.equal(refs.size, reference.cases.length, 'no duplicate reference IDs');
  assert.equal(new Set(input.cases.map(c => c.id)).size, input.cases.length, 'no duplicate input IDs');
  assert.deepEqual([...refs.keys()].sort(), input.cases.map(c => c.id).sort());
  assert.equal(input.cases.length, 7);
  for (const c of input.cases) {
    const r = refs.get(c.id);
    assert.equal(c.yi.length, c.vi.length);
    assert.ok(c.vi.every(v => Number.isFinite(v) && v > 0));
    assert.equal(r.diag.length, c.yi.length);
    assert.equal(r.full.k, c.yi.length);
    assert.deepEqual(r.exclusions.map(x => x.excluded), c.exclusions);
    compare(r.full, r.full, fullKeys, `${c.id}.reference.full`);
    for (const d of r.diag) compare(d, d, [...looKeys, ...diagnosticKeys, 'tau2_del', 'QE_del'], `${c.id}.reference.diag`);
    for (const e of r.exclusions) compare(e.kept, e.kept, fullKeys, `${c.id}.reference.exclusion`);
  }
});

for (const c of input.cases) {
  const r = refs.get(c.id);
  test(`P11 ${c.id}: full REML summary, z CI and tests vs R`, () => {
    compare(loadInfluence().analyze(c).full, r.full, fullKeys, `${c.id}.full`);
  });
  test(`P11 ${c.id}: every LOO summary, CI, heterogeneity and tests vs R`, () => {
    const a = loadInfluence().analyze(c);
    assert.equal(a.diag.length, r.diag.length);
    a.diag.forEach((d, i) => {
      compare(d, r.diag[i], looKeys, `${c.id}.loo[${i}]`);
      // Independently exercise the deletion quantities also returned by influence().
      compare({ tau2_del: d.loo_tau2, QE_del: d.loo_Q }, r.diag[i], ['tau2_del', 'QE_del'], `${c.id}.deletion[${i}]`);
    });
  });
  test(`P11 ${c.id}: DFBETAS and influence diagnostic controls vs R`, () => {
    const a = loadInfluence().analyze(c);
    a.diag.forEach((d, i) => compare(d, r.diag[i], diagnosticKeys, `${c.id}.influence[${i}]`));
  });
  for (const e of r.exclusions) {
    test(`P11 ${c.id}: exclusion [${e.excluded}] refit vs R`, () => {
      const app = loadInfluence();
      app.analyze(c);
      const ex = app.exclude(e.excluded);
      assert.equal(ex.refused, false);
      assert.deepEqual(Array.from(ex.excluded), e.excluded);
      compare(ex.kept, e.kept, fullKeys, `${c.id}.exclusion[${e.excluded}]`);
      compare(ex.full, r.full, fullKeys, `${c.id}.original full`);
      const cleared = app.exclude([]);
      assert.equal(cleared.kept, null);
      assert.equal(cleared.refused, false);
      compare(cleared.full, r.full, fullKeys, `${c.id}.cleared exclusion`);
    });
  }
}

test('P11 tau2=0 controls cover identical effects, Q=0, null z=0 and positive tau2', () => {
  for (const id of ['identical-effects', 'null-symmetric', 'k3-boundary']) {
    const r = refs.get(id), c = input.cases.find(c => c.id === id);
    assert.equal(r.full.tau2, 0);
    const a = loadInfluence().analyze(c);
    assert.equal(a.full.tau2, 0);
    assert.equal(a.full.I2, 0);
    compare(a.full, r.full, fullKeys, `${id}.boundary`);
  }
  assert.equal(refs.get('null-symmetric').full.p, 1);
  assert.ok(refs.get('identical-effects').full.Q < 1e-25);
  assert.ok(refs.get('inf-tiny-control').full.tau2 > 0);
});

test('P11 k=3 yields k=2 LOO fits; k=1/k=2 input and exclusions are refused', () => {
  for (const id of ['k3-positive', 'k3-boundary']) {
    const c = input.cases.find(c => c.id === id), r = refs.get(id), app = loadInfluence();
    const a = app.analyze(c);
    assert.equal(a.full.k, 3);
    a.diag.forEach((d, i) => compare(d, r.diag[i], [...looKeys, ...diagnosticKeys], `${id}.two-study deletion[${i}]`));
    for (const excluded of [[0], [0, 1]]) {
      const ex = app.exclude(excluded);
      assert.equal(ex.refused, true);
      assert.equal(ex.kept, null);
    }
    for (const k of [1, 2]) {
      const refused = app.analyze({ yi: c.yi.slice(0, k), vi: c.vi.slice(0, k) });
      assert.equal(refused.full, null);
      assert.equal(refused.diag, null);
      assert.match(app.error(), /At least 3 studies/);
    }
    compare(app.analyze(c).full, r.full, fullKeys, `${id}.recovery control`);
  }
});

// These deliberate defects alter only source strings inside separate VM contexts.
// The same R assertions must reject each mutant and accept the unmodified control.
const plants = [
  { name: 'one-sided pooled p', path: 'influence/influence-extra.js',
    before: 'p: 2 * pnormUpper(Math.abs(z))', after: 'p: pnormUpper(Math.abs(z))', group: 'full', keys: ['p'] },
  { name: 'rounded CI critical value', path: 'influence/influence-extra.js',
    before: 'var Z975 = 1.959963984540054;', after: 'var Z975 = 1.96;', group: 'full', keys: ['ciLo', 'ciHi'] },
  { name: 'LOO reuses full-model heterogeneity', path: 'influence/index.html',
    before: 'loo_tau2: loo.tau2', after: 'loo_tau2: full.tau2', group: 'diag', keys: ['loo_tau2'] },
  { name: 'DFBETAS uses full tau2', path: 'influence/index.html',
    before: '1 / (x.se * x.se + loo.tau2)', after: '1 / (x.se * x.se + full.tau2)', group: 'diag', keys: ['dfbetas'] },
  { name: 'exclusion retains all studies', path: 'influence/index.html',
    before: 'const p = pool(keepRows);', after: 'const p = pool(_lastStudies);', group: 'exclusion', keys: ['mu', 'tau2'] },
  { name: 'zero tau2 spuriously positive', path: 'influence/index.html',
    before: 'const tau2 = tau2_REML(rows);', after: 'const tau2 = Math.max(0.001, tau2_REML(rows));',
    id: 'identical-effects', group: 'full', keys: ['tau2', 'I2'] },
  { name: 'two-study deletion forced to FE', path: 'influence/index.html',
    before: 'const tau2 = tau2_REML(rows);', after: 'const tau2 = rows.length === 2 ? 0 : tau2_REML(rows);',
    id: 'k3-positive', group: 'diag', keys: ['loo_tau2'] },
];
for (const plant of plants) {
  test(`P11 planted defect: ${plant.name} is detected; original control passes`, () => {
    const c = input.cases.find(c => c.id === (plant.id || 'inf-tiny-control')), r = refs.get(c.id);
    function check(app) {
      const a = app.analyze(c);
      if (plant.group === 'full') compare(a.full, r.full, plant.keys, plant.name);
      else if (plant.group === 'diag') a.diag.forEach((d, i) => compare(d, r.diag[i], plant.keys, `${plant.name}[${i}]`));
      else compare(app.exclude(r.exclusions[0].excluded).kept, r.exclusions[0].kept, plant.keys, plant.name);
    }
    check(loadInfluence());
    const mutated = loadInfluence((path, source) => path === plant.path ? replaceOnce(source, plant.before, plant.after) : source);
    assert.throws(() => check(mutated), { code: 'ERR_ASSERTION', message: /R parity/ });
  });
}
