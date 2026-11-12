'use strict';
// A fit that did not converge must not be reported as converged.
//   node dev/tests/p60_convergence_flags.test.cjs [path/to/ipd-meta-pro.html]
// Complete separation (every treated participant has the event, no control does) has no finite
// treatment-effect MLE: glmer warns and returns a huge estimate. The page's tau2 = 0 boundary
// shortcut ran a GLM by IRLS and declared convergence even when IRLS had not converged.
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

{
  const rows = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 40; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, event: t }); }
  sandbox.__rows = rows;
  const g = run('OneStageGLMM.fitBinary(__rows, "event", "treatment", "study", [], {})');
  check('GLMM under complete separation is not reported as converged', g && g.convergence && g.convergence.converged === false,
    'converged ' + (g && g.convergence && g.convergence.converged) + ' logOR ' + (g && g.treatment && g.treatment.logOR));
}
// the boundary shortcut must still work where the GLM does converge (same data as the archive regression test)
{
  const rows = [];
  for (let s = 0; s < 4; s++) { for (let i = 0; i < 100; i++) rows.push({ study: 'S' + s, treatment: 1, event: i < 20 ? 1 : 0 }); for (let i = 0; i < 100; i++) rows.push({ study: 'S' + s, treatment: 0, event: i < 30 ? 1 : 0 }); }
  sandbox.__rows = rows;
  const g = run('OneStageGLMM.fitBinary(__rows, "event", "treatment", "study", [], {})');
  check('GLMM at the tau2 = 0 boundary with a convergent GLM is still converged', g.convergence.converged === true && g.tau2 < 1e-12,
    'converged ' + g.convergence.converged + ' tau2 ' + g.tau2);
}
// One-stage continuous ML fit: the Nelder-Mead minimiser of the profiled deviance stops after a
// fixed number of evaluations. Stopping there is not convergence and must not be reported as such.
// Fault injection: a deterministic 1e-9 relative perturbation of Math.log (used by the deviance)
// keeps the simplex values from ever agreeing to 1e-13, so every Nelder-Mead run reaches its cap.
function lmmRows(K = 5, m = 60, seed0 = 777, het = 0) {
  let sd = seed0; const r2 = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const g2 = () => { let u = 0; for (let i = 0; i < 12; i++) u += r2(); return u - 6; };
  const rows = [];
  for (let s = 0; s < K; s++) { const b0 = 2 * g2(), b1 = het ? het * g2() : 0; for (let i = 0; i < m; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, outcome: Math.round((20 + b0 - (1.5 + b1) * t + 3 * g2()) * 1e4) / 1e4 }); } }
  return rows;
}
{
  sandbox.__rows = lmmRows();
  const ok = run('runOneStageIPD(__rows, "outcome", "treatment", "study", [])');
  check('one-stage continuous fit with a well-behaved deviance is converged', ok && ok.convergence && ok.convergence.converged === true,
    'converged ' + (ok && ok.convergence && ok.convergence.converged));
  run('(function(){ var L = Math.log, c = 0; Math.__origLog = L; Math.log = function(x){ c++; return L(x) * (1 + 1e-9 * ((c * 7919) % 13 - 6)); }; })()');
  let r;
  try { r = run('runOneStageIPD(__rows, "outcome", "treatment", "study", [])'); }
  finally { run('Math.log = Math.__origLog; delete Math.__origLog;'); }
  check('one-stage continuous fit whose minimiser hit its evaluation cap is not reported as converged',
    r && !r.error && r.convergence && r.convergence.converged === false,
    'converged ' + (r && r.convergence && r.convergence.converged) + (r && r.error ? ' error ' + r.error : ''));
}
// A large deviance (thousands): the absolute 1e-13 simplex spread is below one ulp, so a fit at its optimum
// can reach the cap with a collapsed simplex. That is convergence, and lme4 agrees on these fits.
{
  sandbox.__rows = lmmRows(10, 100, 2, 0.5);
  const r = run('runOneStageIPD(__rows, "outcome", "treatment", "study", [])');
  check('one-stage continuous fit with a deviance in the thousands is converged', r && r.convergence && r.convergence.converged === true && -2 * r.convergence.logLik > 5000,
    'converged ' + (r && r.convergence && r.convergence.converged) + ' deviance ' + (r && r.convergence && -2 * r.convergence.logLik));
}
console.log(failed ? 'FAILED ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
