// Lane audit9: synthesis-journal demo reproduced in R (metafor 5.2.1).
//  Every number on the demo article (pooled RR 0.79 [0.72, 0.87], 7 leave-one-out rows,
//  7 cumulative rows, 7 study CIs) equals metafor::rma(method = "REML", test = "adhoc"),
//  i.e. REML with the Hartung-Knapp variance floored at 1 -- what the page computes
//  (AlmMaCore.pool {method:"REML", knha:true, knhaFloor:true}). Two defects:
//  1. The headline/abstract label says "random-effects (REML, computed here)" with no
//     mention of Hartung-Knapp. Plain REML (Wald z) gives 0.79 [0.73, 0.85], so the label
//     names an estimator whose interval differs from the one displayed.
//  2. The demo attaches invented risk ratios for "cardiovascular mortality" to the names of
//     real trials (Downs 1998 = AFCAPS/TexCAPS, Shepherd 1995 = WOSCOPS, Ridker 2008 =
//     JUPITER, Yusuf 2016 = HOPE-3, ...). The values are not those trials' results (e.g.
//     0.76 [0.64, 0.91] is HOPE-3's composite co-primary, not CV mortality) and "Mortensen
//     2019" is not a statin primary-prevention RCT. Demo data must not wear real trial names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

function renderDemo() {
  const els = {};
  const el = id => (els[id] = els[id] || { id, hidden: false, textContent: '', innerHTML: '', addEventListener() {} });
  const document = { readyState: 'complete', getElementById: el, addEventListener() {} };
  const ctx = { document, console, Math, JSON, isFinite, String, Number, Array, Object };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('shared/ma-core.js'), ctx);
  vm.runInContext(read('synthesis-journal/synthesis-journal.js'), ctx);
  return els.article.innerHTML;
}

test('synthesis-journal: demo pooled numbers are metafor REML + floored Hartung-Knapp (control)', () => {
  const html = renderDemo();
  assert.match(html, /was <b>0\.79<\/b> \(95% CI 0\.72 to 0\.87\)/);
});

test('synthesis-journal: the computed-pool label names Hartung-Knapp, which produced the CI', () => {
  const html = renderDemo();
  const label = (html.match(/0\.87\), ([^.]+)\./) || [])[1];
  assert.ok(label, 'pool label not found');
  assert.match(label, /REML/);
  assert.match(label, /Hartung[–-]Knapp|Knapp[–-]Hartung/, label);
});

test('synthesis-journal: demo studies do not carry real trial names', () => {
  const js = read('synthesis-journal/synthesis-journal.js');
  const demo = js.slice(js.indexOf('var DEMO'), js.indexOf('function readBuses'));
  for (const name of ['Downs', 'Shepherd', 'Sever', 'Nakamura', 'Ridker', 'Yusuf', 'Mortensen'])
    assert.doesNotMatch(demo, new RegExp(name), name + ' is a real trial author');
  assert.doesNotMatch(demo, /Statins/);
});
