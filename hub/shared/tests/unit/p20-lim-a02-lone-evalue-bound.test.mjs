// LIM-P20 A02: a lone confidence limit must be validated as strictly as a complete
// interval. Before the fix, eValues('RR', 2, 3, null) returned a CI E-value computed
// from a "lower" limit ABOVE the estimate. EValue 4.1.4 refuses the same inputs:
// evalues.RR(2, lo = 3) -> "Point estimate should be inside confidence interval"
// (and likewise RR 2 with hi 1.5, RR 0.6 with hi 0.5 or lo 0.7).
import test from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/evalue.js';

const refused = [
  ['lone lower above RR estimate', 'RR', 2, 3, null],
  ['lone upper below RR estimate', 'RR', 2, null, 1.5],
  ['lone upper below protective RR', 'RR', 0.6, null, 0.5],
  ['lone lower above protective RR', 'RR', 0.6, 0.7, null],
  ['lone non-positive ratio lower limit', 'RR', 2, -1, null],
  ['lone zero OR upper limit', 'OR', 0.5, null, 0],
  ['lone non-finite lower limit', 'HR', 2, Infinity, null],
  ['lone NaN upper limit', 'RR', 0.6, null, NaN],
  ['lone SMD lower above estimate', 'SMD', 0.3, 0.5, null],
];
for (const [name, m, pt, lo, hi] of refused) {
  test(`LIM-P20 A02 plant: ${name} is refused`, () => {
    assert.throws(() => E.eValues(m, pt, lo, hi), { name: 'RangeError', message: /confidence interval/i });
  });
}

test('LIM-P20 A02 control: valid lone limits keep their EValue-matching value', () => {
  // EValue 4.1.4: evalues.RR(2, lo = 1.5) lower E-value 2.366025.
  assert.ok(Math.abs(E.eValues('RR', 2, 1.5, null).ci - 2.366025) < 1e-6);
  assert.equal(E.eValues('RR', 0.6, null, 0.9).ci, E.eValue(0.9));
  assert.equal(E.eValues('RR', 2, null, 3).ci, 1); // only the far limit: no CI E-value
  assert.equal(E.eValues('SMD', -0.3, null, -0.1).ci, E.eValue(Math.exp(0.91 * -0.1)));
  assert.equal(E.eValues('RR', 2, null, null).ci, 1);
});
