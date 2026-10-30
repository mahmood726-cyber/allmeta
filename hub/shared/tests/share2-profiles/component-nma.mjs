// share2 test profile: component-nma (additive component NMA; input rows are `A components | B components | effect | SE`).
// The state has no estimator option, so the non-default state changes the data and the conversion log (entryLog),
// which feeds the report text results; the non-ASCII label is a component name.
const COMPONENTS = ['drug', 'exercise', 'education', 'diet', 'sleep'];
export default {
  plot: '#forest',
  results: { selector: '#comp-body', closest: 'section' },
  custom: {
    src: '\u00c9tude+exercise | control | -0.41 | 0.13\n\u00c9tude | control | -0.28 | 0.11\nexercise | control | -0.22 | 0.12\n' +
      '\u00c9tude | exercise | -0.09 | 0.10\nexercise+diet | control | -0.35 | 0.14\ndiet | control | -0.15 | 0.12\n' +
      '\u00c9tude+diet | exercise | -0.30 | 0.15',
    entryLog: [{ method: 'SE from CI' }]
  },
  big: {
    field: 'src',
    row(i, rnd) {
      let arm = COMPONENTS.filter(() => rnd() % 2 === 1);
      if (!arm.length) arm = [COMPONENTS[i % COMPONENTS.length]];
      const te = ((rnd() % 2001) - 1000) / 1000, se = 0.05 + (rnd() % 300) / 1000;
      return arm.join('+') + ' | control | ' + te.toFixed(3) + ' | ' + se.toFixed(3);
    }
  },
  invalid: [{ src: 42 }, { src: 'drug | control | -0.3' }, { entryLog: 'not-a-log' }, { entryLog: [1] }]
};
