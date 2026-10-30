import { test } from 'node:test';
import assert from 'node:assert/strict';
import E from '../../../../shared/rve-extras.js';
import RVE from '../../../../shared/rve.js';

// Synthetic data only. These are exact round-trip invariants, not R-parity
// reference estimates; compare the real engine before and after CSV export.
const leadingSpace = 'cluster,yi,vi\n" A",0.4,0.04\nA,0.6,0.04\nB,0.2,0.04\nC,0.3,0.04';

function inputs(parsed) {
  return { inputs: {
    predictor_names: parsed.predictorNames || [],
    rows: parsed.rows.map(r => ({ cluster: r.cluster, yi: r.yi, vi: r.vi, x: r.X.slice(1) }))
  } };
}

function roundTrip(text) {
  const before = E.parseStudies(text);
  const csv = E.toInputCSV(inputs(before));
  return { before, csv, after: E.parseStudies(csv) };
}

test('plant P15-R2: input CSV preserves distinct leading and trailing spaces and repeated clusters', () => {
  const text = 'cluster,yi,vi,dose\n" A",0.4,0.04,1\nA,0.6,0.04,2\n"A ",0.2,0.04,3\n" A ",0.3,0.04,4\n" A",0.5,0.04,5';
  const { before, csv, after } = roundTrip(text);
  assert.deepEqual(before.rows.map(r => r.cluster), [' A', 'A', 'A ', ' A ', ' A']);
  assert.deepEqual(after.rows, before.rows);
  assert.equal(csv, text.replaceAll('\n', '\r\n') + '\r\n');
});

test('plant P15-R2: input CSV preserves the cluster count and complete CORR fit', t => {
  const { before, after } = roundTrip(leadingSpace);
  const original = RVE.fitCORR(before.rows, { rho: 0.8 });
  const restored = RVE.fitCORR(after.rows, { rho: 0.8 });
  t.diagnostic(JSON.stringify({
    before: { m: original.m_clusters, beta: original.beta },
    after: { m: restored.m_clusters, beta: restored.beta }
  }));
  assert.equal(original.m_clusters, 4);
  assert.equal(restored.m_clusters, original.m_clusters);
  assert.deepEqual(restored, original);
});

test('plant P15-R2: input CSV preserves other boundary whitespace that the parser trims', () => {
  // Leading tab/CR are intentionally excluded: existing spreadsheet guards
  // prefix those with an apostrophe. A trailing tab has no such guard.
  const labels = ['\u00a0A', 'A\u00a0', '\u2003A', 'A\u202f', '\vA', 'A\f', '\ufeffA', 'A\t'];
  for (const label of labels) {
    const { before, after } = roundTrip(`cluster,yi,vi\n"${label}",0.4,0.04\nA,0.6,0.04\nB,0.2,0.04\nC,0.3,0.04`);
    assert.equal(before.rows[0].cluster, label);
    assert.deepEqual(after.rows, before.rows, JSON.stringify(label));
  }
});

test('plant P15-R2: shared CSV cells quote boundary whitespace in headers and coefficient terms', () => {
  const res = inputs(E.parseStudies('cluster,yi,vi,dose\nA,0.4,0.04,1'));
  res.inputs.predictor_names = [' dose '];
  assert.equal(E.toInputCSV(res), 'cluster,yi,vi," dose "\r\nA,0.4,0.04,1\r\n');
  assert.equal(E.toCoefficientCSV({ coefficients: [
    { term: ' dose ', estimate: 1, se: 2, t: 3, df: 4, ci_lo: 5, ci_hi: 6, p: 7 }
  ] }), 'term,estimate,se,t,df,ci_lo,ci_hi,p\r\n" dose ",1,2,3,4,5,6,7\r\n');
});

test('control P15-R2: plain and internal-space labels keep their CSV and fit unchanged', () => {
  const text = 'cluster,yi,vi\nStudy A,0.4,0.04\nA,0.6,0.04\nB,0.2,0.04\nC,0.3,0.04';
  const { before, csv, after } = roundTrip(text);
  assert.equal(csv, text.replaceAll('\n', '\r\n') + '\r\n');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(RVE.fitCORR(after.rows, { rho: 0.8 }), RVE.fitCORR(before.rows, { rho: 0.8 }));
});

test('control P15-R2: comma, semicolon and double-quote escaping preserve rows and fit', () => {
  const text = 'cluster,yi,vi\n"A,B",0.4,0.04\n"A""B",0.6,0.04\n"A;B",0.2,0.04\nC,0.3,0.04';
  const { before, csv, after } = roundTrip(text);
  assert.deepEqual(before.rows.map(r => r.cluster), ['A,B', 'A"B', 'A;B', 'C']);
  assert.equal(csv, text.replaceAll('\n', '\r\n') + '\r\n');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(RVE.fitCORR(after.rows, { rho: 0.8 }), RVE.fitCORR(before.rows, { rho: 0.8 }));
});

test('control P15-R2: the parser still trims only unquoted boundary whitespace', () => {
  assert.deepEqual(E.splitLine(' A ," A " , A ', ',', 1), ['A', ' A ', 'A']);
});

test('control P15-R2: existing spreadsheet prefixes and quote escaping remain intact', () => {
  for (const [label, cell] of [
    ['=1+1', "'=1+1"],
    ['+SUM(1)', "'+SUM(1)"],
    ['@name', "'@name"],
    ['\tA', "'\tA"],
    ['\rA', '"\'\rA"'],
    ['=SUM(1,2)', '"\'=SUM(1,2)"'],
    ['+A"B', '"\'+A""B"']
  ]) {
    const res = { inputs: { predictor_names: [], rows: [{ cluster: label, yi: 0.4, vi: 0.04, x: [] }] } };
    assert.equal(E.toInputCSV(res), `cluster,yi,vi\r\n${cell},0.4,0.04\r\n`, JSON.stringify(label));
    assert.equal(E.toCoefficientCSV({ coefficients: [
      { term: label, estimate: 1, se: 2, t: 3, df: 4, ci_lo: 5, ci_hi: 6, p: 7 }
    ] }), `term,estimate,se,t,df,ci_lo,ci_hi,p\r\n${cell},1,2,3,4,5,6,7\r\n`, JSON.stringify(label));
  }
});
