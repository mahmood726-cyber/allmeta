// share2 test profile: correlation-ma (rows `label, r, n`; tau-squared estimator select).
const DATA = 'Alpha \u00c9tude, 0.31, 120\nBeta, 0.18, 85\nGamma, 0.42, 64\nDelta, 0.05, 210\nEpsilon, 0.27, 150';
// Well-typed text with one malformed row appended: the page parser would skip it silently, so set() must refuse it.
const bad = row => ({ data: DATA + '\n' + row });
export default {
  plot: '#forest-host svg',
  results: { selector: '#res-body', closest: 'section' },
  custom: {
    data: DATA,
    method: 'PM'
  },
  big: {
    field: 'data',
    row(i, rnd) {
      const n = 10 + rnd() % 990, r = ((rnd() % 1801) - 900) / 1000;
      const label = Array.from({ length: 12 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + r.toFixed(3) + ', ' + n;
    }
  },
  invalid: [{ method: 'unknown-estimator' }, { method: null }, { data: 42 },
    bad('Zeta, 1.5, 40'), bad('Zeta, 1, 40'), bad('Zeta, -1, 40'), bad('Zeta, abc, 40'),
    bad('Zeta, 0.3, 3'), bad('Zeta, 0.3, NA'), bad('Zeta, 0.3')]
};
