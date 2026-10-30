// share2 test profile: multilevel-ma (three-level MoM + REML; rows are "study, effect, SE, label").
export default {
  plot: '#forest',
  results: { selector: '#summary', closest: 'section' },
  custom: {
    src: '\u00c9tude 1, 0.31, 0.12, outcome A\n\u00c9tude 1, 0.27, 0.10, outcome B\n2, 0.15, 0.09, primary\n2, 0.21, 0.11, secondary\n3, 0.52, 0.16, score\n4, 0.08, 0.07, main\n5, 0.29, 0.12, main',
    axis: { min: '-0.5', max: '1.5', log: false }
  },
  big: {
    field: 'src',
    row(i, rnd) {
      const yi = ((rnd() % 2000) - 1000) / 1000, se = (50 + rnd() % 200) / 1000;
      const label = Array.from({ length: 12 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'S' + Math.floor(i / 3) + ', ' + yi + ', ' + se + ', outcome ' + label;
    }
  },
  invalid: [
    { axis: { min: '2', max: '1', log: false } },
    { axis: { min: '', max: '', log: 'yes' } },
    { src: '1, 0.3, 0.1abc\n2, 0.2, 0.1\n3, 0.4, 0.2' },
    { src: 42 }
  ]
};
