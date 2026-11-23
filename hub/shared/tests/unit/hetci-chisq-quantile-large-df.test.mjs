// Requirement: shared/heterogeneity-ci.js chiSqQuantile equals R qchisq at every df a Q-profile CI can meet,
// including very large k (df = k - 1). Before the fix the incomplete-gamma series/continued fraction stopped
// at 300 terms, so qchisq(0.025, 1e5) read 99129.10 and qchisq(0.025, 1e6) 997520.07.
// Reference: R 4.6.0, format(qchisq(p, df), digits = 17) (lane packprep, 14 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import HetCI from '../../../../shared/heterogeneity-ci.js';

const R = [
  [1, 0.025, 0.00098206911717525617], [1, 0.975, 5.0238861873148846],
  [10, 0.025, 3.2469727802368409], [10, 0.975, 20.483177350807395],
  [1000, 0.025, 914.25715379925896], [1000, 0.975, 1089.5309127749135],
  [1e4, 0.025, 9724.7183773897978], [1e4, 0.975, 10279.070179887591],
  [1e5, 0.025, 99125.373300647349], [1e5, 0.975, 100878.41530566558],
  [1e6, 0.025, 997230.08714329009], [1e6, 0.975, 1002773.701467926],
];
for (const [df, p, ref] of R) {
  test(`chiSqQuantile(${p}, ${df}) = R qchisq within 1e-10 relative`, () => {
    const got = HetCI.chiSqQuantile(p, df);
    assert.ok(Math.abs(got - ref) / ref < 1e-10, `got ${got}, R ${ref}`);
  });
}
