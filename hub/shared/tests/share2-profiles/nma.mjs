// share2 test profile: nma (contrast-based NMA; rows are "study, treatment1, treatment2, est, SE").
export default {
  plot: '#svg-host svg',
  results: { selector: '#ref-host', closest: 'section' },
  custom: {
    data: 'Étude 1, Placebo, DrugA, -0.25, 0.12\nT2, Placebo, DrugA, -0.35, 0.15\nT3, Placebo, DrugB, -0.12, 0.11\n' +
      'T4, Placebo, DrugB, -0.21, 0.10\nT5, Placebo, DrugC, 0.04, 0.13\nT6, DrugA, DrugB, 0.11, 0.13\n' +
      'T7, DrugA, DrugC, 0.22, 0.15\nT8, DrugB, DrugC, 0.06, 0.14',
    ref: 'Placebo', model: 're', ci: 't-dist', dir: 'undesirable', title: 'Share étude NMA'
  },
  big: {
    field: 'data',
    row(i, rnd) {
      const T = ['Placebo', 'DrugA', 'DrugB', 'DrugC', 'DrugD'];
      const a = rnd() % 5, b = (a + 1 + rnd() % 4) % 5;
      const est = ((rnd() % 1000) - 500) / 1000, se = (80 + rnd() % 200) / 1000;
      const label = Array.from({ length: 12 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return 'Study ' + i + ' ' + label + ', ' + T[a] + ', ' + T[b] + ', ' + est + ', ' + se;
    }
  },
  invalid: [
    { model: 'bayesian' },
    { ci: 'hksj' },
    { data: 42 },
    { ref: 'NoSuchDrug' },
    { data: 'T1, Placebo, DrugA, -0.2x, 0.12\nT2, Placebo, DrugB, -0.1, 0.1' }
  ]
};
