import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, heterogeneous, homogeneous } from '../helpers/p09-proportion-harness.mjs';

function assertNoPI(result) {
  for (const field of ['poolPiLo', 'poolPiHi']) {
    assert.equal(result.exported[field], null, 'export ' + field);
  }
  for (const field of ['piLo', 'piHi', 'poolPiLo', 'poolPiHi']) {
    assert.equal(result.snapshot.values[field], null, 'snapshot ' + field);
  }
  assert.doesNotMatch(result.heterogeneity, /prediction interval/i);
}

function assertPI(result) {
  const r = result.exported;
  for (const field of ['poolPiLo', 'poolPiHi']) assert.ok(Number.isFinite(r[field]), field);
  assert.ok(r.poolPiLo <= r.poolP && r.poolP <= r.poolPiHi);
  assert.ok(r.poolPiLo <= r.poolLo && r.poolHi <= r.poolPiHi);
  assert.ok(r.poolPiLo >= 0 && r.poolPiHi <= 1);
  assert.match(result.heterogeneity, /95% prediction interval/);
}

for (const trans of ['logit', 'ft', 'raw']) {
  test(`P09-D4 plant: ${trans} FE exports no PI after switching from PM`, () => {
    const app = createApp();
    assertPI(app.run(trans, 'PM'));
    const fe = app.run(trans, 'FE');
    assert.equal(fe.exported.tau2, 0);
    assertNoPI(fe);
    assertPI(app.run(trans, 'PM'));
  });

  test(`P09-D4 plant: ${trans} FE renders no prediction interval`, () => {
    const result = createApp().run(trans, 'FE');
    assert.doesNotMatch(result.heterogeneity, /prediction interval/i);
  });

  test(`P09-D4 control: ${trans} FE retains pooled estimate, CI, and forest diamond`, () => {
    const result = createApp().run(trans, 'FE');
    const r = result.exported;
    const { yi, vi } = result.snapshot;
    const sw = vi.reduce((s, v) => s + 1 / v, 0);
    const mu = yi.reduce((s, y, i) => s + y / vi[i], 0) / sw;
    assert.ok(Math.abs(r.mu_re - mu) < 1e-12);
    assert.ok(Math.abs(r.seRE - Math.sqrt(1 / sw)) < 1e-12);
    assert.ok(r.poolLo < r.poolP && r.poolP < r.poolHi);
    for (const field of ['poolP', 'poolLo', 'poolHi']) {
      assert.ok(result.table.includes((100 * r[field]).toFixed(1) + '%'), field);
    }
    assert.match(result.forest, /<polygon /);
  });

  for (const method of ['DL', 'PM']) {
    test(`P09-D4 control: ${trans} ${method} retains PI with positive tau2`, () => {
      const result = createApp().run(trans, method);
      assert.ok(result.exported.tau2 > 0);
      assertPI(result);
    });

    test(`P09-D4 control: ${trans} ${method} retains PI with zero tau2 at k=3`, () => {
      const result = createApp().run(trans, method, homogeneous);
      assert.equal(result.exported.tau2, 0);
      assertPI(result);
    });
  }

  for (const method of ['FE', 'DL', 'PM']) {
    test(`P09-D4 control: ${trans} ${method} has no PI at k=2`, () => {
      const result = createApp().run(trans, method, heterogeneous.split('\n').slice(0, 2).join('\n'));
      assert.equal(result.exported.k, 2);
      assertNoPI(result);
    });
  }
}
