import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEngine, near, checkSummary, checkRows, checkEvalue } from './p20-engine.mjs';

const dir = new URL('../r/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const input = read('p20-input.json');
const ref = read('p20-reference.json');
// Read the EValue oracle inside its own assertions. A missing
// oracle must fail its tests without preventing the metafor tests from running.
const readEvalue = () => read('p20-evalue-reference.json');
const engine = loadEngine();
const md5 = name => createHash('md5').update(readFileSync(new URL(name, dir))).digest('hex');

function checkProvenance(reference) {
  assert.match(reference.provenance.R, /^R version /);
  for (const version of Object.values(reference.provenance.packages)) assert.match(version, /^\d+\./);
  assert.equal(reference.provenance.tolerance, 1e-6);
  assert.equal(reference.provenance.input_md5, md5('p20-input.json'));
  assert.equal(reference.provenance.script_md5, md5(reference.provenance.script));
}

test('P20 provenance control: native R versions, source hashes and complete input coverage', () => {
  checkProvenance(ref);
  for (const group of ['means', 't', 'f', 'wald', 'convert']) {
    assert.deepEqual(ref[group].map(c => c.input), input[group], group);
    assert.ok(ref[group].length >= 4, group);
  }
});

test('P20 EValue provenance control: native R versions, source hashes and complete input coverage', () => {
  const ev = readEvalue();
  checkProvenance(ev);
  assert.deepEqual(ev.cases.map(c => c.input), input.evalue);
  const source = ev.provenance.EValue_source;
  if (source.mode !== 'installed namespace') {
    assert.equal(source.mode, 'unmodified pinned package source; not an installed namespace');
    assert.equal(ev.provenance.packages.EValue, '4.1.4');
    assert.equal(source.revision, '44c2dc41ce49444619bc2d97c16d87c7caef6f07');
    assert.equal(source.origin, `https://raw.githubusercontent.com/cran/EValue/${source.revision}/`);
    assert.deepEqual(Object.keys(source.md5), ['DESCRIPTION', 'R/EValue.R', 'R/effect_measures.R', 'R/utils.R']);
    for (const hash of Object.values(source.md5)) assert.match(hash, /^[a-f0-9]{32}$/);
  }
});

for (const group of ['means', 't', 'f']) for (const c of ref[group]) {
  test(`P20 ${group}: ${c.id} estimate, LS variance, exact J and 95% CI match metafor`, () => {
    const p = c.input, a = engine.accuracy;
    const got = group === 'means' ? a.fromMeans(p.m1, p.sd1, p.n1, p.m2, p.sd2, p.n2)
      : group === 't' ? a.fromT(p.t, p.n1, p.n2) : a.fromF(p.f, p.n1, p.n2, p.sign);
    checkSummary(got, c.expected, c.id);
    const ci = engine.withCI({ scale: "SMD (Hedges' g)", point: got.g, se: got.se });
    near(ci.lo, c.expected.lo, `${c.id}.lo`);
    near(ci.hi, c.expected.hi, `${c.id}.hi`);
  });
}

for (const c of ref.wald) {
  test(`P20 Wald: ${c.id} actual deriveSE and 95% CI match conv.wald`, () => {
    const se = engine.derive(c.input, c.supplied);
    near(se, c.expected.se, `${c.id}.se`);
    near(se ** 2, c.expected.vi, `${c.id}.vi`);
    const row = engine.withCI({ scale: c.input.type, point: c.input.est, se });
    near(row.lo, c.expected.lo, `${c.id}.lo`);
    near(row.hi, c.expected.hi, `${c.id}.hi`);
  });
}

for (const c of ref.convert) {
  test(`P20 conversion: ${c.id} every point, SE and 95% CI matches R`, () => {
    checkRows(engine.convert(c.input), c.expected, c.id);
  });
}

for (const inputCase of input.evalue) {
  // P20-R1: observed FAIL against native R when both CI bounds are missing.
  // CXTASK requires retaining the assertion as TODO without changing the app or oracle.
  const options = inputCase.id === 'rr-missing-ci'
    ? { todo: 'P20-R1: shared/evalue.js defaults missing-CI E-value to 1; EValue returns NA (JSON null)' }
    : {};
  test(`P20 EValue: ${inputCase.id} point, nearest-null CI and RR endpoints match R`, options, () => {
    const c = readEvalue().cases.find(c => c.id === inputCase.id);
    assert.ok(c, `Missing EValue oracle case ${inputCase.id}`);
    assert.deepEqual(c.input, inputCase);
    const p = c.input;
    checkEvalue(engine.evalue.eValues(p.type, p.est, p.lo, p.hi, { rare: p.rare }), c.expected, c.id);
  });
}

test('P20 domain controls: invalid sample sizes and directionless F stay refused', () => {
  for (const n of [1, 2.5, Infinity]) assert.throws(() => engine.accuracy.fromT(2, n, 10), /group sizes/);
  assert.throws(() => engine.accuracy.fromF(4, 10, 10, 0), /direction/);
  assert.throws(() => engine.accuracy.fromF(-1, 10, 10, 1), /nonnegative/);
  assert.throws(() => engine.accuracy.fromMeans(1, 0, 10, 0, 1, 10), /strictly positive/);
});

test('P20 domain controls: degenerate Wald inputs stay refused', () => {
  for (const p of [0, 1, -0.1]) assert.throws(() => engine.derive({ type: 'OR', est: 2 }, { p }), /between 0 and 1/);
  assert.throws(() => engine.derive({ type: 'OR', est: 1 }, { p: .05 }), /absolute Wald effect/);
  assert.throws(() => engine.derive({ type: 'OR', est: 2 }, { lo: 1 }), /both CI bounds/);
});
