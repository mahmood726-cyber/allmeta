import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const inputBytes = readFileSync(new URL('./p10-forest-input.json', import.meta.url));
const input = JSON.parse(inputBytes);
// Execute the page's own parser, estimators and renderer, ending before UI wiring.
const start = html.indexOf('    var Z975 =');
const end = html.indexOf("    document.getElementById('btn-run').addEventListener", start);
assert.ok(start >= 0 && end > start, 'production script boundaries exist');

function app() {
  const forest = { innerHTML: '', setAttribute() {} };
  const context = vm.createContext({
    window: { alm: { analysisLifecycle: fn => fn } },
    document: { getElementById(id) { assert.equal(id, 'forest'); return forest; } }
  });
  vm.runInContext(html.slice(start, end), context, { filename: 'mh-peto/index.html' });
  return { context, forest };
}

function render(studies, pooled = [], measure = 'OR', axis = {}) {
  const { context, forest } = app();
  context._axisState = axis;
  context.drawForest(studies, pooled, measure);
  return forest.innerHTML;
}

const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9,
  `${label}: actual=${actual}, expected=${expected}`);
const boxes = svg => [...svg.matchAll(/<rect x="([^"]+)"/g)].map(m => Number(m[1]) + 3.5);
const intervals = svg => [...svg.matchAll(/<line x1="([^"]+)"[^>]+x2="([^"]+)"[^>]+stroke-width="1.2"/g)]
  .map(m => [Number(m[1]), Number(m[2])]);
function finiteSvg(svg) {
  assert.doesNotMatch(svg, /(?:NaN|Infinity)/, 'SVG must contain finite coordinates');
  assert.match(svg, /class="forest-axis"/, 'axis remains available');
}
function expectedX(studies, pooled = [], log = true, limits) {
  const map = log ? Math.log : v => v;
  const valid = [...studies, ...pooled.filter(Boolean)].flatMap(s => [s.lo, s.est, s.hi])
    .filter(v => Number.isFinite(v) && (!log || v > 0)).map(map);
  const lo = limits ? map(limits[0]) : Math.min(...valid);
  const hi = limits ? map(limits[1]) : Math.max(...valid);
  const pad = (hi - lo) * 0.1 || 0.3;
  return v => 130 + (map(v) - lo + pad) / (hi - lo + 2 * pad) * 440;
}
function geometry(svg, studies, pooled = [], log = true, limits) {
  finiteSvg(svg);
  const x = expectedX(studies, pooled, log, limits), centers = boxes(svg), cis = intervals(svg);
  assert.equal(centers.length, studies.length);
  assert.equal(cis.length, studies.length);
  studies.forEach((s, i) => {
    near(centers[i], x(s.est), `study ${i} point`);
    near(cis[i][0], x(s.lo), `study ${i} lower CI`);
    near(cis[i][1], x(s.hi), `study ${i} upper CI`);
  });
  const diamonds = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m => m[1].split(' ').map(p => Number(p.split(',')[0])));
  const drawable = pooled.filter(p => p && [p.lo, p.est, p.hi].every(v => Number.isFinite(v) && (!log || v > 0)));
  assert.equal(diamonds.length, drawable.length);
  drawable.forEach((p, i) => [p.lo, p.est, p.hi, p.est].forEach((v, j) => near(diamonds[i][j], x(v), `pooled ${i} vertex ${j}`)));
  for (const m of svg.matchAll(/<text class="forest-tick-label" x="([^"]+)"[^>]*>([^<]+)<\/text>/g)) {
    near(Number(m[1]), x(Number(m[2])), 'tick aligns with data');
  }
}

function tinyForest(measure, plantFloor = false) {
  // The original OR fixture gives a second RR of 1.25e-6. Double n1 for
  // this RR rendering case so both points exercise the stated below-floor requirement.
  const csv = measure === 'RR' ? 'A,1,4000000,80,100\nB,2,4000000,80,100' : input.tiny;
  const { context, forest } = app(), rows = context.parse(csv), studies = context.perStudy(rows, measure);
  const pooled = [Object.assign({ name: 'MH' }, measure === 'OR' ? context.mhOR(rows) : context.mhRR(rows))];
  if (measure === 'OR') pooled.push(Object.assign({ name: 'Peto' }, context.peto(rows)));
  assert.equal(studies.length, 2);
  assert.ok(studies.every(s => s.est > 0 && s.est < 1e-6));
  if (plantFloor) {
    const source = context.drawForest.toString();
    const map = 'var mapFn = function (v) { return logScale ? Math.log(v) : v; };';
    assert.equal(source.split(map).length, 2, 'locate exactly one production mapper');
    const historical = 'var mapFn = function (v) { return logScale ? Math.log(Math.max(v, 1e-6)) : v; };';
    vm.runInContext('drawForest = ' + source.replace(map, historical) + ';', context);
  }
  context.drawForest(studies, pooled, measure);
  const svg = forest.innerHTML, centers = boxes(svg);
  assert.ok(centers[0] < centers[1], `distinct ratios require ordered boxes: ${centers}`);
  geometry(svg, studies, pooled);
}

for (const measure of ['OR', 'RR']) {
  test(`P10-R4 plant: default ${measure} forest separates finite ratios below 1e-6`, () => {
    tinyForest(measure);
  });
}

test('P10-R4 control: OR and RR regressions reject the historical log floor', () => {
  for (const measure of ['OR', 'RR']) {
    assert.throws(() => tinyForest(measure, true), {
      name: 'AssertionError', code: 'ERR_ASSERTION', message: /^distinct ratios require ordered boxes:/
    });
  }
});

test('P10-R4 plant: log axis overrides below 1e-6 use the actual limits', () => {
  const { context } = app(), studies = context.perStudy(context.parse(input.tiny), 'OR');
  const x = [1e-9, 1e-5];
  geometry(render(studies, [], 'OR', { x, xLog: true }), studies, [], true, x);
});

test('P10-R4 plant: zero and undefined log endpoints do not become finite intervals', () => {
  for (const endpoint of [0, null, undefined, NaN, Infinity, -1]) {
    const studies = [{ label: 'Incomplete CI', est: 0.5, lo: endpoint, hi: 2 }];
    const svg = render(studies);
    finiteSvg(svg);
    assert.equal(boxes(svg).length, 1, 'retain the finite study estimate');
    assert.equal(intervals(svg).length, 0, 'omit a CI with an unplottable endpoint');
    assert.match(svg, /CI unavailable on this scale/);
  }
});

test('P10-R4 plant: unplottable estimates are labelled without fabricated glyphs', () => {
  const studies = [{ label: 'Zero', est: 0, lo: 0, hi: 0 }, { label: 'Undefined', est: null, lo: undefined, hi: NaN }];
  const pooled = [{ name: 'Peto', est: 0, lo: 0, hi: 0 }];
  const svg = render(studies, pooled);
  finiteSvg(svg);
  assert.equal(boxes(svg).length, 0);
  assert.equal(intervals(svg).length, 0);
  assert.doesNotMatch(svg, /<polygon/);
  assert.equal((svg.match(/Estimate unavailable on this scale/g) || []).length, 3);
});

test('P10-R4 plant: subnormal positive ratios retain finite ordered positions and ticks', () => {
  const v = Number.MIN_VALUE;
  const studies = [{ label: 'A', lo: v, est: 2 * v, hi: 4 * v }, { label: 'B', lo: 4 * v, est: 8 * v, hi: 16 * v }];
  const svg = render(studies);
  assert.ok(boxes(svg)[0] < boxes(svg)[1]);
  geometry(svg, studies);
});

for (const measure of ['OR', 'RR', 'RD']) {
  test(`P10-R4 control: ordinary ${measure} point, interval, pooled and tick geometry`, () => {
    const { context } = app(), rows = context.parse(input.ordinary), studies = context.perStudy(rows, measure);
    const estimate = { OR: context.mhOR, RR: context.mhRR, RD: context.mhRD }[measure](rows);
    const pooled = [Object.assign({ name: 'MH' }, estimate)];
    geometry(render(studies, pooled, measure), studies, pooled, measure !== 'RD');
  });
}

test('P10-R4 control: linear ratio override preserves distinct tiny values', () => {
  const { context } = app(), studies = context.perStudy(context.parse(input.tiny), 'OR');
  geometry(render(studies, [], 'OR', { xLog: false }), studies, [], false);
});

test('P10-R4 control: per-study values agree with the recorded native R oracle', () => {
  const ref = JSON.parse(readFileSync(new URL('./p10-forest-reference.json', import.meta.url), 'utf8'));
  for (const key of ['R', 'metafor', 'jsonlite']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.deepEqual(ref.input, input);
  const { context } = app();
  for (const [name, csv] of Object.entries(input)) for (const measure of ['OR', 'RR', 'RD']) {
    const studies = context.perStudy(context.parse(csv), measure);
    studies.forEach((s, i) => {
      const r = ref.cases[name][measure][i], transform = measure === 'RD' ? v => v : Math.log;
      assert.equal(s.label, r.label);
      for (const [actual, expected] of [[s.est, r.yi], [s.lo, r.lo], [s.hi, r.hi]]) near(transform(actual), expected, `${name} ${measure}`);
    });
  }
});
