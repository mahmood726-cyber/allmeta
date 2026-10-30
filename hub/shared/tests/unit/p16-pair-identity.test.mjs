import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, E, labels, plainLabels, rowsFor, plainSplit, detailMarkup, liveScript, json } from './p16-pair-identity-support.mjs';

for (const [kind, names] of [['plant', labels], ['control', plainLabels]]) {
  const rows = rowsFor(names), base = P.fitAll(E, rows, 'FE');
  const plain = P.fitAll(E, rowsFor(plainLabels), 'FE');
  test(`P16-R3 ${kind}: graph retains six pairs and each pair's study count and p-value`, () => {
    assert.equal(base.status, 'ok');
    assert.equal(base.nodeSplit.length, 6, 'the underlying engine already retains every split');
    const edges = P.graphEdges(base, rows);
    assert.equal(edges.length, 6);
    for (const e of edges) {
      assert.equal(e.k, 1);
      assert.equal(e.p, plainSplit([e.a, e.b], plain, names).p);
    }
    // A reversed duplicate contributes only to its own undirected edge.
    const r = rows[1], duplicate = { ...r, A: r.B, B: r.A, te: -r.te, study: 'duplicate' };
    const augmented = [...rows, duplicate].reverse();
    const more = P.graphEdges(P.fitAll(E, augmented, 'FE'), augmented);
    assert.equal(more.length, 6);
    assert.deepEqual(more.map(e => e.k).sort(), [1, 1, 1, 1, 1, 2]);
    assert.equal(more.find(e => e.a === r.A && e.b === r.B).k, 2);
  });
  test(`P16-R3 ${kind}: model comparison retains all six model-specific p-value triples`, () => {
    const actual = P.compare3(E, rows), expected = P.compare3(E, rowsFor(plainLabels));
    assert.equal(actual.status, 'ok');
    assert.equal(actual.splits.length, 6);
    // Labels may be identical; their numerical triples must still all survive.
    const values = c => c.splits.map(s => JSON.stringify([s.p, s.agree])).sort();
    assert.deepEqual(values(actual), values(expected));
    assert.equal(actual.nDisagree, expected.nDisagree);
  });
  test(`P16-R3 ${kind}: unchanged sensitivity fit has six p-values and no false flips`, () => {
    const d = P.summarizeDrop(base, base, 'unchanged', 0);
    assert.equal(Object.keys(d.splitP).length, 6);
    assert.deepEqual(json(d.splitFlips), []);
    assert.deepEqual(json(d.splitLost), []);
    // The page engine returns VM arrays; compare host arrays with the same values.
    assert.deepEqual(Object.values(d.splitP).sort(), Array.from(base.nodeSplit, s => s.p).sort());
  });
  test(`P16-R3 ${kind}: sensitivity marks a missing pair even if a namesake survives`, () => {
    const missing = base.nodeSplit.find(s => s.direct.mean === 1);
    assert.ok(missing.p < 0.05);
    const fit = { ...base, nodeSplit: base.nodeSplit.filter(s => s !== missing) };
    const d = P.summarizeDrop(base, fit, 'removed direct edge', 0);
    assert.deepEqual(json(d.splitLost), [missing.comparison]);
    assert.deepEqual(json(d.splitFlips), []);
    assert.equal(Object.values(d.splitP).filter(p => p === null).length, 1);
  });
  test(`P16-R3 ${kind}: detail table associates the full-data p with the correct pair`, () => {
    const html = detailMarkup(base);
    const rows = [...html.matchAll(/<tr><th scope="row">[\s\S]*?<\/tr>/g)];
    assert.equal(rows.length, 6);
    for (const [row] of rows) {
      const cells = [...row.matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);
      assert.equal(cells.at(-1), cells.at(-2), row);
    }
  });
  test(`P16-R3 ${kind}: R export addresses six independent split records`, () => {
    const script = P.buildRScript({ rows, base }, { date: '2026-10-29' });
    const lookups = [...script.matchAll(/^check\(".*?: direct", "rel", [^,]+, (.*)\)$/gm)].map(m => m[1]);
    assert.equal(lookups.length, 6);
    assert.equal(new Set(lookups).size, 6, 'different pairs must address different R records');
  });
  test(`P16-R3 ${kind}: live R validation addresses six independent split records`, () => {
    const script = liveScript(rows);
    const names = script.match(/^names_app <- (.*)$/m)[1];
    const keys = [...names.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m => JSON.parse(m[0]));
    assert.equal(keys.length, 6);
    assert.equal(new Set(keys).size, 6, 'live R membership must use pair identity, not display text');
  });
}

test('P16-R3 sparse network retains loop splits but correctly excludes a bridge', () => {
  const rows = [
    { A: 'A', B: 'B', te: 0.1, se: 0.2, study: 'AB' },
    { A: 'B', B: 'C', te: 0.2, se: 0.2, study: 'BC' },
    { A: 'A', B: 'C', te: 0.3, se: 0.2, study: 'AC' },
    { A: 'C', B: 'D', te: 0.4, se: 0.2, study: 'CD-bridge' },
  ];
  const fit = P.fitAll(E, rows, 'FE');
  assert.equal(fit.status, 'ok');
  assert.equal(fit.nodeSplit.length, 3);
  assert.doesNotThrow(() => liveScript(rows, 'FE'));
});

test('P16-R3 ambiguous identical display labels cannot exchange structural identities', () => {
  const rows = rowsFor(labels);
  assert.throws(() => liveScript(rows, 'FE', s => {
    const first = s.state.nodeSplit.findIndex((r, i, all) =>
      all.some((other, j) => j > i && other.comparison === r.comparison));
    assert.notEqual(first, -1, 'fixture must contain two different pairs with the same displayed label');
    const second = s.state.nodeSplit.findIndex((r, j) =>
      j > first && r.comparison === s.state.nodeSplit[first].comparison);
    assert.notEqual(second, -1);
    assert.notEqual(s.pairKeys[first], s.pairKeys[second]);
    [s.pairKeys[first], s.pairKeys[second]] = [s.pairKeys[second], s.pairKeys[first]];
  }), /Structural treatment-pair identity disagrees with (displayed comparison|input evidence)/);
});

test('P16-R3 serialised treatment-pair identities fail closed if absent, duplicated or forged', () => {
  const rows = rowsFor(labels);
  assert.throws(() => liveScript(rows, 'FE', s => { delete s.pairKeys; }),
    /Missing structural treatment-pair identity/);
  assert.throws(() => liveScript(rows, 'FE', s => { s.pairKeys[1] = s.pairKeys[0]; }),
    /Duplicate structural treatment-pair identity/);
  assert.throws(() => liveScript(rows, 'FE', s => { s.pairKeys[0] = 'not-json'; }),
    /Invalid structural treatment-pair identity/);
  assert.throws(() => liveScript(rows, 'FE', s => { s.pairKeys[0] = JSON.stringify(['A', 'not-a-treatment']); }),
    /Unknown structural treatment-pair identity/);
  // Both keys are valid and unique; swapping their assigned comparisons must
  // nevertheless refuse rather than publish a false R verification mapping.
  assert.throws(() => liveScript(rows, 'FE', s => {
    const first = s.pairKeys[0]; s.pairKeys[0] = s.pairKeys[1]; s.pairKeys[1] = first;
  }), /Structural treatment-pair identity disagrees with displayed comparison/);
});
