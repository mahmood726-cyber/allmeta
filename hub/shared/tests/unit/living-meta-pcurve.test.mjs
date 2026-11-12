import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Build window.LMA from the shipped page: run only the inline scripts that define LMA.* functions,
// with an absorbing stub for the DOM (app start-up errors are irrelevant to the numerics).
function lma() {
  const html = readFileSync(new URL('../../../../living-meta/living-meta-complete.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .filter(s => /LMA\.(pchisq|pnorm|pt|calculateQ|eggerTest|beggTest|metaAnalysisLarge|pCurveAnalysis|binomialTest)\s*=/.test(s));
  const sink = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : sink), apply: () => sink, construct: () => sink });
  const c = { console: { log() {}, warn() {}, error() {}, info() {} }, Math, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    document: sink, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, location: { href: '' } };
  c.window = c;
  vm.createContext(c);
  for (const s of scripts) { try { vm.runInContext(s, c); } catch (e) { /* UI start-up */ } }
  if (!c.LMA || typeof c.LMA.calculateQ !== 'function') throw Error('LMA engine not built');
  return c.LMA;
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// R 4.6.0: z = |yi|/sqrt(vi); p = 2 * pnorm(z, lower.tail = FALSE); pp = p[p < .05] / .05 (Simonsohn et al. 2014)
const yi = [0.52, 0.61, 0.45, 0.80, 0.33, 0.70, 0.95, 0.12, 0.58, 0.41];
const vi = [0.04, 0.05, 0.03, 0.06, 0.02, 0.05, 0.09, 0.04, 0.03, 0.05];

test('living-meta p-curve: right-skew binomial test is one-sided, as in the p-curve app (P(X >= #pp<.5))', () => {
  const r = lma().pCurveAnalysis(yi, vi);
  assert.equal(r.n_significant, 8);
  // R: binom.test(8, 8, 0.5, alternative = "greater")$p.value = 0.00390625
  assert.ok(rel(r.binomial_p, 0.00390625) < 1e-12, `binomial_p ${r.binomial_p}`);
});

test('living-meta p-curve: Stouffer test of the pp-values matches R', () => {
  const r = lma().pCurveAnalysis(yi, vi);
  // R: sum(qnorm(pp)) / sqrt(8) = -3.8987804004761881; pnorm(Z) = 4.8339201185470077e-05
  assert.ok(Math.abs(r.stouffer_z - -3.8987804004761881) < 1e-7, `stouffer_z ${r.stouffer_z}`);
  assert.ok(rel(r.stouffer_p, 4.8339201185470077e-05) < 1e-6, `stouffer_p ${r.stouffer_p}`);
  assert.ok(Math.abs(r.mean_pp - 0.12470876054613683) < 1e-8, `mean_pp ${r.mean_pp}`);
});

test('living-meta p-curve: a p-value that underflows to 0 is still a significant result (R keeps it)', () => {
  // z = 40: 2 * pnorm(40, lower.tail = FALSE) is 0 in double precision; R's p < .05 keeps it
  const r = lma().pCurveAnalysis([40, 0.6, 0.7, 0.8], [1, 0.04, 0.04, 0.04]);
  assert.equal(r.n_significant, 4, `n_significant ${r.n_significant}`);
});

test('living-meta binomialTest: two-sided p equals R binom.test', () => {
  const L = lma();
  // R: binom.test(3, 10)$p.value = binom.test(7, 10)$p.value = 0.34375; binom.test(2, 9, 0.3)$p.value = 1
  assert.ok(rel(L.binomialTest(3, 10, 0.5), 0.34375) < 1e-12, `3/10 ${L.binomialTest(3, 10, 0.5)}`);
  assert.ok(rel(L.binomialTest(7, 10, 0.5), 0.34375) < 1e-12, `7/10 ${L.binomialTest(7, 10, 0.5)}`);
  assert.ok(Math.abs(L.binomialTest(2, 9, 0.3) - 1) < 1e-12, `2/9 p=.3 ${L.binomialTest(2, 9, 0.3)}`);
});
