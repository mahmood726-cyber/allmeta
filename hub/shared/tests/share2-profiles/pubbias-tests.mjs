// share2 test profile: pubbias-tests (small-study-effect tests; rows are "[label,] effect, SE" or "[label,] e1, n1, e2, n2").
const profile = {
  plot: '#funnel',
  results: { selector: '#body', closest: 'section' },
  custom: {
    format: 'binary',
    src: '\u00c9tude 1, 12, 100, 20, 100\nBeta, 8, 80, 15, 82\nGamma, 30, 250, 41, 248\nDelta, 5, 40, 9, 42\n' +
      'Epsilon, 17, 150, 25, 149\nZeta, 3, 30, 7, 31\nEta, 22, 200, 28, 205\nTheta, 10, 60, 14, 58',
    axes: ['-3', '3', false, '', '', false]
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const te = ((rnd() % 1000) - 300) / 1000, se = (50 + rnd() % 250) / 1000;
      const label = Array.from({ length: 12 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + te + ', ' + se;
    }
  },
  invalid: [
    { format: 'logit' },
    { axes: ['2', '1', false, '', '', false] },
    { axes: ['', '', 'yes', '', '', false] },
    { axes: ['', ''] },
    { entryLog: 'none' }
  ]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ src: profile.custom.src + '\n' + row });
profile.invalid.push(
  bad('Iota, 50, 40, 3, 40'),
  bad('Iota, -1, 40, 3, 40'),
  bad('Iota, abc, 40, 3, 40'),
  bad('Iota, 2.5, 40, 3, 40'),
  bad('Iota, 3, 40, 3'),
  bad('Iota, 3, 0, 3, 40')
);
export default profile;
