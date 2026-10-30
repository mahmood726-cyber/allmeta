// share2 test profile: dose-response-ma (rows `study, dose, cases, n, logRR, SE, type`; reference rows have blank SE).
export default {
  plot: '#curve-host svg',
  // The results section also hosts the shared #alm-features mount (share status/version text), so compare the
  // predicted relative-risk table only; text.results() still compares every fitted value.
  results: { selector: '#pred-body', closest: 'table' },
  custom: {
    'f-data': [
      '# study, dose, cases, n, logRR, SE, type',
      '\u00c9tude A, 0, 126, 414, 0, , cc', '\u00c9tude A, 9.06, 61, 261, -0.20, 0.223338, cc', '\u00c9tude A, 27, 69, 228, 0.05, 0.233752, cc',
      '\u00c9tude A, 45, 22, 44, 0.530628, 0.376514, cc',
      'B, 0, 77, 258, 0, , cc', 'B, 16.05, 88, 413, -0.430783, 0.221305, cc', 'B, 46.425, 24, 202, -1.07881, 0.297565, cc',
      'B, 77.16, 13, 64, -0.616186, 0.387079, cc',
      'C, 0, 159, 480, 0, , ci', 'C, 6, 229, 975, -0.415516, 0.144215, ci', 'C, 18, 38, 207, -0.634878, 0.238349, ci',
      'C, 28.8, 39, 133, -0.083382, 0.273885, ci',
      'D, 0, 302, 1269, 0, , ci', 'D, 6.25, 129, 436, -0.223144, 0.156587, ci', 'D, 18.75, 19, 49, -0.01005, 0.351089, ci',
      'D, 30, 15, 41, -0.261365, 0.416511, ci'
    ].join('\n'),
    'f-shape': 'quadratic',
    'f-method': 'ML'
  },
  big: {
    field: 'f-data',
    row(i, rnd) {
      // 250 studies x 4 dose levels; the first level of each study is its reference row (logRR 0, blank SE).
      const s = Math.floor(i / 4), j = i % 4, type = s % 2 ? 'ci' : 'cc';
      const cases = 20 + rnd() % 80, n = cases + 100 + rnd() % 400;
      const study = 'Study ' + s + ' ' + String.fromCharCode(65 + s % 26, 65 + (s * 7) % 26);
      if (j === 0) return study + ', 0, ' + cases + ', ' + n + ', 0, , ' + type;
      const dose = j * 10 + rnd() % 5, lrr = ((rnd() % 1001) - 500) / 1000, se = 0.1 + (rnd() % 400) / 1000;
      return study + ', ' + dose + ', ' + cases + ', ' + n + ', ' + lrr.toFixed(3) + ', ' + se.toFixed(3) + ', ' + type;
    }
  },
  invalid: [{ 'f-shape': 'cubic' }, { 'f-mod': 'yes' }, { 'f-method': 'PM', 'f-shape': 'quadratic' }, { entryLog: 'not-a-log' }]
};
