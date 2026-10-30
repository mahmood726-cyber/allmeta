// share2 test profile: mh-peto (share adapter {src: "study, e1, n1, e2, n2" lines, measure, axis {min, max, log, applied}, entryLog}).
export default {
  plot: '#forest',
  results: { selector: '#pooled', closest: 'section' },
  custom: {
    src: 'Alpha \u00c9tude, 4, 320, 11, 318\nBeta, 2, 150, 6, 149\nGamma, 7, 410, 15, 405\nDelta, 1, 90, 3, 92\nEpsilon, 5, 260, 9, 255\nZeta, 3, 200, 8, 210',
    measure: 'RR',
    axis: { min: '0.05', max: '5', log: true, applied: true }
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const n1 = 100 + rnd() % 900, n2 = 100 + rnd() % 900;
      const e1 = 1 + rnd() % 40, e2 = 1 + rnd() % 40;
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + e1 + ', ' + n1 + ', ' + e2 + ', ' + n2;
    }
  },
  invalid: [
    { measure: 'HR' },
    { axis: { min: '5', max: '1', log: true, applied: true } },
    { axis: { min: '', max: '', log: 'yes', applied: false } },
    { entryLog: 'none' },
    { src: 42 }
  ]
};
