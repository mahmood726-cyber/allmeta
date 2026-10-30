// share2 test profile: gosh (share adapter {src, model, draws, enumeration, exactResult, axes (6), entryLog}).
const profile = {
  plot: '#plot',
  results: { selector: '#m-n', closest: 'section' },
  custom: {
    src: '0.31, 0.09, Alpha \u00c9tude\n0.12, 0.11, Beta\n0.55, 0.14, Gamma\n0.20, 0.08, Delta\n-0.05, 0.12, Epsilon\n0.65, 0.10, Zeta\n0.27, 0.07, Eta\n0.40, 0.16, Theta',
    model: 'DL',
    axes: ['-0.3', '0.9', false, '', '', false]
  },
  // gosh accepts 3-100 studies by design (all 2^k subsets), so the large state is its maximum of 100 valid rows with
  // 80-character labels, which together exceed the 8,000-character link limit (the spec asserts that).
  big: {
    field: 'src',
    count: 100,
    row(i, rnd) {
      const est = ((rnd() % 2001) - 1000) / 1000, se = (50 + rnd() % 400) / 1000;
      const label = Array.from({ length: 80 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return est + ', ' + se + ', Study ' + i + ' ' + label;
    }
  },
  invalid: [
    { model: 'REML' },
    { enumeration: 'everything' },
    { draws: '0' },
    { axes: ['1', '0', false, '', '', false] },
    { src: '0.2, 0.1, A\n0.3, zero, B\n0.1, 0.2, C' }
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
