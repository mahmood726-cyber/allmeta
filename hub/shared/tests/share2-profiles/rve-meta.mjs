// share2 test profile: rve-meta (CR2 robust variance meta-regression; rows are "cluster, yi, vi, predictors...").
// The page draws no plot: its main rendered output is the coefficient table, which stands in for the plot here.
const profile = {
  plot: '#coef-table',
  results: { selector: '#coef-body', closest: 'section' },
  custom: {
    src: 'studyid,effectsize,var,dose\n' +
      'Étude 1,0.21,0.031,1\nÉtude 1,0.30,0.033,2\nB,0.12,0.020,1\nB,0.25,0.022,3\nC,0.44,0.090,2\nC,0.61,0.095,4\n' +
      'D,0.05,0.040,1\nD,0.18,0.042,2\nE,-0.10,0.050,1\nE,0.02,0.052,1\nF,0.35,0.060,3\nF,0.48,0.061,4\n' +
      'G,0.15,0.030,2\nH,0.27,0.045,3\nH,0.39,0.047,4\nI,0.09,0.035,1',
    rho: '0.5', names: 'dose', centred: true
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const yi = ((rnd() % 2000) - 800) / 2000, vi = (10 + rnd() % 190) / 1000;
      const males = 40 + rnd() % 50, college = rnd() % 2, binge = rnd() % 2;
      return 'Cluster ' + Math.floor(i / 4) + ',' + yi + ',' + vi + ',' + males + ',' + college + ',' + binge;
    }
  },
  invalid: [
    { rho: '1.5' },
    { centred: 'yes' },
    { names: 'males<script>' },
    { src: '' },
    { src: 42 }
  ]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ src: profile.custom.src + '\n' + row });
profile.invalid.push(
  bad('J,abc,0.03,1'),
  bad('J,0.1,0,1'),
  bad('J,0.1,-0.03,1'),
  bad('J,0.1,0.03,abc'),
  bad('J,0.1,0.03'),
  bad('J,0.1,abc,1'),
  // Lenient number tokens (trailing text, comma decimal, embedded space, empty, NaN/Infinity, hex, non-integer count):
  // parseFloat/parseInt/Number() would read these as a different number; the row checker refuses them.
  bad('J,0.1x,0.03,1'),
  bad('J,0x10,0.03,1'),
  bad('J,0 1,0.03,1'),
  bad('J,0.1,0.03x,1'),
  bad('J,0.1,0x1,1'),
  bad('J,0.1,,1'),
  bad('J,NaN,0.03,1'),
  bad('J,0.1,Infinity,1'),
  bad('J,0.1,0.03,1x'),
  bad('J,0.1,0.03,0x1')
);
export default profile;
