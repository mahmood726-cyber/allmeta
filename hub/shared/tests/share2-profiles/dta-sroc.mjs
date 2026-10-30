// share2 test profile: dta-sroc (rows `label, TP, FP, FN, TN`; bivariate method, continuity correction, title).
// #stats-wrap sits inside the input panel, so it is compared on its own (no closest()).
const profile = {
  plot: '#svg-host svg',
  results: { selector: '#stats-wrap' },
  custom: {
    data: '# TP, FP, FN, TN per study\n\u00c9tude A, 80, 12, 20, 138\nStudy B, 60, 14, 19, 105\nStudy C, 115, 22, 37, 205\n' +
      'Study D, 50, 0, 9, 95\nStudy E, 128, 44, 31, 290\nStudy F, 95, 16, 22, 180\nStudy G, 70, 9, 14, 128',
    method: 'ml',
    cc: 'single',
    title: 'SROC \u00e9tude'
  },
  big: {
    field: 'data',
    row(i, rnd) {
      const tp = 10 + rnd() % 190, fn = 2 + rnd() % 60, fp = 2 + rnd() % 60, tn = 20 + rnd() % 280;
      const label = Array.from({ length: 10 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + tp + ', ' + fp + ', ' + fn + ', ' + tn;
    }
  },
  invalid: [{ method: 'unknown-method' }, { cc: 'maybe' }, { axes: 'not-a-list' }, { entryLog: [1] }, { title: 7 }]
};
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ data: profile.custom.data + '\n' + row });
profile.invalid.push(
  bad('Study H, -1, 5, 5, 5'),
  bad('Study H, abc, 5, 5, 5'),
  bad('Study H, 2.5, 5, 5, 5'),
  bad('Study H, 5, 5, 5'),
  bad('Study H, 0, 5, 0, 5'),
  bad('Study H, 5, 0, 5, 0')
);
export default profile;
