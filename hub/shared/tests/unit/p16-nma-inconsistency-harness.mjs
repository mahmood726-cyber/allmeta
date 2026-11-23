import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma-inconsistency/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).filter(s => s.includes('function fitNMA('));
assert.equal(scripts.length, 1, 'load the single shipped page engine, including run() and drawNS()');
const busSource = readFileSync(new URL('shared/ma-comparisons-v1.js', root), 'utf8');

// Tiny in-memory input/output sinks, not a browser or DOM implementation.
// Execute the entire engine script unchanged; its own run() handles policy,
// parsing, fitting, state export and plot generation. No copied estimator.
export function load({ engine = s => s, bus = s => s } = {}) {
  const elements = new Map(['src', 'f-model', 'btn-run', 'ns-body', 'ns-plot', 'dbt'].map(id => [id, {
    value: id === 'f-model' ? 'FE' : '', innerHTML: '', textContent: '',
    setAttribute() {}, addEventListener() {},
  }]));
  const c = { document: { getElementById: id => {
    assert.ok(elements.has(id), `unexpected engine element ${id}`);
    return elements.get(id);
  } } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(bus(busSource), c, { filename: 'shared/ma-comparisons-v1.js', timeout: 5000 });
  vm.runInContext(engine(scripts[0]), c, { filename: 'nma-inconsistency/index.html:inline-engine', timeout: 5000 });
  return {
    c, elements,
    run(rows, model) {
      const quote = x => '"' + String(x).replaceAll('"', '""') + '"';
      elements.get('f-model').value = model;
      c.__almIncoLoad(rows.map(r => [r.A, r.B, r.te, r.se, r.study].map(quote).join(',')).join('\n'));
      return JSON.parse(JSON.stringify(c._almLastInco()));
    },
    contrasts(studies, measure) {
      return Array.from(c.MaComparisons.toContrasts({ studies, effectMeasure: measure }),
        r => ({ A: r.treatment1, B: r.treatment2, te: r.te, se: r.se, study: r.study }));
    },
  };
}

export function replaceOnce(from, to) {
  return source => {
    assert.equal(source.split(from).length - 1, 1, `plant must match once: ${from}`);
    return source.replace(from, to);
  };
}

export const TOL = 1e-6;
export function near(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= TOL,
    `${label}: app=${actual}, R=${expected}, abs delta=${Math.abs(actual - expected)}, tolerance=${TOL}`);
}

export function compareFit(actual, expected) {
  assert.notEqual(actual.status, 'refused', actual.reason);
  assert.equal(actual.model, expected.model);
  assert.deepEqual(actual.trts, expected.trts);
  assert.equal(actual.df, expected.df);
  for (const key of ['tau2', 'Q', 'Qrandom']) near(actual[key], expected[key], key);
  for (const field of ['estimates', 'estimatesRandom']) {
    assert.deepEqual(Object.keys(actual[field]).sort(), Object.keys(expected[field]).sort(), field);
    for (const t of expected.trts) for (const key of ['est', 'se']) {
      near(actual[field][t][key], expected[field][t][key], `${field}.${t}.${key}`);
    }
  }
  assert.deepEqual(actual.nodeSplit.map(s => s.comparison).sort(), expected.nodeSplit.map(s => s.comparison).sort(), 'split membership');
  for (const ref of expected.nodeSplit) {
    const a = actual.nodeSplit.find(s => s.comparison === ref.comparison);
    for (const group of ['direct', 'indirect']) for (const key of ['mean', 'se']) {
      near(a[group][key], ref[group][key], `${ref.comparison}.${group}.${key}`);
    }
    for (const key of ['diff', 'seDiff', 'z', 'p']) near(a[key], ref[key], `${ref.comparison}.${key}`);
  }
  assert.equal(actual.dbt.df, expected.dbt.df, 'dbt.df');
  near(actual.dbt.Q, expected.dbt.Q, 'dbt.Q');
  if (expected.dbt.p === null) assert.equal(actual.dbt.p, null, 'dbt.p unavailable');
  else near(actual.dbt.p, expected.dbt.p, 'dbt.p');
}

export function comparePlot(h, actual, expected) {
  // Decode the shipped renderer's whiskers on an axis defined solely by R's
  // CI endpoints and the page's fixed plot dimensions. This detects changes
  // to both the limits and the axis; it does not reuse the app's Z975.
  const limits = expected.nodeSplit.flatMap(s => ['direct', 'indirect'].flatMap(g => [s.ci[g].lower, s.ci[g].upper]));
  const lo = Math.min(0, ...limits) - 0.3, hi = Math.max(0, ...limits) + 0.3;
  const lines = [...h.elements.get('ns-plot').innerHTML.matchAll(/<line\b([^>]+)>/g)]
    .map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]])))
    .filter(a => a['stroke-width'] === '1.3');
  assert.equal(lines.length, expected.nodeSplit.length * 2, 'direct and indirect whisker counts');
  actual.nodeSplit.forEach((s, i) => {
    const ref = expected.nodeSplit.find(r => r.comparison === s.comparison);
    ['direct', 'indirect'].forEach((group, j) => {
      const line = lines[2 * i + j];
      for (const [attr, end] of [['x1', 'lower'], ['x2', 'upper']]) {
        near(lo + (Number(line[attr]) - 120) / 450 * (hi - lo), ref.ci[group][end], `${s.comparison}.${group}.CI.${end}`);
      }
    });
  });
}
