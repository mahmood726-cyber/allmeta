import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const require = createRequire(import.meta.url);
const B = require(new URL('shared/dta-bivariate.js', root).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const reference = JSON.parse(readFileSync(new URL('dta-sroc/tests/fixtures/deeks-reference.json', root), 'utf8'));
const byId = Object.fromEntries(reference.cases.map(c => [c.id, c]));

function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${label}: JS ${actual}, R ${expected}`);
}

for (const id of ['constant100', 'constant150', 'constantUnequalGroups', 'constantAfterCorrection', 'nearConstant']) {
  test(`P03-R1 plant: ${id} refuses an R-aliased Deeks slope`, () => {
    const c = byId[id];
    assert.equal(c.rank, 1);
    assert.equal(c.slopeAliased, true);
    assert.equal(c.expected, null);
    assert.equal(B.deeksTest(c.rows), null);
    assert.equal(B.deeksTest(c.rows.toReversed()), null, 'row order cannot restore rank');
  });
}

for (const id of ['ordinary', 'ordinaryZeroCell', 'closeEstimable']) {
  test(`P03-R1 control: ${id} matches fresh R weighted regression`, () => {
    const c = byId[id];
    assert.equal(c.rank, 2);
    assert.equal(c.slopeAliased, false);
    const actual = B.deeksTest(c.rows);
    assert.ok(actual);
    assert.equal(actual.df, c.expected.df);
    for (const key of ['slope', 'intercept', 't', 'p']) close(actual[key], c.expected[key], `${id}.${key}`);
    assert.equal(actual.x.length, c.rows.length);
    assert.equal(actual.y.length, c.rows.length);
  });
}

test('P03-R1 control: fewer than three studies has no slope inference', () => {
  for (let n = 0; n < 3; n++) assert.equal(B.deeksTest(byId.ordinary.rows.slice(0, n)), null);
});

// Run the real page's parser, analysis and render functions with a small DOM.
// Only browser setup/event registration (after Initial load) and the lifecycle
// wrapper are omitted; no statistical or rendering function is stubbed.
function pageHarness() {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', textContent: '',
      classList: { add() {}, remove() {} }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById },
    localStorage: { setItem() {} },
    matchMedia: () => ({ matches: false }),
    AlmDTABivariate: B,
    window: { AlmDTABivariate: B, alm: { analysisLifecycle: render => render } }
  });
  const html = readFileSync(new URL('dta-sroc/index.html', root), 'utf8');
  const start = html.indexOf('(function () {');
  const end = html.indexOf('    // Initial load', start);
  assert.ok(start >= 0 && end > start, 'page harness boundaries exist');
  vm.runInContext(html.slice(start, end) + '\n})();', context, { filename: 'dta-sroc/index.html' });
  return {
    window: context.window,
    html: id => getElementById(id).innerHTML,
    render(rows) {
      context.window.__almRestore({
        data: rows.map((r, i) => `Study ${i + 1}, ${r.tp}, ${r.fp}, ${r.fn}, ${r.tn}`).join('\n'),
        method: 'reml', cc: 'all', cov: '', title: 'Deeks regression test'
      });
    }
  };
}

for (const id of ['constant100', 'constant150']) {
  test(`P03-R1 render plant: ${id} shows unavailable while the pooled fit stays valid`, () => {
    const page = pageHarness();
    page.render(byId[id].rows);
    assert.ok(Number.isFinite(page.window.__almBivariate()?.sens), 'real pooled fit is valid');
    assert.match(page.html('deeks-host'), /Deeks.*unavailable/i);
    assert.doesNotMatch(page.html('deeks-host'), /<svg|Deeks p =|NaN|Infinity/);
    assert.doesNotMatch(page.html('stats-wrap'), /Deeks(?:'|&apos;) test p/);
    assert.equal(page.window.__almDeeks(), null);
    assert.ok(page.window.__almResults().bivariate, 'pooled export remains available');
  });
}

test('P03-R1 render control: ordinary data retains its Deeks p-value and funnel', () => {
  const page = pageHarness();
  page.render(byId.ordinary.rows);
  const p = byId.ordinary.expected.p.toFixed(3);
  assert.ok(page.window.__almBivariate());
  assert.ok(page.window.__almDeeks());
  assert.match(page.html('deeks-host'), /<svg/);
  assert.ok(page.html('deeks-host').includes(`Deeks p = ${p}`));
  assert.match(page.html('stats-wrap'), /Deeks(?:'|&apos;) test p/);
  assert.doesNotMatch(page.html('deeks-host'), /unavailable|NaN|Infinity/i);
});

test('P03-R1 render plant: ordinary to constant to ordinary clears and restores Deeks inference', () => {
  const page = pageHarness();
  page.render(byId.ordinary.rows);
  assert.ok(page.window.__almDeeks());
  page.render(byId.constant150.rows);
  assert.match(page.html('deeks-host'), /Deeks.*unavailable/i);
  assert.equal(page.window.__almDeeks(), null);
  assert.doesNotMatch(page.html('deeks-host'), /<svg|Deeks p =/);
  page.render(byId.ordinary.rows);
  close(page.window.__almDeeks().p, byId.ordinary.expected.p, 'restored p');
  assert.match(page.html('deeks-host'), /<svg/);
  assert.doesNotMatch(page.html('deeks-host'), /unavailable/i);
});
