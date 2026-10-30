// share2 test profile: proportion-ma (the values the original proportion-only spec used, unchanged).
export default {
  plot: '#forest',
  results: { selector: '#res-body', closest: 'section' },
  accessor: '_almLastPropMA',
  custom: { src: '5,40,Alpha Étude\n9,60,Beta\n14,75,Gamma\n2,30,Delta', trans: 'ft', tau: 'DL', axis: { x: [0, 0.8], xLog: false } },
  big: {
    field: 'src',
    row(i, rnd) {
      const n = 100 + rnd() % 900, x = 1 + rnd() % (n - 1);
      const label = Array.from({ length: 32 }, () => String.fromCharCode(65 + rnd() % 26)).join('');
      return x + ',' + n + ',Study ' + i + ' ' + label;
    }
  },
  invalid: [{ trans: 'unknown-transform' }, { axis: { x: [1, 0], xLog: false } },
    // Malformed rows (each file still has >= 2 usable rows, so only a per-row check refuses it). Non-whole counts
    // must be refused, never truncated to 2/40 or 5/40 (proportion-ma/row-check.js).
    { src: '5,40,Alpha\n2.5,40,Half\n9,60,Beta' }, { src: '5,40,Alpha\n5,40.5,Frac\n9,60,Beta' },
    { src: '45,40,Over\n9,60,Beta\n14,75,Gamma' }, { src: '-1,40,Neg\n9,60,Beta\n14,75,Gamma' },
    { src: 'abc,40,Text\n9,60,Beta\n14,75,Gamma' }, { src: '5,0,Zero\n9,60,Beta\n14,75,Gamma' },
    { src: '5,-40,NegN\n9,60,Beta\n14,75,Gamma' }, { src: '7\n9,60,Beta\n14,75,Gamma' }]
};
