// quantile-ma (lane audit6): the results table multiplied I² by 100 a second time.
// AlmMaCore.pool returns I2 already in percent (shared/ma-core.js), and quantile-ma-v1.js passes it
// through as profile[].i2; quantile-ma/index.html printed (p.i2 * 100).toFixed(0) + "%". The shipped
// example has tau2 = 0 at every quantile, so it printed "0%" and hid the bug; any heterogeneous input
// printed e.g. "8172%". R (4.6.0, metafor 5.2.1; lane audit6 run/qma2.R), rma(method = "DL") per
// quantile on the data below: I2 = 81.72, 63.72, 88.82; tau2 = 1.4276, 0.4249, 2.7946.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

test('quantile-ma: I² column is a percentage (82% / 64% / 89%, metafor DL), not x100 again', () => {
  const p = loadPage('quantile-ma/index.html', { shared: ['shared/ma-core.js', 'shared/quantile-ma-v1.js'], pick: s => s.includes('AlmQuantileMA.analyze') });
  p.el('f-quantiles').value = '0.25, 0.5, 0.75';
  p.el('f-data').value = 'S1, -1, 0.5, -3, 0.5, -6, 0.6\nS2, -3, 0.6, -2, 0.4, -8, 0.7\nS3, 0.5, 0.7, -4, 0.6, -4, 0.5\nS4, -2, 0.5, -2.5, 0.5, -7, 0.6';
  p.fire('btn-run');
  const out = text(p.el('result').innerHTML);
  assert.match(out, /0\.25 -1\.410 -2\.710, -0\.110 1\.428 82% 4/, out);
  assert.match(out, /0\.5 -2\.802 -3\.606, -1\.998 0\.425 64% 4/, out);
  assert.match(out, /0\.75 -6\.212 -7\.954, -4\.471 2\.795 89% 4/, out);
  assert.match(out, /Wald χ²=19\.00, df=2/, out);
});
