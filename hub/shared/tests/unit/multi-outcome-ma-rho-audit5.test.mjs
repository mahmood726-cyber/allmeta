// multi-outcome-ma: rho_between is not identified when a between-study SD is 0 (lane audit5).
// On the page's default example both REML tau are 0 and the page printed "rho_between -0.900":
// the first grid value tried (shared/multi-outcome-ma.js rhoGrid[0]), because with tau1 = tau2 = 0
// every rho gives the same likelihood. metafor::rma.mv(struct = "UN") on the same data (R 4.6.0,
// metafor 5.2.1) reports tau 2.4e-08 / 1.5e-07 and rho 0.9996 -- an equally arbitrary value; the
// pooled estimates agree (-0.2737 / -0.3754, SE 0.0452 / 0.0528) and do not depend on rho.
// With tau > 0 the page's rho is identified and matches R (0.0359 vs 0.03593475).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

function fit(src, rhoW) {
  const p = loadPage('multi-outcome-ma/index.html', { shared: ['shared/ma-core.js', 'shared/multi-outcome-ma.js'] });
  if (src != null) p.el('src').value = src;
  if (rhoW != null) p.el('f-rho-within').value = String(rhoW);
  p.fire('btn-run');
  fit.last = p.ctx.__almLastMultiOutcome();             // what the results export downloads
  return text(p.el('bivariate-summary').innerHTML);
}

test('multi-outcome-ma: default example (tau1 = tau2 = 0) does not print a rho_between estimate', () => {
  const p = loadPage('multi-outcome-ma/index.html', { shared: ['shared/ma-core.js', 'shared/multi-outcome-ma.js'] });
  // the textarea's shipped content and the rho_within input's shipped value (the stub DOM does not parse HTML)
  const src = p.html.match(/<textarea[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1].trim();
  const rhoW = Number(p.html.match(/id="f-rho-within"[^>]*value="([^"]+)"/)[1]);
  assert.equal(rhoW, 0.5);
  assert.match(src, /^Trial 1, -0\.30, 0\.12, -0\.40, 0\.15/, 'default example present');
  const out = fit(src, rhoW);
  assert.match(out, /μ̂₁ \(joint\) -0\.2737/, out);
  assert.match(out, /μ̂₂ \(joint\) -0\.3754/, out);
  assert.doesNotMatch(out, /ρ_between -0\.900/, out);
  assert.match(out, /ρ_between not identified \(τ = 0\)/, out);
  assert.equal(fit.last.bivariate.rho_between, null, 'export carries no rho_between estimate');
  assert.ok(Math.abs(fit.last.bivariate.mu[0] - -0.2736706) < 1e-4, 'export keeps the pooled estimates');
});

test('multi-outcome-ma: an identified rho_between is still shown (matches metafor 0.0359)', () => {
  const src = 'S1, -0.8, 0.12, -0.3, 0.15\nS2, -0.1, 0.10, -0.6, 0.12\nS3, -0.45, 0.18, -0.55, 0.20\n' +
    'S4, 0.1, 0.09, 0.05, 0.11\nS5, -0.9, 0.20, -0.4, 0.14\nS6, -0.25, 0.11, -0.9, 0.13\nS7, -0.6, 0.15, -0.3, 0.17\nS8, NA, NA, -0.2, 0.16';
  const out = fit(src, 0.5);
  assert.match(out, /τ₁ 0\.347/, out);
  assert.match(out, /ρ_between 0\.036/, out);
  assert.ok(Math.abs(fit.last.bivariate.rho_between - 0.03593475) < 1e-3, String(fit.last.bivariate.rho_between));
});
