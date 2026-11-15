// Lane low607 (independent review rrev2): synthesis-journal estimator labels must
// name the interval actually shown.
//  1. At k=1 AlmMaCore.pool has df=0, so Hartung-Knapp is not applied and the interval
//     is the single study's own Wald z interval (metafor::rma at k=1 gives the same:
//     log(0.8), se 0.1 -> -0.2231 [-0.4191, -0.0271], tau2 = 0). The page still said
//     "random-effects (REML, Hartung-Knapp CI with variance floor, computed here)".
//  2. At k=2 the floored HK interval IS shown (metafor test="adhoc":
//     -0.3453 [-2.1520, 1.4614]); the HK label is correct there (control).
//  3. The sensitivity-panel note said "REML, Knapp-Hartung" without the variance floor,
//     inconsistent with the estimator the panels use (knhaFloor: true).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

function render(studies, pooledList) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, hidden: false, textContent: '', innerHTML: '', addEventListener() {} });
  const document = { readyState: 'complete', getElementById: el, addEventListener() {} };
  const ctx = { document, console, Math, JSON, isFinite, String, Number, Array, Object };
  ctx.window = ctx; ctx.globalThis = ctx;
  if (studies) ctx.MaStudies = { read: () => studies };
  if (pooledList) ctx.MaPooled = { read: () => pooledList };
  vm.createContext(ctx);
  vm.runInContext(read('shared/ma-core.js'), ctx);
  vm.runInContext(read('synthesis-journal/synthesis-journal.js'), ctx);
  return els.article.innerHTML;
}
const label = html => (html.match(/\(95% CI [^)]+\), ([^.]+)\./) || [])[1];

test('k=1: interval is the single study z interval and the label says so (not Hartung-Knapp)', () => {
  const html = render([{ label: 'Only', est: Math.log(0.8), se: 0.1 }]);
  assert.match(html, /was <b>-0\.22<\/b> \(95% CI -0\.42 to -0\.03\)/); // metafor k=1: [-0.4191, -0.0271]
  const l = label(html);
  assert.ok(l, 'pool label not found');
  assert.doesNotMatch(l, /Hartung|Knapp|random-effects/, l);
  assert.match(l, /single study/i, l);
  assert.match(l, /z/, l);
});

test('k=2 (control): floored Hartung-Knapp interval is shown and labelled as such', () => {
  const html = render([{ label: 'A', est: Math.log(0.8), se: 0.1 }, { label: 'B', est: Math.log(0.6), se: 0.15 }]);
  assert.match(html, /was <b>-0\.35<\/b> \(95% CI -2\.15 to 1\.46\)/); // metafor adhoc: [-2.1520, 1.4614]
  assert.match(label(html), /REML, Hartung[–-]Knapp CI with variance floor/);
});

test('sensitivity-panel note names the same estimator as the page label (with the floor)', () => {
  const studies = [0.79, 0.72, 0.83].map((r, i) => ({ label: 'S' + i, est: Math.log(r), se: 0.1 }));
  const html = render(studies, [{ scale: 'ratio', measure: 'RR', pointEstimate: 0.8, ciLo: 0.7, ciHi: 0.9, k: 3 }]);
  const notes = html.match(/These sensitivity panels are recomputed here \(([^)]+)\)/g) || [];
  assert.equal(notes.length, 2, 'expected the note on both sensitivity figures');
  for (const n of notes) assert.match(n, /REML, Hartung[–-]Knapp CI with variance floor/, n);
  const js = read('synthesis-journal/synthesis-journal.js');
  assert.doesNotMatch(js, /\(REML, Knapp-Hartung\)/);
});
