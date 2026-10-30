// share2 test profile: limit-ma (share adapter {src, options (7 sensitivity controls), axes (4 bounds), sensitivityRun, entryLog}).
const options = { 'plus-alpha': '0.10', 'plus-binary-measure': '', 'plus-binary-counts': '',
  'plus-limit-toggle': true, 'plus-fill-toggle': true, 'plus-reg-toggle': true, 'plus-contour-toggle': false };
const profile = {
  plot: '#plot',
  results: { selector: '#body', closest: 'section' },
  custom: {
    src: '0.62, 0.09, Alpha \u00c9tude\n0.41, 0.11, Beta\n0.80, 0.18, Gamma\n0.55, 0.08, Delta\n0.25, 0.06, Epsilon\n0.90, 0.22, Zeta\n0.47, 0.10, Eta\n0.70, 0.14, Theta',
    options: { ...options, 'plus-alpha': '0.05', 'plus-contour-toggle': true },
    axes: ['-0.2', '1.4', '', '']
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const est = ((rnd() % 2001) - 1000) / 1000, se = (50 + rnd() % 400) / 1000;
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return est + ', ' + se + ', Study ' + i + ' ' + label;
    }
  },
  invalid: [
    { options: { ...options, 'plus-alpha': '5' } },
    { options: { ...options, 'plus-binary-measure': 'HR' } },
    { axes: ['1', '0', '', ''] },
    { sensitivityRun: 'yes' },
    { src: '0.5, 0.1, A\n0.4, 0.1, B\n0.6, 0.1, C' }
  ]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ src: profile.custom.src + '\n' + row });
profile.invalid.push(
  bad('abc, 0.1, Iota'),
  bad('0.1, 0, Iota'),
  bad('0.1, -0.2, Iota'),
  bad('0.1, abc, Iota'),
  bad('0.1')
);
export default profile;
