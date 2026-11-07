import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, heterogeneous, homogeneous } from '../helpers/p09-proportion-harness.mjs';

// The old checkout is not supplied. Remove only the FE PI guard in memory and
// prove that the requirement assertions reject that defect while controls hold.
for (const trans of ['logit', 'ft', 'raw']) {
  test(`P09-D4 injected guard defect: ${trans} FE export and snapshot assertions reject PIs`, () => {
    const current = createApp();
    const planted = createApp({ plantHistoricalFEPI: true });
    // Exercise the same PM -> FE transition as the existing regression test.
    current.run(trans, 'PM');
    planted.run(trans, 'PM');
    const fixed = current.run(trans, 'FE');
    const defect = planted.run(trans, 'FE');
    for (const target of ['exported', 'snapshot']) {
      const fields = target === 'exported' ? ['poolPiLo', 'poolPiHi']
        : ['piLo', 'piHi', 'poolPiLo', 'poolPiHi'];
      const good = target === 'exported' ? fixed.exported : fixed.snapshot.values;
      const bad = target === 'exported' ? defect.exported : defect.snapshot.values;
      for (const field of fields) {
        assert.ok(Number.isFinite(bad[field]), 'injected PI exists: ' + field);
        assert.throws(() => assert.equal(bad[field], null), assert.AssertionError);
        assert.equal(good[field], null, 'current ' + field);
      }
    }
  });

  test(`P09-D4 injected guard defect: ${trans} FE rendered assertion rejects PI text`, () => {
    const defect = createApp({ plantHistoricalFEPI: true }).run(trans, 'FE');
    assert.match(defect.heterogeneity, /95% prediction interval/);
    assert.throws(() => assert.doesNotMatch(defect.heterogeneity, /prediction interval/i),
      assert.AssertionError);
    assert.doesNotMatch(createApp().run(trans, 'FE').heterogeneity, /prediction interval/i);
  });

  test(`P09-D4 injected guard control: ${trans} FE pooled values, CI, table and forest agree`, () => {
    const current = createApp().run(trans, 'FE');
    const planted = createApp({ plantHistoricalFEPI: true }).run(trans, 'FE');
    for (const field of ['mu_re', 'seRE', 'tau2', 'Q', 'df', 'i2', 'k', 'lo', 'hi',
      'poolP', 'poolLo', 'poolHi']) {
      assert.equal(current.snapshot.values[field], planted.snapshot.values[field], field);
    }
    assert.deepEqual(current.snapshot.yi, planted.snapshot.yi);
    assert.deepEqual(current.snapshot.vi, planted.snapshot.vi);
    assert.equal(current.table, planted.table);
    assert.equal(current.forest, planted.forest);
  });

  for (const method of ['DL', 'PM']) {
    test(`P09-D4 injected guard control: ${trans} ${method} agrees for positive and zero tau2`, () => {
      const current = createApp();
      const planted = createApp({ plantHistoricalFEPI: true });
      for (const src of [heterogeneous, homogeneous]) {
        assert.deepEqual(current.run(trans, method, src), planted.run(trans, method, src));
      }
    });
  }

  test(`P09-D4 injected guard control: ${trans} all estimators agree at k=2`, () => {
    const current = createApp();
    const planted = createApp({ plantHistoricalFEPI: true });
    const src = heterogeneous.split('\n').slice(0, 2).join('\n');
    for (const method of ['FE', 'DL', 'PM']) {
      assert.deepEqual(current.run(trans, method, src), planted.run(trans, method, src));
    }
  });
}
