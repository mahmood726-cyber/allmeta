import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harness } from './p03-results-harness.mjs';

const inputBytes = readFileSync(new URL('./p03-diagnostics-input.csv', import.meta.url));
const rows = inputBytes.toString().trim().split(/\r?\n/).slice(1).map(line => {
  const [study, ...counts] = line.split(',');
  const [tp, fp, fn, tn] = counts.map(Number);
  return { study, tp, fp, fn, tn };
});
const data = rows => rows.map(r => [r.study, r.tp, r.fp, r.fn, r.tn].join(', ')).join('\n');
const r6 = v => +v.toFixed(6), r10 = v => +v.toPrecision(10);
const referencePath = new URL('./p03-diagnostics-reference.json', import.meta.url);
const reference = () => JSON.parse(readFileSync(existsSync(referencePath) ? referencePath : join(tmpdir(), 'p03-f1-reference.json'), 'utf8'));
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${label}: ${a} vs ${b}`);
function expectedDeeks(h) {
  const d = h.context.__almDeeks();
  assert.ok(d && Number.isFinite(d.p), 'the displayed Deeks test is available');
  return Object.fromEntries(['slope', 'intercept', 't', 'df', 'p'].map(k => [k, r10(d[k])]));
}
function expectedFagan(h) {
  const b = h.context.__almBivariate();
  const f = h.context.AlmDTABivariate.fagan(b.lrPos, b.lrNeg, 0.20);
  return { pre_prob: r6(f.preProb), post_pos: r6(f.postPos), post_neg: r6(f.postNeg) };
}

test('P03-R1 control: fitted summaries and study rows still match the displayed analysis', async () => {
  const h = harness(), out = JSON.parse((await h.download('json')).text);
  const b = h.context.__almBivariate();
  assert.equal(out._schema, 'dta-sroc-results-v2');
  assert.equal(out.k, rows.length);
  assert.deepEqual(out.rows.map(r => ({ study: r.study, tp: r.TP, fp: r.FP, fn: r.FN, tn: r.TN })), rows);
  for (const [key, value] of Object.entries({ sens: b.sens, spec: b.spec, lr_pos: b.lrPos, lr_neg: b.lrNeg, dor: b.dor })) {
    assert.equal(out.bivariate[key], r6(value), key);
  }
  assert.equal(out.bivariate.mu_logit_se, r10(b.muLogitSe));
  assert.equal(out.bivariate.mu_logit_fpr, r10(b.muLogitFPR));
});

test('P03-R1 plant: downloaded JSON includes the displayed Deeks inference', async () => {
  const h = harness(), expected = expectedDeeks(h);
  assert.ok(h.nodes.get('stats-wrap').innerHTML.includes(h.context.__almDeeks().p.toFixed(3)));
  assert.ok(h.nodes.get('deeks-host').innerHTML.includes('Deeks p = ' + h.context.__almDeeks().p.toFixed(3)));
  const out = JSON.parse((await h.download('json')).text);
  assert.ok(out.deeks, 'displayed Deeks inference must be exported');
  assert.deepEqual(out.deeks, expected);
});

test('P03-R1 plant: downloaded JSON includes the displayed Fagan probabilities', async () => {
  const h = harness(), expected = expectedFagan(h);
  const svg = h.nodes.get('fagan-host').innerHTML;
  assert.ok(svg.includes('pre 20%'));
  assert.ok(svg.includes('+test ' + (expected.post_pos * 100).toFixed(0) + '%'));
  assert.ok(svg.includes('−test ' + (expected.post_neg * 100).toFixed(0) + '%'));
  const out = JSON.parse((await h.download('json')).text);
  assert.ok(out.fagan, 'displayed Fagan probabilities must be exported');
  assert.deepEqual(out.fagan, expected);
});

test('P03-R1 plant: Fagan export is available without drawing the nomogram', () => {
  const h = harness({ faganHost: false });
  assert.deepEqual(h.result().fagan, expectedFagan(h));
});

for (const action of ['csv', 'md', 'report-md', 'report-txt']) {
  test(`P03-R1 plant: ${action} download includes both diagnostic objects`, async () => {
    const h = harness(), out = await h.download(action);
    for (const [group, values] of Object.entries({ deeks: expectedDeeks(h), fagan: expectedFagan(h) })) {
      for (const [key, value] of Object.entries(values)) {
        const line = out.text.split(/\r?\n/).find(line => line.includes(`${group}.${key}`));
        assert.ok(line, `${action} must include ${group}.${key}`);
        assert.ok(line.includes(String(value)), `${group}.${key} must match the analysis`);
      }
    }
  });
}

test('P03-R1 plant: diagnostics follow changed data and estimation method', async () => {
  const h = harness();
  const before = expectedFagan(h), deeksBefore = expectedDeeks(h);
  h.restore({ data: data(rows.map((r, i) => ({ ...r, fp: r.fp + i * 3 }))), method: 'fixed' });
  assert.notDeepEqual(expectedFagan(h), before);
  assert.notDeepEqual(expectedDeeks(h), deeksBefore);
  const out = JSON.parse((await h.download('json')).text);
  assert.equal(out.bivariate.method, 'fixed');
  assert.deepEqual(out.deeks, expectedDeeks(h));
  assert.deepEqual(out.fagan, expectedFagan(h));
});

test('P03-R1 plant: unavailable diagnostics are explicit nulls after clearing the analysis', () => {
  const h = harness();
  h.restore({ data: '' });
  const out = h.result();
  assert.equal(out.bivariate, null);
  assert.equal(h.nodes.get('fagan-host').innerHTML, '');
  assert.equal(h.nodes.get('deeks-host').innerHTML, '');
  assert.equal(out.deeks, null);
  assert.equal(out.fagan, null);
});

test('P03-R1 control: stale and invalid results still refuse downloads', async () => {
  const h = harness();
  h.nodes.get('f-data').value = data(rows.slice(0, 3));
  await assert.rejects(h.download('json'), /No valid results to export/);
  h.restore({ data: '' });
  await assert.rejects(h.download('json'), /No valid results to export/);
});

test('P03-R1 control: fresh R fixture records exact inputs and R/stats versions', () => {
  const ref = reference();
  assert.deepEqual(ref.rows, rows);
  // The retained oracle hashes LF bytes, independent of checkout line endings.
  assert.equal(ref.provenance.input_md5, createHash('md5').update(inputBytes.toString().replace(/\r\n/g, '\n')).digest('hex'));
  for (const key of ['R', 'stats', 'script']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
});

test('P03-R1 control: ordinary Deeks inference agrees with fresh R weighted regression', () => {
  const h = harness(), actual = h.context.__almDeeks();
  for (const [key, value] of Object.entries(reference().deeks)) near(actual[key], value, 1e-9, key);
});

test('P03-R1 control: Fagan calculation agrees with fresh R Bayes probabilities', () => {
  const h = harness();
  for (const ref of reference().fagan) {
    const actual = h.context.AlmDTABivariate.fagan(ref.lr_pos, ref.lr_neg, ref.pre_prob);
    near(actual.preProb, ref.pre_prob, 1e-14, 'preProb');
    near(actual.postPos, ref.post_pos, 1e-14, 'postPos');
    near(actual.postNeg, ref.post_neg, 1e-14, 'postNeg');
  }
});
