// share2 test profile: nma-inconsistency (node-splitting + design-by-treatment; rows are "A, B, effect, SE[, study ID]").
const SRC = 'A, B, -0.28, 0.10, \u00c9tude 1\nA, B, -0.35, 0.09, S2\nA, C, -0.18, 0.12, S3\nA, C, -0.25, 0.11, S4\n' +
  'B, C, 0.14, 0.11, S5\nB, C, 0.05, 0.13, S6\nA, D, -0.55, 0.15, S7\nB, D, -0.20, 0.17, S8\nC, D, -0.31, 0.14, S9\nA, D, -0.42, 0.13, S10';
// Well-typed text with one malformed row (unique study ID) appended: parse() would drop it silently, so set() must refuse it.
const bad = row => ({ src: SRC + '\n' + row });
export default {
  plot: '#ns-plot',
  results: { selector: '#ns-body', closest: 'section' },
  custom: {
    src: SRC,
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
    { src: 42 },
    bad('C, D, abc, 0.10, S11'), bad('C, D, -0.30, 0, S11'), bad('C, D, -0.30, -0.10, S11'),
    bad('C, C, -0.30, 0.10, S11'), bad('C, D, -0.30'), bad('C, D, -0.30, abc, S11'),
  // Lenient number tokens (trailing text, comma decimal, embedded space, empty, NaN/Infinity, hex, non-integer count):
  // parseFloat/parseInt/Number() would read these as a different number; the row checker refuses them.
  bad('C, D, 0x0, 0.10, S11'),
  bad('C, D, 0x10, 0.10, S11'),
  bad('C, D, -0.30, 0x10, S11'),
  bad('C, D, -0.30x, 0.10, S11'),
  bad('C, D, -0.30, 0.10x, S11'),
  bad('C, D, -0 30, 0.10, S11'),
  bad('C, D, NaN, 0.10, S11'),
  bad('C, D, -0.30, Infinity, S11')
  ]
};
