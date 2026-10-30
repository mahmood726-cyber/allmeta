// share2 test profile: cumulative-subgroup (rows `label, estimate, SE, year, group`; view, plot title and axis limits).
export default {
  plot: '#svg-host svg',
  results: { selector: '#stats-wrap', closest: 'section' },
  custom: {
    data: '# label, logOR, SE, year, group\nTrial \u00c9tude, -0.35, 0.13, 2012, Adults\nTrial B, -0.12, 0.11, 2014, Adults\n' +
      'Trial C, -0.41, 0.17, 2016, Children\nTrial D, -0.08, 0.09, 2018, Adults\nTrial E, -0.50, 0.20, 2019, Children\n' +
      'Trial F, -0.27, 0.12, 2021, Children',
    view: 'subgroup',
    title: 'Subgroups \u00e0 l\u2019\u00e9tude',
    axis: ['-1.5', '0.5']
  },
  big: {
    field: 'data',
    row(i, rnd) {
      const est = ((rnd() % 1601) - 800) / 1000, se = 0.05 + (rnd() % 300) / 1000;
      const label = Array.from({ length: 10 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + est.toFixed(3) + ', ' + se.toFixed(3) + ', ' + (1980 + rnd() % 45) + ', ' +
        ['Low-risk', 'High-risk', 'Mixed'][rnd() % 3];
    }
  },
  invalid: [{ view: 'unknown-view' }, { axis: ['abc', ''] }, { axis: ['1'] }, { title: 5 }]
};
