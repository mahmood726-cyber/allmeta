// share2 test profile: influence (share adapter {src: #src "effect, SE, label" lines, axis: {min, max, log}}).
const profile = {
  plot: '#influence-plot',
  results: { selector: '#model-summary', closest: 'section' },
  custom: {
    src: '0.31, 0.09, Alpha \u00c9tude\n0.12, 0.11, Beta\n0.55, 0.14, Gamma\n0.20, 0.08, Delta\n-0.05, 0.12, Epsilon\n0.95, 0.10, Zeta\n0.27, 0.07, Eta',
    axis: { min: '-0.5', max: '1.5', log: false }
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
    { axis: { min: '', max: '', log: true } },
    { axis: { min: '2', max: '1', log: false } },
    { src: '0.25, 0.08, Smith\n0.18, zero, Jones\n0.40, 0.15, Khan' },
    { src: 17 }
  ]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ src: profile.custom.src + '\n' + row });
profile.invalid.push(
  bad('abc, 0.1, Eps'),
  bad('0.1, 0, Eps'),
  bad('0.1, -0.2, Eps'),
  bad('0.1, abc, Eps'),
  bad('0.1')
);
export default profile;
