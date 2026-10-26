import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('multilevel-ma/index.html', root), 'utf8');
const source = html.slice(html.indexOf('    function parse(text)'), html.indexOf('    function drawForest('));
const fixture = clusters => Array.from({ length: clusters }, (_, i) =>
  `${i + 1}, ${i % 2 ? 0.4 : -0.2}, 0.1, A\n${i + 1}, ${i % 2 ? 0.5 : -0.1}, 0.15, B`).join('\n');

function harness(input = fixture(2), { quantiles = true, engine = true } = {}) {
  const elements = Object.fromEntries(['src', 'summary', 'body', 'analysis-stale', 'analysis-status']
    .map(id => [id, { value: input, hidden: true, innerHTML: '' }]));
  const context = vm.createContext({ document: { getElementById: id => elements[id] } });
  context.window = context;
  context.alm = { analysisLifecycle: fn => fn };
  if (quantiles) vm.runInContext(readFileSync(new URL('shared/stats-qt.js', root), 'utf8'), context);
  if (engine) vm.runInContext(readFileSync(new URL('shared/multilevel-reml.js', root), 'utf8'), context);
  vm.runInContext(`var Z975 = 1.959963984540054; function drawForest() {}\n${source}`, context);
  const run = input => {
    if (input !== undefined) elements.src.value = input;
    vm.runInContext('run()', context);
    return elements.summary.innerHTML;
  };
  run();
  return { context, run, get summary() { return elements.summary.innerHTML; },
    get block() { return elements.summary.innerHTML.split('<caption style=')[1] || ''; } };
}

function interval(block, label) {
  const row = block.match(new RegExp('<tr><td>' + label + '</td><td colspan="2">\\[([^,]+), ([^\\]]+)\\]</td></tr>'));
  assert.ok(row, `missing REML interval: ${label}`);
  return row.slice(1).map(Number);
}
function expectBounds(actual, mu, halfWidth) {
  assert.deepEqual(actual, [Number((mu - halfWidth).toFixed(3)), Number((mu + halfWidth).toFixed(3))]);
}

test('J=2 REML adds a t CI using cluster df, alongside the unchanged z CI', () => {
  const h = harness(), r = h.context.__almReml();
  const ci = interval(h.block, '95% CI \\(t<sub>1</sub>, approximate\\)');
  expectBounds(ci, r.mu, 12.7062047361747 * r.se);
  expectBounds(interval(h.block, '95% CI \\(z\\)'), r.mu, 1.959963984540054 * r.se);
  assert.ok((ci[1] - ci[0]) / (r.ciHi - r.ciLo) > 6);
});

test('REML PI predicts a true effect in a new study using BOTH variance components', () => {
  const h = harness('A, -1.5, 0.1\nA, -0.5, 0.1\nB, 1.5, 0.1\nB, 2.5, 0.1');
  const r = h.context.__almReml();
  assert.ok(r.sigma2Between > 0.1 && r.sigma2Within > 0.1);
  const pi = interval(h.block, '95% prediction interval \\(t<sub>1</sub>, plug-in\\)');
  expectBounds(pi, r.mu, 12.7062047361747 * Math.sqrt(r.se ** 2 + r.sigma2Between + r.sigma2Within));
  assert.match(h.block, /true effect in a new study/);
  assert.match(h.block, /uncertainty in the estimated variance components/);
  assert.match(h.block, /not cluster-robust/);
});

test('zero heterogeneity control: REML PI equals the approximate t CI', () => {
  const h = harness('A, 0.2, 0.1\nA, 0.2, 0.1\nB, 0.2, 0.1\nB, 0.2, 0.1');
  assert.deepEqual(interval(h.block, '95% prediction interval \\(t<sub>1</sub>, plug-in\\)'),
    interval(h.block, '95% CI \\(t<sub>1</sub>, approximate\\)'));
});

test('small-J warning is in the REML block and updates at the 10-cluster boundary', () => {
  const h = harness();
  for (const j of [2, 9]) {
    h.run(fixture(j));
    assert.match(h.block, new RegExp('Small-cluster warning: J = ' + j));
    assert.match(h.block, /descriptive/);
    assert.match(h.block, /fragile/);
  }
  h.run(fixture(10));
  assert.doesNotMatch(h.block, /Small-cluster warning/);
  const r = h.context.__almReml();
  expectBounds(interval(h.block, '95% CI \\(t<sub>9</sub>, approximate\\)'), r.mu, 2.2621571628541 * r.se);
  h.run(fixture(2));
  assert.match(h.block, /Small-cluster warning: J = 2/);
});

test('one-cluster input discloses unavailable t CI and PI without inventing df', () => {
  const h = harness('A, 0.1, 0.1\nA, 0.2, 0.1\nA, 0.3, 0.1');
  assert.match(h.block, /Small-cluster warning: J = 1/);
  assert.match(h.block, /t CI and prediction interval unavailable: at least two study clusters are required/);
  assert.doesNotMatch(h.block, /t<sub>|NaN|Infinity/);
  interval(h.block, '95% CI \\(z\\)');
});

test('missing quantile dependency discloses unavailability; no normal fallback labelled t', () => {
  const h = harness(fixture(2), { quantiles: false });
  assert.match(h.block, /t CI and prediction interval unavailable: Student-t quantiles could not be computed/);
  assert.doesNotMatch(h.block, /t<sub>|NaN|Infinity/);
  interval(h.block, '95% CI \\(z\\)');
});

test('control: REML estimates and normal CI retain the engine output', () => {
  const h = harness();
  const rows = h.context.__almMlmaParse(fixture(2)).map(r => ({ cluster: r.study, y: r.te, v: r.se ** 2 }));
  assert.deepEqual(h.context.__almReml(), h.context.AlmMultilevelREML.fit(rows));
  expectBounds(interval(h.block, '95% CI \\(z\\)'), h.context.__almReml().mu,
    1.959963984540054 * h.context.__almReml().se);
});

test('control: unavailable REML engine leaves the MoM display working', () => {
  const h = harness(fixture(2), { engine: false });
  assert.match(h.summary, /Method of moments/);
  assert.equal(h.context.__almReml(), null);
  assert.equal(h.block, '');
});
