// personalised-te vs R (lane audit7). R 4.6.0, metafor 5.2.1, script lanes/audit7-work/run/pte.R:
//   per-subgroup rma(method="PM", control=list(tol=1e-15)) pools; across-subgroup rma(pool, se^2, method="PM"); blup().
// Defects on origin/main:
//  1. shared/personalised-te.js takes PM tau2 from AlmMaCore, but the page never loaded
//     shared/ma-core.js, so in the browser every tau2 silently fell back to DL (Node tests,
//     which can require ma-core, got PM): the same engine gave two answers.
//  2. The "95% CI (EB)" used a variance w*se^2 + (1-w)*se_mu^2 + w(1-w)(y-mu)^2 labelled
//     "Morris 1983". That is the variance of a two-component mixture, not Morris's EB
//     variance (which has k-dependent terms and is undefined at k = 3 subgroups) and not
//     metafor::blup's. On the default data it gave young SE 0.105 vs blup 0.068.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage, text } from './helpers/page-vm.mjs';

const PAGE = 'personalised-te/index.html';
const HTML = readFileSync(new URL('../../../../' + PAGE, import.meta.url), 'utf8');
function run(src, label) {
  const html = HTML;
  // load exactly the engine scripts the page itself loads, in page order
  const shared = [...html.matchAll(/<script[^>]*src="\.\.\/(shared\/(?:ma-core|personalised-te)\.js)"/g)].map(m => m[1]);
  const p = loadPage(PAGE, { shared, pick: s => /AlmPersonalisedTE\.fit/.test(s) });
  p.el('src').value = src ?? html.match(/<textarea[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  p.el('f-predict').value = label ?? 'young';
  p.fire('btn-run');
  return { p, overall: text(p.el('overall').innerHTML), table: text(p.el('qs:#subgroups tbody').innerHTML), pred: text(p.el('pred').innerHTML), last: p.ctx.__almLastPersonalised() };
}

test('personalised-te: the page loads ma-core so tau2 is Paule-Mandel in the browser', () => {
  const r = run();
  assert.equal(r.last.fit.tau2_method, 'PM');
  assert.ok(Math.abs(r.last.fit.sigma2_between - 0.0244884) < 1e-6, String(r.last.fit.sigma2_between)); // R PM, control=list(tol=1e-15) (DL was 0.0233495)
  assert.ok(Math.abs(r.last.fit.overall.mu - -0.494124) < 1e-6);
  assert.ok(Math.abs(r.last.fit.overall.se - 0.103982) < 1e-6);
  assert.match(r.overall, /-0\.4941/); assert.match(r.overall, /0\.1040/); assert.match(r.overall, /-0\.698, -0\.290/); assert.match(r.overall, /0\.0245/);
});

test('personalised-te: shrunk estimates, SE and interval equal metafor::blup', () => {
  const r = run();
  const R = { young: [-0.345606, 0.068181, -0.479239, -0.211974], old: [-0.528444, 0.070481, -0.666584, -0.390303], 'biomarker+': [-0.608323, 0.102926, -0.810055, -0.406592] };
  for (const [g, [pred, se, lo, hi]] of Object.entries(R)) {
    const s = r.last.fit.subgroups[g];
    assert.ok(Math.abs(s.theta_shrunk - pred) < 1e-5, g + ' pred ' + s.theta_shrunk);
    assert.ok(Math.abs(s.se_shrunk - se) < 1e-5, g + ' se ' + s.se_shrunk);
    assert.ok(Math.abs(s.ci_lo - lo) < 1e-5 && Math.abs(s.ci_hi - hi) < 1e-5, g + ' ci');
  }
  assert.match(r.table, /young -0\.3139 \(SE 0\.072\) -0\.3456 \(SE 0\.068\) -0\.479, -0\.212/, r.table);
  assert.match(r.pred, /-0\.3456 \(95% CI -0\.479, -0\.212\)/, r.pred);
  assert.doesNotMatch(r.p.html, /Morris[- ]1983/, 'no Morris attribution for the interval');
});

test('personalised-te: unobserved subgroup falls back to the overall pooled effect (control)', () => {
  const r = run(undefined, 'nobody');
  assert.match(r.pred, /overall-fallback/);
  assert.ok(Math.abs(r.last.prediction.estimate - r.last.fit.overall.mu) < 1e-12);
});
