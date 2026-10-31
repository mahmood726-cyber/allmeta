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
  bad('Iota, 3, 0, 3, 40'),
  // Lenient number tokens (trailing text, comma decimal, embedded space, empty, NaN/Infinity, hex, non-integer count):
  // parseFloat/parseInt/Number() would read these as a different number; the row checker refuses them.
  bad('Iota, 3x, 40, 3, 40'),
  bad('Iota, 0x3, 40, 3, 40'),
  bad('Iota, 3, 4 0, 3, 40'),
  bad('Iota, 3, 40, , 40'),
  bad('Iota, 3, 40, 3, NaN'),
  bad('Iota, 3, 40, 3, Infinity'),
  bad('Iota, 3, 40.5, 3, 40')
);
// The effect/SE format through the same strict line parser: a valid effect/SE file plus ONE lenient-token row.
const TESE = '\u00c9tude 1, -0.51, 0.20\nBeta, -0.33, 0.25\nGamma, -0.22, 0.12\nDelta, -0.61, 0.30\nEpsilon, -0.15, 0.14\nZeta, -0.80, 0.35\nEta, -0.05, 0.10\nTheta, -0.40, 0.22';
const badTESE = row => ({ format: 'te-se', src: TESE + '\n' + row });
profile.invalid.push(
  badTESE('Iota, abc, 0.1'),
  badTESE('Iota, 0.1, 0'),
  badTESE('Iota, 0.1, -0.1'),
  badTESE('Iota, 0.1'),
  badTESE('Iota, 0.1x, 0.1'),
  badTESE('Iota, 0x10, 0.1'),
  badTESE('Iota, 0 1, 0.1'),
  badTESE('Iota, 0.1, 0.1x'),
  badTESE('Iota, 0.1, 0x1'),
  badTESE('Iota, 0.1, '),
  badTESE('Iota, NaN, 0.1'),
  badTESE('Iota, 0.1, Infinity')
);
export default profile;
