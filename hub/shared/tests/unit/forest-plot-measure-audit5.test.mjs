// forest-plot: the measure travels with the data (lane audit5).
//  1. Loading the BCG hero dataset (a log RISK ratio, metadat::dat.bcg) left the plot title at
//     the default example's "Example meta-analysis (logOR)".
//  2. "-> GRADE" pushed no `measure`, so grade-sof's integrity panel never ran its E-value check
//     ("applies to ratio / SMD measures"), and a ratio the user had not exponentiated on the axis
//     was pushed on the log scale.
// References (R 4.6.0, metafor 5.2.1, rma(yi, sei = se, method = "PM", test = "adhoc")):
//   default example (log OR): -0.1980 [-0.3301, -0.0659]  ->  OR 0.8203513 [0.7188267, 0.9362148]
//   BCG, forest layout (log RR): -0.7150 [-1.1091, -0.3208] ->  RR 0.4892033 [0.3298503, 0.7255408]
// E-values (EValue 4.1.4): evalues.RR(0.4892033, 0.3298503, 0.7255408) -> point 3.505088, CI 2.100349.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadPage } from './helpers/page-vm.mjs';
const require = createRequire(import.meta.url);

const SHARED = ['shared/toast.js', 'shared/ma-core.js', 'shared/heterogeneity-ci.js', 'shared/ma-pooled-v1.js',
  'shared/canonical-datasets.js', 'shared/hero-examples.js'];

function forest() {
  const p = loadPage('forest-plot/index.html', { shared: SHARED });
  // The stub's querySelector returns its own element per selector; let '#id' reach the same element
  // getElementById returns, so the hero loader writes the page's real textarea.
  p.ctx.document.querySelector = sel => (/^#[\w-]+$/.test(sel) ? p.el(sel.slice(1)) : p.el('qs:' + sel));
  // The browser runs an element's input listeners when a script dispatches 'input' on it.
  for (const id of ['f-data', 'f-title', 'f-measure']) p.el(id).dispatchEvent = () => { p.fire(id, 'input'); return true; };
  return p;
}
function pickHero(p, key) {
  const mount = p.el('qs:#alm-hero-mount');            // where attachHero put its change listener
  mount.closest = () => ({ value: key });               // the <select data-alm-hero> the user changed
  p.fire('qs:#alm-hero-mount', 'change');               // writes #f-data, dispatches input, then onAfterLoad
}
function paste(p, text) { p.el('f-data').value = text; p.fire('f-data', 'input'); }
function pushed(p) {
  p.fire('btn-push-grade');
  const env = JSON.parse(p.ctx.localStorage.getItem('ma-pooled-v1') || '{"results":[]}');
  return env.results[env.results.length - 1];
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) < tol, `${what}: ${a} vs ${b}`);

test('forest-plot: loading the BCG hero names it a log risk ratio, not the example log OR', () => {
  const p = forest();
  assert.equal(p.el('f-title').value, 'Example meta-analysis (logOR)');
  pickHero(p, 'bcg');
  assert.match(p.el('f-data').value, /^Aronson 1948, -0\.8893, 0\.5706/);
  assert.doesNotMatch(p.el('f-title').value, /logOR/, 'BCG is a log risk ratio');
  assert.match(p.el('f-title').value, /BCG.*log RR/);
  assert.equal(p.el('f-measure').value, 'RR');
});

test('forest-plot: a title the user typed is not overwritten by a hero load', () => {
  const p = forest();
  p.el('f-title').value = 'My review';
  pickHero(p, 'bcg');
  assert.equal(p.el('f-title').value, 'My review');
  assert.equal(p.el('f-measure').value, 'RR');
});

test('forest-plot: -> GRADE carries the measure and the natural-scale ratio (BCG, log RR)', () => {
  const p = forest();
  pickHero(p, 'bcg');
  const r = pushed(p);
  assert.equal(r.measure, 'RR');
  assert.equal(r.scale, 'ratio');
  near(r.pointEstimate, 0.4892033, 1e-6, 'RR');
  near(r.ciLo, 0.3298503, 1e-6, 'RR lo');
  near(r.ciHi, 0.7255408, 1e-6, 'RR hi');
});

test('forest-plot: the default example pushes an OR', () => {
  const p = forest();
  assert.equal(p.el('f-measure').value, 'OR');
  const r = pushed(p);
  assert.equal(r.measure, 'OR');
  near(r.pointEstimate, Math.exp(-0.19802265178207248), 1e-9, 'OR');
  near(r.ciLo, 0.7188267, 1e-6, 'OR lo');
  near(r.ciHi, 0.9362148, 1e-6, 'OR hi');
});

test('forest-plot: an unspecified measure is pushed exactly as before (no measure, axis decides scale)', () => {
  const p = forest();
  p.el('f-measure').value = '';
  let r = pushed(p);
  assert.equal(r.measure, undefined);
  assert.equal(r.scale, 'linear');
  near(r.pointEstimate, -0.19802265178207248, 1e-12, 'linear');
  p.el('f-scale').value = 'exp';
  r = pushed(p);
  assert.equal(r.scale, 'ratio');
  near(r.pointEstimate, Math.exp(-0.19802265178207248), 1e-12, 'exp');
});

test('forest-plot -> grade-sof integrity panel: the E-value check now runs (BCG)', () => {
  const p = forest();
  pickHero(p, 'bcg');
  const r = pushed(p);
  require('../../../../shared/evalue.js');            // the engines grade-sof loads, in this order
  const panel = require('../../../../shared/integrity-panel-v1.js');
  const ev = panel.assess({ studies: [], pooled: r }).checks.find(c => c.key === 'evalue');
  assert.equal(ev.status, 'ok', ev.verdict);
  assert.match(ev.verdict, /E-value 3\.51 \(nearest-CI-bound 2\.10\)/, ev.verdict);
});

test('forest-plot: pasting your own studies clears the example measure; a measure you chose stays', () => {
  const p = forest();
  assert.equal(p.el('f-measure').value, 'OR');
  paste(p, 'S1, 0.10, 0.05\nS2, 0.20, 0.07\nS3, 0.15, 0.06');
  assert.equal(p.el('f-measure').value, '', 'the example OR does not describe pasted rows');
  assert.equal(pushed(p).measure, undefined);
  p.el('f-measure').value = 'SMD'; p.fire('f-measure', 'change');
  paste(p, 'S1, 0.10, 0.05\nS2, 0.25, 0.07\nS3, 0.15, 0.06');
  assert.equal(p.el('f-measure').value, 'SMD');
  const r = pushed(p);
  assert.equal(r.measure, 'SMD');
  assert.equal(r.scale, 'linear');
});
