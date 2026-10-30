import { test } from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/rve-extras.js';
import RVE from '../../../../shared/rve.js';

// Synthetic parser cases, not R-parity references or research observations.
const ordinary = [
  { cluster: 'A', yi: 2, vi: 0.04, X: [1] },
  { cluster: 'B', yi: 0.1, vi: 0.04, X: [1] },
  { cluster: 'C', yi: 0.2, vi: 0.04, X: [1] },
  { cluster: 'D', yi: 0.4, vi: 0.04, X: [1] },
];
const hashRows = ordinary.map((row, i) => ({ ...row, cluster: i === 0 ? '#A' : row.cluster }));
const csv = rows => rows.map(r => [r.cluster, r.yi, r.vi].join(',')).join('\n');

for (const [name, delimiter] of [['comma', ','], ['semicolon', ';'], ['tab', '\t']]) {
  test(`P15-R1 plant: ${name} hash-prefixed rows survive at every position with or without a header`, () => {
    for (const header of [false, true]) for (const position of [0, 1, 3]) {
      const expected = ordinary.map((row, i) => ({ ...row, cluster: i === position ? '#A' : row.cluster }));
      const lines = expected.map(r => [r.cluster, r.yi, r.vi].join(delimiter));
      // Whitespace and blank lines must not turn a label into a comment.
      lines[position] = '  ' + lines[position] + '  ';
      if (header) lines.unshift(['cluster', 'yi', 'vi'].join(delimiter));
      const parsed = E.parseStudies('\r\n' + lines.join('\r\n\r\n') + '\r\n');
      assert.deepEqual(parsed.rows, expected, `header=${header}, position=${position}`);
      assert.equal(parsed.header, header);
      assert.equal(parsed.delimiter, name);
    }
  });

  test(`P15-R1 control: ${name} ordinary and quoted-hash labels retain all rows`, () => {
    for (const rows of [ordinary, hashRows]) {
      const lines = rows.map(r => [r.cluster.startsWith('#') ? `"${r.cluster}"` : r.cluster, r.yi, r.vi].join(delimiter));
      assert.deepEqual(E.parseStudies('\n' + lines.join('\n\n') + '\n').rows, rows);
    }
  });
}

test('P15-R1 plant: hash-prefixed observation contributes to the fitted count and estimate', t => {
  const fit = RVE.fitCORR(E.parseStudies(csv(hashRows)).rows, { rho: 0.8 });
  const direct = RVE.fitCORR(hashRows, { rho: 0.8 });
  t.diagnostic(JSON.stringify({ parsed: { k: fit.k_total, m: fit.m_clusters, beta: fit.beta[0] },
    direct: { k: direct.k_total, m: direct.m_clusters, beta: direct.beta[0] } }));
  assert.equal(fit.k_total, 4);
  assert.equal(fit.m_clusters, 4);
  assert.deepEqual(fit, direct);
});

test('P15-R1 control: ordinary and quoted-hash inputs match directly supplied fit rows', () => {
  for (const rows of [ordinary, hashRows]) {
    const text = csv(rows).replace(/^#A,/, '"#A",');
    const fit = RVE.fitCORR(E.parseStudies(text).rows, { rho: 0.8 });
    assert.equal(fit.k_total, 4);
    assert.equal(fit.m_clusters, 4);
    assert.deepEqual(fit, RVE.fitCORR(rows, { rho: 0.8 }));
  }
});

test('P15-R1 plant: exported hash labels and repeated hash clusters round-trip without loss', () => {
  const rows = [...hashRows, { cluster: '#A', yi: 0.3, vi: 0.04, X: [1] },
    { cluster: '#', yi: 0.5, vi: 0.04, X: [1] }];
  const text = E.toInputCSV({ inputs: { predictor_names: [],
    rows: rows.map(r => ({ cluster: r.cluster, yi: r.yi, vi: r.vi, x: [] })) } });
  assert.deepEqual(E.parseStudies(text).rows, rows);
});

const invalidRows = [
  ['A,oops,0.04,1', /effect size yi .*is not a number/],
  ['A,0.2,-0.04,1', /vi must be a positive sampling variance/],
  ['A,0.2,0.04,NA', /predictor .*is not a number/],
  ['A', /needs at least cluster, yi, vi/],
];
for (const [row, message] of invalidRows) {
  for (const prefix of ['#', '']) {
    const kind = prefix ? 'plant' : 'control';
    test(`P15-R1 ${kind}: invalid row ${prefix}${row} is refused at its original line`, () => {
      const input = `cluster,yi,vi,x\n\n  ${prefix}${row}\nB,0.1,0.04,2\nC,0.2,0.04,3`;
      assert.throws(() => E.parseStudies(input), error =>
        error.userFacing === true && /^Line 3:/.test(error.message) && message.test(error.message));
    });
  }
}

test('P15-R1 plant: standalone hash-prefixed text is explicitly refused', () => {
  assert.throws(() => E.parseStudies('# comment\n' + csv(ordinary)), error =>
    error.userFacing === true && /^Line 1: needs at least 3/.test(error.message));
});

test('P15-R1 control: standalone ordinary text is explicitly refused', () => {
  assert.throws(() => E.parseStudies('comment\n' + csv(ordinary)), error =>
    error.userFacing === true && /^Line 1: needs at least 3/.test(error.message));
});
