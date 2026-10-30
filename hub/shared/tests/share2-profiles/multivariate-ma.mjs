// share2 test profile: multivariate-ma (P18). State: { src, names[2], mode: cov|r|rhoW, rhoW, entryLog }.
const profile = {
  plot: '#plot-host svg',
  results: { selector: '#stats', closest: 'section' },
  // Non-default: assumed within-study correlation (rhoW mode, 4 numbers per row), renamed outcomes, a non-ASCII label.
  custom: {
    src: 'Étude 1, 0.47, 0.0075, -0.32, 0.0077\nTrial 2, 0.20, 0.0057, -0.60, 0.0008\nTrial 3, 0.40, 0.0021, -0.12, 0.0014\n' +
      'Trial 4, 0.26, 0.0029, -0.31, 0.0015\nTrial 5, 0.56, 0.0148, -0.39, 0.0304',
    names: ['Probing depth é', 'Attachment level'], mode: 'rhoW', rhoW: '0.3'
  },
  // 1000 valid rows in the default covariance mode: label, y1, v1, y2, v2, cov with |r| = 0.3 < 1.
  big: {
    field: 'src',
    row(i, rnd) {
      const y1 = ((rnd() % 2000) - 1000) / 1000, v1 = (1 + rnd() % 100) / 1000;
      const y2 = ((rnd() % 2000) - 1000) / 1000, v2 = (1 + rnd() % 100) / 1000;
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + y1 + ', ' + v1 + ', ' + y2 + ', ' + v2 + ', ' + (0.3 * Math.sqrt(v1 * v2)).toFixed(8);
    }
  },
  // set() refuses: an unknown mode, a names array of the wrong length, and |rhoW| >= 1 in rhoW mode.
  invalid: [{ mode: 'unknown-mode' }, { names: ['only one outcome'] }, { mode: 'rhoW', rhoW: '1.5' }]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ src: profile.custom.src + '\n' + row });
profile.invalid.push(
  bad('Trial 6, abc, 0.01, 0.1, 0.01'),
  bad('Trial 6, 0.1, 0, 0.1, 0.01'),
  bad('Trial 6, 0.1, -0.01, 0.1, 0.01'),
  bad('Trial 6, 0.1, 0.01, 0.1'),
  bad('Trial 6, 0.1, 0.01, 0.1, abc')
);
export default profile;
