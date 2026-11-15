// everything-model vs R (lane audit7). The model is y = mu_o + gamma_t + delta_i + e, delta_i ~ N(0, tau2),
// i.e. metafor::rma.mv(yi, vi, mods = ~ 0 + outcome + factor(time), random = ~ 1 | study, method = "ML")
// (R 4.6.0, metafor 5.2.1; scripts lanes/audit7-work/run/em.R, em_het.R). The EM reaches the ML point
// estimates, but on origin/main:
//  1. SE(mu_o) was sqrt(1 / sum 1/(v + tau2)) over that outcome's rows - it ignores that mu_o is the
//     reference-period mean once gamma_t is estimated and that one study's outcomes share delta_i.
//     Default data: 0.0442 / 0.0468 vs rma.mv 0.0608 / 0.0630; heterogeneous data 0.0803 vs 0.1186.
//  2. "log-lik" was the joint density of y and the delta-hat values (diverges as tau2 -> 0): 40.74 vs
//     the ML log-likelihood 15.196; the EM convergence test used it, so the default fit ran to max-iter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage, text } from './helpers/page-vm.mjs';

const PAGE = 'everything-model/index.html';
const HTML = readFileSync(new URL('../../../../' + PAGE, import.meta.url), 'utf8');
function run(src) {
  const p = loadPage(PAGE, { shared: ['shared/everything-model.js'], pick: s => /AlmEverythingModel\.fit/.test(s) });
  p.el('src').value = src ?? HTML.match(/<textarea[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  p.el('f-bias-scale').value = '0';
  p.fire('btn-run');
  return { r: p.ctx.__almLastEverything(), mu: text(p.el('qs:#mu tbody').innerHTML), meta: text(p.el('meta').innerHTML) };
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);

test('everything-model default: mu, SE, CI and logLik equal rma.mv(ML)', () => {
  const { r, mu, meta } = run();
  near(r.mu.primary.estimate, -0.27625, 1e-4, 'mu primary'); near(r.mu.secondary.estimate, -0.18993, 1e-4, 'mu secondary');
  near(r.gamma['2023'].estimate, -0.26716, 1e-4, 'gamma 2023');
  near(r.mu.primary.se, 0.06078, 2e-4, 'se primary'); near(r.mu.secondary.se, 0.06304, 2e-4, 'se secondary');
  near(r.gamma['2021'].se, 0.10020, 2e-4, 'se gamma 2021');
  near(r.log_likelihood, 15.19644, 1e-3, 'ML logLik');
  assert.match(mu, /primary -0\.276\d 0\.06\d\d -0\.39\d, -0\.15\d/, mu);
  assert.match(meta, /log-lik \(ML\) 15\.20/, meta);
  assert.equal(r.polished, true);
});

test('everything-model heterogeneous data: tau2 and SEs equal rma.mv(ML)', () => {
  const csv = readFileSync(new URL('../../../../tests/fixtures/everything-model-het-audit7.csv', import.meta.url), 'utf8');
  const { r } = run(csv);
  near(r.tau2_delta, 0.03335649, 1e-5, 'tau2');
  near(r.mu.primary.estimate, -0.34729, 2e-4, 'mu primary'); near(r.mu.secondary.estimate, -0.24331, 2e-4, 'mu secondary');
  near(r.mu.primary.se, 0.11857, 2e-4, 'se primary'); near(r.mu.secondary.se, 0.12440, 2e-4, 'se secondary');
  near(r.gamma['2021'].se, 0.18353, 3e-4, 'se gamma 2021');
  near(r.log_likelihood, 6.603911, 1e-3, 'ML logLik');
});
