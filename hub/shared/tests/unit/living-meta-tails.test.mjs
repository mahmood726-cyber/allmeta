import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Tail = require('../../../../shared/upper-tail.js');

// Build window.LMA from the shipped page: run only the inline scripts that define LMA.* functions,
// with an absorbing stub for the DOM (app start-up errors are irrelevant to the numerics).
function lma() {
  const html = readFileSync(new URL('../../../../living-meta/living-meta-complete.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .filter(s => /LMA\.(pchisq|pnorm|pt|calculateQ|eggerTest|beggTest|metaAnalysisLarge)\s*=/.test(s));
  const sink = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : sink), apply: () => sink, construct: () => sink });
  const c = { console: { log() {}, warn() {}, error() {}, info() {} }, Math, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    document: sink, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, location: { href: '' } };
  c.window = c;
  vm.createContext(c);
  for (const s of scripts) { try { vm.runInContext(s, c); } catch (e) { /* UI start-up */ } }
  if (!c.LMA || typeof c.LMA.calculateQ !== 'function') throw Error('LMA engine not built');
  return c.LMA;
}
const rel = (a, b) => Math.abs(a - b) / b;

test('living-meta: Cochran Q p-value matches R pchisq(Q, df, lower.tail = FALSE) at ordinary Q', () => {
  const L = lma();
  // yi = (-sqrt5, 0, sqrt5), vi = 1  =>  Q = 10, df = 2;  R: pchisq(10, 2, lower = FALSE) = exp(-5)
  const r = L.calculateQ([-Math.sqrt(5), 0, Math.sqrt(5)], [1, 1, 1]);
  assert.ok(Math.abs(r.Q - 10) < 1e-12 && r.df === 2);
  assert.ok(rel(r.pvalue, 0.006737946999085467) < 1e-8, `Q-test p ${r.pvalue}, R 0.006737946999085467`);
  // Q = qchisq(0.95, 1) on df = 1 must give p = 0.05
  const q = 3.841458820694124, y = Math.sqrt(q / 2);
  const r1 = L.calculateQ([-y, y], [1, 1]);
  assert.ok(Math.abs(r1.pvalue - 0.05) < 1e-9, `p at the 95% chi-square quantile = ${r1.pvalue}`);
  const big = L.metaAnalysisLarge([-10, 0, 10, 5], [1, 1, 1, 1], { method: 'FE' });
  assert.ok(big.pvalue_Q > 0 && rel(big.pvalue_Q, Tail.pchisqUpper(big.Q, big.df)) < 1e-8, `pvalue_Q ${big.pvalue_Q}`);
});

test('living-meta: normal and t upper-tail helpers keep relative precision (no cancellation to 0)', () => {
  const L = lma();
  // (eggerTest itself returns se_intercept = NaN on ordinary data -- a separate defect, reported, not touched here)
  assert.ok(Math.abs(2 * L.pnormUpper(1.9599639845400536) - 0.05) < 1e-12, 'pnormUpper(1.96)');
  assert.ok(rel(L.pnormUpper(9), 1.1285884059538408e-19) < 1e-8, `pnormUpper(9) = ${L.pnormUpper(9)}`);
  assert.ok(Math.abs(L.pnormUpper(-1.9599639845400536) - 0.975) < 1e-12, 'pnormUpper(-1.96)');
  assert.equal(L.pchisqUpper(Infinity, 3), 0);
  assert.ok(Number.isNaN(L.pchisqUpper(1, -1)));
  assert.equal(L.pnormUpper(1e200), 0);
  // R 4.6.0: 2 * pt(-t, df), %.17g
  for (const [t, df, ref] of [[50, 3, 1.7617152041271951e-05], [1e4, 3, 2.2053155022958127e-12], [3, 10, 0.013343655022569588]]) {
    assert.ok(rel(L.pt2(t, df), ref) < 1e-8, `pt2(${t}, ${df}) = ${L.pt2(t, df)}, R ${ref}`);
  }
  // Begg's z for a perfectly rank-correlated set (k = 30) has a tiny but nonzero two-sided p
  const k = 30, vi = Array.from({ length: k }, (_, i) => 0.01 * (i + 1)), yi = vi.map(v => 10 * v);
  const b = L.beggTest(yi, vi);
  assert.ok(b.pvalue > 0 && rel(b.pvalue, 2 * Tail.pnormUpper(Math.abs(b.z))) < 1e-8, `Begg p ${b.pvalue} z ${b.z}`);
});
