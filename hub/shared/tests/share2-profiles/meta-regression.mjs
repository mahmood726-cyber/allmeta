// share2 test profile: meta-regression (P02-series app). State: { data, title, modlabel, effectlabel, scale, axes[], provenance, entryLog }.
export default {
  plot: '#svg-host svg',
  results: { selector: '#stats-wrap' },
  // Non-default: new data with a non-ASCII label and new plot labels. The model option (scale) stays off: it selects the
  // experimental location-scale model, which report text and R verification refuse by design (not a share defect).
  custom: {
    data: 'Étude A, -0.28, 0.12, 32\nTrial B, -0.22, 0.09, 35\nTrial C, -0.15, 0.11, 42\nTrial D, -0.10, 0.13, 48\n' +
      'Trial E, 0.04, 0.15, 55\nTrial F, 0.10, 0.12, 60',
    title: 'Étude by baseline LVEF', modlabel: 'Baseline LVEF (%)', effectlabel: 'Effect (log odds ratio)'
  },
  // 1000 valid rows: label, effect, SE > 0, moderator.
  big: {
    field: 'data',
    row(i, rnd) {
      const y = ((rnd() % 2000) - 1000) / 1000, se = (5 + rnd() % 300) / 1000, x = 20 + rnd() % 60;
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + y + ', ' + se + ', ' + x;
    }
  },
  // set() refuses: a non-boolean scale, an axis list of the wrong length, and a non-string data field.
  invalid: [{ scale: 'yes' }, { axes: [] }, { data: 5 }]
};
