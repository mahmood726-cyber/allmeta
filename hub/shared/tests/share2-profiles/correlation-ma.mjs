// share2 test profile: correlation-ma (rows `label, r, n`; tau-squared estimator select).
export default {
  plot: '#forest-host svg',
  results: { selector: '#res-body', closest: 'section' },
  custom: {
    data: 'Alpha \u00c9tude, 0.31, 120\nBeta, 0.18, 85\nGamma, 0.42, 64\nDelta, 0.05, 210\nEpsilon, 0.27, 150',
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
  invalid: [{ method: 'unknown-estimator' }, { method: null }, { data: 42 }]
};
