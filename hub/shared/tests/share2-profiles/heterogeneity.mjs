// share2 test profile: heterogeneity (share adapter {data: #f-data "label, estimate, SE" lines, tau2: #f-tau2}).
const profile = {
  plot: '#svg-host svg',
  results: { selector: '#stats-wrap' },
  custom: {
    data: 'Alpha \u00c9tude, -0.31, 0.12\nBeta, 0.08, 0.15\nGamma, -0.52, 0.10\nDelta, -0.12, 0.20\nEpsilon, 0.25, 0.17\nZeta, -0.40, 0.09',
    tau2: 'reml'
  },
  big: {
    field: 'data',
    row(i, rnd) {
      const est = ((rnd() % 2001) - 1000) / 1000, se = (50 + rnd() % 400) / 1000;
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + est + ', ' + se;
    }
  },
  invalid: [{ tau2: 'unknown-estimator' }, { data: 42 }, { data: ['Trial A, -0.2, 0.1'] }]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ data: profile.custom.data + '\n' + row });
profile.invalid.push(
  bad('Eta, abc, 0.1'),
  bad('Eta, 0.1x, 0.1'),
  bad('Eta, 0.1, 0'),
  bad('Eta, 0.1, -0.2'),
  bad('Eta, 0.1, abc'),
  bad('Eta, 0.1'),
  // Lenient number tokens (trailing text, comma decimal, embedded space, empty, NaN/Infinity, hex, non-integer count):
  // parseFloat/parseInt/Number() would read these as a different number; the row checker refuses them.
  bad('Eta, 0x10, 0.1'),
  bad('Eta, 0 1, 0.1'),
  bad('Eta, 0.1, 0.1x'),
  bad('Eta, 0.1, 0x1'),
  bad('Eta, 0.1, '),
  bad('Eta, NaN, 0.1'),
  bad('Eta, 0.1, Infinity')
);
export default profile;
