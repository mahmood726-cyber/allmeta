// share2 test profile: nma (contrast-based NMA; rows are "study, treatment1, treatment2, est, SE").
const profile = {
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
// Well-typed state whose data has ONE malformed row appended to the valid custom data: the page's own row
// checker refuses such a row, so share set() must refuse the file too (not drop the row or replace the analysis).
const bad = row => ({ data: profile.custom.data + '\n' + row });
profile.invalid.push(
  bad('T9, DrugA, DrugB, abc, 0.1'),
  bad('T9, DrugA, DrugB, 0.1, 0'),
  bad('T9, DrugA, DrugB, 0.1, -0.1'),
  bad('T9, DrugA, DrugA, 0.1, 0.1'),
  bad('T9, DrugA, DrugB, 0.1'),
  // Lenient number tokens (trailing text, comma decimal, embedded space, empty, NaN/Infinity, hex, non-integer count):
  // parseFloat/parseInt/Number() would read these as a different number; the row checker refuses them.
  bad('T9, DrugA, DrugB, 0.1x, 0.1'),
  bad('T9, DrugA, DrugB, 0x10, 0.1'),
  bad('T9, DrugA, DrugB, 0 1, 0.1'),
  bad('T9, DrugA, DrugB, 0.1, 0.1x'),
  bad('T9, DrugA, DrugB, 0.1, 0x1'),
  bad('T9, DrugA, DrugB, 0.1, '),
  bad('T9, DrugA, DrugB, NaN, 0.1'),
  bad('T9, DrugA, DrugB, 0.1, Infinity')
);
export default profile;
