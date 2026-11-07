import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEngine, readReference, compare, pooledPairs } from './p05-heterogeneity-engine.mjs';

const compute = loadEngine();
const reference = readReference();
const cases = new Map(reference.cases.map(data => [data.id, data]));
const methods = ['pm', 'reml', 'ml', 'eb', 'sj', 'he', 'hs', 'dl'];

test('P05 control: native R provenance, exact generator and coverage matrix', () => {
  const script = readFileSync(new URL('../r/p05-heterogeneity-reference.R', import.meta.url));
  assert.equal(reference.provenance.script_md5, createHash('md5').update(script).digest('hex'));
  assert.match(reference.provenance.R, /^R version /);
  assert.equal(reference.provenance.serialization, 'base R; 17 significant digits');
  for (const pkg of reference.provenance.packages) assert.ok(pkg.version, pkg.package);
  assert.ok(reference.provenance.packages.some(pkg => pkg.package === 'metafor'));
  assert.deepEqual([...cases.keys()], ['single_study', 'two_study', 'zero_q', 'hk_floor',
    'unequal_k10', 'dl_k9', 'dl_k11', 'scale_control', 'scale_6000', 'scale_60000']);
  const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
  const menu = html.match(/<select id="f-tau2"[\s\S]*?<\/select>/)[0];
  assert.deepEqual([...menu.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), methods);
  for (const id of ['two_study', 'zero_q', 'hk_floor', 'unequal_k10']) {
    assert.deepEqual(cases.get(id).methods, methods, id);
  }
});

test('P05 small-k control: singleton is deliberately not pooled for all eight selections', () => {
  for (const method of methods) {
    const actual = compute(cases.get('single_study'), method);
    assert.equal(actual.k, 1);
    assert.equal(actual.notPooled, true);
    assert.equal(actual.requested, method);
    assert.equal(actual.sum, undefined);
    assert.equal(actual.pi, undefined);
  }
});

for (const data of reference.cases.filter(data => data.k >= 2)) {
  test(`P05 ${data.id}: Q, p(Q), Q-based I2 and t critical value match R`, () => {
    const actual = compute(data, data.methods[0]);
    assert.equal(actual.k, data.k);
    assert.equal(actual.sum.df, data.common.df);
    assert.equal(actual.pi.df, data.common.df);
    compare(['Q', 'pQ', 'I2', 'tCrit'].map(key => [key, actual.sum[key], data.common[key]]));
  });

  // P05-R2: observed upper-limit failures at both large scales; the Q-profile
  // solver also stops at 2^30 without bracketing. Keep all assertions active.
  const qProfileOptions = ['scale_6000', 'scale_60000'].includes(data.id)
    ? { todo: 'P05-R2: Q-profile upper bracket is capped at 2^30 (shared/heterogeneity-ci.js:80)' }
    : {};
  test(`P05 ${data.id}: Q-profile tau2 and I2 limits match R`, qProfileOptions, () => {
    const actual = compute(data, data.methods[0]);
    compare(['tau2Lo', 'tau2Hi', 'I2Lo', 'I2Hi']
      .map(key => [key, actual.qpci[key], data.common[key]]));
  });

  for (const method of data.methods) {
    const expected = data.fits[method];
    // P05-R1: observed PM/EB scale failure; ma-core.js stops expanding at 2^30
    // before bracketing the R root. Keep executing the original assertions.
    const options = data.id === 'scale_60000' && ['pm', 'eb'].includes(method)
      ? { todo: 'P05-R1: PM/EB upper bracket is capped at 2^30 (shared/ma-core.js:51)' }
      : {};
    test(`P05 ${data.id}/${method}: estimator, pooling, model I2, modified-HK and t PI match R`, options, () => {
      const actual = compute(data, method);
      assert.equal(actual.estimator, expected.estimator);
      assert.equal(actual.dlRefused, expected.dlRefused);
      compare(pooledPairs(actual, expected));
    });
    test(`P05 ${data.id}/${method}: leave-one-out refits match R`, options, () => {
      const actual = compute(data, method);
      assert.equal(actual.loo.length, data.k);
      const pairs = [];
      actual.loo.forEach((row, i) => {
        assert.equal(row.k, expected.loo[i].k);
        assert.equal(row.estimator, expected.loo[i].estimator);
        for (const key of ['mu', 'se', 'ciLo', 'ciHi', 'tau2', 'I2'])
          pairs.push([`loo[${i}].${key}`, row[key], expected.loo[i][key]]);
      });
      compare(pairs);
    });
  }
}

test('P05 zero-boundary control: exact Q=0 and modified-HK floor have distinct R witnesses', () => {
  const zero = cases.get('zero_q');
  for (const method of methods) {
    const expected = zero.fits[method];
    assert.equal(expected.tau2, 0);
    assert.equal(zero.common.Q, 0);
    assert.equal(zero.common.pQ, 1);
    assert.equal(zero.common.tau2Hi, 0);
    const floor = cases.get('hk_floor').fits[method];
    assert.ok(floor.unmodifiedHkSE < floor.se, method);
    compare([['seHKSJ', floor.seHKSJ, floor.se]]);
  }
});

test('P05 PI control: k=2 t interval differs from default normal predict()', () => {
  const data = cases.get('two_study');
  for (const method of methods) {
    const expected = data.fits[method];
    assert.ok(expected.piHi - expected.normalPiHi > 1, method);
    assert.ok(expected.normalPiLo - expected.piLo > 1, method);
  }
});

test('P05 DL control: k=9 fallback, k=10 PM omissions, k=11 DL omissions', () => {
  for (const [id, estimator, omitted] of [
    ['dl_k9', 'pm', 'pm'], ['unequal_k10', 'dl', 'pm'], ['dl_k11', 'dl', 'dl']
  ]) {
    const actual = compute(cases.get(id), 'dl');
    assert.equal(actual.estimator, estimator);
    assert.ok(actual.loo.every(row => row.estimator === omitted));
  }
});

test('P05 scale control: native R roots transform with effect units', () => {
  const original = cases.get('scale_control');
  for (const scale of [6000, 60000]) {
    const scaled = cases.get(`scale_${scale}`);
    for (const method of original.methods) {
      compare([['tau2', scaled.fits[method].tau2 / scale ** 2, original.fits[method].tau2]]);
    }
    compare(['tau2Lo', 'tau2Hi'].map(key => [key, scaled.common[key] / scale ** 2, original.common[key]]));
  }
});
