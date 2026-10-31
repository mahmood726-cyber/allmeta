import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const html = read('nma/index.html');

function report(effect, scale = 'log') {
  const fields = Object.fromEntries(Object.entries({
    data: `One,A,B,${effect},0.1\nTwo,A,B,0.2,0.1`, ref: 'A', model: 'fe',
    ci: 'classic', dir: 'desirable', scale, title: '', example: 'generic',
  }).map(([key, value]) => ['f-' + key, { value }]));
  const nodes = {};
  const context = vm.createContext({ document: {
    getElementById: id => fields[id], querySelectorAll: selector => nodes[selector] || [],
    querySelector: () => null,
  }, MutationObserver: class { observe() {} } });
  vm.runInContext('var window = globalThis;', context);
  vm.runInContext(html.slice(html.indexOf('    function contrastCells('), html.indexOf('    function clearResults(')), context);
  vm.runInContext(read('shared/nma-multiarm-v1.js'), context);
  vm.runInContext(html.slice(html.indexOf('    window.__almNmaParse ='), html.indexOf('    const loaded = loadSaved();')), context);
  const result = context.__almNmaCompute(fields['f-data'].value, 'A');
  assert.equal(result.error, undefined);
  const a = result.analysis, index = a.treatments.indexOf('B'), ref = a.treatments.indexOf('A');
  // Use the page's own number formatter and display formulas on real engine results.
  vm.runInContext(html.slice(html.indexOf('    function fmt('), html.indexOf('    function buildNetworkSvg(')), context);
  const fmt = context.fmt;
  const tv = value => fmt(scale === 'exp' ? Math.exp(value) : value, scale === 'exp' ? 2 : 3);
  const cell = textContent => ({ textContent });
  const row = (...cells) => ({ cells: cells.map(cell) });
  nodes['#stats-wrap .stat .v'] = ['2', '2', '2'].map(cell);
  nodes['#het-host tbody tr'] = [
    row('tau', `${fmt(a.tau2, 4)}, ${fmt(a.tau, 4)}`),
    row('I²', `${fmt(100 * a.I2, 1)}% (0.0% to 100.0%)`),
    row('Total', `Q = ${fmt(a.Q, 2)}, df = ${a.df}, p ${a.pvalQ < .0001 ? '< 0.0001' : '= ' + fmt(a.pvalQ, 4)}`),
  ];
  const estimates = [a.common.TE[index][ref], a.common.lower[index][ref], a.common.upper[index][ref]].map(tv);
  nodes['#ref-host tbody tr'] = [row('B', `${estimates[0]} (${estimates[1]} to ${estimates[2]})`, '0.0001')];
  vm.runInContext(read('shared/alm-text.js'), context);
  vm.runInContext(read('nma/alm-features.js'), context);
  const spec = context.AlmNmaFeatures.text, r = spec.results();
  const ctx = { app: 'nma', entryLog: [], build: { version: 'test', shortSha: 'test' } };
  const out = context.AlmText.render(spec.templates, r, ctx);
  return { r, a, estimates, audit: context.AlmText.audit(out, r, { ctx, dom: spec.dom() }) };
}

test('NMA report preserves scientific-notation Q without shifting df and p', () => {
  const { r, a, audit } = report(1e10);
  assert.ok(a.Q >= 1e21, 'The actual page formatter must emit scientific notation');
  assert.equal(r.het_0_Q, a.Q);
  assert.equal(r.df, a.df);
  assert.equal(r.het_0_p, .0001);
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
});

test('NMA report preserves exponentiated scientific-notation estimates and CI endpoints', () => {
  const { r, estimates, audit } = report(100, 'exp');
  assert.ok(estimates.every(value => value.includes('e+')));
  for (const [i, suffix] of ['est', 'lo', 'hi'].entries()) assert.equal(r['ref_0_' + suffix], Number(estimates[i]));
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
});

test('CONTROL: NMA report preserves ordinary decimal Q, df, p and estimates', () => {
  const { r, a, estimates, audit } = report(.3);
  assert.equal(r.het_0_Q, Number(a.Q.toFixed(2)));
  assert.equal(r.df, a.df);
  assert.equal(r.het_0_p, Number(a.pvalQ.toFixed(4)));
  for (const [i, suffix] of ['est', 'lo', 'hi'].entries()) assert.equal(r['ref_0_' + suffix], Number(estimates[i]));
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
});
