// share2 test profile: nma-inconsistency (node-splitting + design-by-treatment; rows are "A, B, effect, SE[, study ID]").
export default {
  plot: '#ns-plot',
  results: { selector: '#ns-body', closest: 'section' },
  custom: {
    src: 'A, B, -0.28, 0.10, \u00c9tude 1\nA, B, -0.35, 0.09, S2\nA, C, -0.18, 0.12, S3\nA, C, -0.25, 0.11, S4\n' +
      'B, C, 0.14, 0.11, S5\nB, C, 0.05, 0.13, S6\nA, D, -0.55, 0.15, S7\nB, D, -0.20, 0.17, S8\nC, D, -0.31, 0.14, S9\nA, D, -0.42, 0.13, S10',
    model: 'PM'
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const T = ['A', 'B', 'C', 'D'];
      const a = rnd() % 4, b = (a + 1 + rnd() % 3) % 4;
      const est = ((rnd() % 1000) - 500) / 1000, se = (80 + rnd() % 200) / 1000;
      const label = Array.from({ length: 12 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return T[a] + ', ' + T[b] + ', ' + est + ', ' + se + ', Study ' + i + ' ' + label;
    }
  },
  invalid: [
    { model: 'REML' },
    { model: 42 },
    { src: 42 }
  ]
};
